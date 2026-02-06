export function trimByPlatform(items, cfg) {
  const maxTotal = cfg?.output?.max_items ?? 30;
  const caps = cfg?.ranking?.max_per_platform || {};

  const counts = new Map();
  const out = [];
  for (const it of items) {
    if (out.length >= maxTotal) break;
    const p = it.platform || 'unknown';
    const cap = typeof caps[p] === 'number' ? caps[p] : Infinity;
    const c = counts.get(p) || 0;
    if (c >= cap) continue;
    counts.set(p, c + 1);
    out.push(it);
  }
  return out;
}
