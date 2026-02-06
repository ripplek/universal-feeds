import fs from 'node:fs';
import path from 'node:path';

async function readYamlConfig(filePath) {
  // Lazy-load yaml dependency from package.json
  const YAML = (await import('yaml')).default;
  const raw = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(raw);
}

function stripHtml(s) {
  return (s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(text, tag) {
  // very naive RSS/Atom extraction. Good enough for MVP.
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function extractAllItems(xml) {
  const items = [];
  // RSS <item>
  const rssRe = /<item[\s\S]*?<\/item>/gi;
  const rss = xml.match(rssRe) || [];
  for (const block of rss) items.push({ kind: 'rss', block });
  // Atom <entry>
  const atomRe = /<entry[\s\S]*?<\/entry>/gi;
  const atom = xml.match(atomRe) || [];
  for (const block of atom) items.push({ kind: 'atom', block });
  return items;
}

function canonicalizeUrl(u) {
  try {
    const url = new URL(u);
    // drop tracking params
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'];
    for (const k of drop) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return u;
  }
}

async function fetchText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'universal-feeds/0.1 (+https://github.com/ripplek/universal-feeds)'
      }
    });
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchRssFromPacks({ packs = [], fetchedAt, maxPerSource = 20 }) {
  const items = [];

  for (const packPath of packs) {
    const abs = path.resolve(packPath);
    const cfg = await readYamlConfig(abs);
    const sources = Array.isArray(cfg?.sources) ? cfg.sources : [];

    for (const s of sources) {
      if (s.type !== 'rss') continue;
      const url = s.url;
      if (!url) continue;

      let xml;
      try {
        xml = await fetchText(url);
      } catch {
        continue;
      }

      const blocks = extractAllItems(xml).slice(0, maxPerSource);
      for (const { kind, block } of blocks) {
        const titleRaw = extractTag(block, 'title');
        const title = stripHtml(titleRaw || '');

        let link = null;
        if (kind === 'rss') {
          link = stripHtml(extractTag(block, 'link') || '');
        } else {
          // atom: <link href="..."/>
          const m = /<link[^>]+href=["']([^"']+)["'][^>]*\/>/i.exec(block);
          link = m ? m[1] : stripHtml(extractTag(block, 'link') || '');
        }
        if (!link) continue;
        link = canonicalizeUrl(link);

        const guid = stripHtml(extractTag(block, 'guid') || '') || link;
        const pub = stripHtml(extractTag(block, 'pubDate') || '') || stripHtml(extractTag(block, 'updated') || '') || stripHtml(extractTag(block, 'published') || '');
        const publishedAt = (() => {
          const d = new Date(pub);
          return isNaN(d) ? undefined : d.toISOString();
        })();

        const descRaw = extractTag(block, 'description') || extractTag(block, 'summary') || '';
        const text = stripHtml(descRaw).slice(0, 400);

        items.push({
          platform: 'rss',
          sourceType: 'trending',
          source: { pack: packPath, name: s.name },
          id: String(guid),
          url: link,
          title: title || undefined,
          text: text || undefined,
          publishedAt,
          fetchedAt,
          tags: s.tags || undefined
        });
      }
    }
  }

  return items;
}
