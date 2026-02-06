# Sources — seed list (draft)

This document is a **seed list** of sources for the MVP and beyond. It focuses on:

- **Trending / Most-read / Most-popular** pages (public)
- **RSS / Atom** feeds when available (preferred for stability)
- Notes about stability, paywalls, and parsing

> Principles
> - Prefer official RSS/Atom/sitemaps when possible.
> - If only HTML is available, treat it as best-effort and expect breakage.
> - Avoid sources that require login for MVP.

---

## 1) US mainstream media (MVP: RSS-first)

### General news
- Reuters — RSS directory (multiple topics)
  - https://www.reuters.com/tools/rss
  - Notes: often stable; some pages may have consent walls.
- AP News — Topics / feeds (HTML-first)
  - https://apnews.com/
  - Notes: may require HTML extraction.

### Tech / business
- The Verge — RSS
  - https://www.theverge.com/rss/index.xml
- TechCrunch — RSS
  - https://techcrunch.com/feed/
- Wired — RSS
  - https://www.wired.com/feed/rss

### Finance / markets
- WSJ / Bloomberg
  - Notes: paywalls; treat as link-only; summarization may fail.

---

## 2) Mainland China mainstream media (MVP: RSS/公开热榜优先)

> CN sources vary widely. Prefer public feeds /公开榜单 first.

### 综合新闻
- 新华网
  - https://www.xinhuanet.com/
  - Notes: may need sitemap/HTML.
- 人民网
  - http://www.people.com.cn/

### 科技/财经
- 36氪
  - https://36kr.com/
  - Notes: has structured pages; RSS availability uncertain; use HTML extraction.
- 虎嗅
  - https://www.huxiu.com/

---

## 3) Platforms

### X
- Adapter: `bird`
- Sources:
  - trending/news: `bird news` (AI curated explore tabs)
  - keyword search: `bird search "..."`
  - following: `bird home --following`
- Notes: cookie auth; following requires user login.

### V2EX
- Hot topics
  - https://www.v2ex.com/?tab=hot
- RSS (community-maintained in various mirrors)
  - Notes: may rely on HTML parsing for stability.

### YouTube
- Channel RSS (stable pattern)
  - https://www.youtube.com/feeds/videos.xml?channel_id=<CHANNEL_ID>
- Notes: for MVP, prefer channel RSS + optional search later.

### Weibo
- 热搜榜 (best-effort)
  - Notes: frequent changes; may require fallback sources.

### WeChat Official Accounts
- Hot lists (3rd-party)
  - Notes: no official universal RSS; start with public hotlists.

### TikTok
- Later
  - Notes: official API constraints; region/rate limits; scraping is high maintenance.

---

## 4) Curated seed packs (to add)

Planned curated packs in this repo:
- `sources/us-tech.yaml`
- `sources/us-general.yaml`
- `sources/cn-tech.yaml`
- `sources/cn-general.yaml`
- `sources/youtube-ai-channels.yaml`

Each pack should include:
- name
- url
- type: rss|html|api
- region: us|cn|global
- topic tags
- notes: paywall / parsing / reliability
