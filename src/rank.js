function hoursAgo(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

export function rankItems(items, cfg) {
  const recencyHours = cfg?.output?.recency_hours ?? 24;

  return items
    .map((x) => {
      const m = x.metrics || {};
      const engagement = (m.like || 0) + 2 * (m.repost || 0) + (m.reply || 0) + (m.quote || 0);
      const ageH = hoursAgo(x.publishedAt);
      const recencyBoost = ageH <= recencyHours ? (recencyHours - ageH) / recencyHours : 0;
      const score = engagement + recencyBoost;
      return { ...x, score };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}
