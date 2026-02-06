function canonicalizeUrl(u) {
  try {
    const url = new URL(u);
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'feature'];
    for (const k of drop) url.searchParams.delete(k);
    // remove fragment
    url.hash = '';
    return url.toString();
  } catch {
    return u;
  }
}

export function dedupItems(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = canonicalizeUrl(it.url || '') || it.id;
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, url: canonicalizeUrl(it.url) });
  }
  return out;
}
