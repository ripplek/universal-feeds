// Build the compact candidate list handed to an AI judge for relevance review.
//
// The digest emits candidates (post cheap pre-filtering), a Clawdbot agent
// judges each against the user's interest profile, and the digest ingests the
// judgments (see src/judgments.js + skill/universal-feeds/SKILL.md). Keeping the
// payload compact — id, platform, title, truncated text, url — controls the
// token cost of the judging call.

// Stable cross-platform key for round-tripping a judgment back to its item.
// FeedItem.id is only unique within a platform (e.g. a reddit and a bilibili
// item can share a numeric id), so the judge key is `<platform>:<id>`.
export function candidateKey(item) {
  return `${item.platform}:${item.id}`;
}

export function buildCandidates(items, { maxTextLen = 500 } = {}) {
  return items.map((it) => {
    const c = { id: candidateKey(it), platform: it.platform, url: it.url };
    if (it.title) c.title = it.title;
    const text = (it.text || '').trim();
    if (text)
      c.text =
        text.length > maxTextLen ? `${text.slice(0, maxTextLen)}…` : text;
    return c;
  });
}

export function serializeCandidates(cands) {
  return (
    cands.map((c) => JSON.stringify(c)).join('\n') + (cands.length ? '\n' : '')
  );
}
