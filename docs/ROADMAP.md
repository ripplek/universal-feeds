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
- [~] Cron template to run daily and send to user — dogfooded via an **external** cron → iMessage job; no template committed to this repo yet

## Phase 2 — Quality

- [x] De-duplication (URL canonicalization + similarity) (`src/dedup.js`)
- [x] Ranking improvements — weight × reliability, per-source caps, hard recency filter (`src/rank.js`, `src/filters.js`)
- [ ] Summarization pipeline (top N only) — not integrated yet (renderer has the hook; no `summarize` call)
- [~] Unit tests per adapter — core modules covered (rank, dedup, render, tagging, unfurl, recommend, rsshub, x); RSS / V2EX / YouTube / WeChat adapters still lack dedicated tests

## Phase 3 — CN platforms expansion

- [ ] Weibo 热搜 adapter (best-effort + fallback) — **not implemented** (no `src/sources/weibo*`)
- [~] WeChat adapter — album-only via `__biz` + `album` (`src/sources/wechat_mp.js`, sogou source list); no general third-party hot list yet
- [x] Better zh/en topic handling (`src/tagging.js`)
- [x] Xiaohongshu + Bilibili via reach layer (`src/reach/channels/`, OpenCLI)

## Phase 3.5 — Reach layer (auth-gated fetching)

Ported from Agent-Reach (MIT); depends on the OpenCLI browser bridge. Desktop-only
(see `docs/adr/0001`). Full design in `docs/REACH.md`.

- [x] Core: probe / config (0o600) / opencli backend / normalize / channels / doctor
- [x] `digest reach doctor | configure | fetch` CLI
- [x] Pipeline integration (opt-in per `platforms.<name>.reach`)
- [x] Channels: twitter, reddit, bilibili, xiaohongshu, facebook, instagram
- [x] Verified live: reddit end-to-end; twitter/bilibili/xiaohongshu field-shape
- [ ] Calibrate facebook / instagram against a live run (mapped from adapter columns only)
- [ ] Add linkedin / xueqiu / xiaoyuzhou channels (OpenCLI backends off/warn today)
- [ ] `reach watch` for scheduled health + update checks

## Phase 4 — Short video platforms

- [~] YouTube support — channel packs only (`src/sources/youtube.js`); playlists / transcripts not done
- [ ] TikTok (if feasible via official API or safe relay)

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
