# Reach layer — auth-gated platform fetching

The `reach` layer lets the digest pull **login-gated, personalized** content
(Twitter/X, Reddit, Bilibili, Xiaohongshu, Facebook, Instagram) that has no
public API. It does this by driving your **real, already-logged-in Chrome**
through [OpenCLI](https://github.com/jackwener/opencli)'s browser bridge, reusing
the live session — no tokens to manage, no cookie decryption.

The design (ordered-backend routing, health `doctor`, per-channel descriptors,
`0o600` config) is ported from
[Agent-Reach](https://github.com/Panniantong/Agent-Reach) (MIT). We depend on
the `opencli` engine but keep our own thin capability layer so the digest owns
normalization and ranking. See `docs/adr/0001-reach-layer-desktop-browser-bridge.md`
for why fetching runs on the desktop.

## Requirements (one-time, desktop only)

1. Install OpenCLI: `npm install -g @jackwener/opencli`
2. Install the OpenCLI Chrome extension (one manual click):
   <https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk>
3. Log into the target sites in that Chrome profile (small/dedicated accounts
   recommended to limit platform-detection risk).
4. Verify: `node bin/digest reach doctor`

> OpenCLI is **desktop-only (no headless)**. Run the digest on the machine where
> Chrome is logged in. Headless/CI environments can only run tier-0 sources
> (RSS / YouTube / V2EX).

## Commands

```bash
node bin/digest reach doctor                 # health of every channel
node bin/digest reach watch                   # compact health + update check (cron; exit≠0 if unhealthy)
node bin/digest reach fetch reddit "ai"      # one-off fetch → FeedItem JSONL
node bin/digest reach configure twitter_backend OpenCLI
```

## Enabling a platform in the digest

Each reach channel is opt-in per platform in `feeds.yaml`:

```yaml
platforms:
  reddit:
    reach:
      enabled: true
      mode: feed # feed (personalized/hot) | search | trending
      limit: 30
      tags: [ai, tech] # inherited by items so topic boosts apply
  twitter:
    reach:
      enabled: true
      mode: search
      query: 'AI agents'
      limit: 25
```

`mode: auto` (default) picks `search` when a `query` is set, otherwise the
platform's feed/trending command.

> **Gotcha — `require_topic_match: true` drops non-matching reach items.**
> Topic matching keys off an item's **content** (title/text vs a topic's
> keywords/anchors). The `tags:` you set on a reach platform are merged into the
> output for boosts/grouping but do **not** count toward topic survival
> (`src/tagging.js`). So in focused mode, reach platforms whose content doesn't
> hit an English keyword — notably Chinese ones (36kr, weibo) — silently vanish.
> When reach platforms are enabled, keep `require_topic_match: false`, or add
> topic anchors that actually match the reach content (e.g. Chinese terms).

## Supported channels

| Channel     | platform      | feed cmd   | search | verified              |
| ----------- | ------------- | ---------- | ------ | --------------------- |
| twitter     | `x`           | `timeline` | ✅     | fields (live)         |
| reddit      | `reddit`      | `home`     | ✅     | end-to-end (live)     |
| bilibili    | `bilibili`    | `dynamic`  | ✅     | fields (live)         |
| xiaohongshu | `xiaohongshu` | `feed`     | ✅     | fields (live)         |
| facebook    | `facebook`    | `feed`     | —      | adapter columns\*     |
| instagram   | `instagram`   | `explore`  | —      | adapter columns\*     |
| linkedin    | `linkedin`    | `timeline` | —      | adapter columns (t2)† |
| xueqiu      | `xueqiu`      | `feed`     | —      | adapter columns       |
| weibo       | `weibo`       | `feed`     | ✅     | fields (live)         |
| hackernews  | `hackernews`  | `top`      | ✅     | end-to-end (live)     |
| 36kr        | `36kr`        | `hot`      | ✅     | end-to-end (live)     |
| producthunt | `producthunt` | `hot`      | —      | wired; opencli erred‡ |
| juejin      | `juejin`      | `hot`      | —      | adapter columns       |
| tiktok      | `tiktok`      | `explore`  | ✅     | adapter columns       |
| substack    | `substack`    | `feed`     | ✅     | adapter columns       |

\* facebook/instagram live fetches returned empty this run (feed may require
scroll/interaction); mapping is from the OpenCLI adapter's declared columns.
† linkedin is tier-2 (OpenCLI backend `off` until configured); `search` is
omitted because its OpenCLI command returns job listings, not posts. xueqiu
`search` is omitted for the same reason (it returns stock symbols); use `feed`
or `mode: trending` (the `hot` command). Podcast platform **xiaoyuzhou** is
intentionally not a channel — its adapter is podcast-lookup only, with no
feed/search command.
‡ producthunt's OpenCLI `hot` command errored on a live run (page/anti-bot);
the channel is wired and the pipeline skips it best-effort when it fails.

Output is mapped to `FeedItem` (see `docs/SCHEMA.md`) by a defensive,
alias-based normalizer (`src/reach/normalize.js`) so minor per-command column
differences don't break ingestion. New platforms only need a descriptor entry
in `src/reach/channels/index.js`.

## Reliability

Fetching is **best-effort and health-gated**: if a channel's backend isn't ready
(extension asleep beyond wake, session expired), the pipeline logs a `# reach:`
warning and contributes nothing — the digest still renders. Check `reach doctor`
when a platform goes quiet. `runOpenCli` retries once on an empty result to cover
a cold browser-bridge call.

### Overlap with RSS feeds (learned the hard way)

A reach channel can fetch the **same URLs** an RSS feed already provides. Example:
`sources/us-tech.yaml` includes the Hacker News RSS feed
(`news.ycombinator.com/rss`), and the reach `hackernews` channel fetches the same
front page. RSS items are pushed before reach items, so a naive first-wins dedup
would silently drop every reach copy — the channel looks "empty" while actually
being deduped away.

`dedupItems` therefore keeps the **richer** of two duplicates (engagement
metrics outrank text/date/author), not the first. The reach copy — which carries
score/likes — now upgrades the bare RSS entry instead of being discarded. When a
reach platform seems to contribute nothing, first check whether an RSS pack
already covers the same URLs (`grep` the feed hosts) before suspecting the
browser bridge.

## Attribution

Portions of `src/reach/` are ported from Agent-Reach
(github.com/Panniantong/Agent-Reach), MIT © its authors. universal-feeds is also
MIT; see `LICENSE`.
