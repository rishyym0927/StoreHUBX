# In-Context Preview — "Try this component inside your actual app"

> **Status:** Planned — not yet implemented
> **Complexity:** High (the differentiating feature; also the riskiest)
> **Depends on:** existing build worker, GitHub OAuth, S3/MinIO publishing, BuildJob queue

---

## 1. Problem statement

Every component gallery — including StoreHUBX today — shows a component
rendered in a vacuum: the author's fonts, the author's colors, a blank demo
page. But the question that actually blocks adoption is never *"does this
component render?"*. It is:

> **"Will this look right, and work, inside *my* app?"**

Answering that today means: read the README, copy the code into your project,
install its dependencies, fix the conflicts, run your dev server, look at it,
and — usually — delete it. That loop takes 20 minutes and is why most
discovered components are never adopted.

**The insight:** StoreHUBX is uniquely positioned to answer this, because it is
the only system that can hold *both sides* of the relationship — the
component's repo and the visitor's repo. CodeSandbox and StackBlitz cannot do
this: they are generic sandboxes with no knowledge of "your app." Competing
with them on generic code editing is a losing battle. Competing on
**context-aware component evaluation** is a battle nobody else is fighting.

**The product promise:** click "Try in my app" → 90 seconds later, get a live
URL showing *your application*, with your layout, your theme, your nav, your
data — with the candidate component dropped in. Then either open a PR, or throw
it away with zero trace in your codebase.

---

## 2. Two tiers

This document plans **Tier B**, but Tier A is the correct thing to ship first
and is described here because it de-risks Tier B.

| | Tier A — Theme Substitution | Tier B — Real Preview Deployment |
|---|---|---|
| **What the user gives us** | design tokens (Tailwind config / CSS vars) | their GitHub repo |
| **What we render** | the component alone, restyled | *their whole app*, with the component in it |
| **Answers** | "does this fit my design system?" | "does this work in my app?" |
| **Build cost** | none (CSS injection at render) | a full app build per preview |
| **Trust required** | minimal (a config file) | high (repo access) |
| **Effort** | ~2 days | ~2-3 weeks |

**Recommendation: ship Tier A first.** It delivers most of the perceived value,
validates that people want this at all, and requires none of the trust or
infrastructure of Tier B. Tier B then becomes an upgrade for users who already
believe in the feature.

---

## 3. Tier B architecture

```
 visitor clicks "Try in my app"
             │
             ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. TARGET REPO RESOLUTION                                    │
 │    GitHub App install → fork into storehubx-sandbox org      │
 │    (never write to the user's own repo — see §6)             │
 └────────────────────────┬────────────────────────────────────┘
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 2. COMPATIBILITY PREFLIGHT  (fast, synchronous, ~2s)         │
 │    framework match? dep conflicts? build tool recognized?    │
 │    → hard fail early with a readable reason, not a build log │
 └────────────────────────┬────────────────────────────────────┘
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 3. INJECTION  (codemod on a throwaway branch)                │
 │    write component files + generate preview route            │
 │    + patch package.json deps                                 │
 └────────────────────────┬────────────────────────────────────┘
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 4. BUILD    ← reuses internal/worker almost unchanged        │
 │    PreviewJob on the existing Redis Stream + Mongo queue     │
 └────────────────────────┬────────────────────────────────────┘
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 5. PUBLISH + TTL                                             │
 │    S3 under previews/{previewId}/ → URL; reaper deletes 24h  │
 └────────────────────────┬────────────────────────────────────┘
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 6. ADOPT (optional)                                          │
 │    "Open PR" → real PR against the user's actual repo        │
 └─────────────────────────────────────────────────────────────┘
```

**The critical architectural insight:** steps 4 and 5 are *already built*.
`internal/worker/worker.go` downloads a repo at a ref, runs npm, picks an
output dir, and publishes to S3 via `PublishComponentFromDist`. Tier B is
mostly **a new trigger and a new target for infrastructure that already
exists** — plus one genuinely new piece (step 3, injection).

