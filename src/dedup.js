function canonicalizeUrl(u) {
  try {
    const url = new URL(u);
    const drop = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'source',
      'feature',
    ];
    for (const k of drop) url.searchParams.delete(k);
    // remove fragment
    url.hash = '';
    return url.toString();
  } catch {
    return u;
  }
}

// How much signal an item carries — used to pick the better of two duplicates.
// Engagement metrics are worth most: a reach item's score/likes shouldn't be
// dropped just because an RSS feed surfaced the same URL first (e.g. the HN
// front page arrives via both an RSS feed and the reach hackernews channel).
function richness(it) {
  let r = 0;
  const m = it.metrics;
  if (m && Object.values(m).some((v) => v !== undefined && v !== null)) r += 2;
  if (it.text) r += 1;
  if (it.publishedAt) r += 1;
  if (it.author?.name || it.author?.handle) r += 1;
  return r;
}

export function dedupItems(items) {
  const posByKey = new Map(); // canonical key -> index in `out`
  const out = [];
  for (const it of items) {
    const canonUrl = canonicalizeUrl(it.url || '');
    const key = canonUrl || it.id;
    if (!key) continue;
    const norm = { ...it, url: canonUrl };

    if (posByKey.has(key)) {
      // Duplicate: keep whichever carries more signal, at the first position.
      const pos = posByKey.get(key);
      if (richness(norm) > richness(out[pos])) out[pos] = norm;
      continue;
    }
    posByKey.set(key, out.length);
    out.push(norm);
  }
  return out;
}
