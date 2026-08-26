package worker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rishyym0927/storehubx/internal/cache"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/metrics"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/notify"
	"github.com/rishyym0927/storehubx/internal/storage"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// jobTimeout bounds an entire job (download, build, upload) so a stuck
// network call or hung subprocess can't wedge this single-threaded
// polling loop forever, blocking every job queued after it.
const jobTimeout = 10 * time.Minute

// BuildStreamKey/BuildStreamGroup back the Redis Streams queue that
// EnqueueBuild pushes onto (internal/handlers/build.go) so a worker is
// notified immediately instead of only discovering new jobs on the next
// poll tick.
const (
	BuildStreamKey   = "builds:stream"
	buildStreamGroup = "workers"
)

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

// Run drives the worker. When Redis is available, new jobs are picked up
// immediately via a blocking read on the "builds:stream" Redis Stream
// (pushed to by EnqueueBuild), with a slower Mongo poll running alongside
// as a fallback sweep — it catches retries (which become "queued" again
// without a fresh stream message) and any job whose XADD was dropped.
// Without Redis, it falls back entirely to the original fast Mongo poll.
func (p *Processor) Run(ctx context.Context) {
	go p.heartbeatLoop(ctx)

	if cache.Client != nil {
		go p.pollLoop(ctx, 30*time.Second)
		p.streamLoop(ctx)
		return
	}

	pollMs, _ := strconv.Atoi(os.Getenv("JOB_POLL_INTERVAL_MS"))
	if pollMs <= 0 {
		pollMs = 1000
	}
	p.pollLoop(ctx, time.Duration(pollMs)*time.Millisecond)
}

func (p *Processor) heartbeatLoop(ctx context.Context) {
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeatTicker.C:
			count, err := db.Client.Database(os.Getenv("MONGO_DB")).
				Collection("build_jobs").
				CountDocuments(ctx, bson.M{"status": models.BuildQueued})
			if err == nil {
				fmt.Printf("[WORKER] Heartbeat: queued=%d\n", count)
				metrics.BuildQueueDepth.Set(float64(count))
			}
		}
	}
}

func (p *Processor) pollLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if job, err := p.claimQueued(ctx); err == nil && job != nil {
				jobCtx, cancel := context.WithTimeout(ctx, jobTimeout)
				p.process(jobCtx, job)
				cancel()
			}
		}
	}
}

// streamLoop blocks on Redis Streams for newly enqueued jobs. Each message
// only carries a job id — claimSpecific still does the atomic Mongo
// status flip, so a message that arrives for a job another path (e.g. the
// fallback sweep) already claimed is simply a no-op ack.
func (p *Processor) streamLoop(ctx context.Context) {
	consumer := fmt.Sprintf("worker-%d", os.Getpid())

	if err := cache.Client.XGroupCreateMkStream(ctx, BuildStreamKey, buildStreamGroup, "$").Err(); err != nil &&
		!strings.Contains(err.Error(), "BUSYGROUP") {
		fmt.Printf("[WORKER] failed to create stream consumer group: %v\n", err)
	}

	for {
		if ctx.Err() != nil {
			return
		}

		res, err := cache.Client.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    buildStreamGroup,
			Consumer: consumer,
			Streams:  []string{BuildStreamKey, ">"},
			Count:    1,
			Block:    5 * time.Second,
		}).Result()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			continue // timeout (no new messages) or transient Redis error
		}

		for _, stream := range res {
			for _, msg := range stream.Messages {
				p.handleStreamMessage(ctx, msg)
			}
		}
	}
}

func (p *Processor) handleStreamMessage(ctx context.Context, msg redis.XMessage) {
	defer cache.Client.XAck(ctx, BuildStreamKey, buildStreamGroup, msg.ID)

	jobIDHex, _ := msg.Values["jobId"].(string)
	oid, err := primitive.ObjectIDFromHex(jobIDHex)
	if err != nil {
		return
	}

	job, err := p.claimSpecific(ctx, oid)
	if err != nil || job == nil {
		return
	}

	jobCtx, cancel := context.WithTimeout(ctx, jobTimeout)
	p.process(jobCtx, job)
	cancel()
}