---

## 4. Step 2 — Compatibility preflight

Must run **before** anything is cloned or built, and must produce human
readable reasons. A cryptic npm error after 90 seconds is a terrible
experience; "this component needs Tailwind 4, your app is on Tailwind 3" in
two seconds is a great one.

```go
// internal/preview/compat.go (new)
type CompatReport struct {
    Compatible bool           `json:"compatible"`
    Blockers   []CompatIssue  `json:"blockers"`   // hard stop
    Warnings   []CompatIssue  `json:"warnings"`   // proceed, but tell the user
    Detected   TargetProfile  `json:"detected"`
}

type TargetProfile struct {
    Framework   string `json:"framework"`   // next | vite-react | cra | remix | unknown
    FrameworkV  string `json:"frameworkVersion"`
    Router      string `json:"router"`      // app | pages | react-router | none
    Styling     string `json:"styling"`     // tailwind | css-modules | styled-components | plain
    TailwindV   string `json:"tailwindVersion"`
    PkgManager  string `json:"packageManager"` // npm | pnpm | yarn | bun
    TSConfig    bool   `json:"typescript"`
    SrcDir      string `json:"srcDir"`      // "src" | "" — where code lives
}
```

Detection reads only a handful of files via the GitHub contents API — no clone
needed: `package.json`, `next.config.*`, `vite.config.*`, `tailwind.config.*`,
`tsconfig.json`, and a directory listing of `app/` vs `pages/` vs `src/`.

**Blocker rules (v1):**
- Framework mismatch (React component → Vue app) → hard stop.
- Major-version mismatch on a shared peer dep (React 17 vs 19) → hard stop.
- Unrecognized build tool → hard stop with "unsupported project type."
- Monorepo detected (`workspaces` / `pnpm-workspace.yaml`) → hard stop in v1;
  workspace resolution is a rabbit hole.

**Warning rules:** Tailwind major mismatch, missing peer dep we'll auto-install,
bundle-size delta > 50KB gzipped, component requires env vars.

This preflight is independently valuable — surface it as a **"Compatibility"
badge on the component page** even for users who never run a preview.

---

## 5. Step 3 — Injection strategy

This is the genuinely hard, genuinely novel part. **The question: where in an
arbitrary codebase does this component go?**

### 5.1 Three strategies, ranked

**Strategy 1 — Isolated route injection ★ RECOMMENDED FOR V1**

Do not attempt to insert the component into an existing page. Instead generate
a *new* route that inherits the app's real shell — layout, providers, global
CSS, fonts, theme — and renders the candidate component alone inside it.

For a Next.js App Router target:
```
app/__storehubx/[previewId]/page.tsx    ← generated
```
Because App Router nests layouts automatically, this page inherits
`app/layout.tsx` — meaning the user's fonts, `globals.css`, theme provider, and
body classes all apply **for free**. That single fact is what makes this
strategy so much cheaper than it looks: 80% of "does it fit my app" is theme
and typography inheritance, and the framework's own layout nesting gives it to
us without any AST work.

- ✅ No AST analysis of user code required — we only *add* files.
- ✅ Deterministic and safe: nothing existing is modified except `package.json`.
- ✅ Works on any project structure we can detect.
- ❌ Doesn't show the component *beside* their real UI, only *within* their shell.

**Strategy 2 — Marker-slot injection (v2)**

The user places a marker in a real page:
```tsx
{/* storehubx:slot */}
```
A codemod replaces that marker with the component. Gives true in-page context —
the component rendered next to their actual nav, sidebar, and content.

- ✅ Real in-context preview, the full promise.
- ❌ Requires the user to prepare their repo; only works where they opted in.
- ❌ Needs a real codemod (`jscodeshift` or `ts-morph` via a Node sidecar).

**Strategy 3 — Automatic AST-based placement (NOT RECOMMENDED)**

