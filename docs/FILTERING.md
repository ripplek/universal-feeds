# Relevance filtering — keyword vs AI-judged

The digest decides which items reach you in one of two ways, selected by
`filter.mode` in `feeds.yaml`.

## `keyword` (default)

The legacy matcher (`src/tagging.js`): per topic, an item survives when its
title/text hits the topic's `anchors` **and** `keywords` (respecting
`exclude_keywords`, source/domain/platform allow-lists). Zero-config, offline,
deterministic — but brittle: it misses synonyms, paraphrase, and cross-language
content (a Chinese post never matches English keywords). Kept as the fallback.

## `llm` / `hybrid` — AI relevance judgment

Because this project is built for AI agents, `mode: llm` hands the relevance
decision to a Clawdbot agent, which judges each item **semantically** against a
natural-language interest profile. It replaces the keyword gate for the main
digest; the "Recommended" section still uses the keyword profile.

Execution is **delegated to the host agent** — the digest CLI never calls an LLM
API or holds a key. It's a three-step hand-off:

```
① CLI    digest --stage candidates      → out/candidates-<date>.jsonl
② agent  judge each with claude-haiku-4-5 → out/judgments-<date>.jsonl
③ CLI    digest --judgments <file>       → filter/tag/score → digest-<date>.md
```

The judging step (②) is specified for the agent in
`skill/universal-feeds/SKILL.md`.

### Data contract

Candidate (one JSONL line, emitted by the CLI):

```json
{
  "id": "reddit:1tolh94",
  "platform": "reddit",
  "title": "…",
  "text": "…(≤ max_text_len)…",
  "url": "…"
}
```

`id` is `<platform>:<FeedItem.id>` — platform-qualified so ids don't collide
across sources (`src/candidates.js`).

Judgment (one per candidate, produced by the agent):

```json
{
  "id": "reddit:1tolh94",
  "relevant": true,
  "score": 0.82,
  "topics": ["agentic-ai"],
  "why": "hands-on agent framework"
}
```

When `output.translate: true`, the judging task also carries `target_language`
and the judgment gains an optional `title_translated` — the title rendered in
`output.language` (echoed unchanged if already in that language). It folds into
this same pass; `applyJudgments` attaches it as `item.titleTranslated` and the
reader view prefers it, so `digest-<date>.md` is single-language instead of a
mix of English and Chinese headlines. Absent → the original title is used.

`applyJudgments` (`src/judgments.js`) then:

- drops items marked `relevant:false`, unjudged, or `score < filter.min_relevance`
  — **only when `output.require_topic_match: true`** (strict). With it `false`,
  all items are kept but judged ones are still tagged and boosted.
- sets `tags = existing ⋃ topics` (feeds the digest's grouping / coverage / boosts).
- folds relevance into the score: `score += score_judged × filter.relevance_boost`.
- records `debug.relevance = { score, why }`.

### Config

```yaml
output:
  language: zh # target language for translate
  translate: true # unify digest titles into `language` (needs mode: llm/hybrid)
  require_topic_match: true # strict: drop items the agent didn't mark relevant
filter:
  mode: llm # keyword | llm | hybrid
  model: claude-haiku-4-5 # which model the agent uses to judge (cheap bulk)
  min_relevance: 0.5 # threshold in strict mode
  max_text_len: 500 # candidate text truncation (token control)
  relevance_boost: 1.0 # how much judged relevance adds to score
  profile: |
    I care about agentic AI, LLM releases + evals, dev tooling, and the
    OpenClaw/Clawdbot ecosystem. Not interested in crypto, ads, or celebrity news.
```

`hybrid` behaves like `llm` when a judgments file is present and like `keyword`
when it isn't — a safe default for cron that may or may not run under an agent.

### Cron note

With `mode: llm`, the daily run is a **Clawdbot agent invocation** of this skill
(so it can perform step ②), not a bare `node bin/digest`. A bare run with no
judgments file falls back to the keyword gate.

### Cost control

- Cheap deterministic pre-filters (recency, dedup, X-noise) run **before**
  candidates are emitted, so only survivors are judged.
- Candidate payloads are compact (`max_text_len`).
- Use `claude-haiku-4-5` — one call classifies hundreds of items for cents.
- Judgments are a plain file; an agent can cache/merge across runs to avoid
  re-judging unchanged items.
