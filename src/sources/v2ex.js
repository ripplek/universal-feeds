function strip(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function htmlDecode(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'universal-feeds/0.1' }
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return await res.text();
}

export async function fetchV2exHot({ fetchedAt, limit = 30 }) {
  const url = 'https://www.v2ex.com/?tab=hot';
  const html = await fetchText(url);

  // Very simple parsing: find topic links in hot list.
  // Matches: <span class="item_title"><a href="/t/123">Title</a>
  const re = /<span class="item_title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/gi;
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const title = htmlDecode(strip(m[2]));
    if (!href || !title) continue;
    const full = href.startsWith('http') ? href : `https://www.v2ex.com${href}`;
    const id = href;
    items.push({
      platform: 'v2ex',
      sourceType: 'trending',
      id,
      url: full,
      title,
      fetchedAt
    });
    if (items.length >= limit) break;
  }

  return items;
}
