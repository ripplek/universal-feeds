import fs from 'node:fs';
import path from 'node:path';
import { fetchXFollowing } from './sources/x_bird.js';
import { rankItems } from './rank.js';
import { tagAndScore } from './tagging.js';
import { renderDigestMarkdown } from './render.js';

export async function runDigest({ cfg, date, outDir }) {
  const fetchedAt = new Date().toISOString();
  let items = [];

  // X — Following (MVP)
  if (cfg?.platforms?.x?.enabled && (cfg?.platforms?.x?.sources || []).includes('following')) {
    const limit = cfg.platforms.x.following?.limit ?? 200;
    const mode = cfg.platforms.x.following?.mode ?? 'following';
    const xItems = await fetchXFollowing({ limit, mode, fetchedAt });
    items.push(...xItems);
  }

  // Rank (base) + topic tagging/boost + trim
  items = rankItems(items, cfg);
  items = tagAndScore(items, cfg);
  items = items.slice(0, cfg.output.max_items || 30);

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
