# Roadmap — Universal Feeds

## Phase 0 — Repo scaffolding (now)
- [x] Create repo
- [x] Write PRD + architecture + roadmap

## Phase 1 — MVP (A-tier sources)
- [ ] Define `FeedItem` schema + JSONL format
- [ ] Preferences config format (`feeds.yaml`)
- [ ] Adapter: X via bird (search + following)
- [ ] Adapter: V2EX hot topics
- [ ] Adapter: RSS (curated list of media feeds)
- [ ] Digest renderer (Markdown)
- [ ] Cron template to run daily and send to user

## Phase 2 — Quality
- [ ] De-duplication (URL canonicalization + similarity)
- [ ] Ranking improvements
- [ ] Summarization pipeline (top N only)
- [ ] Unit tests per adapter

## Phase 3 — CN platforms expansion
- [ ] Weibo 热搜 adapter (best-effort + fallback)
- [ ] WeChat hot list adapter (third-party list first)
- [ ] Better zh/en topic handling

## Phase 4 — Short video platforms
- [ ] YouTube deeper support (playlists, transcripts)
- [ ] TikTok (if feasible via official API or safe relay)

## Phase 5 — Personalization
- [ ] Feedback loop: thumbs up/down in chat
- [ ] Per-user weighting
