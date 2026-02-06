function stripHtml(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickMeta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const m = re.exec(html);
  return m ? stripHtml(m[1]) : '';
}

function pickTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? stripHtml(m[1]) : '';
}

export async function unfurlUrl(url, { timeoutMs = 8000, fetchImpl = fetch, maxBytes = 200_000 } = {}) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: {
        // some sites block generic fetch; keep minimal
        'user-agent': 'universal-feeds/0.1 (+https://github.com/ripplek/universal-feeds)'
      }
    });

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      return { finalUrl: res.url || url };
    }

    // read a bounded amount
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const html = new TextDecoder('utf-8').decode(slice);

    const ogTitle = pickMeta(html, 'og:title');
    const ogDesc = pickMeta(html, 'og:description');
    const title = ogTitle || pickTitle(html);
    const description = ogDesc || pickMeta(html, 'description');

    return {
      finalUrl: res.url || url,
      title: title || undefined,
      description: description || undefined
    };
  } catch {
    return { finalUrl: url };
  } finally {
    clearTimeout(to);
  }
}
