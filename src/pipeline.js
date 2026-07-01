import fs from 'node:fs';
import path from 'node:path';
import { fetchXFollowing } from './sources/x_bird.js';
import { fetchRssFromPacks } from './sources/rss.js';
import { fetchV2exHot } from './sources/v2ex.js';
import { fetchYouTubeFromPacks } from './sources/youtube.js';
import { fetchViaReach } from './sources/reach.js';
import { getAllChannels } from './reach/channels/index.js';
import { ReachConfig } from './reach/config.js';
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
  let items = [];

  // X — Following
  if (
    cfg?.platforms?.x?.enabled &&
    (cfg?.platforms?.x?.sources || []).includes('following')
  ) {
    const limit = cfg.platforms.x.following?.limit ?? 200;
    const mode = cfg.platforms.x.following?.mode ?? 'following';
    const timeoutMs = cfg.platforms.x.following?.timeout_ms ?? 60000;
    const xItems = await fetchXFollowing({ limit, mode, timeoutMs, fetchedAt });
    items.push(...xItems);
  }

  // RSS packs
  if (
    cfg?.platforms?.rss?.enabled &&
    (cfg?.platforms?.rss?.sources || []).includes('trending')
  ) {
    const packs = cfg.platforms.rss.packs || [];
    const cachePath = path.join(outDir, 'state-html.json');
    const rssItems = await fetchRssFromPacks({
      packs,
      fetchedAt,
      maxPerSource: 20,
      cachePath,
    });
    items.push(...rssItems);
  }

  // WeChat MP album (best-effort)
  try {
    const wechatPackPath = 'sources/cn-wechat-hot.yaml';
    const wechatPack = (await import('yaml')).default.parse(
      fs.readFileSync(wechatPackPath, 'utf8')
    );
    const wechatSources = Array.isArray(wechatPack?.sources)
      ? wechatPack.sources
      : [];
    const albumSources = wechatSources.filter(
      (s) => s.type === 'html' && String(s.url || '').includes('mp/appmsgalbum')
    );
    if (albumSources.length) {
      const { fetchWeChatMpAlbum } = await import('./sources/wechat_mp.js');
      for (const s of albumSources) {
        const ws = await fetchWeChatMpAlbum({
          name: s.name,
          url: s.url,
          fetchedAt,
          limit: 30,
        });
        // inherit tags
        for (const it of ws) {
          it.tags = Array.isArray(s.tags) ? s.tags : it.tags;
          it.source = { pack: wechatPackPath, name: s.name };
        }
        items.push(...ws);
      }
    }
  } catch {
    // best-effort
  }

  // V2EX hot
  if (
    cfg?.platforms?.v2ex?.enabled &&
    (cfg?.platforms?.v2ex?.sources || []).includes('trending')
  ) {
    try {
      const v2 = await fetchV2exHot({ fetchedAt, limit: 30 });
      items.push(...v2);
    } catch {
      // best-effort
    }
  }

  // YouTube channel RSS
  if (
    cfg?.platforms?.youtube?.enabled &&
    (cfg?.platforms?.youtube?.sources || []).includes('trending')
  ) {
    const packs = cfg.platforms.youtube.packs || [];
    const yt = await fetchYouTubeFromPacks({
      packs,
      fetchedAt,
      maxPerSource: 10,
    });
    items.push(...yt);
  }

  // Reach layer — auth-gated platforms via OpenCLI browser bridge.
  // Each channel is opt-in per config: platforms.<name>.reach.enabled = true.
  // Best-effort: an unavailable channel warns and contributes nothing.
  const reachChannels = getAllChannels().filter(
    (ch) => cfg?.platforms?.[ch.name]?.reach?.enabled
  );
  if (reachChannels.length) {
    const reachConfig = new ReachConfig();
    for (const ch of reachChannels) {
      const rc = cfg.platforms[ch.name].reach;
      try {
        const reachItems = await fetchViaReach({
          platform: ch.name,
          query: rc.query,
          mode: rc.mode || 'auto',
          limit: rc.limit,
          config: reachConfig,
          fetchedAt,
        });
        // Inherit config-declared tags so topic tagging/boosts still apply.
        if (Array.isArray(rc.tags)) {
          for (const it of reachItems) it.tags = rc.tags;
        }
        items.push(...reachItems);
      } catch (e) {
        console.error(`# reach: ${ch.name} failed: ${e?.message || e}`);
      }
    }
  }

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
