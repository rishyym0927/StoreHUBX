package worker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/storage"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// jobTimeout bounds an entire job (download, build, upload) so a stuck
// network call or hung subprocess can't wedge this single-threaded
// polling loop forever, blocking every job queued after it.
const jobTimeout = 10 * time.Minute

type Processor struct {
	uploader storage.Uploader
	tmpDir   string
}

func NewProcessor(uploader storage.Uploader) *Processor {
	tmp := os.Getenv("BUILD_TMP_DIR")
	if tmp == "" {
		tmp = os.TempDir()
	}
	return &Processor{uploader: uploader, tmpDir: tmp}
}

func (p *Processor) logPush(ctx context.Context, id primitive.ObjectID, msg string) {
	_, _ = db.Client.Database(os.Getenv("MONGO_DB")).
		Collection("build_jobs").
		UpdateByID(ctx, id, bson.M{"$set": bson.M{"updatedAt": time.Now()}, "$push": bson.M{"logs": msg}})
}

func (p *Processor) setStatus(ctx context.Context, id primitive.ObjectID, status models.BuildStatus, extra bson.M) {
	set := bson.M{"status": status, "updatedAt": time.Now()}
	for k, v := range extra {
		set[k] = v
	}
	_, _ = db.Client.Database(os.Getenv("MONGO_DB")).
		Collection("build_jobs").
		UpdateByID(ctx, id, bson.M{"$set": set})
}

func (p *Processor) claimQueued(ctx context.Context) (*models.BuildJob, error) {
	var job models.BuildJob
	now := time.Now()
	filter := bson.M{
		"status": models.BuildQueued,
		"$or": []bson.M{
			{"nextAttemptAt": bson.M{"$exists": false}},
			{"nextAttemptAt": bson.M{"$lte": now}},
		},
	}
	err := db.Client.Database(os.Getenv("MONGO_DB")).
		Collection("build_jobs").
		FindOneAndUpdate(ctx,
			filter,
			bson.M{"$set": bson.M{"status": models.BuildRunning, "startedAt": now, "updatedAt": now}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&job)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (p *Processor) Run(ctx context.Context) {
	pollMs, _ := strconv.Atoi(os.Getenv("JOB_POLL_INTERVAL_MS"))
	if pollMs <= 0 {
		pollMs = 1000
	}
	ticker := time.NewTicker(time.Duration(pollMs) * time.Millisecond)
	defer ticker.Stop()

	// Heartbeat ticker for logging (every 30 seconds)
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeatTicker.C:
			// Log heartbeat with queued job count
			count, err := db.Client.Database(os.Getenv("MONGO_DB")).
				Collection("build_jobs").
				CountDocuments(ctx, bson.M{"status": models.BuildQueued})
			if err == nil {
				fmt.Printf("[WORKER] Heartbeat: queued=%d\n", count)
			}
		case <-ticker.C:
			if job, err := p.claimQueued(ctx); err == nil && job != nil {
				jobCtx, cancel := context.WithTimeout(ctx, jobTimeout)
				p.process(jobCtx, job)
				cancel()
			}
		}
	}
}

