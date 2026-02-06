# Architecture — Universal Feeds

## High-level

```
Preferences (YAML/JSON)
  └─ compile → platform queries
        └─ Adapters fetch items (trending/following/search)
              └─ Normalize → FeedItem[]
                    ├─ De-dup
                    ├─ Rank
                    ├─ (Optional) Summarize
                    └─ Render → Markdown digest + JSONL log
```

## Components

### 1) Adapters
- `adapters/x_bird.*`
- `adapters/rss.*` (or `src/sources/rss.js` in early MVP)
- `adapters/v2ex.*` (or `src/sources/v2ex.js` in early MVP)
- `adapters/youtube.*` (or `src/sources/youtube.js` in early MVP)
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
1) cheap extraction (title + lead + bullets)
2) optional LLM summary for top N items only

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
