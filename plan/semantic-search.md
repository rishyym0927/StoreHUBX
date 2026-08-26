# Semantic Component Search (RAG-style Discovery)

> **Status:** Phases 1–2 approved for implementation; Phases 3–4 still planned
> **Complexity:** Medium (well-understood pattern, no new infrastructure category)
> **Depends on:** existing build pipeline, `component_versions` collection, MongoDB
> **Tech stack:** 100% free / self-hosted — `bge-small-en-v1.5` embedding model run
> locally via a small Python sidecar **on ONNX (`fastembed`), not PyTorch**,
> brute-force cosine similarity in Go (no vector DB needed at this catalog
> size), with **Qdrant** documented as the drop-in upgrade path once/if the
> catalog outgrows in-memory search. No paid API, no managed vector DB, no
> per-query cost. See §5, §14 and §15.

> **Decisions taken (2026-08-16).** Two choices were made when this moved from
> plan to implementation, both recorded inline below:
> 1. **Scope:** ship Phases 1–2 first (vectors exist + search works). RRF
>    fusion, `/similar` and prop extraction stay planned. See §10.
> 2. **Runtime:** the sidecar uses `fastembed` (ONNX) rather than
>    `sentence-transformers` (PyTorch) — same model, same 384 dimensions,
>    ~200MB image and ~150MB RAM instead of ~2GB and ~600MB. This is the single
>    change that makes free production hosting viable. See §5 and §15.

---

## 1. Problem statement

Discovery on StoreHUBX today is keyword + tag based. `GET /components`
(`internal/handlers/component_handler.go`) filters on `frameworks`, `tags`, and
a name/description substring match. That has three failure modes:

1. **Vocabulary mismatch.** A user searching "pricing card with monthly/yearly
   toggle" gets nothing if the author tagged it `subscription`, `plans`, `saas`.
   The concepts match; the strings don't.
2. **Tags are author-supplied and low quality.** Authors tag inconsistently,
   sparsely, or not at all. Tag-based browse degrades as the catalog grows.
3. **No notion of "similar to this."** There is no way to answer "show me other
   components like this one," which is the single highest-intent discovery
   action on a component marketplace.

The fix is to search over **meaning** rather than **strings**: embed each
component into a vector space, embed the query the same way, and rank by
similarity — then re-rank with the structured quality signals we already have
(`AverageRating`, `RatingCount`, `LikeCount`, `ViewCount`, build health, recency).

---

## 2. Architecture overview

```
                     ┌──────────────────────────────────────────┐
   author publishes  │  API (cmd/main.go)                        │
   or rebuilds  ───► │  CreateComponent / AddVersion /           │
                     │  EnqueueBuild / webhook                   │
                     └──────────────┬───────────────────────────┘
                                    │ enqueue IndexJob
                                    ▼
                     ┌──────────────────────────────────────────┐
                     │  Redis Stream  "index:stream"             │
                     └──────────────┬───────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────────────────┐
                     │  Worker (cmd/worker/main.go)              │
                     │   1. assemble component document          │
                     │   2. POST document to embed-svc (below)   │
                     │   3. write vector -> component_embeddings │
                     └──────────────┬───────────────────────────┘
                                    │  HTTP, localhost / docker network
                                    ▼
                     ┌──────────────────────────────────────────┐
                     │  embed-svc  (new, tiny Python sidecar)     │
                     │  FastAPI + fastembed (ONNX, no torch),     │
                     │  model = bge-small-en-v1.5, runs on CPU,   │
                     │  ~150MB RAM, no external calls, no cost    │
                     └─────────────────────────────────────────┘

                     ┌──────────────────────────────────────────┐
                     │  MongoDB — component_embeddings collection │
                     │  vector stored as a plain float array      │
                     │  (NOT Atlas Vector Search — see §5)         │
                     └──────────────▲───────────────────────────┘
                                    │ load vectors into memory,
   user types query ───────────────►│ brute-force cosine in Go, re-rank
                     GET /search?q= │  (upgrade path: swap this box for
                                    │   self-hosted Qdrant — §14)
                                    └───────────────────────────────
```

**Key design decision:** indexing rides on the *existing* worker process and
the *existing* Redis Streams pattern. We are not introducing a new service, a
new queue technology, or a new datastore beyond one small, free, self-hosted
embedding sidecar. This keeps the operational surface almost identical to
today's and reuses the graceful-degradation behaviour already built into
`internal/cache` (Redis optional) and `internal/worker`.

---

## 3. What exactly gets embedded

This is the part that determines whether the feature is good or mediocre.
Embedding just `Component.Description` produces weak results — descriptions are
one line and often marketing fluff. We assemble a richer **component document**
from signals we already collect or can cheaply extract.

### 3.1 Document assembly

| Source | Field | Why it matters |
|---|---|---|
| `Component.Name` | title | Strong signal, weight it by repeating once |
| `Component.Description` | prose | Author's own summary |
| `Component.Tags`, `Component.Frameworks` | keywords | Sparse but high-precision |
| `ComponentVersion.Readme` | prose | Richest source — usage examples, prop docs |
| Extracted **prop names + types** | structured | `variant: 'compact' \| 'expanded'` is enormously informative |
| Extracted **dependency list** | structured | "uses framer-motion" implies animated |
| Extracted **JSX element/class summary** | structured | `<button>`, `rounded-2xl`, `grid-cols-3` hint at form |

