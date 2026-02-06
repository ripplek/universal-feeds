function normalize(s) {
  return (s || '').toLowerCase();
}

export function filterXNoise(items, cfg) {
  // Conservative v2 filters: structure-based, not ideology-based.
  const promoRe = /(pre-?save|buy now|promo code|giveaway|sweepstakes|limited time|sale\b|discount\b|win \$|free \$|out the door prices)/i;
  const lotsOfHashtags = /(#[\p{L}\p{N}_]{2,}\s*){5,}/u;
  const linkOnlyish = /^(rt\s+@\w+:\s*)?(https?:\/\/\S+\s*)+$/i;

  const xCfg = cfg?.platforms?.x?.following || {};
  const minLen = typeof xCfg.min_text_len === 'number' ? xCfg.min_text_len : 0;

  return items.filter((it) => {
    if (it.platform !== 'x') return true;
    const text = normalize(it.text);
    if (!text) return true;

    if (promoRe.test(text)) return false;
    if (lotsOfHashtags.test(it.text || '')) return false;

    // Drop extremely short tweets (often low signal), but allow if they match a topic later.
    if (minLen > 0 && text.length < minLen) return false;

    if (linkOnlyish.test(text)) return false;

    return true;
  });
}

export function isRetweet(item) {
  if (item.platform !== 'x') return false;
  const t = item.text || '';
  return /^RT\s+@/i.test(t);
}
