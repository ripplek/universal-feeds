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
    fetch: (cfg, { fetchedAt, outDir }) =>
      fetchRssFromPacks({
        packs: cfg.platforms.rss.packs || [],
        fetchedAt,
        maxPerSource: 20,
        cachePath: path.join(outDir, 'state-html.json'),
        rsshub: cfg.rsshub,
        htmlSources: cfg.html_sources,
      }),
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
      for (const ch of getAllChannels()) {
        const rc = cfg?.platforms?.[ch.name]?.reach;
        if (!rc?.enabled) continue;
        try {
          const items = await fetchViaReach({
            platform: ch.name,
            query: rc.query,
            mode: rc.mode || 'auto',
            limit: rc.limit,
            config: reachConfig,
            fetchedAt,
          });
          if (Array.isArray(rc.tags)) for (const it of items) it.tags = rc.tags;
          out.push(...items);
        } catch (e) {
          console.error(`# reach: ${ch.name} failed: ${e?.message || e}`);
        }
      }
      return out;
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

// Fetch every enabled source into one FeedItem[]. `sources` is injectable for
// tests. Each source is isolated: a throw warns and yields nothing.
export async function fetchAllSources(cfg, ctx, sources = SOURCES) {
  const out = [];
  for (const s of sources) {
    if (!isEnabled(s, cfg)) continue;
    try {
      const items = await s.fetch(cfg, ctx);
      if (Array.isArray(items)) out.push(...items);
    } catch (e) {
      console.error(`# source ${s.id} failed: ${e?.message || e}`);
    }
  }
  return out;
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
