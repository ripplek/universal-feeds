import fs from 'node:fs';
import path from 'node:path';
import { fetchAllSources } from './fetch_sources.js';
import { dedupItems } from './dedup.js';
import { filterXNoise } from './filters.js';
import { unfurlUrl } from './unfurl.js';
import { buildCandidates, serializeCandidates } from './candidates.js';
import { parseJudgments, indexJudgments } from './judgments.js';
import { assembleDigest } from './assemble.js';
import { renderDigestMarkdown } from './render.js';

export async function runDigest({
  cfg,
  date,
  outDir,
  stage = 'full',
  judgmentsPath,
}) {
  // Make cfg available for adapters that need it (MVP shortcut; replace with explicit params later)
  globalThis.__UF_CFG = cfg;

  const fetchedAt = new Date().toISOString();

  // Fetch every enabled source through one seam (see src/fetch_sources.js).
  let items = await fetchAllSources(cfg, { fetchedAt, outDir });

  // De-noise + de-dup
  items = filterXNoise(items, cfg);
  items = dedupItems(items);

  // Hard recency filter (product behavior): drop items older than recency_hours
  // when publishedAt is known.
  const recencyH = cfg?.output?.recency_hours ?? 24;
  const nowMs = Date.now();
  items = items.filter((it) => {
    const ts = Date.parse(it.publishedAt || '');
    if (!Number.isFinite(ts)) return true;
    const ageH = (nowMs - ts) / 36e5;
    return ageH <= recencyH;
  });

  // Stage 1 of AI relevance filtering: emit the compact candidate list for a
  // Clawdbot agent to judge, then stop. See SKILL.md + docs/FILTERING.md.
  if (stage === 'candidates') {
    const cands = buildCandidates(items, {
      maxTextLen: cfg?.filter?.max_text_len ?? 500,
    });
    const candidatesPath = path.join(outDir, `candidates-${date}.jsonl`);
    fs.writeFileSync(candidatesPath, serializeCandidates(cands), 'utf8');
    return { candidatesPath, count: cands.length };
  }

  // X low-info enrichment: if a tweet is mostly link/mentions, unfurl the first URL
  // and display the destination title in the digest.
  const xCfg2 = cfg?.platforms?.x?.following || {};
  const unfurlEnabled = xCfg2?.unfurl?.enabled !== false;
  const unfurlMax = xCfg2?.unfurl?.max_per_run ?? 10;
  const unfurlTimeoutMs = xCfg2?.unfurl?.timeout_ms ?? 8000;
  const cachePathUnfurl = path.join(outDir, 'state-unfurl.json');

  let unfurlCache = {};
  try {
    unfurlCache = JSON.parse(fs.readFileSync(cachePathUnfurl, 'utf8'));
  } catch {
    unfurlCache = {};
  }

  const urlRe = /https?:\/\/\S+/gi;
  const stripEff = (t) =>
    String(t || '')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/@[A-Za-z0-9_]{1,30}/g, ' ')
      .replace(/#[\p{L}\p{N}_]{2,}/gu, ' ')
      .replace(/[\s\u200B]+/g, ' ')
      .trim();

  if (unfurlEnabled) {
    let did = 0;
    for (let i = 0; i < items.length && did < unfurlMax; i++) {
      const it = items[i];
      if (it.platform !== 'x') continue;
      if (it?.debug?.unfurl?.title) continue;

      const text = it.text || '';
      const eff = stripEff(text);
      if (eff.length >= 25) continue;

      const urls = text.match(urlRe) || [];
      if (!urls.length) continue;

      const u0 = urls[0];
      const cached = unfurlCache[u0];
      let meta = cached;
      if (!meta) {
        meta = await unfurlUrl(u0, { timeoutMs: unfurlTimeoutMs });
        unfurlCache[u0] = meta;
        did += 1;
      }

      if (meta?.title || meta?.finalUrl) {
        items[i] = {
          ...it,
          title: it.title || meta.title,
          debug: {
            ...(it.debug || {}),
            unfurl: meta,
          },
        };
      }
    }

    try {
      fs.writeFileSync(
        cachePathUnfurl,
        JSON.stringify(unfurlCache, null, 2) + '\n',
        'utf8'
      );
    } catch {
      // ignore cache write
    }
  }

  // Resolve the relevance gate input (I/O stays in the shell). AI judgments
  // when filter.mode is llm/hybrid and a judgments file is present; otherwise
  // null → assembleDigest uses the keyword matcher.
  const filterMode = cfg?.filter?.mode || 'keyword';
  let judgeIndex = null;
  if ((filterMode === 'llm' || filterMode === 'hybrid') && judgmentsPath) {
    try {
      judgeIndex = indexJudgments(
        parseJudgments(fs.readFileSync(judgmentsPath, 'utf8'))
      );
    } catch (e) {
      console.error(
        `# filter: could not read judgments ${judgmentsPath}: ${e?.message || e}`
      );
    }
  }
  if (filterMode === 'llm' && !judgeIndex) {
    console.error(
      '# filter: mode=llm but no --judgments file; falling back to keyword gate'
    );
  }

  // Pure core: rank → topic/relevance gate → recommended → retweet policy → trim.
  const assembled = assembleDigest({ items, cfg, judgeIndex });
  items = assembled.items;
  const recommended = assembled.recommended;

  // Persist JSONL
  const itemsPath = path.join(outDir, `items-${date}.jsonl`);
  const jsonl =
    items.map((x) => JSON.stringify(x)).join('\n') + (items.length ? '\n' : '');
  fs.writeFileSync(itemsPath, jsonl, 'utf8');

  // Render digest
  const digestPath = path.join(outDir, `digest-${date}.md`);
  const md = renderDigestMarkdown(items, { cfg, date, fetchedAt, recommended });
  fs.writeFileSync(digestPath, md, 'utf8');

  return { itemsPath, digestPath, count: items.length };
}
