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
