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

// existingVersionForCommit returns the version already created for this exact commit, if any.
func existingVersionForCommit(ctx context.Context, verCol *mongo.Collection, componentID primitive.ObjectID, commitSHA string) (models.ComponentVersion, bool) {
	var v models.ComponentVersion
	err := verCol.FindOne(ctx, bson.M{"componentId": componentID, "commitSha": commitSHA}).Decode(&v)
	return v, err == nil
}

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

	comp, err := findComponentBySlug(ctx, componentSlug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return utils.Error(c, 400, "component must be linked to a GitHub repository before adding versions")
	}

	if strings.TrimSpace(version.CommitSHA) == "" {
		version.CommitSHA = comp.RepoLink.Commit
	}
	if version.CommitSHA == "" {
		return utils.Error(c, 400, "commit SHA is required")
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")
	if existing, ok := existingVersionForCommit(ctx, verCol, comp.ID, version.CommitSHA); ok {
		return utils.Error(c, 409, fmt.Sprintf("version already exists for commit %s (version: %s)", version.CommitSHA[:7], existing.Version))
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
	notify.NewVersion(ctx, comp.ID, comp.Slug, comp.Name, version.Version)

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

	repo := comp.RepoLink.AsBuildRepo()
	repo.Commit = version.CommitSHA
	if _, err := enqueueBuildJob(ctx, &comp, version.ID, version.Version, uid, "enqueued", repo); err != nil {
		return utils.Error(c, 500, "failed to enqueue build")
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

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")
	cursor, err := verCol.Find(ctx, bson.M{"componentId": comp.ID})
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	versions := make([]models.ComponentVersion, 0) // [] not null when empty
	if err := cursor.All(ctx, &versions); err != nil {
		return utils.Error(c, 500, "failed to decode versions")
	}

	return utils.Success(c, fiber.Map{"versions": versions})
}

// POST /api/components/:slug/deploy  (protected) - creates a version + build from a pushed commit
func AutoDeploy(c *fiber.Ctx) error {
	slug := c.Params("slug")

	var payload struct {
		CommitSHA string `json:"commitSha"`
		Version   string `json:"version"`
		Changelog string `json:"changelog"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}
	if payload.CommitSHA == "" {
		return utils.Error(c, 400, "commit SHA is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	uid, _ := c.Locals("user_id").(string)
	newVersion, jobID, deployErr := createVersionAndBuild(ctx, &comp, payload.CommitSHA, payload.Version, payload.Changelog, uid)
	if deployErr != nil {
		return utils.Error(c, deployErr.statusCode, deployErr.message)
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
// enqueues a BuildJob for it (or reuses a matching successful build's output
// instead of rebuilding). Shared by AutoDeploy and the GitHub push webhook.
func createVersionAndBuild(ctx context.Context, comp *models.Component, commitSHA, versionHint, changelog, actorUID string) (*models.ComponentVersion, primitive.ObjectID, *deployError) {
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return nil, primitive.NilObjectID, &deployError{400, "component is not linked to a repository"}
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")
	if existing, ok := existingVersionForCommit(ctx, verCol, comp.ID, commitSHA); ok {
		return nil, primitive.NilObjectID, &deployError{409, fmt.Sprintf("version already exists for this commit: %s", existing.Version)}
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

	insertResult, err := verCol.InsertOne(ctx, newVersion)
	if err != nil {
		return nil, primitive.NilObjectID, &deployError{500, "failed to create version"}
	}
	newVersion.ID = insertResult.InsertedID.(primitive.ObjectID)
	notify.NewVersion(ctx, comp.ID, comp.Slug, comp.Name, versionNumber)

	repo := comp.RepoLink.AsBuildRepo()
	repo.Commit = commitSHA

	if cached, ok := findCachedBuild(ctx, comp.ID, commitSHA); ok {
		reuseCachedBuild(ctx, cached, comp.ID, newVersion.ID, comp.Slug, versionNumber, actorUID)
		return &newVersion, primitive.NilObjectID, nil
	}

	jobID, err := enqueueBuildJob(ctx, comp, newVersion.ID, versionNumber, actorUID, "enqueued - auto-deploy", repo)
	if err != nil {
		return nil, primitive.NilObjectID, &deployError{500, "failed to create build job"}
	}

	return &newVersion, jobID, nil
}

// generateNextVersion picks the next patch version after the component's latest one.
func generateNextVersion(ctx context.Context, verCol *mongo.Collection, componentID primitive.ObjectID) string {
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

	var major, minor, patch int
	if _, err := fmt.Sscanf(versions[0].Version, "%d.%d.%d", &major, &minor, &patch); err != nil {
		return "1.0.0"
	}
	return fmt.Sprintf("%d.%d.%d", major, minor, patch+1)
}
