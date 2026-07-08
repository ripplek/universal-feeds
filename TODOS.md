# TODOS

## Docs

### Sync README.zh-CN.md with README.md

**What:** Port the "Use with your agent" / MCP server section from README.md
into README.zh-CN.md (currently English-only).

**Why:** README.zh-CN.md diverged when PR #3 (agent integration surface)
updated only the English README — Chinese readers get a stale picture of
MCP support.

**Context:** See README.md's "## Use with your agent" section (MCP server,
`bin/mcp`, skill install scripts). Translate and insert in the same relative
position in README.zh-CN.md.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Reliability

### Investigate persistent v2ex empty-fetch

**What:** `v2ex` returned 0 items in both showcased real runs
(2026-07-03 and 2026-07-08) while every other enabled source stayed healthy.

**Why:** The run-snapshot health contract surfaces this instead of hiding
it (see `docs/SHOWCASE.md`), but two-for-two empty fetches across separate
days points to a source/adapter problem worth root-causing, not noise.

**Context:** Check `src/sources/` for the v2ex fetch path; compare against a
manual check of the v2ex trending endpoint to see if it's a selector change,
rate limit, or block.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed
