// Shared text primitives for the topic-matching modules (tagging, recommend,
// filters). Kept in one place so normalization and domain parsing can't drift
// between the modules that all match items against the same topic definitions.

export function normalizeText(s) {
  return (s || '').toLowerCase();
}

// Hostname of a URL, or null for a missing/invalid URL (never throws).
export function getDomain(url) {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

// The named HTML entities that actually show up in feed titles. Numeric and hex
// references are handled generically; this table only covers the named ones.
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;

// Decode the HTML entities that leak into RSS titles (`&#8217;` → `’`) for the
// reader view. Single left-to-right pass, so `&amp;#8217;` decodes to the
// literal `&#8217;` rather than being decoded twice. Unknown entities are left
// untouched. Never throws; nullish input returns ''.
export function decodeEntities(s) {
  if (!s) return '';
  return String(s).replace(ENTITY_RE, (m, body) => {
    if (body[0] === '#') {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        try {
          return String.fromCodePoint(cp);
        } catch {
          return m;
        }
      }
      return m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body]
      : m;
  });
}
