// `digest reach watch` — quick health + update check for scheduled tasks.
//
// Ported from Agent-Reach (github.com/Panniantong/Agent-Reach, MIT).
// Compact one-screen status with a cron-friendly exit code: non-zero when the
// engine is unusable or no channel is ready, so a scheduler can alert.

import { spawn } from 'node:child_process';
import { checkAll } from './doctor.js';
import { opencliStatus, OPENCLI_PACKAGE } from './backends/opencli.js';

// Pure: build the report + ok flag from gathered data. Unit-tested.
export function watchReport({ results, opencli, update }) {
  const total = Object.keys(results).length;
  const ready = Object.values(results).filter((r) => r.status === 'ok').length;

  const lines = [`reach: ${ready}/${total} channels ready`];
  for (const [name, r] of Object.entries(results)) {
    if (r.status !== 'ok') lines.push(`  ${name}: ${r.status}`);
  }

  if (!opencli || !opencli.installed) lines.push('opencli: NOT INSTALLED');
  else if (opencli.broken) lines.push('opencli: BROKEN');
  else {
    const conn = opencli.extensionConnected ? ' (extension connected)' : '';
    lines.push(`opencli: v${opencli.version || '?'}${conn}`);
  }

  if (
    update &&
    update.current &&
    update.latest &&
    update.current !== update.latest
  ) {
    lines.push(
      `update: opencli ${update.current} → ${update.latest} available (npm i -g ${OPENCLI_PACKAGE})`
    );
  }

  const ok = !!(opencli && opencli.installed && !opencli.broken && ready > 0);
  return { lines, ok };
}

// Best-effort latest-version lookup via `npm view`. Returns null on any failure
// (offline, npm missing) so watch never hard-fails on the update check.
export function fetchLatestOpenCli({
  spawnImpl = spawn,
  timeoutMs = 8000,
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let p;
    try {
      p = spawnImpl('npm', ['view', OPENCLI_PACKAGE, 'version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return finish(null);
    }
    const timer = setTimeout(() => {
      try {
        p.kill('SIGKILL');
      } catch {
        /* noop */
      }
      finish(null);
    }, timeoutMs);
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      const v = Buffer.concat(out).toString('utf8').trim();
      finish(code === 0 && v ? v : null);
    });
  });
}

export async function runWatch({
  config = null,
  statusOf = opencliStatus,
  latest = fetchLatestOpenCli,
  log = console.log,
} = {}) {
  const opencli = statusOf();
  const results = checkAll(config, { statusOf });
  const latestVersion = await latest();
  const update = latestVersion
    ? { current: opencli.version, latest: latestVersion }
    : null;

  const { lines, ok } = watchReport({ results, opencli, update });
  log(lines.join('\n'));
  process.exitCode = ok ? 0 : 1;
  return ok;
}
