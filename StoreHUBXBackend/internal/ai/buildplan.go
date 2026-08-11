package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/rishyym0927/storehubx/internal/models"
)

// BuildPlanFallbackEnabled reports whether the build-plan AI fallback may run.
// Like the autofill fallback it requires both an explicit opt-in and a key, so
// build detection stays deterministic-only by default.
func BuildPlanFallbackEnabled() bool {
	return os.Getenv("BUILD_AI_FALLBACK_ENABLED") == "true" && os.Getenv("GROQ_API_KEY") != ""
}

// aiFields is the decode target for the model's reply, and deliberately the
// *only* thing it can express.
//
// This is a structural guarantee rather than a prompt instruction: the fields
// deterministic detection established as fact (package manager, Node version,
// install command, available scripts) simply have nowhere to land here. A
// model that returns "packageManager": "bash" is not rejected — it is
// discarded during decoding, before any code reads it.
type aiFields struct {
	Framework           string   `json:"framework"`
	BuildScript         string   `json:"buildScript"`
	OutputDirCandidates []string `json:"outputDirCandidates"`
}

const buildPlanSystemPrompt = `You identify how to build a JavaScript/TypeScript web project.

You will be given a package.json and the list of script names it defines.

Respond with ONLY a JSON object with exactly these keys:
{
  "framework": "a short lowercase label, e.g. vite, webpack, parcel, rollup, esbuild, nextjs, remix, static",
  "buildScript": "the name of the script to run to produce a production build",
  "outputDirCandidates": ["most likely output directory", "second most likely"]
}

Rules:
- "buildScript" MUST be one of the script names provided. Never invent a script name. If none of them produce a production build, return an empty string.
- "outputDirCandidates" must be relative directory paths (e.g. "dist", "build", "out", "public"). List 1-3, most likely first. Never use absolute paths or "..".
- Do not include any other keys, comments, or prose.`

// FillMissingFields asks the model for only what deterministic detection could
// not establish: the framework label, which of the repo's existing scripts
// builds it, and where that build lands.
//
// It is called only when Detect matched no known framework signature. The
// returned plan is a copy of the input with those three fields populated;
// everything else is carried over untouched. The caller must still run
// buildplan.Validate on the result — this function does not and cannot be the
// security boundary, because its input is attacker-influenced repository
// content (a package.json can contain anything, including text aimed at the
// model).
//
// Every failure path returns an error and no plan, so the caller falls back to
// the legacy build rather than acting on a partial guess.
func FillMissingFields(ctx context.Context, packageJSON string, plan models.BuildPlan) (*models.BuildPlan, error) {
	if !BuildPlanFallbackEnabled() {
		return nil, fmt.Errorf("build plan AI fallback is disabled")
	}
	if len(plan.AvailableScripts) == 0 {
		// With no scripts to choose from there is nothing the model could
		// legitimately return, so don't spend a call finding that out.
		return nil, fmt.Errorf("package.json declares no scripts")
	}

	userPrompt := fmt.Sprintf(
		"Script names defined in package.json: %s\n\npackage.json:\n%s",
		strings.Join(plan.AvailableScripts, ", "),
		truncateRunes(packageJSON, 2000),
	)

	raw, err := chatCompletionJSON(ctx, buildPlanSystemPrompt, userPrompt, 300)
	if err != nil {
		return nil, err
	}

	var fields aiFields
	if err := json.Unmarshal([]byte(stripCodeFence(raw)), &fields); err != nil {
		return nil, fmt.Errorf("groq returned unparseable build plan JSON: %w", err)
	}

	if fields.BuildScript == "" {
		return nil, fmt.Errorf("groq found no build script among %s", strings.Join(plan.AvailableScripts, ", "))
	}
	// Cheap pre-check so the failure reason is specific in the logs; Validate
	// enforces this again as the actual gate.
	if !contains(plan.AvailableScripts, fields.BuildScript) {
		return nil, fmt.Errorf("groq proposed script %q which package.json does not define", fields.BuildScript)
	}
	if len(fields.OutputDirCandidates) == 0 {
		return nil, fmt.Errorf("groq returned no output directory candidates")
	}

	filled := plan
	filled.Framework = strings.ToLower(strings.TrimSpace(fields.Framework))
	if filled.Framework == "" {
		filled.Framework = "unknown"
	}
	filled.BuildCmd = []string{plan.PackageManager, "run", fields.BuildScript}
	filled.OutputDirCandidates = normalizeDirs(fields.OutputDirCandidates)
	filled.Source = models.PlanSourceDeterministicAI

	if len(filled.OutputDirCandidates) == 0 {
		return nil, fmt.Errorf("groq returned no usable output directory candidates")
	}
	return &filled, nil
}

// stripCodeFence removes a ```json ... ``` wrapper if the model emitted one.
// JSON mode should prevent this, but the cost of tolerating it is one string
// operation and the cost of not tolerating it is a failed build.
func stripCodeFence(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	if i := strings.Index(s, "\n"); i != -1 {
		s = s[i+1:] // drop the ```json opening line
	}
	if i := strings.LastIndex(s, "```"); i != -1 {
		s = s[:i]
	}
	return strings.TrimSpace(s)
}

// normalizeDirs tidies model-supplied paths and drops obviously unusable ones.
// Validate still rejects traversal and absolute paths; this just avoids
// passing along noise like "./dist/" or empty strings.
func normalizeDirs(dirs []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, d := range dirs {
		d = strings.TrimSpace(d)
		d = strings.TrimPrefix(d, "./")
		d = strings.TrimSuffix(d, "/")
		if d == "" || seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
		if len(out) == 3 {
			break
		}
	}
	return out
}

func contains(haystack []string, needle string) bool {
	for _, v := range haystack {
		if v == needle {
			return true
		}
	}
	return false
}
