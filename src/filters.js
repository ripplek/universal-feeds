function normalize(s) {
  return (s || '').toLowerCase();
}

function compileTopicMatchers(cfg) {
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const out = [];
  for (const t of topics) {
    const name = t?.name;
    if (!name) continue;
    const kws = (Array.isArray(t.keywords) ? t.keywords : []).map(normalize).filter(Boolean);
    const anchors = (Array.isArray(t.anchors) ? t.anchors : []).map(normalize).filter(Boolean);
    out.push({ name, kws, anchors });
  }
  return out;
}

function matchesAnyTopic(text, matchers) {
  if (!text) return false;
  const hay = normalize(text);
  for (const t of matchers) {
    const anchorOk = !t.anchors.length || t.anchors.some((a) => a && hay.includes(a));
    const kwOk = !t.kws.length || t.kws.some((k) => k && hay.includes(k));
    if (anchorOk && kwOk) return true;
  }
  return false;
}

function stripXNoiseText(text) {
  const t = String(text || '');
  return t
    // urls
    .replace(/https?:\/\/\S+/gi, ' ')
    // handles
    .replace(/@[A-Za-z0-9_]{1,30}/g, ' ')
    // hashtags
    .replace(/#[\p{L}\p{N}_]{2,}/gu, ' ')
    // common separators
    .replace(/[→➡️▶︎»]+/g, ' ')
    .replace(/[\s\u200B]+/g, ' ')
    .trim();
}

function tokenCount(s) {
  if (!s) return 0;
  return stripXNoiseText(s).split(/\s+/).filter(Boolean).length;
}

export function filterXNoise(items, cfg) {
  // Conservative v2 filters: structure-based, not ideology-based.
  const promoRe = /(pre-?save|buy now|promo code|giveaway|sweepstakes|limited time|sale\b|discount\b|win \$|free \$|out the door prices)/i;
  const lotsOfHashtags = /(#[\p{L}\p{N}_]{2,}\s*){5,}/u;
  const linkOnlyish = /^(rt\s+@\w+:\s*)?(https?:\/\/\S+\s*)+$/i;

  const xCfg = cfg?.platforms?.x?.following || {};
  const minLen = typeof xCfg.min_text_len === 'number' ? xCfg.min_text_len : 0;
  const minEffectiveLen = typeof xCfg.min_effective_len === 'number' ? xCfg.min_effective_len : 20;
  const minEffectiveTokens = typeof xCfg.min_effective_tokens === 'number' ? xCfg.min_effective_tokens : 6;

  const matchers = compileTopicMatchers(cfg);

  return items.filter((it) => {
    if (it.platform !== 'x') return true;
    const text = it.text || '';
    const textNorm = normalize(text);
    if (!textNorm) return true;

    if (promoRe.test(textNorm)) return false;
    if (lotsOfHashtags.test(text)) return false;
    if (linkOnlyish.test(textNorm)) return false;

    // Legacy length gate (raw characters)
    if (minLen > 0 && textNorm.length < minLen) {
      if (!matchesAnyTopic(text, matchers)) return false;
    }

    // Product-grade: effective info gate.
    // If after stripping URLs/handles/hashtags there's still too little substance,
    // drop it even if it matches topics (topic match alone isn't enough).
    const eff = stripXNoiseText(text);
    if (eff.length < minEffectiveLen || tokenCount(text) < minEffectiveTokens) {
      return false;
    }

    return true;
  });
}

export function isRetweet(item) {
  if (item.platform !== 'x') return false;
  const t = item.text || '';
  return /^RT\s+@/i.test(t);
}
