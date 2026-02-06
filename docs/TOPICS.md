# Topics cookbook

This doc lists practical knobs for improving topic quality.

## Fields

```yaml
- name: openclaw
  match: any|all
  anchors: []          # optional; required context anchors
  keywords: []         # keywords to match
  exclude_keywords: [] # if any appears, skip this topic
  platform_allow: []   # optional allowlist of platforms (x/rss/v2ex/youtube)
  allow_domains: []    # optional allowlist of URL domains
  block_domains: []    # optional blocklist of URL domains
  boost: 1.0
```

## Examples

### Track OpenClaw, but avoid crypto noise

```yaml
- name: openclaw
  match: any
  keywords: ["OpenClaw", "Clawdbot", "Moltbot", "moltbook"]
  exclude_keywords: ["airdrop", "pump", "memecoin", "token", "ca:"]
  platform_allow: ["x", "rss", "v2ex", "youtube"]
  boost: 2.0
```

### Track AI model releases (more strict)

```yaml
- name: ai-model-releases
  match: all
  anchors: ["gpt", "claude", "gemini", "model", "weights"]
  keywords: ["benchmark", "SWE-bench", "OSWorld", "context window", "API"]
  platform_allow: ["x", "rss"]
  boost: 1.3
```