### 3.2 Extraction step (runs in the worker, during build)

The worker already downloads and unzips the repo (`internal/worker/worker.go:237-258`)
and has the component's source on disk at `working`. Add a `extractComponentFacts`
step immediately after `pickOutputDir` succeeds:

```go
// internal/worker/extract.go  (new)
type ComponentFacts struct {
    Props        []PropFact `json:"props"`        // name, type, optional, default
    Dependencies []string   `json:"dependencies"` // from package.json
    Elements     []string   `json:"elements"`     // distinct JSX tags
    ClassHints   []string   `json:"classHints"`   // frequent utility classes
    ExportName   string     `json:"exportName"`
}
```

**Implementation choice for prop extraction — three options, ranked:**

1. **Recommended: `react-docgen-typescript` via a tiny Node sidecar script.**
   The worker already requires Node to run npm builds, so there is no new
   runtime dependency. Ship a `scripts/extract-props.mjs` that the worker
   invokes with `exec.CommandContext` (same pattern as `maybeBuildWithNode`),
   which prints JSON to stdout. Handles TS types, JSDoc comments, defaults, and
   union literals correctly. **Best accuracy per unit of effort.**
2. Pure-Go regex/heuristic parse of the `interface Props` block. Zero new
   dependencies, but breaks on generics, imported types, and intersections.
   Acceptable as a *fallback* when option 1 fails.
3. Full TypeScript compiler API integration. Highest fidelity, highest cost.
   Not worth it here.

**Failure policy:** extraction is best-effort and must never fail a build. Wrap
it exactly like the existing `modifyIndexHTMLOnDisk` call
(`internal/worker/worker.go:274-276`), which logs a `[WARN]` and continues.

### 3.3 Rendered document template

```
{Name}. {Name} is a {Frameworks} component.
{Description}
Tags: {Tags}
Props: {for each} {name} ({type}) — {doc}
Renders: {Elements}
Depends on: {Dependencies}
Readme: {first ~1500 chars of Readme, markdown stripped}
```

Truncate the whole document to the embedding model's token limit — **512 tokens
for `bge-small-en-v1.5`**, which is why the README slice above is capped at
~1500 characters rather than fed in whole. One vector per component, **not** per chunk — components
are small enough that chunking adds complexity without improving recall. This
is a deliberate simplification versus a document-RAG system.

---

## 4. Data model

### 4.1 New collection: `component_embeddings`

Kept in a **separate collection** rather than as a field on `Component` for
three reasons: (a) a 1536-float array bloats every `GET /components` document
read, (b) the existing Redis cache stores serialized components and would double
in size, (c) re-embedding is an independent lifecycle from component writes.

```go
// internal/models/embedding.go (new)
type ComponentEmbedding struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
    Slug        string             `bson:"slug" json:"slug"`

    Vector      []float32          `bson:"vector" json:"-"`      // never serialized to clients
    Model       string             `bson:"model" json:"model"`   // e.g. "bge-small-en-v1.5"
    Dimensions  int                `bson:"dimensions" json:"dimensions"` // 384

    // Provenance — lets us detect staleness without re-embedding to compare.
    DocHash     string             `bson:"docHash" json:"docHash"`     // sha256 of the rendered document
    SourceSHA   string             `bson:"sourceSha" json:"sourceSha"` // commit the facts came from

    // Denormalized ranking inputs, refreshed on re-index. Avoids a $lookup
    // per candidate during re-rank.
    Visibility  string    `bson:"visibility" json:"visibility"`
    AvgRating   float64   `bson:"avgRating" json:"avgRating"`
    RatingCount int       `bson:"ratingCount" json:"ratingCount"`
    LikeCount   int       `bson:"likeCount" json:"likeCount"`
    LastBuiltAt time.Time `bson:"lastBuiltAt" json:"lastBuiltAt"`

    CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
    UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}
```

### 4.2 New collection: `component_facts`

Stores the extracted structured facts so they can be surfaced in the UI
(a "Props" table on the component page is a free win) independently of search.

### 4.3 Indexes (`internal/db/indexes.go`)

```go
// unique — one embedding per component
{Keys: bson.D{{Key: "componentId", Value: 1}}, Options: options.Index().SetUnique(true)}
// re-rank prefilter
{Keys: bson.D{{Key: "visibility", Value: 1}}}
```

No special Mongo index is needed for the vector itself — `vector` is a plain
`[]float32` array field. Similarity search happens in Go (§7.2), not inside
Mongo, so there is no Atlas Vector Search index to create and no Atlas tier
requirement. This is deliberate — see §5 and §14 for why.

---

## 5. Embedding provider — free, self-hosted stack

Mirror the existing `storage.Uploader` pattern
(`internal/storage/storage.go`) — define an interface in Go, ship one
implementation, keep the door open to swap it later.

