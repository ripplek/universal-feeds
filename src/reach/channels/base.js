// Channel abstraction for the reach layer.
//
// Ported from Agent-Reach (github.com/Panniantong/Agent-Reach, MIT).
// A channel is a plain descriptor (see ./index.js); these helpers give it the
// ordered-backend routing + health-check behaviour. "Switching backends" for a
// platform means reordering `backends` (or a user override) — not code changes.

import { opencliStatus, opencliSummary } from '../backends/opencli.js';

// Does this channel own this URL? Matches the descriptor's host suffixes.
export function canHandle(ch, url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (ch.hosts || []).some((h) => host === h || host.endsWith(`.${h}`));
}

// Candidate backends in probe order, honouring a user override.
// Config key `<name>_backend` (env `<NAME>_BACKEND`) moves the named backend to
// the front. Unknown overrides are ignored so a stale value can't hide a
// working backend.
export function orderedBackends(ch, config = null) {
  const candidates = [...(ch.backends || [])];
  const override = config ? config.get(`${ch.name}_backend`) : null;
  if (override) {
    const i = candidates.findIndex(
      (b) => b === override || b.startsWith(override)
    );
    if (i > 0) candidates.unshift(candidates.splice(i, 1)[0]);
  }
  return candidates;
}

// Probe backends in order; first fully-usable ('ok') wins, else first 'warn'.
// Returns { status: 'ok'|'warn'|'off'|'error', message, activeBackend }.
// `statusOf` is injectable for tests (defaults to real opencli probing).
export function checkChannel(
  ch,
  config = null,
  { statusOf = opencliStatus } = {}
) {
  const findings = [];
  for (const backend of orderedBackends(ch, config)) {
    if (backend === 'OpenCLI') {
      const st = statusOf();
      if (!st.installed) continue; // not a candidate
      if (st.broken) {
        findings.push(['error', st.hint || 'OpenCLI broken']);
        continue;
      }
      if (st.ready) {
        findings.push(['ok', opencliSummary(st)]);
        continue;
      }
      findings.push(['warn', st.hint || opencliSummary(st)]);
    }
    // Future backends (native CLIs / APIs) would be probed here.
  }

  for (const wanted of ['ok', 'warn']) {
    const hit = findings.find(([s]) => s === wanted);
    if (hit)
      return {
        status: hit[0],
        message: hit[1],
        activeBackend: activeFor(ch, config, hit[0]),
      };
  }
  if (findings.length)
    return {
      status: 'error',
      message: findings.map(([, m]) => m).join('\n'),
      activeBackend: null,
    };
  return {
    status: 'off',
    message: `${ch.description}: no usable backend (install OpenCLI + Chrome extension)`,
    activeBackend: null,
  };
}

// The backend actually serving the channel is the first ordered one (only
// OpenCLI is wired today); kept as a function so multi-backend channels slot in.
function activeFor(ch, config, status) {
  if (status === 'off' || status === 'error') return null;
  return orderedBackends(ch, config)[0] || null;
}
