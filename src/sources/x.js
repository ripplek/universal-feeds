// X (Twitter) source module — all X-specific rules beyond raw fetching live
// here, so changing X behavior is a one-file change (locality).
//   fetchX             — the fetch adapter wiring (delegates to x_bird)
//   enrichX            — post-fetch enrichment: unfurl low-info tweets (I/O)
//   applyXRetweetPolicy — post-score policy: drop/cap/penalize retweets (pure)
//
// enrichX is wired as a source `enrich` hook and applyXRetweetPolicy as a
// `postScore` hook (see src/fetch_sources.js), so the pipeline shell and the
// pure assemble core stay platform-agnostic.

import fs from 'node:fs';
import path from 'node:path';
import { fetchXFollowing } from './x_bird.js';
import { unfurlUrl } from '../unfurl.js';

export function fetchX(cfg, { fetchedAt }) {
  const f = cfg.platforms.x.following || {};
  return fetchXFollowing({
    limit: f.limit ?? 200,
    mode: f.mode ?? 'following',
    timeoutMs: f.timeout_ms ?? 60000,
    fetchedAt,
  });
}

const URL_RE = /https?:\/\/\S+/gi;
// Effective text: strip URLs / @handles / #tags to judge whether a tweet is
// mostly a bare link (worth unfurling for a real title).
function effectiveText(t) {
  return String(t || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@[A-Za-z0-9_]{1,30}/g, ' ')
    .replace(/#[\p{L}\p{N}_]{2,}/gu, ' ')
    .replace(/[\s​]+/g, ' ')
    .trim();
}

// Unfurl the first URL of link-only X items and surface the destination title.
// Cached in <outDir>/state-unfurl.json; capped per run. Mutates nothing outside
// the returned array.
export async function enrichX(items, cfg, { outDir }) {
  const xCfg = cfg?.platforms?.x?.following || {};
  if (xCfg?.unfurl?.enabled === false) return items;
  const max = xCfg?.unfurl?.max_per_run ?? 10;
  const timeoutMs = xCfg?.unfurl?.timeout_ms ?? 8000;
  const cachePath = path.join(outDir, 'state-unfurl.json');

  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    cache = {};
  }

  const out = items.slice();
  let did = 0;
  for (let i = 0; i < out.length && did < max; i++) {
    const it = out[i];
    if (it.platform !== 'x') continue;
    if (it?.debug?.unfurl?.title) continue;

    const text = it.text || '';
    if (effectiveText(text).length >= 25) continue;

    const urls = text.match(URL_RE) || [];
    if (!urls.length) continue;

    const u0 = urls[0];
    let meta = cache[u0];
    if (!meta) {
      meta = await unfurlUrl(u0, { timeoutMs });
      cache[u0] = meta;
      did += 1;
    }
    if (meta?.title || meta?.finalUrl) {
      out[i] = {
        ...it,
        title: it.title || meta.title,
        debug: { ...(it.debug || {}), unfurl: meta },
      };
    }
  }

  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  } catch {
    // ignore cache write
  }
  return out;
}

// Retweet policy (pure): optionally drop RTs, cap their count, and penalize
// their score. Non-X items pass through untouched.
export function applyXRetweetPolicy(items, cfg) {
  const xCfg = cfg?.platforms?.x?.following || {};
  const includeRT = xCfg.include_retweets !== false;
  const rtPenalty =
    typeof xCfg.retweet_penalty === 'number' ? xCfg.retweet_penalty : 1.0;
  const maxRt =
    typeof xCfg.max_retweets === 'number' ? xCfg.max_retweets : Infinity;
  let rtCount = 0;
  const isRT = (it) => it.platform === 'x' && /^RT\s+@/i.test(it.text || '');

  return items
    .filter((it) => {
      if (!isRT(it)) return true;
      if (!includeRT) return false;
      rtCount += 1;
      return rtCount <= maxRt;
    })
    .map((it) =>
      isRT(it) ? { ...it, score: (it.score || 0) * rtPenalty } : it
    );
}