```go
// internal/embed/embed.go (new)
type Embedder interface {
    // Embed returns one vector per input document. Implementations must be
    // safe for concurrent use and honour ctx cancellation.
    Embed(ctx context.Context, texts []string) ([][]float32, error)
    Model() string
    Dimensions() int
}
```

**Chosen model: `bge-small-en-v1.5`** (BAAI, open source, MIT-compatible
license) — 384 dimensions, ranks near the top of the MTEB leaderboard among
small models, ~130MB, runs comfortably on CPU in well under 50ms per document.
This is the standard self-hosted choice for exactly this use case, not a
"budget" fallback — `all-MiniLM-L6-v2` is a close second if you want an even
smaller/older/more battle-tested option.

**Where it runs: a tiny Python sidecar, not the Go binary.** Go has no mature
native runtime for these models, and the standard pattern industry-wide is a
small dedicated embedding service. New component in the repo:

```
StoreHUBXBackend/embed-svc/
  main.py              # FastAPI, one endpoint
  requirements.txt     # fastapi, uvicorn, fastembed   (ONNX — no torch)
  Dockerfile
```

```python
# embed-svc/main.py — the entire service, roughly
from fastapi import FastAPI
from fastembed import TextEmbedding

app = FastAPI()
model = TextEmbedding("BAAI/bge-small-en-v1.5")   # ONNX runtime, vectors are pre-normalized

@app.post("/embed")
def embed(body: dict):
    vectors = [v.tolist() for v in model.embed(body["texts"])]
    return {"vectors": vectors, "model": "bge-small-en-v1.5", "dimensions": 384}
```

**Why `fastembed` and not `sentence-transformers`.** They serve the same model
and produce the same 384-dimension vectors; the difference is what gets
installed underneath. `sentence-transformers` pulls PyTorch — roughly a 2GB
image and ~600MB resident. `fastembed` runs the model through ONNX Runtime:
~200MB image, ~150MB resident, and faster CPU inference for short documents.

That gap is not a micro-optimization, it is the deployment story. At ~150MB the
sidecar fits inside a 512MB free tier; at ~600MB it does not, and production
requires a paid instance. Since the whole point of this design is zero marginal
cost (§14), ONNX is the correct default. `sentence-transformers` remains a
drop-in swap behind the same HTTP contract if a future model isn't packaged for
ONNX.

The Go `Embedder` implementation is a thin HTTP client calling this service
(`http://embed-svc:8000/embed` in Docker Compose, alongside Mongo/Redis/MinIO
in the existing `docker-compose.yml`). Batch requests (send up to ~100 texts
per call) to amortize the HTTP round trip.

**Cost: $0.** No API key, no per-token billing, no rate limits, no external
network dependency at runtime once the model weights are downloaded once at
build time. The only "cost" is ~130MB of disk for model weights and a small
amount of CPU during indexing — indexing is infrequent (only on
create/update/build-success) and cheap even on a small VM.

**Graceful degradation (non-negotiable, matches existing project conventions):**
if `embed-svc` is unreachable or `EMBEDDING_ENABLED=false`, indexing is
skipped and `GET /search` transparently falls back to the existing regex/tag
search. This mirrors exactly how `internal/cache` treats a missing Redis
(`internal/cache/cache.go:12-36`).

---

## 6. Indexing pipeline

### 6.1 Triggers

An index job should be enqueued whenever the component document could have
changed:

| Event | Handler | Why |
|---|---|---|
| Component created | `CreateComponent` | initial index |
| Component metadata updated | `UpdateComponent` | name/description/tags changed |
| Version added | `AddVersion` | new README, new props |
| Build succeeded | `worker.process` | facts extracted, source changed |
| Rating/like changed | *debounced* | ranking inputs stale |

