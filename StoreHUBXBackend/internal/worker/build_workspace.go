package worker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/rishyym0927/storehubx/internal/ai"
	"github.com/rishyym0927/storehubx/internal/buildplan"
	"github.com/rishyym0927/storehubx/internal/metrics"
	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// aiPlanKey identifies a cached AI-derived plan, so a failed build can
// invalidate the exact entry that produced it.
type aiPlanKey struct {
	owner, repo, path, hash string
}

// usedAIPlans records, per job, the cache entry a running build came from.
// Only populated when the plan was AI-derived — a deterministic plan has
// nothing to invalidate.
//
// Keyed by job id hex rather than threaded through fail() because fail() is
// shared by every failure path in process(), most of which happen before a
// plan even exists.
var usedAIPlans = newPlanTracker()

// buildWorkspace turns an extracted repo into a directory ready to publish.
//
// Order of preference:
//  1. deterministic detection (always runs, always fills what it can)
//  2. cached AI plan, then a fresh AI call, but only for the framework-shaped
//     fields deterministic detection left blank
//  3. the legacy hardcoded npm build, if no validated plan could be produced
//     or the sandbox isn't available
//
// repoRoot is the extracted repository root; workDir is the component's
// subdirectory within it. Returns the directory holding the build output.
func (p *Processor) buildWorkspace(ctx context.Context, job *models.BuildJob, repoRoot, workDir string) (string, error) {
	jobID := job.ID

	plan := buildplan.Detect(repoRoot, job.Repo.Path)
	hash := buildplan.LockfileHash(repoRoot, plan.BuildDir, plan.InstallDir)
	key := aiPlanKey{owner: job.Repo.Owner, repo: job.Repo.Repo, path: job.Repo.Path, hash: hash}

	// Only reach for AI when deterministic detection found no framework.
	if plan.NeedsAIFill() {
		if filled, ok := p.fillPlanFromAI(ctx, jobID, plan, key, repoRoot); ok {
			plan = filled
		}
	}

	planErr := buildplan.Validate(plan)
	usable := planErr == nil

	switch {
	case usable && SandboxAvailable():
		if plan.Source == models.PlanSourceDeterministicAI {
			usedAIPlans.set(jobID.Hex(), key)
		}
		p.logPush(ctx, jobID, fmt.Sprintf("[PLAN] %s: %s", plan.Source, plan.Framework))
		metrics.BuildPlanTotal.WithLabelValues(plan.Source).Inc()
		metrics.BuildSandboxTotal.WithLabelValues("container").Inc()

		if err := p.runContainerizedBuild(ctx, jobID, repoRoot, plan); err != nil {
			return "", err
		}
		return resolveOutputDir(workDir, plan.OutputDirCandidates)

	default:
		p.logPush(ctx, jobID, fmt.Sprintf("[PLAN] %s: %s", models.PlanSourceLegacy, legacyReason(usable, planErr)))
		metrics.BuildPlanTotal.WithLabelValues(models.PlanSourceLegacy).Inc()
		metrics.BuildSandboxTotal.WithLabelValues("host").Inc()

		p.logPush(ctx, jobID, "running build (npm) or static fallback...")
		if err := p.maybeBuildWithNode(ctx, jobID, workDir); err != nil {
			return "", err
		}
		return pickOutputDir(workDir)
	}
}

// fillPlanFromAI tries the cache, then a live Groq call, to supply the fields
// deterministic detection couldn't. Every failure is logged with its reason and
// reported as "not filled" so the caller falls through to the legacy path —
// this is strictly best-effort and never blocks a build.
func (p *Processor) fillPlanFromAI(ctx context.Context, jobID primitive.ObjectID, plan *models.BuildPlan, key aiPlanKey, repoRoot string) (*models.BuildPlan, bool) {
	if cached, ok := buildplan.FindCachedPlan(ctx, key.owner, key.repo, key.path, key.hash); ok {
		merged := mergeAIFields(plan, cached)
		p.logPush(ctx, jobID, fmt.Sprintf("[PLAN] reusing cached plan: %s", merged.Framework))
		return merged, true
	}

	if !ai.BuildPlanFallbackEnabled() {
		return nil, false
	}

	pkgJSON := buildplan.RawPackageJSON(repoRoot, plan.BuildDir)
	if len(pkgJSON) == 0 {
		return nil, false
	}

	filled, err := ai.FillMissingFields(ctx, string(pkgJSON), *plan)
	if err != nil {
		p.logPush(ctx, jobID, fmt.Sprintf("[PLAN] ai fill failed: %v", err))
		return nil, false
	}

	// Validate before caching so a bad plan is never persisted for reuse.
	if err := buildplan.Validate(filled); err != nil {
		p.logPush(ctx, jobID, fmt.Sprintf("[PLAN] ai plan rejected by validation: %v", err))
		return nil, false
	}

	if err := buildplan.UpsertPlan(ctx, key.owner, key.repo, key.path, key.hash, filled); err != nil {
		// A cache miss next time costs one extra API call, nothing more.
		p.logPush(ctx, jobID, fmt.Sprintf("[PLAN] warning: could not cache plan: %v", err))
	}
	return filled, true
}

// mergeAIFields grafts a cached plan's AI-derived fields onto a freshly
// detected plan.
//
// Deliberately field-by-field rather than using the cached plan wholesale: the
// deterministic fields must come from this checkout's filesystem, not from
// whatever was true when the entry was written. A cached document is untrusted
// input, and Validate runs on the result regardless.
func mergeAIFields(fresh, cached *models.BuildPlan) *models.BuildPlan {
	merged := *fresh
	merged.Framework = cached.Framework
	merged.OutputDirCandidates = cached.OutputDirCandidates
	merged.Source = models.PlanSourceDeterministicAI

	// Rebuild the command from this checkout's package manager, keeping only
	// the script name from cache, so a cached entry can't smuggle in a
	// different binary.
	if len(cached.BuildCmd) == 3 {
		merged.BuildCmd = []string{fresh.PackageManager, "run", cached.BuildCmd[2]}
	}
	return &merged
}

// resolveOutputDir picks the first candidate that actually exists.
//
// Candidates are guesses — a framework may have changed its output location
// between versions, or an AI-supplied path may simply be wrong. Failing loudly
// here is important: the alternative is publishing an empty or wrong directory
// as a successful build, which reads as a green build with a blank preview.
func resolveOutputDir(workDir string, candidates []string) (string, error) {
	for _, c := range candidates {
		full := filepath.Join(workDir, c)
		info, err := os.Stat(full)
		if err != nil || !info.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(full, "index.html")); err != nil {
			// A directory without index.html can't be served as a preview;
			// keep looking rather than publishing something unusable.
			continue
		}
		return full, nil
	}
	return "", fmt.Errorf("declared output dir(s) not found after build (or missing index.html): %v", candidates)
}

func legacyReason(usable bool, planErr error) string {
	switch {
	case !usable && planErr != nil:
		return "no usable plan (" + planErr.Error() + ")"
	case !SandboxAvailable():
		return "docker sandbox unavailable"
	default:
		return "unknown"
	}
}
