# Schema — FeedItem (v0.1)

This repo normalizes items from different platforms into a single structure.

## FeedItem

```ts
type Platform =
  | "x"
  | "rss"
  | "v2ex"
  | "youtube"
  | "weibo"
  | "wechat"
  | "tiktok"
  | string;

type SourceType = "trending" | "following" | "search";

type FeedItem = {
  platform: Platform;
  sourceType: SourceType;

  // Where it came from (optional but recommended)
  source?: {
    pack?: string; // e.g. sources/us-tech.yaml
    name?: string; // human label, e.g. "TechCrunch"
  };

  // Identity
  id: string;        // platform id (or deterministic hash if none)
  url: string;       // canonical URL

  // Content
  title?: string;
  text?: string;
  author?: {
    name?: string;
    handle?: string;
  };
  language?: "en" | "zh" | string;

  // Time
  publishedAt?: string; // ISO8601 if known
  fetchedAt?: string;   // ISO8601

  // Engagement / metrics (optional)
  metrics?: {
    like?: number;
    repost?: number;
    reply?: number;
    quote?: number;
    view?: number;
  };

  // Tagging & ranking (computed)
  tags?: string[];
  score?: number;

  // Debug
  raw?: unknown; // optional; avoid storing by default
};
```

## JSONL storage format

Daily normalized items are written to:

- `out/items-YYYY-MM-DD.jsonl`

Each line is a full JSON object of `FeedItem`.

## Digest output

Rendered digest is written to:

- `out/digest-YYYY-MM-DD.md`

Language is controlled by `output.language` in config.