Infer a sensible mount point by analyzing the component tree. This is a
research problem, not a feature. It will guess wrong, and a wrong guess is
worse than no feature. **Explicitly out of scope.**

### 5.2 Generated preview route (Next.js App Router example)

```tsx
// app/__storehubx/[previewId]/page.tsx — GENERATED, do not edit
import { PreviewCandidate } from '@/components/__storehubx/{{slug}}'

export default function StoreHUBXPreview() {
  return (
    <main className="p-8">
      <PreviewCandidate {...{{defaultProps}}} />
    </main>
  )
}
```

`defaultProps` come from the **props extracted in the semantic-search plan**
(`plan/semantic-search.md` §3.2) — the two features share the extraction step.
Building either one makes the other cheaper.

### 5.3 Per-framework adapters

```go
// internal/preview/inject/adapter.go
type Adapter interface {
    Detect(files map[string][]byte) bool
    PreviewRoutePath(previewID string) string
    RenderRoute(ctx RouteContext) ([]byte, error)
    PreviewURLPath(previewID string) string   // "/__storehubx/{id}"
    BuildCommand(pm string) []string
    OutputDir() string
}
```

Ship `NextAppRouterAdapter` and `ViteReactAdapter` in v1. Everything else
returns an honest "unsupported project type" from the preflight. **Two
adapters done well beats six done badly.**

---

## 6. Trust model — fork, never write to the user's repo

**This is the most important non-technical decision in the feature.** Asking
someone to grant a third-party platform write access to their private codebase
is an enormous trust ask, and getting it wrong is an unrecoverable reputational
event.

### Recommended: GitHub App + sandbox fork

1. Ship a **GitHub App** (not an OAuth app) so the user grants access to
   *specific repos*, not their whole account. This is a meaningful upgrade over
   the existing OAuth token flow in `internal/auth/oauth.go` and is worth doing
   properly.
2. On "Try in my app," **fork the repo into a StoreHUBX-controlled org**
   (`storehubx-sandbox`), or clone-and-push to a scratch repo we own.
3. All injection, branching, and building happens in **our** copy.
4. **The user's actual repository is never written to** during preview.
5. Only the explicit "Open PR" action (§9) ever touches their repo, and it
   opens a PR — it never pushes to a default branch.

### Why forking rather than a branch in their repo

| | Branch in their repo | Fork into our org |
|---|---|---|
| Trust ask | write access to their code | read access only for preview |
| Blast radius of a bug | **their repository** | our sandbox |
| Cleanup failure mode | stale branches in their repo | our problem, invisible to them |
| Private repos | works | works (fork inherits privacy) |

The fork approach is strictly better on every axis that matters. The only cost
is fork/clone latency, which is dominated by build time anyway.

### Secrets and env

Preview builds **must not** receive the user's production secrets. Build with
an empty/placeholder env, and if the preflight detects required env vars,
warn: *"this app requires 6 environment variables; preview will use
placeholders and some features may not render."* Never prompt the user to paste
real secrets into StoreHUBX.

---

## 7. Step 4 — Build, reusing the existing worker

### 7.1 Data model

`PreviewJob` deliberately mirrors `BuildJob`
(`internal/models/build_job.go`) so the worker's claim/retry/log/status
machinery is reused rather than reimplemented.

