import fs from 'node:fs';
import path from 'node:path';
import { fetchXFollowing } from './sources/x_bird.js';
import { fetchRssFromPacks } from './sources/rss.js';
import { fetchV2exHot } from './sources/v2ex.js';
import { fetchYouTubeFromPacks } from './sources/youtube.js';
import { dedupItems } from './dedup.js';
import { filterXNoise } from './filters.js';
import { rankItems } from './rank.js';
import { tagAndScore } from './tagging.js';
import { trimByPlatform } from './trim.js';
import { renderDigestMarkdown } from './render.js';

export async function runDigest({ cfg, date, outDir }) {
  const fetchedAt = new Date().toISOString();
  let items = [];

  // X — Following
  if (cfg?.platforms?.x?.enabled && (cfg?.platforms?.x?.sources || []).includes('following')) {
    const limit = cfg.platforms.x.following?.limit ?? 200;
    const mode = cfg.platforms.x.following?.mode ?? 'following';
    const xItems = await fetchXFollowing({ limit, mode, fetchedAt });
    items.push(...xItems);
  }

  // RSS packs
  if (cfg?.platforms?.rss?.enabled && (cfg?.platforms?.rss?.sources || []).includes('trending')) {
    const packs = cfg.platforms.rss.packs || [];
    const rssItems = await fetchRssFromPacks({ packs, fetchedAt, maxPerSource: 20 });
    items.push(...rssItems);
  }

  // V2EX hot
  if (cfg?.platforms?.v2ex?.enabled && (cfg?.platforms?.v2ex?.sources || []).includes('trending')) {
    try {
      const v2 = await fetchV2exHot({ fetchedAt, limit: 30 });
      items.push(...v2);
    } catch {
      // best-effort
    }
  }

  // YouTube channel RSS
  if (cfg?.platforms?.youtube?.enabled && (cfg?.platforms?.youtube?.sources || []).includes('trending')) {
    const packs = cfg.platforms.youtube.packs || [];
    const yt = await fetchYouTubeFromPacks({ packs, fetchedAt, maxPerSource: 10 });
    items.push(...yt);
  }

  // De-noise + de-dup
  items = filterXNoise(items);
  items = dedupItems(items);

  // Rank (base) + topic tagging/boost + trim
  items = rankItems(items, cfg);
  items = tagAndScore(items, cfg);
  // re-sort because tagAndScore can add score boosts
  items = items.sort((a, b) => (b.score || 0) - (a.score || 0));
  items = trimByPlatform(items, cfg);

  // Persist JSONL
  const itemsPath = path.join(outDir, `items-${date}.jsonl`);
  const jsonl = items.map((x) => JSON.stringify(x)).join('\n') + (items.length ? '\n' : '');
  fs.writeFileSync(itemsPath, jsonl, 'utf8');

  // Render digest
  const digestPath = path.join(outDir, `digest-${date}.md`);
  const md = renderDigestMarkdown(items, { cfg, date, fetchedAt });
  fs.writeFileSync(digestPath, md, 'utf8');

  return { itemsPath, digestPath, count: items.length };
}
