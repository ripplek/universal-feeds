# PRD — Universal Feeds (Clawdbot/OpenClaw Skill)

## 1. Background

Users want a **single place** to get today’s most important content across multiple platforms:

- Trending / 热搜 (public, no login)
- Following feeds (requires user’s own account binding)
- Topic-based feeds (e.g. “AI model releases”, “OpenClaw updates”, “companies I hold”) 

The output should be a **daily briefing** (and optionally breaking alerts), delivered to the user via their messaging channel.

## 2. Goals

1) Collect daily hot content from US + Mainland China mainstream platforms.
2) Normalize results to a unified schema.
3) Allow users to configure preferences (topics/entities/sources) and optional account binding.
4) Produce ranked digests and summaries with citations/links.
5) Ship as a **Clawdbot Skill** (self-hosted first), with pluggable adapters.

## 3. Non-goals (initially)

- Building a centralized SaaS crawler for all users.
- Circumventing platform protections. If no official API/auth exists, we use **best-effort** public endpoints or browser relay with explicit user consent.
- Perfect personalization/recommendation ML.

## 4. Personas

- **Builder**: wants to track AI tooling, releases, repos.
- **Operator**: wants market/company news (US/CN), macro headlines.
- **Creator**: wants trending topics for content ideas.
- **Security-conscious user**: wants clear boundaries + auditability.

## 5. User stories

- As a user, I can run `daily-digest` and get a ranked list of links across platforms.
- As a user, I can connect my X account to get my Following timeline.
- As a user, I can define preferences like:
  - “Track OpenClaw/Clawdbot/Moltbot news daily”
  - “Track AI model releases from OpenAI/Anthropic/Google/xAI”
  - “Track重大新闻 about companies I hold (tickers + aliases)”
- As a user, I can disable any platform adapter.
- As a user, I can choose output format: short/medium/long digest.

## 6. Functional requirements

### 6.1 Sources
Each platform adapter should support some subset of:
- `trending` (Explore/热搜/most popular)
- `following` (requires auth)
- `search` (topic queries)
- `item_detail` (fetch full text if feasible)

### 6.2 Preference system
- Topics: keywords + aliases + intent
- Entities: companies/products/people
- Source filters: allow/block lists
- Language filters: zh/en
- Recency window: today / 24h / 7d

### 6.3 Normalization
All results return `FeedItem` with:
- `platform`, `sourceType`
- `id`, `url`
- `author`, `title`, `text`
- `publishedAt`
- `metrics` (platform-specific engagement)
- `tags` (topic hits)
- `raw` (optional)

### 6.4 Ranking & de-dup
- Basic ranking: engagement + recency + topic match score
- De-dup: same URL, same canonical news story, or high similarity

### 6.5 Summarization
- Per-item summary (optional)
- Daily executive summary
- Always include links/citations

### 6.6 Delivery
- CLI output
- Markdown report file
- Optional send to messaging channel via Clawdbot

## 7. Constraints & risks

- Platform anti-scraping & ToS
- Login binding security
- Cost control for summarization
- Maintenance burden (HTML changes)

## 8. MVP definition

MVP adapters (recommended):
- X via `bird` (search + following)
- RSS/Most-popular pages for a curated list of US/CN media
- V2EX hot topics
- YouTube (channels + search)

MVP outputs:
- `out/digest-YYYY-MM-DD.md`
- `out/items-YYYY-MM-DD.jsonl`

## 9. Success metrics

- Time-to-digest: < 2 minutes on a typical machine.
- User reports >70% of digest items are relevant.
- Easy to add a new platform adapter (< 1 day).