func (p *Processor) process(ctx context.Context, job *models.BuildJob) {
	jobID := job.ID
	p.logPush(ctx, jobID, "picked by worker")
	workRoot := filepath.Join(p.tmpDir, "job-"+jobID.Hex())
	_ = os.RemoveAll(workRoot)
	_ = os.MkdirAll(workRoot, 0o755)

	// 1) Download zipball
	p.logPush(ctx, jobID, "downloading repository zip...")
	zipPath, err := downloadRepoZip(ctx, workRoot, job.Repo.Owner, job.Repo.Repo, firstNonEmpty(job.Repo.Commit, job.Repo.Ref, "main"), job.OwnerID)
	if err != nil {
		p.fail(ctx, job, fmt.Errorf("download failed: %w", err))
		return
	}

	// 2) Unzip
	p.logPush(ctx, jobID, "extracting zip...")
	topDir, err := unzip(zipPath, workRoot)
	if err != nil {
		p.fail(ctx, job, fmt.Errorf("unzip failed: %w", err))
		return
	}

	// 3) Resolve working dir (linked folder)
	working := topDir
	if job.Repo.Path != "" {
		working = filepath.Join(topDir, job.Repo.Path)
	}
	if _, err := os.Stat(working); err != nil {
		p.fail(ctx, job, fmt.Errorf("invalid path in repo: %s", job.Repo.Path))
		return
	}

	// 4) Try to build
	p.logPush(ctx, jobID, "running build (npm) or static fallback...")
	if err := p.maybeBuildWithNode(ctx, jobID, working); err != nil {
		p.fail(ctx, job, err)
		return
	}

	// 5) Pick output folder
	outDir, err := pickOutputDir(working)
	if err != nil {
		p.fail(ctx, job, err)
		return
	}

	// 6) Modify index.html BEFORE upload
	p.logPush(ctx, jobID, "[STEP] Modifying index.html...")
	indexPath := filepath.Join(outDir, "index.html")
	if err := modifyIndexHTMLOnDisk(ctx, jobID, indexPath, job, p.logPush); err != nil {
		p.logPush(ctx, jobID, fmt.Sprintf("[WARN] index.html modification skipped: %v", err.Error()))
	}

	// 7) Upload files using PublishComponentFromDist (handles path rewriting)
	p.logPush(ctx, jobID, "[STEP] Uploading files to S3 and rewriting asset paths...")
	bundleURL, err := p.uploader.PublishComponentFromDist(ctx, job.Component, job.Version, outDir)
	if err != nil {
		p.fail(ctx, job, fmt.Errorf("upload failed: %w", err))
		return
	}
	p.logPush(ctx, jobID, fmt.Sprintf("[SUCCESS] Files uploaded. Bundle URL: %s", bundleURL))

	// 6) Update job success
	p.setStatus(ctx, jobID, models.BuildSuccess, bson.M{
		"endedAt":   time.Now(),
		"artifacts": models.BuildArtifact{BundleURL: bundleURL},
	})
	p.logPush(ctx, jobID, "build complete")

	// 7) Patch version with previewUrl + set build state
	verCol := db.Client.Database(os.Getenv("MONGO_DB")).Collection("component_versions")
	_, _ = verCol.UpdateOne(ctx,
		bson.M{"componentId": job.ComponentID, "version": job.Version},
		bson.M{"$set": bson.M{"previewUrl": bundleURL, "buildState": models.VersionBuildReady}},
	)
}

// maxBuildBackoff caps the wait between retries so a flaky job doesn't
// end up parked for an unreasonably long time before its next attempt.
const maxBuildBackoff = 2 * time.Minute

func (p *Processor) fail(ctx context.Context, job *models.BuildJob, err error) {
	p.logPush(ctx, job.ID, "ERROR: "+err.Error())

	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	attempts := job.Attempts + 1

	if attempts < maxAttempts {
		backoff := 10 * time.Second * time.Duration(1<<(attempts-1))
		if backoff > maxBuildBackoff {
			backoff = maxBuildBackoff
		}
		nextAttemptAt := time.Now().Add(backoff)
		p.logPush(ctx, job.ID, fmt.Sprintf("[RETRY] attempt %d/%d failed, retrying in %s", attempts, maxAttempts, backoff))
		p.setStatus(ctx, job.ID, models.BuildQueued, bson.M{
			"attempts":      attempts,
			"nextAttemptAt": nextAttemptAt,
		})
		return
	}

	p.setStatus(ctx, job.ID, models.BuildError, bson.M{"attempts": attempts, "endedAt": time.Now()})

	// Update component version status to error
	verCol := db.Client.Database(os.Getenv("MONGO_DB")).Collection("component_versions")
	_, _ = verCol.UpdateOne(ctx,
		bson.M{"componentId": job.ComponentID, "version": job.Version},
		bson.M{"$set": bson.M{"buildState": models.VersionBuildError}},
	)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

