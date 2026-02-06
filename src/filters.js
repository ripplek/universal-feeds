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

export function filterXNoise(items, cfg) {
  // Conservative v2 filters: structure-based, not ideology-based.
  const promoRe = /(pre-?save|buy now|promo code|giveaway|sweepstakes|limited time|sale\b|discount\b|win \$|free \$|out the door prices)/i;
  const lotsOfHashtags = /(#[\p{L}\p{N}_]{2,}\s*){5,}/u;
  const linkOnlyish = /^(rt\s+@\w+:\s*)?(https?:\/\/\S+\s*)+$/i;

  const xCfg = cfg?.platforms?.x?.following || {};
  const minLen = typeof xCfg.min_text_len === 'number' ? xCfg.min_text_len : 0;

  const matchers = compileTopicMatchers(cfg);

  return items.filter((it) => {
    if (it.platform !== 'x') return true;
    const text = it.text || '';
    const textNorm = normalize(text);
    if (!textNorm) return true;

    if (promoRe.test(textNorm)) return false;
    if (lotsOfHashtags.test(text)) return false;

    // Drop extremely short tweets (often low signal), BUT keep if it matches any topic.
    if (minLen > 0 && textNorm.length < minLen) {
      if (!matchesAnyTopic(text, matchers)) return false;
    }

    if (linkOnlyish.test(textNorm)) return false;

    return true;
  });
}

export function isRetweet(item) {
  if (item.platform !== 'x') return false;
  const t = item.text || '';
  return /^RT\s+@/i.test(t);
}
