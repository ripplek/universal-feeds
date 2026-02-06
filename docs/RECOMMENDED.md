# Recommended (24h, profile-based)

This project supports an **additive** section that answers:

> In the last 24 hours, what happened in the world that I might care about?

It is designed to complement (not replace) your strict **topic-only** briefing.

## Design goals

- **Additive**: do not duplicate items already shown under configured topics.
- **Personalized**: use your existing `topics` + `entities` as a lightweight profile.
- **Hotness-aware**: start from the same ranking score used by the main digest.
- **Diverse**: prevent a single site/source from flooding recommendations.
- **Cheap**: no LLM required (optional future layer).

## How it works (algorithm)

### 1) Candidate pool

Start from `allTagged` items (same fetch, dedup, and recency filters as the main pipeline), then:

- Keep only platforms in `recommended.use_platforms` (default: `rss`, `v2ex`, `youtube`).
- Exclude any item that already matches a configured topic.
  - We compute tags for all items with `require_topic_match=false`.
  - If an item contains a tag equal to any configured `topic.name`, it is excluded from recommendations.

### 2) Interest model (profile)

We compile a lightweight profile from config:

- Topic keywords and anchors from `topics[*].keywords` and `topics[*].anchors`
- Entity aliases from `entities[*].aliases`

We score each candidate by counting matches in the normalized text:

- `kwHits`: number of topic keyword/anchor hits (capped)
- `entHits`: number of entity alias hits (capped)

Interest is additive:

```
interest = kwHits * 0.15 + entHits * 0.35
```

Entity hits are weighted higher than generic keywords.

### 3) Final score

We re-score each candidate using:

```
finalScore = hotScore * (1 + interest)
```

Where `hotScore` is the existing pipeline score (recency + engagement + platform/source weights).

Then we apply:

- `min_score`: drop items below this threshold.

### 4) Diversity caps

To avoid repetition, we apply caps after sorting:

- `max_per_source`: maximum items per `source.name` (fallback to `source.pack`, then `platform`)
- `max_per_domain`: maximum items per URL domain

### 5) Output

In `topic-only` mode, the digest prints:

- `By Topic` sections (strict)
- `Recommended (24h, profile-based)` section (additive)

## Configuration

Add this block to your config:

```yaml
recommended:
  enabled: true
  use_platforms: [rss, v2ex, youtube]
  max_items: 10
  max_per_source: 2
  max_per_domain: 3
  min_score: 0.6
```

## Debugging

For recommended items we attach a debug payload:

- `debug.recommend.hot`
- `debug.recommend.interest`
- `debug.recommend.final`

This makes recommendation behavior inspectable without an LLM.

## Known limitations

- Pure keyword matching can miss semantically-related items.
- No per-user feedback loop yet.
- No content summarization yet.

Future improvements:
- Optional LLM re-ranker for the top-K candidates.
- Topic/category diversity constraints (chips/security/policy/etc.).
