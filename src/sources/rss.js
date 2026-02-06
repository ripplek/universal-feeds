import fs from 'node:fs';
import path from 'node:path';

async function readYamlConfig(filePath) {
  // Lazy-load yaml dependency from package.json
  const YAML = (await import('yaml')).default;
  const raw = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(raw);
}

function stripHtml(s) {
  const t = (s || '')
    // unwrap CDATA
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
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

import crypto from 'node:crypto';

function sha1(s) {
  return crypto.createHash('sha1').update(String(s || ''), 'utf8').digest('hex');
}

function loadState(cachePath) {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { html: {} };
  }
}

function saveState(cachePath, state) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

export async function fetchRssFromPacks({ packs = [], fetchedAt, maxPerSource = 20, cachePath = null }) {
  const items = [];
  const state = cachePath ? loadState(cachePath) : { html: {} };

  for (const packPath of packs) {
    const abs = path.resolve(packPath);
    const cfg = await readYamlConfig(abs);
    const sources = Array.isArray(cfg?.sources) ? cfg.sources : [];

    for (const s of sources) {
      const url = s.url;
      if (!url) continue;

      if (s.type === 'rss') {
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
      } else if (s.type === 'html') {
        // Best-effort HTML source: treat each configured URL as one item.
        // Useful for vendors that don't publish RSS.
        let html;
        try {
          html = await fetchText(url);
        } catch {
          continue;
        }

        const title = (() => {
          const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(html);
          if (og?.[1]) return stripHtml(og[1]);
          const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
          return t?.[1] ? stripHtml(t[1]) : undefined;
        })();

        const desc = (() => {
          const og = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(html);
          if (og?.[1]) return stripHtml(og[1]);
          const m = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(html);
          return m?.[1] ? stripHtml(m[1]) : undefined;
        })();

        const canonical = canonicalizeUrl(url);
        const fingerprint = sha1([title || '', desc || ''].join('\n'));
        const prev = state.html?.[canonical];
        const changed = !prev || prev.fingerprint !== fingerprint;
        if (changed) {
          state.html = state.html || {};
          state.html[canonical] = { fingerprint, lastSeenAt: fetchedAt, title, desc };
        }

        // If unchanged, treat it as old content (do not surface daily unless user wants).
        const publishedAt = changed ? fetchedAt : prev?.lastSeenAt;

        items.push({
          platform: 'rss',
          sourceType: 'trending',
          source: { pack: packPath, name: s.name },
          id: String(url),
          url: canonical,
          title,
          text: desc,
          publishedAt,
          fetchedAt,
          tags: s.tags || undefined
        });
      }
    }
  }

  if (cachePath) saveState(cachePath, state);
  return items;
}