func (p *Processor) claimSpecific(ctx context.Context, id primitive.ObjectID) (*models.BuildJob, error) {
	var job models.BuildJob
	now := time.Now()
	filter := bson.M{
		"_id":    id,
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

func (p *Processor) process(ctx context.Context, job *models.BuildJob) {
	jobID := job.ID
	p.logPush(ctx, jobID, "picked by worker")
	workRoot := filepath.Join(p.tmpDir, "job-"+jobID.Hex())
	_ = os.RemoveAll(workRoot)
	_ = os.MkdirAll(workRoot, 0o755)
	// Clean up the extracted repo/node_modules/dist regardless of how this
	// job finishes (success, any failure return, or a panic) so BUILD_TMP_DIR
	// doesn't grow unbounded across jobs.
	defer os.RemoveAll(workRoot)

	p.logPush(ctx, jobID, "downloading repository zip...")
	zipPath, err := downloadRepoZip(ctx, workRoot, job.Repo.Owner, job.Repo.Repo, firstNonEmpty(job.Repo.Commit, job.Repo.Ref, "main"), job.OwnerID)
	if err != nil {
		p.fail(ctx, job, fmt.Errorf("download failed: %w", err))
		return
	}

	p.logPush(ctx, jobID, "extracting zip...")
	topDir, err := unzip(zipPath, workRoot)
	if err != nil {
		p.fail(ctx, job, fmt.Errorf("unzip failed: %w", err))
		return
	}

	working := topDir
	if job.Repo.Path != "" {
		working = filepath.Join(topDir, job.Repo.Path)
	}
	if _, err := os.Stat(working); err != nil {
		p.fail(ctx, job, fmt.Errorf("invalid path in repo: %s", job.Repo.Path))
		return
	}

	p.logPush(ctx, jobID, "running build (npm) or static fallback...")
	if err := p.maybeBuildWithNode(ctx, jobID, working); err != nil {
		p.fail(ctx, job, err)
		return
	}

	outDir, err := pickOutputDir(working)
	if err != nil {
		p.fail(ctx, job, err)
		return
	}

	p.logPush(ctx, jobID, "[STEP] Modifying index.html...")
	indexPath := filepath.Join(outDir, "index.html")
	if err := modifyIndexHTMLOnDisk(ctx, jobID, indexPath, job, p.logPush); err != nil {
		p.logPush(ctx, jobID, fmt.Sprintf("[WARN] index.html modification skipped: %v", err.Error()))
	}

	p.logPush(ctx, jobID, "[STEP] Uploading files to S3 and rewriting asset paths...")
	bundleURL, err := p.uploader.PublishComponentFromDist(ctx, job.Component, job.Version, outDir)
	if err != nil {
		p.fail(ctx, job, fmt.Errorf("upload failed: %w", err))
		return
	}
	p.logPush(ctx, jobID, fmt.Sprintf("[SUCCESS] Files uploaded. Bundle URL: %s", bundleURL))

	p.setStatus(ctx, jobID, models.BuildSuccess, bson.M{
		"endedAt":   time.Now(),
		"artifacts": models.BuildArtifact{BundleURL: bundleURL},
	})
	p.logPush(ctx, jobID, "build complete")
	metrics.BuildsTotal.WithLabelValues("success").Inc()
	metrics.BuildDuration.Observe(time.Since(jobStartTime(job)).Seconds())
	notify.BuildCompleted(ctx, job.OwnerID, job.ComponentID, job.Component, job.Version, true)
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
	metrics.BuildsTotal.WithLabelValues("error").Inc()
	metrics.BuildDuration.Observe(time.Since(jobStartTime(job)).Seconds())
	notify.BuildCompleted(ctx, job.OwnerID, job.ComponentID, job.Component, job.Version, false)
}

// jobStartTime returns when this attempt began, for build-duration metrics.
func jobStartTime(job *models.BuildJob) time.Time {
	if job.StartedAt != nil {
		return *job.StartedAt
	}
	return job.CreatedAt
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