```go
// internal/models/preview_job.go (new)
type PreviewJob struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    PreviewID   string             `bson:"previewId" json:"previewId"`   // short public id
    RequesterID string             `bson:"requesterId" json:"requesterId"`

    // What is being previewed
    ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
    Component   string             `bson:"component" json:"component"`
    Version     string             `bson:"version" json:"version"`

    // Where it is being injected
    Target      TargetRepo         `bson:"target" json:"target"`
    SandboxRepo string             `bson:"sandboxRepo" json:"sandboxRepo"` // our fork
    Branch      string             `bson:"branch" json:"branch"`

    Strategy    string             `bson:"strategy" json:"strategy"`  // "route" | "slot"
    Adapter     string             `bson:"adapter" json:"adapter"`    // "next-app" | "vite-react"

    Status      models.BuildStatus `bson:"status" json:"status"`      // reuse BuildQueued/Running/Success/Error
    Logs        []string           `bson:"logs,omitempty" json:"logs,omitempty"`
    PreviewURL  string             `bson:"previewUrl,omitempty" json:"previewUrl,omitempty"`
    Compat      *CompatReport      `bson:"compat,omitempty" json:"compat,omitempty"`

    Attempts    int  `bson:"attempts" json:"attempts"`
    MaxAttempts int  `bson:"maxAttempts" json:"maxAttempts"`

    ExpiresAt   time.Time  `bson:"expiresAt" json:"expiresAt"`  // TTL reaper input
    CreatedAt   time.Time  `bson:"createdAt" json:"createdAt"`
    StartedAt   *time.Time `bson:"startedAt,omitempty" json:"startedAt,omitempty"`
    EndedAt     *time.Time `bson:"endedAt,omitempty" json:"endedAt,omitempty"`
}
```

### 7.2 Worker changes

Add `previews:stream` alongside `builds:stream`, and a `previewLoop` goroutine
in `Processor.Run` (`internal/worker/worker.go:96`). The processing function
differs from `process()` in three places only:

| Stage | Component build (today) | Preview build (new) |
|---|---|---|
| Source | component repo zip | sandbox fork zip |
| Pre-build | none | **inject files + patch package.json** |
| Publish key | `{component}/{version}/` | `previews/{previewId}/` |
| Timeout | 10 min | **15 min** (whole apps are slower) |

Everything else — atomic `FindOneAndUpdate` claiming, `logPush` streaming,
exponential backoff, Prometheus metrics — is unchanged and inherited.

### 7.3 Build time is the product risk

A component build today is fast. Building a *whole application* is not: 60-180s
is realistic, and a cold `npm install` on a large app can exceed that badly.

**Mitigations, in order of value:**
1. **Dependency cache keyed on `package-lock.json` hash.** Tar the resolved
   `node_modules` to S3 and restore on subsequent builds of the same lockfile.
   Typically the single biggest win — often 60-70% of total build time.
2. **Reuse the existing build-cache pattern.** `internal/handlers/build_cache.go`
   already implements "same commit → reuse output." The preview equivalent is
   "same (targetCommit, componentVersion, strategy) → reuse preview." Free, and
   makes repeat previews instant.
3. **Warm sandbox pool** for popular target repos. Complex; defer.
4. **Honest UI.** Stream the real build logs (they already flow through
   `logPush`) with a progress indication. Users tolerate 90 seconds when they
   can see progress; they abandon at 20 seconds of a blank spinner.

---

## 8. Step 5 — Publish, isolate, and expire

### 8.1 Serving

Publish to `previews/{previewId}/` via the existing
`PublishComponentFromDist`, then serve behind a redirect handler mirroring
`internal/handlers/preview_handler.go`:

```
GET /preview/app/:previewId   → 302 to the S3/CDN URL
```

### 8.2 Isolation (security-critical)

A preview is **user-supplied application code** running on a URL under our
domain. Treat it as hostile:

- Serve previews from a **separate origin** (`preview.storehubx.dev`, or better,
  `{previewId}.preview.storehubx.dev`), never from the app's own origin. This
  is the single most important control — it prevents preview JS from touching
  StoreHUBX cookies, localStorage, or same-origin API calls.
- Embed in the UI only inside a sandboxed iframe:
  `sandbox="allow-scripts allow-forms allow-same-origin"` — and note that
  `allow-same-origin` is only safe *because* of the separate origin above.
- Strict CSP on preview responses; no StoreHUBX auth cookie is ever scoped to
  the preview domain.

### 8.3 Expiry

- `ExpiresAt = created + 24h`, extended on view.
- A reaper goroutine (or `cmd/reap_previews/main.go`, matching the existing
  maintenance-script convention) deletes S3 objects, the sandbox branch, and
  marks the job expired.
