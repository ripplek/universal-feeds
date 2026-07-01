// Reach source adapter — fetch an auth-gated platform via the reach layer
// (OpenCLI browser bridge) and normalize to FeedItem[].
//
// Health-gated and best-effort: if the channel's backend isn't ready, it warns
// and returns [] so the digest still renders (see docs/adr/0001).

import { getChannel } from '../reach/channels/index.js';
import { checkChannel } from '../reach/channels/base.js';
import { runOpenCli } from '../reach/backends/opencli.js';
import { normalizeRows } from '../reach/normalize.js';

// Pick the OpenCLI command for the requested mode.
//   mode 'search' → commands.search ; 'feed'/'trending' → that command
//   mode 'auto'   → search when a query is given, else feed → trending → search
function resolveCommand(ch, mode, query) {
  const c = ch.commands || {};
  if (mode && mode !== 'auto')
    return c[mode] ? { key: mode, ...c[mode] } : null;
  if (query && c.search) return { key: 'search', ...c.search };
  if (c.feed) return { key: 'feed', ...c.feed };
  if (c.trending) return { key: 'trending', ...c.trending };
  if (c.search) return { key: 'search', ...c.search };
  return null;
}

export async function fetchViaReach({
  platform,
  query,
  mode = 'auto',
  limit,
  config = null,
  fetchedAt,
  exec, // injected OpenCLI executor (tests)
  statusOf, // injected opencli status probe (tests)
}) {
  const ch = getChannel(platform);
  if (!ch) throw new Error(`reach: unknown platform '${platform}'`);

  const health = checkChannel(ch, config, statusOf ? { statusOf } : {});
  if (health.status !== 'ok') {
    console.error(
      `# reach: ${platform} unavailable (${health.status}) — skipping. ${health.message.split('\n')[0]}`
    );
    return [];
  }

  const spec = resolveCommand(ch, mode, query);
  if (!spec) {
    console.error(`# reach: ${platform} has no command for mode '${mode}'`);
    return [];
  }
  if (spec.key === 'search' && !query) {
    console.error(`# reach: ${platform} search needs a query — skipping.`);
    return [];
  }

  const rows = await runOpenCli({
    platform: ch.name,
    cmd: spec.cmd,
    query,
    limit,
    exec,
  });
  return normalizeRows(rows, {
    platform: ch.platform,
    sourceType: spec.sourceType,
    source: { name: `reach:${ch.name}` },
    fetchedAt,
  });
}
