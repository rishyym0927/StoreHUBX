# Repo Autofill — Prefill Component Metadata from GitHub

> **Status:** Planned — not yet implemented
> **Complexity:** Low (mostly reuses existing code)
> **Depends on:** `internal/github` (already built), `internal/handlers/component_handler.go`

---

## 1. Problem

`app/(private)/components/new/page.tsx` asks the author to hand-type name,
description, tags, frameworks, and license — for a platform whose entire
premise is "link a GitHub repo." Almost all of that data already exists on
GitHub.

## 2. What's already deterministic — no AI needed

| Field | Source | Already built? |
|---|---|---|
| `Description` | `RepoInfo.Description` | Yes — `github.FetchRepoInfo` (`internal/github/handlers.go:256`) |
| `License` | `RepoInfo.License.SpdxID` | Yes — same call |
| `Tags` | `RepoInfo.Topics` | Yes — same call |
| `Readme` | `GetReadme` | Yes — `internal/github/handlers.go:465` |
| `Frameworks` | parse `package.json` deps | New — one `GetRepoContents` call + a static lookup |
| `Name` | repo/folder name | Trivial — already surfaced by the repo picker |

`FetchRepoInfo` and `GetReadme` are already cached 10 minutes via
`cachedGitHubFetch`, so this endpoint is fast and free on repeat calls.

## 3. Where AI actually helps — narrow, fallback-only

- **Description is empty.** Some repos don't set one. Fallback: summarize the
  README's first ~500 chars with one LLM call.
- **Topics are missing/sparse (<2).** Fallback: suggest tags from the README +
  `package.json` deps.

AI never runs on the common path — only when GitHub's own data is missing.
Every AI-derived field is tagged in the response (`source: "github" | "ai"`) so
the frontend can flag it for review.

**Provider: Groq** (OpenAI-compatible chat completions API, free-tier
available, fast inference — good fit for a short, low-stakes fallback call).
Config via env var only, never hardcoded:

```bash
# .env — DO NOT COMMIT
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
AUTOFILL_AI_FALLBACK_ENABLED=true
```

> The user shared a live Groq key in chat while requesting this plan. That key
> must be treated as compromised — **rotate/revoke it in the Groq console**
> and put the new one only in `.env` (already gitignored per existing
> convention), never in code, commit messages, or docs.

## 4. API

```
GET /api/github/autofill?owner=&repo=&path=&ref=
```
Auth: JWT-protected (reuses `GetUserGitHubToken`, same as other `/api/github/*` routes).

```json
{
  "success": true,
  "data": {
    "name": "pricing-card",
    "description": "A responsive pricing card with billing toggle",
    "descriptionSource": "github",
    "license": "MIT",
    "tags": ["ui", "pricing", "saas"],
    "tagsSource": "github",
    "frameworks": ["react"],
    "readme": "..."
  }
}
```

### Handler sketch

```go
// internal/handlers/autofill_handler.go (new)
func AutofillFromRepo(c *fiber.Ctx) error {
    owner, repo, path, ref := c.Query("owner"), c.Query("repo"), c.Query("path"), c.Query("ref")
    token, _ := githubapi.GetUserGitHubToken(c)

    info, err := githubapi.FetchRepoInfo(token, owner, repo)       // reused, already cached
    readme, _ := fetchReadme(token, owner, repo, ref)              // reused
    pkg, _ := fetchPackageJSON(token, owner, repo, path, ref)      // new, ~15 lines
    frameworks := detectFrameworks(pkg.Dependencies, pkg.DevDependencies) // new, static lookup

    description, descSource := info.Description, "github"
    if description == "" && aiEnabled() {
        description, _ = aiSummarize(readme)
        descSource = "ai"
    }
    tags, tagsSource := info.Topics, "github"
    if len(tags) < 2 && aiEnabled() {
        tags, _ = aiSuggestTags(readme, pkg.Dependencies)
        tagsSource = "ai"
    }

    return utils.Success(c, fiber.Map{
        "name": repo, "description": description, "descriptionSource": descSource,
        "license": licenseOrEmpty(info.License), "tags": tags, "tagsSource": tagsSource,
        "frameworks": frameworks, "readme": readme,
    })
}
```

### Framework detection (deterministic, ~20 lines)

```go
var frameworkDeps = map[string]string{
    "react": "react", "vue": "vue", "svelte": "svelte",
    "@angular/core": "angular", "solid-js": "solid", "preact": "preact",
}
func detectFrameworks(deps, devDeps map[string]string) []string {
    var out []string
    for dep, name := range frameworkDeps {
        if _, ok := deps[dep]; ok { out = append(out, name); continue }
        if _, ok := devDeps[dep]; ok { out = append(out, name) }
    }
    return out
}
```

## 5. Frontend

- `app/(private)/components/[slug]/import/page.tsx`: after repo selection, call
  `/api/github/autofill`, prefill the existing form fields (same ones
  `new/page.tsx` already renders) — all remain editable before submit.
- Fields where `source === "ai"` get a small "AI-suggested, please review" badge.
- `CreateComponent` (`internal/handlers/component_handler.go:50`) is
  **unchanged** — it still just receives a normal `Component` body. Zero
  backend risk beyond the new read-only autofill endpoint.

## 6. Route registration

```go
// internal/routes/routes.go — alongside the existing gh group (line 108-111)
gh.Get("/autofill", handlers.AutofillFromRepo)
```

## 7. Phases

**Phase 1 (0.5–1 day):** deterministic autofill only (description/license/tags
from `FetchRepoInfo`, frameworks from `package.json`). No AI, no new API key
needed. Ships most of the value immediately.

**Phase 2 (0.5 day):** Groq fallback for empty description / sparse tags,
`source` tagging in the response, review-badge in the UI.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Wrong framework detected (e.g. a repo depends on React only in an unrelated example folder) | Field stays editable; this is a prefill, not a commit |
| AI fallback fabricates inaccurate description | Always labeled `source: "ai"` in the UI; never silently trusted |
| Extra GitHub API calls hit rate limits | Reuses existing 10-min cache (`cachedGitHubFetch`); `package.json` fetch is one small additional call per autofill |
| Groq key exposure | Env var only, gitignored `.env`, rotate immediately if ever pasted/logged/committed |

## 9. Relationship to other plans

Shares `package.json`/framework-detection logic with the extraction step in
`plan/semantic-search.md` (§3.2) — build it once, reuse for autofill, search
embeddings, and (later) preview default props.
