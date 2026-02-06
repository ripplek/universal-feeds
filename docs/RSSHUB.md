# RSSHub integration plan

RSSHub is a community-driven "RSS generator" that provides RSS/Atom feeds for many platforms that don't offer official feeds.

Docs: https://docs.rsshub.app/guide/

## Why we should use RSSHub

- Fastest way to obtain usable feeds when the official source has no RSS.
- Huge catalog of routes (social, media, dev, CN platforms, etc.).
- Supports parameters like filtering and full-text output.

## Integration strategy (recommended)

### 1) Treat RSSHub as a *feed provider*, not a crawler
- Keep our pipeline RSS-first.
- Add RSSHub URLs into `sources/*.yaml` packs as `type: rss`.

### 2) Instance configuration
Allow configuring an RSSHub base URL:

```yaml
rsshub:
  base_url: https://rsshub.app
```

For reliability, users can self-host and set their own instance.

### 3) Discovery flow (human-in-the-loop)
When we only know a website URL and want a feed quickly:

- Try official RSS (existing packs)
- If missing, consult RSSHub routes
- Use RSSHub Radar rules endpoint to map pages → RSSHub routes when possible
  - https://rsshub.app/api/radar/rules

### 4) Future: optional automated helper
Add a helper command that suggests RSSHub routes by:
- searching route docs (static mapping list)
- using Radar rules

## Risks / notes
- Public instances may rate-limit; self-host recommended for heavy use.
- RSSHub routes can change; keep source packs versioned.
