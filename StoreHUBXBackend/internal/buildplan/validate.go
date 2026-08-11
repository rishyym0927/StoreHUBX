package buildplan

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/rishyym0927/storehubx/internal/models"
)

// Validate is the single gate every BuildPlan passes before any part of it is
// executed, regardless of whether it came from Detect or the AI fallback.
//
// The model is allowlist-only: a plan may express one of a fixed set of known
// argv shapes and nothing else. It cannot express arbitrary text, so there is
// no quoting or metacharacter analysis involved — a command either matches an
// approved shape exactly or the plan is rejected wholesale.
//
// What this does and does not protect against is worth being precise about.
// It prevents a plan from naming a command the repo never defined — which is
// the injection path an AI-supplied or cache-poisoned plan would otherwise
// open. It does NOT make a hostile repository safe: a repo's own build scripts
// are arbitrary code, and `npm ci` runs postinstall hooks regardless. Container
// isolation (internal/worker/container_build.go) is the control for that; this
// is defense in depth layered under it.
func Validate(plan *models.BuildPlan) error {
	if plan == nil {
		return fmt.Errorf("plan is nil")
	}

	switch plan.PackageManager {
	case models.PackageManagerNpm, models.PackageManagerPnpm, models.PackageManagerYarn:
	default:
		return fmt.Errorf("unsupported package manager %q", plan.PackageManager)
	}

	switch plan.NodeVersion {
	case models.NodeVersion18, models.NodeVersion20, models.NodeVersion22:
	default:
		return fmt.Errorf("unsupported node version %q", plan.NodeVersion)
	}

	if err := validateRelDir(plan.InstallDir, "installDir"); err != nil {
		return err
	}
	if err := validateRelDir(plan.BuildDir, "buildDir"); err != nil {
		return err
	}

	// A static site has neither install nor build command; anything else must
	// have a build command to be worth running.
	isStatic := plan.Framework == "static"
	if !isStatic && len(plan.BuildCmd) == 0 {
		return fmt.Errorf("plan has no build command")
	}

	if len(plan.InstallCmd) > 0 {
		if err := validateInstallCmd(plan.PackageManager, plan.InstallCmd); err != nil {
			return err
		}
	}
	if len(plan.BuildCmd) > 0 {
		if err := validateRunCmd(plan.PackageManager, plan.BuildCmd, plan.AvailableScripts); err != nil {
			return err
		}
	}

	if len(plan.OutputDirCandidates) == 0 {
		return fmt.Errorf("plan has no output directory candidates")
	}
	for _, dir := range plan.OutputDirCandidates {
		if err := validateRelDir(dir, "outputDir"); err != nil {
			return err
		}
	}

	return nil
}

// approvedInstallCmds is the complete set of install invocations the pipeline
// will run, keyed by package manager.
var approvedInstallCmds = map[string][][]string{
	models.PackageManagerNpm: {
		{"npm", "ci"},
		{"npm", "install"},
	},
	models.PackageManagerPnpm: {
		{"pnpm", "install", "--frozen-lockfile"},
		{"pnpm", "install"},
	},
	models.PackageManagerYarn: {
		{"yarn", "install", "--frozen-lockfile"},
		{"yarn", "install"},
	},
}

func validateInstallCmd(pm string, cmd []string) error {
	for _, approved := range approvedInstallCmds[pm] {
		if equalArgv(approved, cmd) {
			return nil
		}
	}
	return fmt.Errorf("install command %q is not an approved %s invocation", strings.Join(cmd, " "), pm)
}

// validateRunCmd accepts exactly `<pm> run <script>`, where script must be a
// key that genuinely exists in the repo's package.json.
//
// Checking the script against availableScripts (populated deterministically by
// Detect, never by the model) is what keeps an AI-proposed command bounded to
// the repo's own declared entry points.
func validateRunCmd(pm string, cmd []string, availableScripts []string) error {
	if len(cmd) != 3 {
		return fmt.Errorf("build command must be exactly %q run <script>, got %q", pm, strings.Join(cmd, " "))
	}
	if cmd[0] != pm {
		return fmt.Errorf("build command must invoke %q, got %q", pm, cmd[0])
	}
	if cmd[1] != "run" {
		return fmt.Errorf("build command must use %q run, got %q", pm, cmd[1])
	}

	script := cmd[2]
	if script == "" {
		return fmt.Errorf("build command names an empty script")
	}
	for _, available := range availableScripts {
		if available == script {
			return nil
		}
	}
	return fmt.Errorf("build script %q is not defined in package.json (available: %s)",
		script, strings.Join(availableScripts, ", "))
}

// validateRelDir rejects anything that isn't a plain relative path contained
// within the repo: absolute paths, parent traversal, and (on the off chance a
// model emits one) Windows-style drive paths.
func validateRelDir(dir, field string) error {
	if dir == "" || dir == "." {
		return nil // repo root / build dir root
	}
	if filepath.IsAbs(dir) || strings.HasPrefix(dir, "/") {
		return fmt.Errorf("%s %q must be relative", field, dir)
	}
	if strings.Contains(dir, ":") {
		return fmt.Errorf("%s %q must not contain a drive or scheme separator", field, dir)
	}
	// Clean resolves any interior ".." — if the result still escapes, reject.
	cleaned := filepath.Clean(dir)
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return fmt.Errorf("%s %q escapes the repository root", field, dir)
	}
	return nil
}

func equalArgv(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
