// Package buildplan turns a checked-out repository into a BuildPlan: the
// package manager, Node version, install/build commands and output directory
// needed to build it.
//
// Detection is deterministic-first. Detect reads the filesystem and fills in
// every field it can establish as fact, and only leaves the framework-shaped
// fields (framework label, build command, output directory) blank when no
// known signature matches. Those blanks are the sole input to the AI fallback
// in internal/ai — everything else is never guessed.
//
// Validate is the security boundary for both paths: no plan, however derived,
// reaches an exec call without passing it.
package buildplan

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/rishyym0927/storehubx/internal/models"
)

// packageJSON is the subset of package.json detection cares about.
type packageJSON struct {
	Scripts         map[string]string `json:"scripts"`
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
	Engines         struct {
		Node string `json:"node"`
	} `json:"engines"`
	// Workspaces is either ["pkgs/*"] or {"packages": ["pkgs/*"]} depending on
	// the tool, so it's decoded loosely and only tested for presence.
	Workspaces json.RawMessage `json:"workspaces"`
}

// Detect inspects the repo and returns a plan. It never returns nil: callers
// always get back the deterministic facts, even when the framework couldn't be
// identified (in which case BuildPlan.NeedsAIFill reports true).
//
// repoRoot is the extracted repository root; subPath is the component's
// subdirectory within it (BuildJob.Repo.Path), which may be empty.
func Detect(repoRoot, subPath string) *models.BuildPlan {
	buildDir := filepath.Clean(strings.TrimPrefix(subPath, "/"))
	if buildDir == "." || buildDir == string(filepath.Separator) {
		buildDir = ""
	}

	plan := &models.BuildPlan{
		BuildDir: buildDir,
		Source:   models.PlanSourceDeterministic,
	}

	buildAbs := filepath.Join(repoRoot, buildDir)
	pkg, pkgFound := readPackageJSON(buildAbs)

	// Dependencies install at the workspace root when this component is a
	// member of one; a workspace member usually has no lockfile of its own.
	installDir := findWorkspaceRoot(repoRoot, buildDir)
	plan.InstallDir = installDir
	installAbs := filepath.Join(repoRoot, installDir)

	plan.PackageManager = detectPackageManager(installAbs)
	plan.NodeVersion = detectNodeVersion(buildAbs, pkg)

	if pkgFound {
		plan.AvailableScripts = scriptNames(pkg)
		plan.InstallCmd = installCommand(plan.PackageManager)
	}

	// A repo with no package.json but a bare index.html can be served as-is.
	if !pkgFound {
		if _, err := os.Stat(filepath.Join(buildAbs, "index.html")); err == nil {
			plan.Framework = "static"
			plan.OutputDirCandidates = []string{"."}
			plan.InstallCmd = nil
			plan.BuildCmd = nil
		}
		return plan
	}

	if fw, outputs, script := matchFramework(buildAbs, pkg); fw != "" {
		plan.Framework = fw
		plan.OutputDirCandidates = outputs
		plan.BuildCmd = runCommand(plan.PackageManager, script)
	}

	return plan
}

// readPackageJSON loads package.json from dir. The bool reports whether the
// file existed and parsed; a malformed package.json is treated as absent so
// detection degrades to the legacy path rather than acting on garbage.
func readPackageJSON(dir string) (*packageJSON, bool) {
	raw, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil, false
	}
	var pkg packageJSON
	if err := json.Unmarshal(raw, &pkg); err != nil {
		return nil, false
	}
	return &pkg, true
}

// RawPackageJSON returns the raw package.json bytes for a component directory,
// used to give the AI fallback context and to key the plan cache.
func RawPackageJSON(repoRoot, buildDir string) []byte {
	raw, err := os.ReadFile(filepath.Join(repoRoot, buildDir, "package.json"))
	if err != nil {
		return nil
	}
	return raw
}

// findWorkspaceRoot walks from buildDir up to repoRoot looking for a workspace
// definition. It returns the directory dependencies should be installed in,
// relative to repoRoot — buildDir itself when this isn't a workspace member.
func findWorkspaceRoot(repoRoot, buildDir string) string {
	if buildDir == "" {
		return ""
	}

	parts := strings.Split(filepath.ToSlash(buildDir), "/")
	// Walk ancestors nearest-first so the closest workspace root wins, but
	// stop short of buildDir itself (it's the fallback, not a candidate).
	for i := len(parts) - 1; i >= 0; i-- {
		ancestor := strings.Join(parts[:i], "/")
		if isWorkspaceRoot(filepath.Join(repoRoot, ancestor)) {
			return ancestor
		}
	}
	return buildDir
}

// isWorkspaceRoot reports whether dir declares a JS workspace, via either
// pnpm-workspace.yaml or a "workspaces" key in package.json (npm/yarn).
func isWorkspaceRoot(dir string) bool {
	if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
		return true
	}
	if pkg, ok := readPackageJSON(dir); ok && len(pkg.Workspaces) > 0 {
		// "workspaces": null / {} / [] shouldn't count as a workspace root
		s := strings.TrimSpace(string(pkg.Workspaces))
		if s != "null" && s != "{}" && s != "[]" {
			return true
		}
	}
	return false
}

// detectPackageManager picks the package manager from the lockfile present in
// dir, defaulting to npm.
func detectPackageManager(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "pnpm-lock.yaml")); err == nil {
		return models.PackageManagerPnpm
	}
	if _, err := os.Stat(filepath.Join(dir, "yarn.lock")); err == nil {
		return models.PackageManagerYarn
	}
	return models.PackageManagerNpm
}

