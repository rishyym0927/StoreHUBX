package buildplan

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rishyym0927/storehubx/internal/models"
)

// writeRepo materializes a map of relative path -> file contents into a temp
// dir and returns the root.
func writeRepo(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, content := range files {
		full := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", full, err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", full, err)
		}
	}
	return root
}

const vitePkg = `{"scripts":{"dev":"vite","build":"vite build"}}`

func TestDetectFrameworks(t *testing.T) {
	tests := []struct {
		name        string
		files       map[string]string
		wantFw      string
		wantOutputs []string
		wantBuild   []string
	}{
		{
			name: "vite",
			files: map[string]string{
				"package.json":   vitePkg,
				"vite.config.ts": "export default {}",
			},
			wantFw:      "vite",
			wantOutputs: []string{"dist"},
			wantBuild:   []string{"npm", "run", "build"},
		},
		{
			name: "cra via react-scripts dependency",
			files: map[string]string{
				"package.json": `{"scripts":{"build":"react-scripts build"},"dependencies":{"react-scripts":"5.0.1"}}`,
			},
			wantFw:      "cra",
			wantOutputs: []string{"build"},
			wantBuild:   []string{"npm", "run", "build"},
		},
		{
			name: "astro",
			files: map[string]string{
				"package.json":     `{"scripts":{"build":"astro build"}}`,
				"astro.config.mjs": "export default {}",
			},
			wantFw:      "astro",
			wantOutputs: []string{"dist"},
		},
		{
			name: "gatsby",
			files: map[string]string{
				"package.json":     `{"scripts":{"build":"gatsby build"}}`,
				"gatsby-config.js": "module.exports = {}",
			},
			wantFw:      "gatsby",
			wantOutputs: []string{"public"},
		},
		{
			name: "angular 17+ prefers browser subdir",
			files: map[string]string{
				"package.json": `{"scripts":{"build":"ng build"}}`,
				"angular.json": `{"projects":{"my-app":{}}}`,
			},
			wantFw:      "angular",
			wantOutputs: []string{"dist/my-app/browser", "dist/my-app", "dist"},
		},
		{
			name: "static site with no package.json",
			files: map[string]string{
				"index.html": "<html></html>",
			},
			wantFw:      "static",
			wantOutputs: []string{"."},
		},
		{
			name: "unrecognized framework leaves fields blank for AI",
			files: map[string]string{
				"package.json": `{"scripts":{"build":"some-exotic-bundler"}}`,
			},
			wantFw: "",
		},
		{
			name: "no build script means no deterministic match",
			files: map[string]string{
				"package.json":   `{"scripts":{"dev":"vite"}}`,
				"vite.config.ts": "export default {}",
			},
			wantFw: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			root := writeRepo(t, tc.files)
			plan := Detect(root, "")
			if plan == nil {
				t.Fatal("Detect returned nil; it must always return a plan")
			}
			if plan.Framework != tc.wantFw {
				t.Errorf("framework = %q, want %q", plan.Framework, tc.wantFw)
			}
			if tc.wantOutputs != nil {
				if len(plan.OutputDirCandidates) != len(tc.wantOutputs) {
					t.Fatalf("outputs = %v, want %v", plan.OutputDirCandidates, tc.wantOutputs)
				}
				for i := range tc.wantOutputs {
					if plan.OutputDirCandidates[i] != tc.wantOutputs[i] {
						t.Errorf("outputs = %v, want %v", plan.OutputDirCandidates, tc.wantOutputs)
						break
					}
				}
			}
			if tc.wantBuild != nil && !equalArgv(plan.BuildCmd, tc.wantBuild) {
				t.Errorf("buildCmd = %v, want %v", plan.BuildCmd, tc.wantBuild)
			}
			// Deterministic plans that matched must survive validation.
			if tc.wantFw != "" {
				if err := Validate(plan); err != nil {
					t.Errorf("deterministically-detected plan failed validation: %v", err)
				}
			}
		})
	}
}

func TestDetectPackageManager(t *testing.T) {
	cases := []struct {
		lockfile string
		want     string
		wantCmd  []string
	}{
		{"package-lock.json", models.PackageManagerNpm, []string{"npm", "ci"}},
		{"pnpm-lock.yaml", models.PackageManagerPnpm, []string{"pnpm", "install", "--frozen-lockfile"}},
		{"yarn.lock", models.PackageManagerYarn, []string{"yarn", "install", "--frozen-lockfile"}},
	}
	for _, tc := range cases {
		t.Run(tc.lockfile, func(t *testing.T) {
			root := writeRepo(t, map[string]string{
				"package.json":   vitePkg,
				"vite.config.ts": "export default {}",
				tc.lockfile:      "",
			})
			plan := Detect(root, "")
			if plan.PackageManager != tc.want {
				t.Errorf("packageManager = %q, want %q", plan.PackageManager, tc.want)
			}
			if !equalArgv(plan.InstallCmd, tc.wantCmd) {
				t.Errorf("installCmd = %v, want %v", plan.InstallCmd, tc.wantCmd)
			}
		})
	}
}