The last one must **not** trigger re-embedding — only a cheap
`UpdateOne` refreshing the denormalized ranking fields. Re-embedding on every
like would be wasteful and pointless (the vector doesn't depend on likes).

### 6.2 Reuse the existing queue pattern

```go
// internal/handlers/index.go (new) — mirrors notifyWorker in build.go:23
const IndexStreamKey = "index:stream"

func notifyIndexer(ctx context.Context, componentID primitive.ObjectID) {
    if cache.Client == nil { return }
    _ = cache.Client.XAdd(ctx, &redis.XAddArgs{
        Stream: IndexStreamKey,
        Values: map[string]interface{}{"componentId": componentID.Hex()},
    }).Err()
}
```

Worker side, add a second stream loop alongside `streamLoop`
(`internal/worker/worker.go:152`). Both run as goroutines under the same
`Processor.Run`. Add a slow (5 min) Mongo sweep for components whose
`docHash` differs from a freshly computed hash, mirroring the existing
poll-as-fallback design (`worker.go:96-110`).

### 6.3 Idempotency via `DocHash`

Before calling the embedding API, compute `sha256(renderedDocument)`. If it
matches the stored `DocHash`, skip the API call and only refresh the ranking
fields. This makes re-indexing free for unchanged components and makes a full
catalog re-sweep safe to run on a timer.

### 6.4 Backfill

One-off script at `cmd/backfill_embeddings/main.go`, following the existing
maintenance-script convention (`cmd/fix_bucket_policy`, `cmd/fix_mime_types`).
Batches 100 components per embedding API call (the API accepts arrays), with
a `--dry-run` flag.

---

## 7. Query path

### 7.1 New endpoint

```
GET /search?q=<text>&framework=<f>&tags=<a,b>&page=1&limit=10
```

Public, registered next to the other public component reads in
`internal/routes/routes.go:25-30`. Wrapped in `middleware.OptionalAuth` so a
logged-in owner's private components can appear in *their own* results.

**The response MUST mirror `ComponentsListResponse` exactly**, plus one field:

```jsonc
{ "success": true, "data": {
    "page": 1, "limit": 10, "total": 42,
    "components": [ /* full Component docs, ranked */ ],
    "mode": "vector"            // or "keyword" when degraded
}}
```

This is a correction to an earlier draft of this plan, which proposed an opaque
`cursor`. The frontend browse page (`app/components/page.tsx:44-60`) is built on
page/limit/total: it computes `totalPages = Math.ceil(total / limit)` and drives
the shared `Pagination` primitive from it. A cursor contract would force a
rewrite of that page and lose the URL-as-source-of-truth behaviour it already
has. Matching the existing envelope means `useComponents` only has to choose a
different endpoint — every other part of the page keeps working untouched.

For the same reason `/search` **must** accept `framework` and `tags` and apply
them as prefilters before the cosine scan. The browse page's framework chips and
tags input stay mounted while a query is active; if the endpoint ignored them,
the chips would silently stop filtering.

### 7.2 Pipeline

```
1. Normalize + hash the query string.
2. Redis lookup: search:v{epoch}:{sha256(q + filters)} → cached result IDs.
   Reuse the existing epoch-counter invalidation pattern (cache.Incr) so any
   component write invalidates the whole search cache family at once.
3. Cache miss → call embed-svc for the query vector (~20-50ms on CPU).
4. Load all public component_embeddings into memory (or keep a warm
   process-lifetime cache refreshed on a ticker — see below), compute cosine
   similarity against every vector, take the top 50 by score.
5. Re-rank the 50 candidates (section 7.3).
6. $lookup / batch-fetch the top 20 full Component docs.
7. Cache the ordered IDs for 5 minutes.
```

**In-memory vector cache:** rather than re-querying Mongo for every search,
keep the full `(componentId, vector, visibility, ownerId, collaborators,
rankingFields)` set in a package-level Go slice. At a few thousand components
this is a few MB of RAM — trivial. This is what makes brute-force search fast:
no database round-trip on the hot path at all, just a for-loop over memory.

**How it stays fresh — corrected.** An earlier draft said the slice refreshes
"on-demand whenever an `index:stream` message is processed." **That does not
work:** `index:stream` is consumed by the *worker* process, while the slice
lives in the *API* process serving `/search`. The two are separate binaries
(see CLAUDE.md) and share nothing but MongoDB and Redis. Left as written, the
only refresh would be the 30s ticker, which has a security consequence: a
component switched to private would remain searchable for up to 30 seconds.

The fix reuses machinery that already exists. Every component write already
bumps `cache:components:list:epoch` via `invalidateComponentCaches`
(`internal/handlers/component_handler.go:37-40`) — including visibility changes
(`component_visibility_handler.go:44,84,112`) and ratings
(`rating_handler.go:141,219`). So:

1. Each `/search` request reads that epoch (one Redis GET, ~1ms).
2. If it differs from the epoch the slice was loaded at, reload from Mongo
   before scanning.
3. The 30s ticker (same pattern as `heartbeatLoop`,
   `internal/worker/worker.go:112`) stays as the fallback for when Redis is
   unavailable and the epoch can't be read.

This makes a visibility change take effect on the very next search rather than
up to 30s later, and adds no new invalidation mechanism to maintain.

**Latency budget:** ~30ms embed (local, no network) + ~5-15ms brute-force scan
over an in-memory slice + ~20ms hydrate ≈ **~60-80ms cold, <10ms warm.**
Faster than the original Atlas-based estimate, and with one fewer network hop.

### 7.3 Re-ranking — the part that makes results actually good

Pure cosine similarity has a well-known failure mode on marketplaces: an
abandoned, unrated component with a perfectly-worded README outranks a
battle-tested one whose README is terse. Blend semantic relevance with earned
trust:

```go
// internal/search/rank.go (new)
func score(c Candidate) float64 {
    semantic := c.VectorScore                       // 0..1 cosine

    // Bayesian average — prevents a single 5-star rating from beating
    // a 4.6 with 200 ratings. C = prior weight, m = catalog mean rating.
    const C, m = 10.0, 3.8
    quality := (C*m + c.AvgRating*float64(c.RatingCount)) /
               (C + float64(c.RatingCount)) / 5.0

    // Log-damped popularity so a 10k-view component doesn't dominate.
    popularity := math.Log1p(float64(c.LikeCount)) / math.Log1p(1000)

    // Freshness: full credit <30d, decaying to 0 at ~1y since last build.
    freshness := math.Exp(-daysSince(c.LastBuiltAt) / 180.0)

    // Build health — a component whose latest build errored is a bad result.
    health := 1.0
    if c.LastBuildStatus == models.BuildError { health = 0.4 }

    return (0.60*semantic + 0.20*quality + 0.12*popularity + 0.08*freshness) * health
}
```

Weights are a starting point, not gospel. **They must be tunable via env vars**
(`SEARCH_W_SEMANTIC`, etc.) so they can be adjusted without a redeploy, and
every search response should include the per-signal breakdown behind a
`?debug=1` flag so tuning is empirical rather than vibes-based.

### 7.4 Hybrid retrieval (recommended addition)

Pure vector search is weak on **exact identifier matches** — searching
`react-hook-form` should hard-match a component that depends on it. Run the
existing regex/tag search in parallel and fuse the two result lists with
**Reciprocal Rank Fusion**:

```
RRF(d) = Σ over lists L of  1 / (k + rank_L(d)),  k = 60
```

RRF requires no score normalization between the two systems (their scores are
not comparable), is two lines of code, and reliably beats either list alone.
This is the highest-value 30 lines in the whole feature.

---

## 8. "More like this"

Free once vectors exist, and arguably higher-intent than text search:

```
GET /components/:slug/similar?limit=6
```

Fetch the component's own stored vector, run it through the same in-memory
cosine scan as `/search`, drop the self match. Renders as a "Similar components" rail on the detail page
(`app/components/[slug]/page.tsx`). **Ship this in the same PR as search** — it
is ~40 lines and demos extremely well.

---

## 9. Frontend integration

| File | Change |
|---|---|
| `lib/api.ts` | `searchComponents(q, filters)` and `getSimilarComponents(slug)` via `apiFetch<T>` |
| `types/index.ts` | `SearchResult` (component + `score`, optional `scoreBreakdown`), `ComponentFacts` |
| `hooks/use-api.ts` | `useSearch(query)` with 250ms debounce + request cancellation on keystroke |
| `app/components/page.tsx` | search input becomes semantic; keep framework/tag chips as prefilters applied before the cosine scan |
| `app/components/[slug]/page.tsx` | "Similar components" rail + a "Props" table from `component_facts` |
| `components/common/` | new `search-input.tsx` and `similar-components-rail.tsx`, brutalist-styled to match existing primitives |

Empty/error states matter: when `embed.Client` is nil server-side the response
should carry `"mode": "keyword"` so the UI can quietly render the old
experience rather than showing a broken search.

---

## 10. Implementation phases

> **Phases 1–2 are the approved first slice.** They are expanded into a file
> map below. Phases 3–4 remain planned and are deliberately not started until
> the first slice can be judged in use.

**Phase 1 — Vectors exist (1-2 days)** ← approved
`internal/embed` package + HTTP client for the sidecar; `ComponentEmbedding`
model + indexes; backfill script; document assembly from *existing* fields only
(name, description, tags, README) — no source extraction yet.
*Exit criteria:* every component has a vector; `cmd/backfill_embeddings` is idempotent.

**Phase 2 — Search works (1-2 days)** ← approved
`GET /search` — brute-force cosine over the in-memory vector slice (§7.2) plus
re-ranking (§7.3); Redis caching with epoch invalidation; frontend search input.
*Exit criteria:* "pricing card with a toggle" returns sensible results on a seeded catalog.

### 10.1 File map for Phases 1–2

**New — backend**

| File | Purpose |
|---|---|
| `internal/embed/embed.go` | `Embedder` interface + HTTP client. Gate with `embed.Enabled()`, mirroring `ai.FallbackEnabled()` (`internal/ai/groq.go:24`). |
| `internal/models/embedding.go` | `ComponentEmbedding` (§4.1). |
| `internal/search/document.go` | Assemble + render the document (§3.3); sha256 → `DocHash`. |
| `internal/search/store.go` | In-memory vector cache + cosine scan, 30s ticker refresh. |
| `internal/search/rank.go` | `score()` (§7.3), weights from env. |
| `internal/handlers/index.go` | `notifyIndexer` — near-copy of `notifyWorker` (`internal/handlers/build.go:23`). |
| `internal/handlers/search_handler.go` | `GET /search`. |
| `internal/worker/index.go` | `indexLoop` (Redis Stream) + 5-min `DocHash` sweep. |
| `cmd/backfill_embeddings/main.go` | Backfill. **Dry run by default, writes only with `--apply`**, matching `cmd/normalize_frameworks` and `cmd/reap_orphans`. |
| `embed-svc/{main.py,requirements.txt,Dockerfile}` | The sidecar (§5). |

**Modified — backend**

- `cmd/main.go` — `embed.Init()` and `search.Init()` after `cache.Init()` (line 34). The **API process** needs both: the embedder to vectorize incoming queries, and the in-memory store to scan. Neither may be fatal on failure — log and degrade, like `cache.Init()`.
- `cmd/worker/main.go` — `embed.Init()` after `cache.Init()`. The **worker** needs the embedder to index, but *not* the in-memory store — it never serves a query.
- `internal/routes/routes.go` — `app.Get("/search", middleware.OptionalAuth, handlers.SearchComponents)` in the public-reads block (line 25), so an owner sees their own private components.
- `internal/worker/worker.go` — `Run()` (line 96) starts `go p.indexLoop(ctx)` **before** the Redis branch at line 99. Note `Run` blocks on `streamLoop` in the Redis path and on `pollLoop` otherwise, so `indexLoop` must be launched ahead of the branch or it will never start in one of the two modes.
- `internal/handlers/component_handler.go` — `notifyIndexer` on `CreateComponent`; like/rating changes do a cheap `UpdateOne` of ranking fields only, **never a re-embed** (§6.1). **`DeleteComponent` (line 344) must also delete the `component_embeddings` row** — see the note below.
- `internal/handlers/version_handler.go` — `notifyIndexer` on `AddVersion`.
- `internal/handlers/component_visibility_handler.go` — `notifyIndexer` on visibility change.
- `internal/db/indexes.go` — unique on `componentId`, plus `visibility` (§4.3). Note `EnsureIndexes` is only called from `cmd/main.go`, so the API must have started at least once before the worker indexes.
- `internal/metrics/metrics.go` — the counters in §13. `promauto` self-registers, so adding the vars is the whole change.
- `docker-compose.yml` — `embed-svc` beside mongodb/minio/redis.
- `.env.example` — the variables in §12.

**`DeleteComponent` is the easiest thing here to miss, and the most visible when
missed.** It already fans out across six collections — `component_versions`,
`build_jobs`, `interactions`, `notifications`, `follows`, and a `$pull` from
`collections` — and `component_embeddings` must join that list. Without it, a
deleted component keeps a live vector, keeps matching queries, and surfaces in
results until someone notices. The in-memory store would also need to tolerate
hydration finding no `Component` for an id; it should drop such rows rather than
return a null entry.

**Modified — frontend**

- `types/index.ts` — `SearchResult`, `SearchResponse` (carrying `mode`).
- `lib/api.ts` — `searchComponents(q, filters)` via the existing `apiFetch<T>`.
- `hooks/use-api.ts` — `useSearch(query)`, 250ms debounce with cancellation (the browse page already debounces at 300ms — match that idiom).
- `app/components/page.tsx` — the existing input calls `/search` when `mode` is `vector`; otherwise current behaviour is untouched.

Concretely, because `/search` returns the same envelope as `/components` (§7.1):

- `lib/api.ts` — add `componentApi.search(params, authToken?)` beside the
  existing `list` (line 177); same `ComponentsQueryParams` in, same shape out.
- `hooks/use-api.ts` — `useComponents` (line 43) picks the endpoint:
  `params.q ? componentApi.search(...) : componentApi.list(...)`. This single
  line is the entire integration. It also means `/me`, collections, and every
  other caller of `componentApi.list` are unaffected.
- `app/components/page.tsx` — **no structural change required.** Its URL-state,
  300ms debounce (line 80-89), chips, pagination and skeletons all keep working.
  The only optional addition is a small "semantic" indicator when
  `data.mode === "vector"`.

No new UI primitives — reuse `ComponentCard`, `ComponentCardSkeleton`,
`EmptyState`, `Pagination` per the conventions in CLAUDE.md.

### 10.2 Things explicitly checked and *not* needed

Recorded so nobody re-derives them mid-implementation:

- **Swagger annotations.** `/docs/index.html` is served from the generated
  `docs/` package, but **no handler in the codebase carries a single `@Router`
  or `@Summary` annotation** — the generated spec is already minimal. Adding
  the endpoint requires no doc work and no `swag init` re-run. (Two copies of
  the generated output exist, `docs/` and `cmd/docs/`; `cmd/main.go` imports
  the former. Pre-existing, unrelated to this feature.)
- **CORS and rate limiting.** Both are global in `cmd/main.go` (lines 39-46), so
  `/search` inherits them. The per-query Redis cache (§7.2) is what keeps an
  uncached-query flood from hammering `embed-svc`.
- **`internal/config`.** `Config` holds only six fields and the `ai` package
  reads its own env directly (`internal/ai/groq.go:24,40`). `internal/embed`
  follows that precedent — no change to the config struct.
- **New queue technology.** `index:stream` is another Redis Stream on the
  existing client; nothing new to deploy.
- **Frontend env.** No new `NEXT_PUBLIC_*` variable — `/search` lives on the
  same API base the client already uses.

### 10.3 Known sequencing wrinkle

`CreateComponent` fires `notifyIndexer`, but a component has **no README until a
version exists** — `Readme` lives on `ComponentVersion`
(`internal/models/version.go:18`). So the first vector is built from name,
description, tags and frameworks only, and is genuinely weaker. The re-index on
`AddVersion` replaces it. This is correct behaviour, not a bug, but it means a
freshly created component ranks poorly until its first version lands — worth
knowing before concluding the model is underperforming.

### 10.4 Verification for Phases 1–2

1. `docker-compose up -d embed-svc`; `curl -X POST localhost:8000/embed -d '{"texts":["a pricing card"]}'` → 384 floats.
2. `go run cmd/backfill_embeddings/main.go` writes nothing. Re-run with `--apply`; confirm one row per component. Run `--apply` **twice** — the second run must skip everything via `DocHash`.
3. Create a component with the API + worker running; confirm an index job is logged and a vector lands.
4. `curl 'localhost:8080/search?q=pricing+card+with+a+monthly+yearly+toggle'`, compared against `curl 'localhost:8080/components?q=...'` on the same query.
5. **Auth check (the one that matters most):** mark a component private, search its text signed out → absent **on the very next request**, not after a delay; search as its owner → present. Repeat as a collaborator.
6. **Deletion:** delete a component, search its distinctive text → absent, and confirm `component_embeddings` has no orphan row.
7. **Degradation:** stop `embed-svc`, search again → 200 with `"mode":"keyword"`, never a 500. Then stop Redis too and repeat — still 200.
8. **Frontend contract:** with a query active, confirm pagination still pages, the framework chips still filter, and the URL still round-trips on reload. These are the things the envelope decision in §7.1 exists to protect.
9. `curl localhost:8080/metrics | grep storehubx_search`.

**Phase 3 — Quality (2-3 days)**
RRF hybrid fusion with the existing keyword search; `?debug=1` score breakdown;
weight tuning via env; `/similar` endpoint + detail-page rail.
*Exit criteria:* on a hand-written eval set of 20 queries, top-3 precision beats keyword-only search.

**Phase 4 — Deep signal (2-3 days)**
`extract-props.mjs` sidecar wired into the worker; `component_facts` collection;
richer documents; re-index sweep; Props table in the UI.
*Exit criteria:* prop names appear in the embedded document; searching a prop name finds the component.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Private components leak into public results** | Severe — auth bypass | `visibility` is filtered *before* the brute-force scan (the in-memory candidate set only ever contains public vectors, plus the viewer's own private ones when authenticated). Add an explicit assertion in the handler that every returned doc is public unless the viewer is owner/collaborator. This mirrors the existing "private components skip the Redis fast-path" decision. |
| `embed-svc` sidecar down/unreachable | Search degraded | Fall back to keyword search on error; never 500. Health-check `embed-svc` on worker startup and log a warning, same tone as the existing Redis-unavailable warning (`cache.go:30`). |
| Stale vectors after edits | Bad results | `DocHash` comparison in the 5-min sweep catches anything the event triggers missed. |
| **Deleted components keep matching queries** | High — visibly broken results | `DeleteComponent` must remove the `component_embeddings` row alongside the six collections it already cleans up (§10.1). Defence in depth: the hydration step drops any candidate whose `Component` no longer exists. |
| **A component made private stays searchable briefly** | Severe — same class as an auth bypass | The API's in-memory slice reloads whenever `cache:components:list:epoch` changes, which every visibility write already bumps (§7.2). Without this the window is up to 30s. |
| API and worker disagree about the embedding model | Vectors of mixed dimensions in one scan | Both processes read the same `EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS` env. The store skips any row whose `Dimensions` doesn't match the configured value, and logs a count — a non-zero count means a migration is half-finished. |
| Model change (e.g. swapping to a bigger model later) | Full re-index | `Model` + `Dimensions` are stored per row. A model migration is a backfill job, then an atomic cutover of an env var. Plan for it; don't pretend it won't happen. |
| Catalog outgrows in-memory brute-force (~50k+ components) | Search gets slow | This is the trigger to introduce Qdrant (self-hosted, free, see §14) — swap the `internal/search` implementation behind its existing interface. Not a concern at current or near-term scale. |
| Prompt/document injection via README | Poisoned ranking | Truncate README, strip HTML/scripts, and cap any single field's contribution. Embeddings are not instruction-following, so the blast radius is limited to relevance manipulation — treat it as spam, not RCE. |

---

## 12. Config additions (`.env.example`)

```bash
EMBEDDING_ENABLED=true
EMBEDDING_SVC_URL=http://embed-svc:8000   # http://localhost:8000 outside docker
EMBEDDING_MODEL=bge-small-en-v1.5
EMBEDDING_DIMENSIONS=384
SEARCH_ENABLED=true
SEARCH_CACHE_TTL=300s
SEARCH_W_SEMANTIC=0.60
SEARCH_W_QUALITY=0.20
SEARCH_W_POPULARITY=0.12
SEARCH_W_FRESHNESS=0.08
```

---

## 13. Observability

Extend `internal/metrics/metrics.go` following the existing
`storehubx_builds_total` convention:

```go
storehubx_search_requests_total{mode="vector|keyword|hybrid"}
storehubx_search_latency_seconds{stage="embed|vector|rerank|hydrate"}
storehubx_search_zero_results_total          // the single best quality signal
storehubx_embeddings_indexed_total{result="ok|skipped|error"}
storehubx_embedding_api_latency_seconds
```

`search_zero_results_total` trending up is the clearest possible signal that
the index is stale or the catalog has a coverage gap. Add these to the existing
auto-provisioned Grafana dashboard (`grafana/provisioning/`).

---

## 14. Why this design over the alternatives

- **Why self-host the embedding model instead of an API?** Zero marginal cost,
  no external network dependency in the hot path, no vendor rate limits, and
  `bge-small-en-v1.5` is competitive with paid APIs on retrieval quality at
  this document size (MTEB-ranked among the top small models). The only real
  cost is running one extra small container — negligible next to the worker
  process the project already runs.
- **Why brute-force cosine instead of a vector database?** At the catalog
  sizes this project will realistically hit in the near term (hundreds to low
  thousands of components), an in-memory linear scan is not a compromise —
  it's *faster* than round-tripping to a separate vector DB, because there's no
  network hop and no index-build overhead. Vector databases solve a problem
  (searching millions-to-billions of vectors with sub-linear complexity) this
  project doesn't have yet. Reaching for one now would be premature
  infrastructure, not engineering rigor.
- **The documented upgrade path: self-hosted Qdrant.** If the catalog grows
  past roughly 50k components, or query latency becomes a real bottleneck,
  swap the brute-force scan in `internal/search` for calls to a Qdrant
  instance (open source, Apache 2.0, runs as one more `docker-compose`
  service — no license cost, no per-query cost). Because `Embedder` and the
  scoring function are already isolated interfaces, this is a storage-layer
  swap, not a rewrite — the document-assembly, re-ranking, and RRF-fusion
  logic in this plan are unaffected. `pgvector` is the equivalent move *if*
  the project ever migrates off Mongo; Milvus is the move *if* it ever needs
  billion-scale, distributed search — neither applies here.
- **Why not Elasticsearch/Typesense for the whole thing?** Both are excellent
  for keyword search specifically, but this plan already keeps the existing
  Mongo-based keyword search and fuses it via RRF (§7.4) rather than
  replacing it — so there's no need for a second full-text search engine on
  top of everything else.
- **Why not chunk the README into multiple vectors?** Classic RAG chunking
  optimizes for retrieving *passages* from long documents. Here the retrieval
  unit is a whole component, and components are small. One vector per component
  keeps ranking, dedup, and "more like this" trivially simple.
- **Why not an LLM re-ranker?** A cross-encoder or LLM re-rank over the top 50
  would improve precision meaningfully — but it adds ~500ms and a per-query LLM
  cost to every search. Revisit once there is evidence the cheap re-ranker is
  the bottleneck. Design keeps the door open: re-ranking is already an isolated
  function (`internal/search/rank.go`).
- **Why keep keyword search at all?** Exact-match queries (a package name, an
  author's handle, a precise component name) are a large share of real search
  traffic and are exactly where embeddings are weakest. RRF fusion gets both.

---

## 15. Running this in production for free

Every design choice above was made so that the whole stack has a genuinely free
configuration — no trial credits, no expiring tier.

| Piece | Free option | Note |
|---|---|---|
| Frontend | **Vercel** Hobby | Next.js, no card required |
| Go API + worker | **Oracle Cloud Always Free** ARM VM (4 vCPU / 24GB) | The strongest permanently-free tier available; comfortably runs API, worker and `embed-svc` together. Fly.io or Koyeb are the fallbacks. |
| `embed-svc` | Same VM, or **Google Cloud Run** (2M req/mo, scales to zero) | Cloud Run cold start is ~5-10s with ONNX. Tolerable *only* because `/search` falls back to keyword on timeout (§5) — without that degradation path, don't scale this to zero. |
| MongoDB | **Atlas M0** (512MB) | No Atlas Vector Search needed: cosine runs in Go (§7.2), so the free tier is sufficient. This is a direct payoff of the brute-force decision. |
| Redis | **Upstash** free tier | Cache + streams; already optional everywhere (§5). |
| Object storage | **Cloudflare R2** (10GB free) | Replaces MinIO in production; `CDN_BASE_URL` already exists for exactly this swap. |

**The number that decides it: ~150MB RAM for `embed-svc`.** That is what keeps
the sidecar inside a 512MB free instance. Under PyTorch it would need ~600MB and
every option above except the Oracle VM stops working — which is the whole
reason for the ONNX decision in §5.

**Marginal cost per search is zero.** No embedding API, no managed vector DB, no
per-query billing. The only recurring compute is indexing, which runs on
create / new version / build success — never on a read.

**Simplest concrete deployment:** one Oracle Always Free ARM VM running the
existing `docker-compose` stack plus `embed-svc`, Atlas M0 for data, R2 for
bundles, Vercel for the frontend. That is the entire production footprint, at $0.

**What would eventually cost money:** outgrowing Atlas M0's 512MB (the vectors
are ~1.5KB each, so ~10k components is only ~15MB — text and build jobs will hit
the limit long before embeddings do), or outgrowing in-memory brute force at
~50k components, which is the trigger to introduce self-hosted Qdrant (§14) —
itself free, just one more container.
