function normalize(s) {
  return (s || '').toLowerCase();
}

export function filterXNoise(items) {
  // Conservative v1 filters. Keep recall high.
  const promoRe = /(pre-?save|buy now|promo code|giveaway|sweepstakes|limited time|sale\b|discount\b)/i;
  const adHandlesRe = /(^|\s)@([a-z0-9_]{1,20})/i;

  return items.filter((it) => {
    if (it.platform !== 'x') return true;
    const text = normalize(it.text);
    if (!text) return true;

    // Drop obvious promos
    if (promoRe.test(text)) return false;

    // If it's a pure RT with very short text, keep (sometimes valuable) — so no RT filter yet.
    return true;
  });
}
