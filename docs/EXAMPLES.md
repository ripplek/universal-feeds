# Examples

This page contains copy/paste examples for common setups.

## 1) Minimal demo config (always produces output)

Use the included demo config:

```bash
node bin/digest --config config/feeds.demo.yaml --date today
```

Key idea: `require_topic_match: false` so the digest is never empty.

## 2) Topic-only daily briefing (recommended)

Copy the example config and customize topics:

```bash
cp config/feeds.example.yaml config/feeds.yaml
node bin/digest --config config/feeds.yaml --date today
```

Recommended settings:

```yaml
output:
  require_topic_match: true
  max_per_topic: 8
  recency_hours: 24
```

## 3) Add a new RSS source pack

1) Create a pack file under `sources/`:

```yaml
# sources/my-pack.yaml
sources:
  - name: Example Blog
    url: https://example.com/rss.xml
    type: rss
    region: global
    weight: 1.0
    reliability: 0.95
    tags: [tech]
```

2) Add it to config:

```yaml
platforms:
  rss:
    packs:
      - sources/my-pack.yaml
```

## 4) RSSHub route shorthand

Instead of a full URL, use `rsshub_route`:

```yaml
- name: Some Telegram Channel
  type: rss
  rsshub_route: telegram/channel/some_channel
```

Set RSSHub base:

```yaml
rsshub:
  base_url: https://rsshub.app
```

## 5) Install as a Clawdbot skill (local)

From the repo root:

```bash
bash scripts/install_skill.sh
```

Then restart the gateway if needed and allow the skill in your channel config.