- Mongo TTL index on `expiresAt` for the job records themselves.
- **Quota:** max 3 concurrent + 20/day previews per user. Without this, the
  feature is an open invitation to use StoreHUBX as free CI.

---

## 9. Step 6 — "Open PR" (the adoption payoff)

Once a preview is approved, close the loop:

```
POST /api/previews/:previewId/pr
```

Opens a **real PR against the user's own repo** containing only the component
files and the `package.json` dependency additions — *not* the generated preview
route, which is scaffolding.

This is the moment the feature stops being a demo and becomes a workflow:
**discover → evaluate in context → adopt**, without ever leaving the browser.
It is also the natural place to require the elevated GitHub App permission,
asked for at the moment the user has already decided they want the component —
which is exactly when a permission prompt converts.

---

## 10. API surface

```
POST   /api/previews/compat          # preflight only — fast, no build
       body: { componentSlug, version, targetRepo }
       → CompatReport

POST   /api/previews                 # create preview job
       body: { componentSlug, version, targetRepo, strategy }
       → { previewId, jobId, status: "queued" }

GET    /previews/:previewId          # public poll — status + logs + URL
GET    /preview/app/:previewId       # 302 → served preview
DELETE /api/previews/:previewId      # early teardown
POST   /api/previews/:previewId/pr   # open PR against the user's repo

GET    /api/me/previews              # quota + history
```

Registered in `internal/routes/routes.go` following the existing split: the
poll and redirect endpoints are public (matching `GET /builds/:id`), everything
else lives under the `/api` JWT group.

---

## 11. Frontend integration

| File | Change |
|---|---|
| `app/components/[slug]/page.tsx` | "Try in my app" CTA next to the existing preview |
| `app/(private)/previews/[previewId]/page.tsx` | **new** — live log stream, then split-view: preview iframe + "Open PR" |
| `app/(private)/settings/repos/page.tsx` | **new** — GitHub App install + connected repo management |
| `lib/api.ts` | `checkCompat`, `createPreview`, `getPreview`, `openPreviewPR` |
| `types/index.ts` | `CompatReport`, `PreviewJob`, `TargetProfile` |
| `hooks/use-api.ts` | `usePreviewJob(id)` — polls (or SSE) until terminal state |
| `components/common/` | `compat-badge.tsx`, `build-log-stream.tsx`, `repo-picker.tsx` |

The build-log stream is worth real design attention. It is the only thing the
user looks at for 90 seconds, and it is the difference between "this feels
broken" and "this feels like CI."

---

## 12. Implementation phases

**Phase 0 — Tier A: theme substitution (2 days) — SHIP THIS FIRST**
Accept a Tailwind config or CSS-variable block, re-render the existing
component preview with those tokens injected. No repo access, no builds, no
trust ask. Validates demand for the whole idea at ~2% of the cost.

**Phase 1 — Preflight only (3-4 days)**
GitHub App + repo connection; `TargetProfile` detection; `CompatReport`;
compatibility badge in the UI. **Independently shippable and useful** even
with no preview capability behind it.

**Phase 2 — Preview builds, Next.js App Router only (1 week)**
`PreviewJob` model; `previews:stream` + worker loop; `NextAppRouterAdapter`
with route-injection; sandbox forking; S3 publish under `previews/`;
log-streaming UI. Single framework, single strategy, end to end.

**Phase 3 — Hardening (4-5 days)**
Dependency caching; preview reuse cache; TTL reaper; quotas; separate preview
origin + CSP; `ViteReactAdapter`.

**Phase 4 — Adoption loop (3-4 days)**
"Open PR" flow; marker-slot injection strategy; preview sharing links.

---

