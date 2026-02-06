# Source packs

YAML packs that can be loaded by adapters/pipelines.

## Packs

- `us-tech.yaml`
- `us-general.yaml`
- `cn-tech.yaml`
- `cn-general.yaml`
- `youtube-ai-channels.yaml`

## Schema

Each file contains:

```yaml
sources:
  - name: Example
    url: https://example.com/feed.xml
    type: rss|html|api
    region: us|cn|global
    tags: [tag1, tag2]
    notes: free text
```

Notes:
- Prefer `type: rss` for stability.
- `type: html` requires an HTML extraction adapter.
- Some sources may be paywalled; treat as link-only.
