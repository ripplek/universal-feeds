# Contributing

Thanks for helping improve **universal-feeds**.

This repo is both:
- a **Node.js CLI** that generates topic-based daily digests from multiple sources, and
- a **Clawdbot skill** entrypoint at `skill/universal-feeds/SKILL.md`.

## Ground rules

- **No secrets**: never commit cookies, tokens, API keys, or personal data.
- **Respect websites/ToS**: do not add scraping that clearly bypasses paywalls/anti-bot. Prefer RSS/official APIs.
- **Small PRs**: keep changes focused; include tests.

## Development setup

Requirements:
- Node.js 22+

Install:

```bash
npm ci
```

Run tests (unit + digest smoke test):

```bash
npm test
```

Run digest locally:

```bash
cp config/feeds.example.yaml config/feeds.yaml
node bin/digest --config config/feeds.yaml --date today
```

## Project layout

- `bin/` — CLI entrypoints
- `src/` — pipeline + adapters + ranking/tagging/dedup
- `sources/` — curated source packs (`weight` / `reliability` supported)
- `config/` — example configs + CI config
- `docs/` — design docs (PRD/architecture/schema)
- `skill/` — Clawdbot skill directory
- `test/` — unit tests (Node test runner)

## Adding or editing sources

- Prefer `type: rss` whenever possible.
- Use `type: html` only when there is no stable RSS.
- Set `weight` (ranking preference) and `reliability` (0..1; stability/trust) thoughtfully:
  - Official RSS: reliability 1.0
  - Stable media RSS: 0.9–0.95
  - Community/aggregators: 0.8–0.9
  - HTML extraction: 0.7–0.85

## Adding a new adapter/source type

1) Add a source module under `src/sources/` (see `rss.js`, `v2ex.js`, `youtube.js`).
2) Normalize output to the shared item shape used across the pipeline.
3) Add unit tests for critical parsing/ranking behavior.
4) Update docs if you introduce new config keys.

## PR process

- Use a descriptive title; prefer **Conventional Commits** if possible:
  - `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `quality: ...`
- Ensure:
  - `npm test` passes
  - docs updated if config/schema changed

See `.github/pull_request_template.md`.