## 13. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Arbitrary code execution** — we run `npm install` + build on untrusted app repos | **Critical** | This already exists in the current worker and is the project's largest latent security issue. Tier B multiplies exposure. **Containerize builds before shipping Phase 2**: ephemeral Docker container per job, no host mount, dropped capabilities, CPU/memory/PID limits, egress restricted to the npm registry and GitHub. Non-negotiable prerequisite. |
| Trust: users won't grant repo access | High (adoption) | GitHub App with per-repo scope; fork-not-write model; explicit "we never write to your repo" copy; make Tier A the on-ramp. |
| Build times kill the UX | High | Dependency cache, preview reuse cache, honest streaming logs. Set expectation in the CTA ("~90s"). |
| Preview XSS / cookie theft | High | Separate preview origin, sandboxed iframe, strict CSP, no auth cookies scoped to the preview domain. |
| Cost — every preview is a full app build | Medium | Hard quotas, aggressive TTL, dependency caching, reuse cache. Track `storehubx_preview_build_seconds` from day one. |
| Fragmentation: too many frameworks to support | Medium | Two adapters, honest "unsupported" messaging. Do not chase coverage. |
| Injection breaks a nontrivial app | Medium | Route-injection only adds files — it cannot break existing code. This is precisely why it is the v1 strategy. |
| Abandoned sandbox forks accumulate | Low | Reaper deletes forks with expired jobs; cap forks per user. |

---

## 14. Config additions

```bash
PREVIEW_ENABLED=true
PREVIEW_SANDBOX_ORG=storehubx-sandbox
PREVIEW_GITHUB_APP_ID=
PREVIEW_GITHUB_APP_PRIVATE_KEY_PATH=
PREVIEW_BASE_URL=https://preview.storehubx.dev
PREVIEW_TTL=24h
PREVIEW_MAX_CONCURRENT_PER_USER=3
PREVIEW_MAX_PER_DAY_PER_USER=20
PREVIEW_JOB_TIMEOUT=15m
PREVIEW_DEP_CACHE_BUCKET=storehubx-depcache
BUILD_SANDBOX_MODE=docker        # docker | none (none = current behaviour, dev only)
```

---

## 15. Observability

```go
storehubx_previews_total{status="success|error|incompatible|quota_denied"}
storehubx_preview_duration_seconds{stage="fork|inject|install|build|publish"}
storehubx_preview_queue_depth
storehubx_preview_dep_cache_hits_total{result="hit|miss"}
storehubx_preview_compat_blockers_total{reason="framework|version|monorepo|unknown_tool"}
storehubx_previews_active                 // for TTL/cost monitoring
```

`preview_compat_blockers_total{reason}` is the highest-value metric in this
list: it tells you exactly which adapter to build next, from real demand rather
than guesswork.

---

## 16. Why this beats "build our own CodeSandbox"

The tempting version of this feature is an in-browser IDE — edit the
component's code, see it re-render. That path is a trap:

- It competes directly with StackBlitz and CodeSandbox, who have spent years
  and substantial engineering on WebContainers-class technology.
- The generic sandbox is a *solved* problem, so a worse clone adds nothing.
- It answers a question users don't actually have. Nobody's blocker is "I wish
  I could edit this in a scratchpad" — it's "I don't know if this fits my app."

In-context preview inverts that. It is **only buildable by a platform that
holds both repos**, which is precisely the position StoreHUBX already occupies
via its existing GitHub linking. It reuses infrastructure that already exists
(the worker, the queue, S3 publishing, build caching) rather than inventing a
new runtime. And it answers the actual adoption blocker, which turns the
product from a *gallery* into an *adoption tool*.

That is a defensible position. A better CodeSandbox is not.

---

## 17. Relationship to the semantic-search plan

The two planned features share one component: **source fact extraction**
(`plan/semantic-search.md` §3.2). Props extracted from the component source are
used by search (to build a richer embedding document) and by preview (to
generate sensible `defaultProps` in the injected route). Build the extractor
once, in the worker, and both features get cheaper.

Suggested order: **semantic search first.** It is lower risk, ships faster,
improves the product immediately, and leaves the extraction infrastructure in
place for preview to build on.
