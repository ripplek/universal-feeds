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

  const compiled = topics.map((t) => {
    const kws = Array.isArray(t.keywords) ? t.keywords : [];
    const anchors = Array.isArray(t.anchors) ? t.anchors : [];
    const match = t.match === 'all' ? 'all' : 'any';
    return {
      name: t.name,
      boost: typeof t.boost === 'number' ? t.boost : 1.0,
      match,
      kws: kws.map((k) => normalizeText(k)).filter(Boolean),
      anchors: anchors.map((k) => normalizeText(k)).filter(Boolean)
    };
  });

  const requireTopicMatch = cfg?.output?.require_topic_match === true;

  const out = [];
  for (const it of items) {
    const hay = normalizeText([it.title, it.text, it.author?.name, it.author?.handle].filter(Boolean).join('\n'));

    const matched = [];
    const tagHits = {};
    let topicBoost = 0;
    for (const t of compiled) {
      if (!t.name) continue;
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