// TestDetectWorkspaceResolution covers the monorepo case: a component living
// at a subpath whose dependencies must be installed at the workspace root,
// where the lockfile actually lives.
func TestDetectWorkspaceResolution(t *testing.T) {
	t.Run("pnpm workspace member installs at root", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"pnpm-workspace.yaml":        "packages:\n  - 'packages/*'\n",
			"pnpm-lock.yaml":             "",
			"package.json":               `{"name":"root","private":true}`,
			"packages/ui/package.json":   vitePkg,
			"packages/ui/vite.config.ts": "export default {}",
		})
		plan := Detect(root, "packages/ui")

		if plan.BuildDir != "packages/ui" {
			t.Errorf("buildDir = %q, want %q", plan.BuildDir, "packages/ui")
		}
		if plan.InstallDir != "" {
			t.Errorf("installDir = %q, want workspace root %q", plan.InstallDir, "")
		}
		// The lockfile lives at the root, so pnpm must be detected from there
		// even though packages/ui has no lockfile of its own.
		if plan.PackageManager != models.PackageManagerPnpm {
			t.Errorf("packageManager = %q, want pnpm (lockfile is at workspace root)", plan.PackageManager)
		}
		if plan.Framework != "vite" {
			t.Errorf("framework = %q, want vite (detected in buildDir)", plan.Framework)
		}
		if err := Validate(plan); err != nil {
			t.Errorf("workspace plan failed validation: %v", err)
		}
	})

	t.Run("npm workspaces key marks the root", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"package.json":                `{"name":"root","workspaces":["packages/*"]}`,
			"package-lock.json":           "",
			"packages/app/package.json":   vitePkg,
			"packages/app/vite.config.ts": "export default {}",
		})
		plan := Detect(root, "packages/app")
		if plan.InstallDir != "" {
			t.Errorf("installDir = %q, want workspace root", plan.InstallDir)
		}
	})

	t.Run("standalone subdir installs in place", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"README.md":                      "not a workspace",
			"packages/app/package.json":      vitePkg,
			"packages/app/vite.config.ts":    "export default {}",
			"packages/app/package-lock.json": "",
		})
		plan := Detect(root, "packages/app")
		if plan.InstallDir != "packages/app" {
			t.Errorf("installDir = %q, want %q (no workspace root above)", plan.InstallDir, "packages/app")
		}
	})

	t.Run("empty workspaces key is not a workspace root", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"package.json":                `{"name":"root","workspaces":[]}`,
			"packages/app/package.json":   vitePkg,
			"packages/app/vite.config.ts": "export default {}",
		})
		plan := Detect(root, "packages/app")
		if plan.InstallDir != "packages/app" {
			t.Errorf("installDir = %q, want %q", plan.InstallDir, "packages/app")
		}
	})
}

func TestDetectNodeVersion(t *testing.T) {
	t.Run("nvmrc is clamped not rejected", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"package.json":   vitePkg,
			"vite.config.ts": "export default {}",
			".nvmrc":         "16\n",
		})
		plan := Detect(root, "")
		if plan.NodeVersion != models.NodeVersion18 {
			t.Errorf("nodeVersion = %q, want %q (clamped up from 16)", plan.NodeVersion, models.NodeVersion18)
		}
		// Critically, the clamped plan must still validate — otherwise an odd
		// Node pin would drop the build to the un-sandboxed legacy path.
		if err := Validate(plan); err != nil {
			t.Errorf("clamped plan failed validation: %v", err)
		}
	})

	t.Run("engines.node used when nvmrc absent", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"package.json":   `{"scripts":{"build":"vite build"},"engines":{"node":">=22"}}`,
			"vite.config.ts": "export default {}",
		})
		plan := Detect(root, "")
		if plan.NodeVersion != models.NodeVersion22 {
			t.Errorf("nodeVersion = %q, want %q", plan.NodeVersion, models.NodeVersion22)
		}
	})

	t.Run("defaults when nothing declared", func(t *testing.T) {
		root := writeRepo(t, map[string]string{
			"package.json":   vitePkg,
			"vite.config.ts": "export default {}",
		})
		plan := Detect(root, "")
		if plan.NodeVersion != models.DefaultNodeVersion {
			t.Errorf("nodeVersion = %q, want default %q", plan.NodeVersion, models.DefaultNodeVersion)
		}
	})
}

func TestDetectMalformedPackageJSONFallsBack(t *testing.T) {
	root := writeRepo(t, map[string]string{
		"package.json":   `{"scripts":{ broken`,
		"vite.config.ts": "export default {}",
	})
	plan := Detect(root, "")
	if plan == nil {
		t.Fatal("Detect returned nil")
	}
	// Unparseable package.json is treated as absent, so no framework match and
	// no invented commands — the build falls through to the legacy path.
	if plan.Framework != "" {
		t.Errorf("framework = %q, want empty for malformed package.json", plan.Framework)
	}
	if len(plan.BuildCmd) != 0 {
		t.Errorf("buildCmd = %v, want none", plan.BuildCmd)
	}
}
