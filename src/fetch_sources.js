// Uniform Source seam: one interface to fetch every source into FeedItem[].
//
// Each source is a descriptor { id, enabled(cfg), fetch(cfg, ctx) }. Adding a
// source is a local change here — the runDigest shell no longer needs to know
// any per-source fetch signature. Every fetch is best-effort: a source that
// throws warns and contributes nothing, so one broken feed never aborts the
// digest (the project's stated per-source resilience).

import path from 'node:path';
import { fetchX, enrichX, applyXRetweetPolicy } from './sources/x.js';
import { fetchRssFromPacks } from './sources/rss.js';
import { fetchV2exHot } from './sources/v2ex.js';
import { fetchViaReach } from './sources/reach.js';
import { getAllChannels } from './reach/channels/index.js';
import { ReachConfig } from './reach/config.js';

const platformOn = (cfg, name, src) =>
  cfg?.platforms?.[name]?.enabled &&
  (cfg?.platforms?.[name]?.sources || []).includes(src);

// Order matters: earlier sources win at dedup (kept unless a later item is
// richer). This preserves the historical x → rss → v2ex → reach ordering
// (YouTube now flows through reach via OpenCLI — see src/reach/channels).
export const SOURCES = [
  {
    id: 'x',
    enabled: (cfg) => platformOn(cfg, 'x', 'following'),
    fetch: fetchX,
    enrich: enrichX, // unfurl low-info tweets (post-fetch, I/O)
    postScore: applyXRetweetPolicy, // drop/cap/penalize RTs (post-score, pure)
  },
  {
    id: 'rss',
    enabled: (cfg) => platformOn(cfg, 'rss', 'trending'),
    fetch: async (cfg, { fetchedAt, outDir }) => {
      // Per-feed counts flow into sourceHealth so a single dead feed inside
      // the rss aggregate is never silent (a platform-level total would hide
      // "the OpenAI/Anthropic feeds all failed but rss looks normal").
      const feeds = [];
      const items = await fetchRssFromPacks({
        packs: cfg.platforms.rss.packs || [],
        fetchedAt,
        maxPerSource: 20,
        cachePath: path.join(outDir, 'state-html.json'),
        rsshub: cfg.rsshub,
        htmlSources: cfg.html_sources,
        onFeed: (f) => feeds.push(f),
      });
      return {
        items,
        perSource: [
          { source: 'rss', platform: 'rss', fetched: items.length, feeds },
        ],
      };
    },
  },
  {
    id: 'v2ex',
    enabled: (cfg) => platformOn(cfg, 'v2ex', 'trending'),
    fetch: (cfg, { fetchedAt }) => fetchV2exHot({ fetchedAt, limit: 30 }),
  },
  {
    // Auth-gated platforms via the OpenCLI browser bridge. Per-channel opt-in
    // in feeds.yaml (platforms.<name>.reach.enabled); per-channel best-effort.
    id: 'reach',
    enabled: (cfg) =>
      getAllChannels().some((ch) => cfg?.platforms?.[ch.name]?.reach?.enabled),
    fetch: async (cfg, { fetchedAt }) => {
      const reachConfig = new ReachConfig();
      const out = [];
      const perSource = [];
      for (const ch of getAllChannels()) {
        const rc = cfg?.platforms?.[ch.name]?.reach;
        if (!rc?.enabled) continue;
        // Every enabled channel gets an entry — including the non-throw
        // failure branches inside fetchViaReach (health gate, no command,
        // missing query), which used to vanish into console.error + [].
        const entry = { source: 'reach', platform: ch.name, channel: ch.name };
        try {
          const items = await fetchViaReach({
            platform: ch.name,
            query: rc.query,
            mode: rc.mode || 'auto',
            limit: rc.limit,
            config: reachConfig,
            fetchedAt,
            onOutcome: (o) => {
              if (o?.status && o.status !== 'ok') entry.outcome = o.status;
              if (o?.message) entry.message = o.message;
            },
          });
          if (Array.isArray(rc.tags)) for (const it of items) it.tags = rc.tags;
          entry.fetched = items.length;
          out.push(...items);
        } catch (e) {
          entry.fetched = 0;
          entry.error = String(e?.message || e);
          console.error(`# reach: ${ch.name} failed: ${entry.error}`);
        }
        perSource.push(entry);
      }
      return { items: out, perSource };
    },
  },
];

function isEnabled(s, cfg) {
  try {
    return !!s.enabled(cfg);
  } catch {
    return false;
  }
}

// Fetch every enabled source into `{items, perSource}`. `sources` is
// injectable for tests. Each source is isolated: a throw is captured as a
// structured perSource error and yields nothing — never silent, never fatal.
// A source's fetch may return a plain FeedItem[] (a single perSource entry is
// synthesized) or `{items, perSource}` for per-channel/per-feed detail.
export async function fetchAllSources(cfg, ctx, sources = SOURCES) {
  const out = [];
  const perSource = [];
  for (const s of sources) {
    if (!isEnabled(s, cfg)) continue;
    try {
      const res = await s.fetch(cfg, ctx);
      if (Array.isArray(res)) {
        out.push(...res);
        perSource.push({ source: s.id, platform: s.id, fetched: res.length });
      } else if (res && Array.isArray(res.items)) {
        out.push(...res.items);
        if (Array.isArray(res.perSource)) perSource.push(...res.perSource);
      } else {
        perSource.push({ source: s.id, platform: s.id, fetched: 0 });
      }
    } catch (e) {
      const error = String(e?.message || e);
      perSource.push({ source: s.id, platform: s.id, fetched: 0, error });
      console.error(`# source ${s.id} failed: ${error}`);
    }
  }
  return { items: out, perSource };
}

// Run each enabled source's optional `enrich(items, cfg, ctx)` hook in order
// (post-fetch, I/O allowed — e.g. X unfurl). Best-effort per source.
export async function runEnrichers(items, cfg, ctx, sources = SOURCES) {
  let out = items;
  for (const s of sources) {
    if (!s.enrich || !isEnabled(s, cfg)) continue;
    try {
      const next = await s.enrich(out, cfg, ctx);
      if (Array.isArray(next)) out = next;
    } catch (e) {
      console.error(`# enrich ${s.id} failed: ${e?.message || e}`);
    }
  }
  return out;
}

// Collect the `postScore(items, cfg)` hooks of enabled sources (pure; applied
// inside assembleDigest after scoring — e.g. X retweet policy).
export function collectPostScore(cfg, sources = SOURCES) {
  return sources
    .filter((s) => s.postScore && isEnabled(s, cfg))
    .map((s) => s.postScore);
}
