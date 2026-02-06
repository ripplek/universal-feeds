import fs from 'node:fs';
import path from 'node:path';

async function readYaml(filePath) {
  const YAML = (await import('yaml')).default;
  const raw = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(raw);
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function fetchText(url, timeoutMs = 8000) {
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

export async function fetchYouTubeFromPacks({ packs = [], fetchedAt, maxPerSource = 10 }) {
  const items = [];
  for (const packPath of packs) {
    const abs = path.resolve(packPath);
    const cfg = await readYaml(abs);
    const sources = Array.isArray(cfg?.sources) ? cfg.sources : [];

    for (const s of sources) {
      if (s.type !== 'rss') continue;
      const feedUrl = s.url;
      if (!feedUrl) continue;

      let xml;
      try {
        xml = await fetchText(feedUrl);
      } catch {
        continue;
      }

      // YouTube feed uses Atom entries.
      const entryRe = /<entry[\s\S]*?<\/entry>/gi;
      const entries = xml.match(entryRe) || [];

      for (const block of entries.slice(0, maxPerSource)) {
        const title = stripHtml(extractAll(block, 'title')[0] || '');
        const linkM = /<link[^>]+href=["']([^"']+)["'][^>]*\/>/i.exec(block);
        const url = linkM ? linkM[1] : null;
        const vid = stripHtml(extractAll(block, 'yt:videoId')[0] || '') || url;
        const pub = stripHtml(extractAll(block, 'published')[0] || '');
        const publishedAt = (() => {
          const d = new Date(pub);
          return isNaN(d) ? undefined : d.toISOString();
        })();
        if (!url) continue;

        items.push({
          platform: 'youtube',
          sourceType: 'trending',
          source: { pack: packPath, name: s.name },
          id: String(vid),
          url,
          title: title || undefined,
          publishedAt,
          fetchedAt,
          tags: s.tags || undefined
        });
      }
    }
  }

  return items;
}
