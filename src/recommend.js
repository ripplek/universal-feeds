function norm(s) {
  return (s || '').toLowerCase();
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function compileProfile(cfg) {
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const entities = Array.isArray(cfg?.entities) ? cfg.entities : [];

  const keywords = [];
  for (const t of topics) {
    for (const k of (Array.isArray(t.keywords) ? t.keywords : [])) keywords.push(norm(k));
    for (const a of (Array.isArray(t.anchors) ? t.anchors : [])) keywords.push(norm(a));
  }

  const entityAliases = [];
  for (const e of entities) {
    for (const a of (Array.isArray(e.aliases) ? e.aliases : [])) entityAliases.push(norm(a));
  }

  return {
    topicNames: topics.map((t) => t?.name).filter(Boolean),
    keywords: [...new Set(keywords.filter(Boolean))],
    entityAliases: [...new Set(entityAliases.filter(Boolean))]
  };
}

function interestScore(item, profile) {
  const hay = norm([item.title, item.text, item.author?.name, item.author?.handle].filter(Boolean).join('\n'));
  if (!hay) return 0;

  let s = 0;
  const kwHits = profile.keywords.filter((k) => k && hay.includes(k)).slice(0, 6).length;
  const entHits = profile.entityAliases.filter((k) => k && hay.includes(k)).slice(0, 4).length;

  // Entity matches are a stronger signal than generic keywords.
  s += kwHits * 0.15;
  s += entHits * 0.35;
  return s;
}

function capDiversity(items, { maxPerSource = 2, maxPerDomain = 3 } = {}) {
  const srcCount = new Map();
  const domCount = new Map();
  const out = [];
  for (const it of items) {
    const src = it?.source?.name || it?.source?.pack || it.platform || 'unknown';
    const dom = getDomain(it.url) || 'unknown';

    const sc = srcCount.get(src) || 0;
    if (maxPerSource > 0 && sc >= maxPerSource) continue;
    const dc = domCount.get(dom) || 0;
    if (maxPerDomain > 0 && dc >= maxPerDomain) continue;

    srcCount.set(src, sc + 1);
    domCount.set(dom, dc + 1);
    out.push(it);
  }
  return out;
}

export function pickRecommended(items, cfg) {
  const rcfg = cfg?.recommended || {};
  const enabled = rcfg.enabled !== false;
  if (!enabled) return [];

  const maxItems = rcfg.max_items ?? 10;
  const minScore = rcfg.min_score ?? 0.4;
  const usePlatforms = Array.isArray(rcfg.use_platforms) ? rcfg.use_platforms : ['rss', 'v2ex', 'youtube'];

  const profile = compileProfile(cfg);
  const topicNames = new Set(profile.topicNames);

  // Exclude items that already match configured topics (to keep the section additive).
  const base = items.filter((it) => {
    if (!usePlatforms.includes(it.platform)) return false;
    const tags = it.tags || [];
    const hitsTopic = tags.some((t) => topicNames.has(t));
    return !hitsTopic;
  });

  const scored = base
    .map((it) => {
      const hot = it.score || 0;
      const interest = interestScore(it, profile);
      const final = hot * (1 + interest);
      return { ...it, debug: { ...(it.debug || {}), recommend: { hot, interest, final } }, score: final };
    })
    .filter((it) => (it.score || 0) >= minScore)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const diversified = capDiversity(scored, {
    maxPerSource: rcfg.max_per_source ?? 2,
    maxPerDomain: rcfg.max_per_domain ?? 3
  });

  return diversified.slice(0, maxItems);
}
