package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/notify"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// POST /api/components/:slug/versions  (protected)
func AddVersion(c *fiber.Ctx) error {
	componentSlug := c.Params("slug")

	var version models.ComponentVersion
	if err := c.BodyParser(&version); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}
	if strings.TrimSpace(version.Version) == "" {
		return utils.Error(c, 400, "version number required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": componentSlug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	// Check if component is linked to a repo
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return utils.Error(c, 400, "component must be linked to a GitHub repository before adding versions")
	}

	// If no commit SHA provided, use the one from component's repoLink
	if strings.TrimSpace(version.CommitSHA) == "" {
		version.CommitSHA = comp.RepoLink.Commit
	}

	if version.CommitSHA == "" {
		return utils.Error(c, 400, "commit SHA is required")
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")

	// Check if version already exists for this commit
	var existingVersion models.ComponentVersion
	err := verCol.FindOne(ctx, bson.M{
		"componentId": comp.ID,
		"commitSha":   version.CommitSHA,
	}).Decode(&existingVersion)

	if err == nil {
		// Version with this commit already exists
		return utils.Error(c, 409, fmt.Sprintf("version already exists for commit %s (version: %s)", version.CommitSHA[:7], existingVersion.Version))
	}

	uid, _ := c.Locals("user_id").(string)
	version.ComponentID = comp.ID
	version.CreatedBy = uid
	version.CreatedAt = time.Now()
	version.CodeURL = strings.TrimSpace(version.CodeURL)
	version.Readme = strings.TrimSpace(version.Readme)

	res, err := verCol.InsertOne(ctx, version)
	if err != nil {
		return utils.Error(c, 500, "failed to insert version")
	}
	version.ID = res.InsertedID.(primitive.ObjectID)

	notify.NewVersion(ctx, comp.ID, comp.Name, version.Version)

	// Build cache: reuse another version's output if it was already built
	// successfully from the exact same commit.
	if cached, ok := findCachedBuild(ctx, comp.ID, version.CommitSHA); ok {
		reuseCachedBuild(ctx, cached, comp.ID, version.ID, componentSlug, version.Version, uid)
		return utils.Success(c, fiber.Map{
			"status":  "version added",
			"version": version,
			"message": "reused build output from an identical commit",
		})
	}

	// Auto-trigger build
	job := models.BuildJob{
		ComponentID: comp.ID,
		VersionID:   version.ID,
		Component:   componentSlug,
		Version:     version.Version,
		Status:      models.BuildQueued,
		OwnerID:     uid,
		Repo: models.BuildRepo{
			Owner:  comp.RepoLink.Owner,
			Repo:   comp.RepoLink.Repo,
			Path:   comp.RepoLink.Path,
			Ref:    comp.RepoLink.Ref,
			Commit: version.CommitSHA,
		},
		Logs:      []string{"enqueued"},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	jobRes, _ := jobCol.InsertOne(ctx, job)
	if oid, ok := jobRes.InsertedID.(primitive.ObjectID); ok {
		notifyWorker(ctx, oid)
	}

	return utils.Success(c, fiber.Map{
		"status":  "version added",
		"version": version,
		"message": "Build queued automatically",
	})
}

// GET /components/:slug/versions  (public)
func GetComponentVersions(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")
	cursor, err := verCol.Find(ctx, bson.M{"componentId": comp.ID})
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	// Pre-init to ensure JSON array, not null
	versions := make([]models.ComponentVersion, 0)
	if err := cursor.All(ctx, &versions); err != nil {
		return utils.Error(c, 500, "failed to decode versions")
	}

	return utils.Success(c, fiber.Map{
		"versions": versions, // [] when empty
	})
}

// POST /api/components/:slug/deploy  (protected)
// Auto-deploy a new commit from linked repository
func AutoDeploy(c *fiber.Ctx) error {
	slug := c.Params("slug")

	type deployPayload struct {
		CommitSHA string `json:"commitSha"`
		Version   string `json:"version"`   // Optional: suggest version number
		Changelog string `json:"changelog"` // Optional: changelog message
	}

	var payload deployPayload
	if err := c.BodyParser(&payload); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}

	if payload.CommitSHA == "" {
		return utils.Error(c, 400, "commit SHA is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	uid, _ := c.Locals("user_id").(string)

	newVersion, jobID, err := createVersionAndBuild(ctx, &comp, payload.CommitSHA, payload.Version, payload.Changelog, uid)
	if err != nil {
		return utils.Error(c, err.statusCode, err.message)
	}

	return utils.Success(c, fiber.Map{
		"version": newVersion,
		"jobId":   jobID.Hex(),
		"message": "Version created and build queued automatically",
	})
}

type deployError struct {
	statusCode int
	message    string
}

func (e *deployError) Error() string { return e.message }

// createVersionAndBuild creates a ComponentVersion for the given commit and
// enqueues a BuildJob for it (or, if an identical commit was already built
// successfully, reuses that build's output instead of rebuilding). Shared by
// the manual auto-deploy endpoint and the GitHub push webhook.
func createVersionAndBuild(ctx context.Context, comp *models.Component, commitSHA, versionHint, changelog, actorUID string) (*models.ComponentVersion, primitive.ObjectID, *deployError) {
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return nil, primitive.NilObjectID, &deployError{400, "component is not linked to a repository"}
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")

	var existingVersion models.ComponentVersion
	err := verCol.FindOne(ctx, bson.M{
		"componentId": comp.ID,
		"commitSha":   commitSHA,
	}).Decode(&existingVersion)
	if err == nil {
		return nil, primitive.NilObjectID, &deployError{409, fmt.Sprintf("version already exists for this commit: %s", existingVersion.Version)}
	}

	versionNumber := versionHint
	if versionNumber == "" {
		versionNumber = generateNextVersion(ctx, verCol, comp.ID)
	}

	newVersion := models.ComponentVersion{
		ComponentID: comp.ID,
		Version:     versionNumber,
		Changelog:   changelog,
		CommitSHA:   commitSHA,
		CreatedBy:   actorUID,
		CreatedAt:   time.Now(),
	}

	if newVersion.Changelog == "" {
		newVersion.Changelog = fmt.Sprintf("Auto-deployed from commit %s", commitSHA[:min(7, len(commitSHA))])
	}

	// Build cache: if this exact commit was already built successfully for
	// this component (under a different version), reuse its output instead
	// of enqueuing another build.
	if cached, ok := findCachedBuild(ctx, comp.ID, commitSHA); ok {
		insertResult, err := verCol.InsertOne(ctx, newVersion)
		if err != nil {
			return nil, primitive.NilObjectID, &deployError{500, "failed to create version"}
		}
		newVersion.ID = insertResult.InsertedID.(primitive.ObjectID)
		reuseCachedBuild(ctx, cached, comp.ID, newVersion.ID, comp.Slug, versionNumber, actorUID)
		notify.NewVersion(ctx, comp.ID, comp.Name, versionNumber)
		return &newVersion, primitive.NilObjectID, nil
	}

	insertResult, err := verCol.InsertOne(ctx, newVersion)
	if err != nil {
		return nil, primitive.NilObjectID, &deployError{500, "failed to create version"}
	}
	newVersion.ID = insertResult.InsertedID.(primitive.ObjectID)
	notify.NewVersion(ctx, comp.ID, comp.Name, versionNumber)

	job := models.BuildJob{
		ComponentID: comp.ID,
		VersionID:   newVersion.ID,
		Component:   comp.Slug,
		Version:     versionNumber,
		Status:      models.BuildQueued,
		OwnerID:     actorUID,
		Repo: models.BuildRepo{
			Owner:  comp.RepoLink.Owner,
			Repo:   comp.RepoLink.Repo,
			Path:   comp.RepoLink.Path,
			Ref:    comp.RepoLink.Ref,
			Commit: commitSHA,
		},
		Logs:      []string{"enqueued - auto-deploy"},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	jobRes, err := jobCol.InsertOne(ctx, job)
	if err != nil {
		return nil, primitive.NilObjectID, &deployError{500, "failed to create build job"}
	}

	jobID, _ := jobRes.InsertedID.(primitive.ObjectID)
	notifyWorker(ctx, jobID)

	return &newVersion, jobID, nil
}

// Helper function to generate next semantic version
func generateNextVersion(ctx context.Context, verCol *mongo.Collection, componentID primitive.ObjectID) string {
	// Get latest version sorted by creation date
	opts := options.Find().SetSort(bson.M{"createdAt": -1}).SetLimit(1)
	cursor, err := verCol.Find(ctx, bson.M{"componentId": componentID}, opts)
	if err != nil {
		return "1.0.0"
	}
	defer cursor.Close(ctx)

	var versions []models.ComponentVersion
	if err := cursor.All(ctx, &versions); err != nil || len(versions) == 0 {
		return "1.0.0"
	}

	// Parse latest version and increment patch
	latestVersion := versions[0].Version
	// Simple increment: if it's "1.2.3", make it "1.2.4"

	var major, minor, patch int
	_, err = fmt.Sscanf(latestVersion, "%d.%d.%d", &major, &minor, &patch)
	if err != nil {
		// If parsing fails, start with 1.0.0
		return "1.0.0"
	}

	return fmt.Sprintf("%d.%d.%d", major, minor, patch+1)
}
