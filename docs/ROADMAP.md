# Roadmap — Universal Feeds

_Last synced with code: 2026-07-01._

Legend: `[x]` done · `[~]` partial · `[ ]` not started.

## Phase 0 — Repo scaffolding

- [x] Create repo
- [x] Write PRD + architecture + roadmap

## Phase 1 — MVP (A-tier sources)

- [x] Define `FeedItem` schema + JSONL format (`docs/SCHEMA.md`, `out/items-*.jsonl`)
- [x] Preferences config format (`feeds.yaml` + `feeds.example.yaml`)
- [x] Adapter: X via bird (search + following) (`src/sources/x_bird.js`)
- [x] Adapter: V2EX hot topics (`src/sources/v2ex.js`)
- [x] Adapter: RSS (curated list of media feeds) (`src/sources/rss.js` + `sources/*.yaml` packs)
- [x] Digest renderer (Markdown) (`src/render.js`)
- [x] Cron template to run daily and send to user — `examples/cron/daily-digest.sh` with a pluggable `$UF_DELIVER` seam

## Phase 2 — Quality

- [x] De-duplication (URL canonicalization + similarity) (`src/dedup.js`); keeps the richer duplicate
- [x] Ranking improvements — weight × reliability, per-source caps, hard recency filter (`src/rank.js`, `src/filters.js`)
- [x] AI relevance filtering — agent-judged semantic gate replacing keyword matching (`src/candidates.js`, `src/judgments.js`, `docs/FILTERING.md`); keyword mode kept as fallback
- [ ] Summarization pipeline (top N only) — not integrated yet (renderer has the hook; no `summarize` call)
- [~] Unit tests per adapter — core modules covered (rank, dedup, render, tagging, unfurl, recommend, rsshub, x); RSS / V2EX / YouTube / WeChat adapters still lack dedicated tests

## Phase 3 — CN platforms expansion

- [x] Weibo adapter — via reach layer (`feed` + `hot`, OpenCLI); native `src/sources/weibo*` not needed
- [~] WeChat adapter — album-only via `__biz` + `album` (`src/sources/wechat_mp.js`, sogou source list); no general third-party hot list yet
- [x] Better zh/en topic handling (`src/tagging.js`)
- [x] Xiaohongshu + Bilibili via reach layer (`src/reach/channels/`, OpenCLI)

## Phase 3.5 — Reach layer (auth-gated fetching)

Ported from Agent-Reach (MIT); depends on the OpenCLI browser bridge. Desktop-only
(see `docs/adr/0001`). Full design in `docs/REACH.md`.

- [x] Core: probe / config (0o600) / opencli backend / normalize / channels / doctor
- [x] `digest reach doctor | configure | fetch` CLI
- [x] Pipeline integration (opt-in per `platforms.<name>.reach`)
- [x] Channels (15): twitter, reddit, bilibili, xiaohongshu, facebook, instagram, linkedin, xueqiu, weibo, hackernews, producthunt, 36kr, juejin, tiktok, substack
- [x] Verified end-to-end live: reddit, hackernews, 36kr; field-verified: twitter/bilibili/xiaohongshu/weibo
- [ ] producthunt opencli `hot` erred live — revisit; juejin/tiktok/substack need a logged-in/working run to calibrate
- [x] `reach watch` — compact health + npm update check, cron-friendly exit code
- [~] facebook / instagram — mapped from adapter columns; live fetch returned empty (needs a logged-in run with feed content to calibrate)
- [~] linkedin — added (feed=`timeline`); tier-2, OpenCLI backend `off` until configured
- [x] xueqiu — added (feed + `hot` trending); `search` omitted (returns stock symbols)
- [—] xiaoyuzhou — skipped: podcast-lookup adapter only, no feed/search command

## Phase 4 — Short video platforms

- [~] YouTube support — channel packs only (`src/sources/youtube.js`); playlists / transcripts not done
- [x] TikTok — via reach layer (`explore`, OpenCLI browser bridge)

## Phase 5 — Personalization

- [ ] Feedback loop: thumbs up/down in chat
- [ ] Per-user weighting — per-_source_ weights exist; per-_user_ weighting not started

## Shipped beyond the original plan

- [x] RSSHub route support (`src/rsshub.js`, `docs/RSSHUB.md`, `scripts/rsshub_suggest.mjs`)
- [x] Link unfurling with cached state (`src/unfurl.js`)
- [x] Profile-based "Recommended" section — 24h tech/ai (`src/recommend.js`, `docs/RECOMMENDED.md`)
- [x] Source packs with `weight` / `reliability` knobs (`sources/*.yaml`)
- [x] Per-source item caps per topic (`src/trim.js`, `src/filters.js`)
- [x] HTML change detection for scraped sources (`out/state-html.json`)
- [x] X low-info noise filtering (`src/filters.js`)
- [x] Clawdbot `SKILL.md` + installer script (`skill/`, `scripts/install_skill.sh`)
- [x] CI: unit tests + digest smoke test (`.github/workflows/ci.yml`)
- [x] Runtime-agnostic agent contract (`AGENTS.md`) + `--json` output / stable exit codes on the digest CLI
- [x] MCP server (`src/mcp/`, `bin/mcp`) — `run_digest` / `emit_candidates` / `apply_judgments` / `reach_fetch` for any MCP agent
- [x] Self-contained judging task (`out/judging-task-<date>.json`) + `--validate-judgments` dry-run + fixture (`examples/judging/`)
- [x] Multi-runtime skill installer (Clawdbot + Claude Code) (`scripts/install_skill.sh`)
- [x] Scheduled-delivery template with a pluggable seam (`examples/cron/`)
