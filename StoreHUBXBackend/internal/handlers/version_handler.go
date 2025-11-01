package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
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
	version.PreviewURL = strings.TrimSpace(version.PreviewURL)
	version.Readme = strings.TrimSpace(version.Readme)
	version.BuildState = models.VersionBuildQueued

	if _, err := verCol.InsertOne(ctx, version); err != nil {
		return utils.Error(c, 500, "failed to insert version")
	}

	// Auto-trigger build
	job := models.BuildJob{
		ComponentID: comp.ID,
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
	_, _ = jobCol.InsertOne(ctx, job)

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

	// Find component
	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	// Verify component is linked
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return utils.Error(c, 400, "component is not linked to a repository")
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")

	// Check if version exists for this commit
	var existingVersion models.ComponentVersion
	err := verCol.FindOne(ctx, bson.M{
		"componentId": comp.ID,
		"commitSha":   payload.CommitSHA,
	}).Decode(&existingVersion)

	if err == nil {
		return utils.Error(c, 409, fmt.Sprintf("version already exists for this commit: %s", existingVersion.Version))
	}

	// Auto-generate version number if not provided
	versionNumber := payload.Version
	if versionNumber == "" {
		versionNumber = generateNextVersion(ctx, verCol, comp.ID)
	}

	uid, _ := c.Locals("user_id").(string)

	// Create new version
	newVersion := models.ComponentVersion{
		ComponentID: comp.ID,
		Version:     versionNumber,
		Changelog:   payload.Changelog,
		CommitSHA:   payload.CommitSHA,
		BuildState:  models.VersionBuildQueued,
		CreatedBy:   uid,
		CreatedAt:   time.Now(),
	}

	if newVersion.Changelog == "" {
		newVersion.Changelog = fmt.Sprintf("Auto-deployed from commit %s", payload.CommitSHA[:7])
	}

	insertResult, err := verCol.InsertOne(ctx, newVersion)
	if err != nil {
		return utils.Error(c, 500, "failed to create version")
	}

	newVersion.ID = insertResult.InsertedID.(primitive.ObjectID)

	// Create build job
	job := models.BuildJob{
		ComponentID: comp.ID,
		Component:   slug,
		Version:     versionNumber,
		Status:      models.BuildQueued,
		OwnerID:     uid,
		Repo: models.BuildRepo{
			Owner:  comp.RepoLink.Owner,
			Repo:   comp.RepoLink.Repo,
			Path:   comp.RepoLink.Path,
			Ref:    comp.RepoLink.Ref,
			Commit: payload.CommitSHA,
		},
		Logs:      []string{"enqueued - auto-deploy"},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	jobRes, err := jobCol.InsertOne(ctx, job)
	if err != nil {
		return utils.Error(c, 500, "failed to create build job")
	}

	jobID, _ := jobRes.InsertedID.(primitive.ObjectID)

	return utils.Success(c, fiber.Map{
		"version": newVersion,
		"jobId":   jobID.Hex(),
		"message": "Version created and build queued automatically",
	})
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
