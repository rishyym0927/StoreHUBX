package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Supported Node major versions. A repo's requested version is clamped into
// this set rather than rejected — see buildplan.ClampNodeVersion. Each maps to
// an allowlisted node:<v>-slim image tag.
const (
	NodeVersion18 = "18"
	NodeVersion20 = "20"
	NodeVersion22 = "22"

	// DefaultNodeVersion is used when a repo declares nothing usable.
	DefaultNodeVersion = NodeVersion20
)

// Package managers the build pipeline knows how to drive.
const (
	PackageManagerNpm  = "npm"
	PackageManagerPnpm = "pnpm"
	PackageManagerYarn = "yarn"
)

// BuildPlan sources, recorded on the plan so the worker can tell how a plan
// was arrived at (for metrics, logging, and the bad-plan invalidation rule).
const (
	// PlanSourceDeterministic means every field came from filesystem facts.
	PlanSourceDeterministic = "deterministic"
	// PlanSourceDeterministicAI means the framework/build command/output dir
	// were filled in by the AI fallback because no signature matched.
	PlanSourceDeterministicAI = "deterministic+ai"
	// PlanSourceLegacy means no usable plan was produced and the pre-existing
	// hardcoded "npm ci && npm run build" path ran instead.
	PlanSourceLegacy = "legacy"
)

// BuildPlan describes how to build one component from a checked-out repo.
//
// The fields split into two groups by trust:
//
//   - PackageManager, NodeVersion, AvailableScripts, InstallCmd, InstallDir and
//     BuildDir are always derived deterministically from the filesystem. They
//     are unambiguous facts about the repo, so the AI fallback is never asked
//     for them and structurally cannot override them.
//   - Framework, BuildCmd and OutputDirCandidates are set deterministically when
//     a known framework signature matches, and only otherwise are filled in by
//     the AI fallback.
//
// Regardless of origin, a plan must pass buildplan.Validate before any part of
// it reaches an exec call.
type BuildPlan struct {
	// Framework is a label like "vite" or "cra"; empty means unresolved.
	Framework string `bson:"framework" json:"framework"`

	// PackageManager is one of the PackageManager* constants.
	PackageManager string `bson:"packageManager" json:"packageManager"`

	// NodeVersion is one of the NodeVersion* constants (already clamped).
	NodeVersion string `bson:"nodeVersion" json:"nodeVersion"`

	// AvailableScripts holds the keys of package.json "scripts". BuildCmd may
	// only reference a script named here — this is what stops an AI-proposed
	// build command from naming something the repo doesn't actually define.
	AvailableScripts []string `bson:"availableScripts,omitempty" json:"availableScripts,omitempty"`

	// InstallCmd/BuildCmd are argv slices, never shell strings, so no quoting
	// or metacharacter handling is involved in constructing them.
	InstallCmd []string `bson:"installCmd,omitempty" json:"installCmd,omitempty"`
	BuildCmd   []string `bson:"buildCmd,omitempty" json:"buildCmd,omitempty"`

	// InstallDir is where dependencies are installed, relative to the repo
	// root. For a workspace/monorepo member this is the workspace root rather
	// than BuildDir, since the lockfile and node_modules live there.
	InstallDir string `bson:"installDir" json:"installDir"`

	// BuildDir is where the build command runs, relative to the repo root.
	// Mirrors BuildJob.Repo.Path.
	BuildDir string `bson:"buildDir" json:"buildDir"`

	// OutputDirCandidates is an ordered list of possible build output
	// directories relative to BuildDir. The first one that exists after the
	// build wins. It's a list because some frameworks moved their output
	// location between major versions (Angular 17+ emits dist/<p>/browser
	// where older versions emitted dist/<p>), and because an AI-supplied guess
	// is inherently uncertain.
	OutputDirCandidates []string `bson:"outputDirCandidates,omitempty" json:"outputDirCandidates,omitempty"`

	// Source is one of the PlanSource* constants.
	Source string `bson:"source" json:"source"`
}

// NeedsAIFill reports whether deterministic detection left the framework-shaped
// fields blank, which is the only condition under which the AI fallback runs.
func (p *BuildPlan) NeedsAIFill() bool {
	return p.Framework == "" && len(p.BuildCmd) == 0
}

// CachedBuildPlan memoizes an AI-derived BuildPlan so the fallback is called
// once per unique dependency set rather than once per build.
//
// The key is (Owner, Repo, Path, LockfileHash). Path is part of the key
// because one repo can host several components at different subpaths, and
// LockfileHash is part of it so a dependency change re-derives the plan.
type CachedBuildPlan struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Owner        string             `bson:"owner" json:"owner"`
	Repo         string             `bson:"repo" json:"repo"`
	Path         string             `bson:"path" json:"path"`
	LockfileHash string             `bson:"lockfileHash" json:"lockfileHash"`
	Plan         BuildPlan          `bson:"plan" json:"plan"`
	CreatedAt    time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time          `bson:"updatedAt" json:"updatedAt"`
}
