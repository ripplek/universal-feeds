# Configuration

Configs are YAML files passed to the CLI:

```bash
node bin/digest --config config/feeds.yaml --date today
```

Start from:
- `config/feeds.demo.yaml` — demo (topic matching off)
- `config/feeds.example.yaml` — topic-only daily briefing

## Key sections

### output

- `language`: `en` | `zh`
- `max_items`: overall output cap
- `recency_hours`: sliding window
- `require_topic_match`: if `true`, keep only items that match any topic
- `max_per_topic`: cap items shown per topic section

### ranking

- `platform_weights`: per-platform multipliers
- `max_per_platform`: per-platform caps
- `max_per_source_per_topic` (optional, number): cap how many items from the same `source.name` are shown **within each topic section**. Set to `0` to disable.

Example:

```yaml
ranking:
  max_per_source_per_topic: 2
```

### platforms

Enable/disable adapters and select source modes.

#### X (bird)

```yaml
platforms:
  x:
    enabled: true
    sources: [following]
    following:
      mode: following
      limit: 120
      timeout_ms: 60000
```

- `timeout_ms` is passed to `bird --timeout` to avoid home timeline timeouts.
- `min_effective_len` / `min_effective_tokens` drop low-information tweets (e.g. only mentions + a link).
- `unfurl.*` expands the first URL for low-information tweets and uses the destination page title in the digest.

Example:

```yaml
platforms:
  x:
    following:
      min_effective_len: 20
      min_effective_tokens: 6
      unfurl:
        enabled: true
        max_per_run: 10
        timeout_ms: 8000
```

### rsshub

- `base_url`: e.g. `https://rsshub.app`

### html_sources

- `min_change_length`: ignore tiny HTML description tweaks
- `force_refresh_days`: surface an unchanged seed at least once every N days
