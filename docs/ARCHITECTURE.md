# Architecture — Universal Feeds

## High-level

```
Preferences (YAML/JSON)
  └─ compile → platform queries
        └─ Adapters fetch items (trending/following/search)   ─┐ fetchAllSources
              └─ Normalize → FeedItem[] + perSource[] counts   │ → {items, perSource}
                    ├─ De-dup                                  │
                    ├─ Recency filter (anchored to fetchedAt)  │
                    └─ Enrich (X unfurl, I/O)                 ─┘
                          └─ freeze run snapshot → out/runs/<runId>/
                                ├─ items.jsonl   (immutable base pool)
                                ├─ meta.json     (fetchedAt, config hashes, perSource)
                                ├─ candidates.jsonl + judging-task.json  (stage ①)
                                ├─ judgments.jsonl                       (agent writes)
                                └─ run-report.json  (terminal: status/health)
                          └─ render (from snapshot, now = fetchedAt)
                                ├─ Rank → topic/relevance gate → recommended residual
                                ├─ Render → reader digest + inspection + items JSONL
                                └─ sourceHealth → status / health contract
```

**Run snapshot** is the seam that makes candidate drift structurally impossible:
one fetch freezes the base pool, and candidate emission, judgment validation, and
rendering all read that same `items.jsonl` — the render never re-fetches. The
`runId` (`<date>-<seq>`) binds the whole loop; judgments live in the run dir so
their path _is_ the binding. See `src/run_store.js`.

**Health contract** (`src/health.js`): every enabled source contributes a
`perSource` entry; severity is judged on `fetched` (0 items = `warning`, fetch
error / unavailable channel = `error`), optional sources demote to `info`. The
top-level `health` (`ok`/`warning`/`degraded`) is orthogonal to the process
`status` (`ok`/`awaiting_judgments`/`error`) — a source can fail without the run
failing. This is what turns "zero silent failures" from a slogan into a testable
invariant.

## Components

### 1) Adapters

- `adapters/x_bird.*`
- `adapters/rss.*` (or `src/sources/rss.js` in early MVP)
- `adapters/v2ex.*` (or `src/sources/v2ex.js` in early MVP)
- YouTube — via the reach layer (OpenCLI browser bridge); see `src/reach/`
- (later) `adapters/weibo.*`, `adapters/wechat_hot.*`, `adapters/tiktok.*`

Adapters should expose a small interface:

- `fetchTrending(params)`
- `fetchFollowing(params)`
- `search(params)`

### 2) Normalization layer

Converts platform responses into a unified `FeedItem` structure.

### 3) Ranking

Inputs:

- topic match score
- recency
- engagement (if available)
- source reliability weight (configurable)

### 4) Summarization

Two-stage recommended to control cost:

1. cheap extraction (title + lead + bullets)
2. optional LLM summary for top N items only

### 5) Storage

- Raw pull logs: `out/raw/<platform>/...` (optional)
- Normalized items: `out/items-YYYY-MM-DD.jsonl`
- Digest: `out/digest-YYYY-MM-DD.md`

## Security posture

- Following feeds require explicit user opt-in.
- Prefer official tokens/OAuth when available.
- If cookies are used, keep them local; never commit.
- Least-privilege filesystem scope; avoid arbitrary exec in adapters.
- Provide audit logs for what was fetched and why.
