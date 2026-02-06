function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': 'universal-feeds/0.1' }
    });
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export function parseMpAlbumUrl(url) {
  const u = new URL(url);
  const biz = u.searchParams.get('__biz');
  const albumId = u.searchParams.get('album_id');
  return { biz, albumId };
}

export async function fetchWeChatMpAlbum({ name, url, fetchedAt, limit = 30 }) {
  const { biz, albumId } = parseMpAlbumUrl(url);
  if (!biz || !albumId) return [];

  const html = await fetchText(url);

  // Try to extract article links from the page.
  // WeChat pages often contain HTML-escaped URLs (&amp;). Normalize them.
  const normalized = html.replace(/&amp;/g, '&');

  // Links appear as https://mp.weixin.qq.com/s?__biz=... or http://mp.weixin.qq.com/s?__biz=...
  const re = /(https?:\/\/mp\.weixin\.qq\.com\/s\?[^\"\s<>]+|\/s\?[^\"\s<>]+)/g;
  const found = [];
  let m;
  while ((m = re.exec(normalized))) {
    let link = m[1];
    if (link.startsWith('/')) link = `https://mp.weixin.qq.com${link}`;
    // drop obvious JS placeholders
    if (link.includes('s?a=b')) continue;
    found.push(link);
    if (found.length >= limit) break;
  }

  // De-dup
  const uniq = [...new Set(found)];

  // Best-effort title extraction is hard without JS; keep link-only for now.
  return uniq.map((link) => {
    // Normalize to https
    const url = link.replace(/^http:\/\//i, 'https://');
    return {
      platform: 'rss',
      sourceType: 'trending',
      source: { name: name || 'WeChat MP album', pack: 'mp.weixin' },
      id: url,
      url,
      title: name ? `${name} (WeChat article)` : 'WeChat article',
      text: undefined,
      publishedAt: fetchedAt,
      fetchedAt,
      tags: ['wechat', 'cn']
    };
  });
}