// detectNodeVersion reads .nvmrc or package.json engines.node and clamps the
// result into the supported set.
func detectNodeVersion(dir string, pkg *packageJSON) string {
	if raw, err := os.ReadFile(filepath.Join(dir, ".nvmrc")); err == nil {
		if v := ClampNodeVersion(string(raw)); v != "" {
			return v
		}
	}
	if pkg != nil && pkg.Engines.Node != "" {
		if v := ClampNodeVersion(pkg.Engines.Node); v != "" {
			return v
		}
	}
	return models.DefaultNodeVersion
}

// ClampNodeVersion maps a requested Node version onto the nearest supported
// major, rather than rejecting unsupported ones.
//
// Clamping (not rejecting) is deliberate: a rejected version would fall
// through to the un-sandboxed legacy build path, meaning an unusual Node pin
// would get *less* isolation than a common one. Running Node 16 code on Node
// 18 may fail the build honestly; silently dropping the sandbox is worse.
//
// Returns "" only when nothing version-like could be parsed, letting the
// caller fall back to the default.
func ClampNodeVersion(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// Strip range/prefix noise: "^20.1.0", ">=18", "v22", "lts/*", "20.x"
	s = strings.TrimPrefix(s, "v")
	var digits strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
			continue
		}
		if digits.Len() > 0 {
			break // stop at the first non-digit after we've started
		}
	}
	if digits.Len() == 0 {
		return "" // "lts/*", "latest", "node" — nothing numeric to clamp
	}
	major, err := strconv.Atoi(digits.String())
	if err != nil {
		return ""
	}

	switch {
	case major <= 18:
		return models.NodeVersion18
	case major <= 21:
		return models.NodeVersion20
	default:
		return models.NodeVersion22
	}
}

func scriptNames(pkg *packageJSON) []string {
	if pkg == nil || len(pkg.Scripts) == 0 {
		return nil
	}
	names := make([]string, 0, len(pkg.Scripts))
	for name := range pkg.Scripts {
		names = append(names, name)
	}
	return names
}

func hasDependency(pkg *packageJSON, name string) bool {
	if pkg == nil {
		return false
	}
	if _, ok := pkg.Dependencies[name]; ok {
		return true
	}
	_, ok := pkg.DevDependencies[name]
	return ok
}

func hasScript(pkg *packageJSON, name string) bool {
	if pkg == nil {
		return false
	}
	_, ok := pkg.Scripts[name]
	return ok
}

// fileExists reports whether any of names exists in dir.
func fileExists(dir string, names ...string) bool {
	for _, n := range names {
		if _, err := os.Stat(filepath.Join(dir, n)); err == nil {
			return true
		}
	}
	return false
}

// matchFramework identifies the framework from config-file signatures and
// dependencies, returning the framework label, ordered output-directory
// candidates, and the package.json script to run.
//
// Returns ("", nil, "") when nothing matches — the only trigger for AI fill.
func matchFramework(dir string, pkg *packageJSON) (framework string, outputs []string, script string) {
	// Every signature requires a "build" script to actually be runnable;
	// without one there's nothing deterministic to invoke.
	if !hasScript(pkg, "build") {
		return "", nil, ""
	}

	switch {
	case fileExists(dir, "vite.config.js", "vite.config.ts", "vite.config.mjs", "vite.config.mts"):
		return "vite", []string{"dist"}, "build"

	case fileExists(dir, "angular.json"):
		return "angular", angularOutputs(dir), "build"

	case hasDependency(pkg, "react-scripts"):
		return "cra", []string{"build"}, "build"

	case fileExists(dir, "gatsby-config.js", "gatsby-config.ts", "gatsby-config.mjs"):
		return "gatsby", []string{"public"}, "build"

	case fileExists(dir, "astro.config.mjs", "astro.config.js", "astro.config.ts"):
		return "astro", []string{"dist"}, "build"

	case fileExists(dir, "svelte.config.js", "svelte.config.mjs"):
		// adapter-static writes "build"; plain Vite+Svelte writes "dist"
		return "sveltekit", []string{"build", "dist"}, "build"
	}

	return "", nil, ""
}

// angularOutputs returns candidate output dirs for an Angular workspace.
// Angular 17+ nests the browser bundle under dist/<project>/browser while
// older versions wrote straight to dist/<project>, so both are offered and the
// first that exists after the build wins.
func angularOutputs(dir string) []string {
	project := firstAngularProject(dir)
	if project == "" {
		// Unknown project name — offer the generic shapes.
		return []string{"dist"}
	}
	return []string{
		filepath.ToSlash(filepath.Join("dist", project, "browser")),
		filepath.ToSlash(filepath.Join("dist", project)),
		"dist",
	}
}

func firstAngularProject(dir string) string {
	raw, err := os.ReadFile(filepath.Join(dir, "angular.json"))
	if err != nil {
		return ""
	}
	var cfg struct {
		DefaultProject string                     `json:"defaultProject"`
		Projects       map[string]json.RawMessage `json:"projects"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return ""
	}
	if cfg.DefaultProject != "" {
		return cfg.DefaultProject
	}
	// Map iteration order is random, so prefer the lexicographically first
	// name to keep detection reproducible across runs.
	best := ""
	for name := range cfg.Projects {
		if best == "" || name < best {
			best = name
		}
	}
	return best
}

// installCommand returns the lockfile-respecting install argv for pm.
func installCommand(pm string) []string {
	switch pm {
	case models.PackageManagerPnpm:
		return []string{"pnpm", "install", "--frozen-lockfile"}
	case models.PackageManagerYarn:
		return []string{"yarn", "install", "--frozen-lockfile"}
	default:
		return []string{"npm", "ci"}
	}
}

// runCommand returns the argv to run a named package.json script.
func runCommand(pm, script string) []string {
	if script == "" {
		return nil
	}
	return []string{pm, "run", script}
}
