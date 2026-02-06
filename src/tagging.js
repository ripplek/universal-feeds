function normalizeText(s) {
  return (s || '').toLowerCase();
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function findHits(hay, keywords, match) {
  if (!keywords.length) return [];
  if (match === 'all') {
    const ok = keywords.every((k) => k && hay.includes(k));
    return ok ? keywords.slice(0, 5) : [];
  }
  return keywords.filter((k) => k && hay.includes(k)).slice(0, 5);
}

export function tagAndScore(items, cfg) {
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const entities = Array.isArray(cfg?.entities) ? cfg.entities : [];

  const compiled = topics.map((t) => {
    const kws = Array.isArray(t.keywords) ? t.keywords : [];
    const anchors = Array.isArray(t.anchors) ? t.anchors : [];
    const excludes = Array.isArray(t.exclude_keywords) ? t.exclude_keywords : [];
    const platformAllow = Array.isArray(t.platform_allow) ? t.platform_allow : null;
    const allowDomains = Array.isArray(t.allow_domains) ? t.allow_domains : null;
    const blockDomains = Array.isArray(t.block_domains) ? t.block_domains : null;
    const sourcePackAllow = Array.isArray(t.source_pack_allow) ? t.source_pack_allow : null;
    const sourceNameAllow = Array.isArray(t.source_name_allow) ? t.source_name_allow : null;
    const match = t.match === 'all' ? 'all' : 'any';
    return {
      name: t.name,
      boost: typeof t.boost === 'number' ? t.boost : 1.0,
      match,
      platformAllow,
      allowDomains,
      blockDomains,
      sourcePackAllow,
      sourceNameAllow,
      kws: kws.map((k) => normalizeText(k)).filter(Boolean),
      anchors: anchors.map((k) => normalizeText(k)).filter(Boolean),
      excludes: excludes.map((k) => normalizeText(k)).filter(Boolean)
    };
  });

  const compiledEntities = entities.map((e) => {
    const aliases = Array.isArray(e.aliases) ? e.aliases : [];
    return {
      name: e.name,
      boost: typeof e.boost === 'number' ? e.boost : 1.0,
      aliases: aliases.map((a) => normalizeText(a)).filter(Boolean)
    };
  });

  // If entities exist, we create a synthetic topic name to group them.
  const ENT_TOPIC = 'entities-news';

  const requireTopicMatch = cfg?.output?.require_topic_match === true;

  const out = [];
  for (const it of items) {
    const hay = normalizeText([it.title, it.text, it.author?.name, it.author?.handle].filter(Boolean).join('\n'));

    const matched = [];
    const tagHits = {};
    let topicBoost = 0;
    for (const t of compiled) {
      if (!t.name) continue;
      if (t.platformAllow && !t.platformAllow.includes(it.platform)) continue;

      // Source allow filters (optional)
      const srcPack = it?.source?.pack;
      const srcName = it?.source?.name;
      if (t.sourcePackAllow && (!srcPack || !t.sourcePackAllow.includes(srcPack))) continue;
      if (t.sourceNameAllow && (!srcName || !t.sourceNameAllow.includes(srcName))) continue;

      // Domain allow/block filters (optional)
      const domain = (() => {
        try {
          return it.url ? new URL(it.url).hostname : null;
        } catch {
          return null;
        }
      })();
      if (domain) {
        if (t.blockDomains && t.blockDomains.includes(domain)) continue;
        if (t.allowDomains && !t.allowDomains.includes(domain)) continue;
      }

      // Exclude keywords: if any present, skip this topic match.
      if (t.excludes?.length && t.excludes.some((k) => k && hay.includes(k))) continue;

      const anchorOk = !t.anchors.length || t.anchors.some((k) => k && hay.includes(k));
      const hits = findHits(hay, t.kws, t.match);
      const kwOk = !t.kws.length ? true : hits.length > 0;
      const hit = anchorOk && kwOk;
      if (hit) {
        matched.push(t.name);
        if (hits.length) tagHits[t.name] = hits;
        // additive boost; keep simple for MVP
        topicBoost += (t.boost - 1.0);
      }
    }

    // Entity matches (tag as entity:<name>)
    let entityHit = false;
    for (const e of compiledEntities) {
      if (!e.name || !e.aliases.length) continue;
      const hit = e.aliases.some((a) => a && hay.includes(a));
      if (hit) {
        entityHit = true;
        const tag = `entity:${e.name}`;
        matched.push(tag);
        topicBoost += (e.boost - 1.0);
      }
    }

    // Synthetic entity topic
    if (entityHit) {
      matched.push(ENT_TOPIC);
    }

    if (requireTopicMatch && matched.length === 0) continue;

    const tags = uniq([...(it.tags || []), ...matched]);
    const score = (it.score || 0) + topicBoost;
    const debug = Object.keys(tagHits).length ? { ...(it.debug || {}), tagHits } : it.debug;
    out.push({ ...it, tags, score, debug });
  }
  return out;
}

export function groupByTopic(items, cfg) {
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const names = topics.map((t) => t.name).filter(Boolean);
  const groups = new Map();
  for (const n of names) groups.set(n, []);
  groups.set('other', []);

  for (const it of items) {
    const ts = it.tags || [];
    const hit = names.find((n) => ts.includes(n));
    (groups.get(hit || 'other') || groups.get('other')).push(it);
  }

  return groups;
}
