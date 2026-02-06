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

### rsshub

- `base_url`: e.g. `https://rsshub.app`

### html_sources

- `min_change_length`: ignore tiny HTML description tweaks
- `force_refresh_days`: surface an unchanged seed at least once every N days
