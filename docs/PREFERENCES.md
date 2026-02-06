# Preferences spec (draft)

A user-defined config that controls what the digest includes.

## Example (YAML)

```yaml
output:
  language: [en, zh]
  max_items: 30
  summarize_top_n: 10
  recency_hours: 24

platforms:
  x:
    enabled: true
    sources: [search, following]
  v2ex:
    enabled: true
    sources: [trending]
  rss:
    enabled: true

topics:
  - name: openclaw
    match: any
    keywords: ["OpenClaw", "Clawdbot", "Moltbot", "clawd bot"]
    exclude_keywords: []
    platform_allow: ["x", "rss", "v2ex", "youtube"]
    allow_domains: []
    block_domains: []
    source_pack_allow: []
    source_name_allow: []
    boost: 1.5

  - name: ai-model-releases
    keywords: ["released", "launch", "new model", "weights", "SOTA", "benchmark"]
    boost: 1.2

entities:
  - name: NVIDIA
    aliases: ["NVIDIA", "英伟达", "NVDA"]
    boost: 1.1

sources:
  allow_domains: []
  block_domains: []
  allow_authors: []
  block_authors: []
```

## Notes
- This file is compiled into platform-specific queries.
- The adapters are responsible for translating keywords into the target platform syntax.
