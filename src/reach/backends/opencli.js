// OpenCLI backend: health probe + command executor.
//
// Ported from Agent-Reach (github.com/Panniantong/Agent-Reach, MIT).
// OpenCLI (github.com/jackwener/opencli) drives the user's real Chrome via a
// browser-bridge extension + local daemon, reusing existing login sessions —
// zero per-platform config, DESKTOP-ONLY (no headless). See docs/adr/0001.
//
// Probing notes (from Agent-Reach, verified live upstream):
//   - `opencli doctor` AUTO-STARTS the daemon (side effect); health checks use
//     `opencli daemon status` (pure query) instead.
//   - Exit codes are always 0; status is parsed from text output.
//   - "Extension: disconnected" does NOT mean unusable: the service worker
//     sleeps and any real command wakes it. Since daemon status can't tell
//     "sleeping" from "never installed", we check Chrome's Extensions dir.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import { probeCommand } from '../probe.js';

export const OPENCLI_PACKAGE = '@jackwener/opencli';
export const OPENCLI_EXTENSION_ID = 'ildkmabpimmkaediidaifkhjpohdnifk';
export const OPENCLI_EXTENSION_URL = `https://chromewebstore.google.com/detail/opencli/${OPENCLI_EXTENSION_ID}`;

const CHROME_PROFILE_ROOTS = [
  '~/Library/Application Support/Google/Chrome',
  '~/Library/Application Support/Chromium',
  '~/.config/google-chrome',
  '~/.config/chromium',
];

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function extensionInstalledOnDisk() {
  const roots = CHROME_PROFILE_ROOTS.map(expandHome);
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData)
    roots.push(path.join(localAppData, 'Google', 'Chrome', 'User Data'));
  for (const root of roots) {
    let profiles = [];
    try {
      profiles = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const prof of profiles) {
      if (
        fs.existsSync(path.join(root, prof, 'Extensions', OPENCLI_EXTENSION_ID))
      )
        return true;
    }
  }
  return false;
}

// Probe OpenCLI install + daemon/extension state without side effects.
// `probe` and `extOnDisk` are injectable for tests.
export function opencliStatus({
  probe = probeCommand,
  extOnDisk = extensionInstalledOnDisk,
} = {}) {
  const version = probe({
    cmd: 'opencli',
    args: ['--version'],
    pkg: OPENCLI_PACKAGE,
  });
  if (version.status === 'missing') return { installed: false, ready: false };
  if (version.status === 'broken') {
    return {
      installed: true,
      broken: true,
      ready: false,
      hint: `opencli present but cannot run. Reinstall:\n  npm install -g ${OPENCLI_PACKAGE}`,
    };
  }

  const st = {
    installed: true,
    broken: false,
    version: version.output.replace(/^v/, ''),
  };
  const daemon = probe({
    cmd: 'opencli',
    args: ['daemon', 'status'],
    pkg: OPENCLI_PACKAGE,
  });
  const out =
    daemon.status === 'ok' || daemon.status === 'error' ? daemon.output : '';
  for (const raw of out.split('\n')) {
    const line = raw.trim().toLowerCase();
    if (line.startsWith('daemon:')) {
      st.daemonRunning =
        !line.includes('not running') && line.includes('running');
    } else if (line.startsWith('extension:')) {
      st.extensionConnected =
        !line.includes('disconnected') && line.includes('connected');
    }
  }

  if (!st.extensionConnected) {
    st.extensionInstalled = extOnDisk();
    if (!st.extensionInstalled) {
      st.hint =
        `OpenCLI installed but the Chrome extension is missing.\n` +
        `  1. Install it (one manual click): ${OPENCLI_EXTENSION_URL}\n` +
        `  2. Keep Chrome open, then run \`opencli doctor\` to verify`;
    }
  }

  // Usable now or on first call: a live connection, or an installed-but-sleeping
  // extension whose worker wakes on the first real command.
  st.ready =
    st.installed &&
    !st.broken &&
    (st.extensionConnected || !!st.extensionInstalled);
  return st;
}

export function opencliSummary(st) {
  if (!st.installed) return 'OpenCLI not installed';
  if (st.broken) return 'OpenCLI cannot run (broken install)';
  if (st.extensionConnected)
    return `OpenCLI ready (browser session, v${st.version})`;
  if (st.ready) return 'OpenCLI ready (extension asleep, wakes on first call)';
  if (st.daemonRunning)
    return 'OpenCLI installed, waiting for Chrome extension';
  return 'OpenCLI installed (daemon idle; needs Chrome extension)';
}

// Default executor: spawn opencli, capture stdout. Injectable for tests.
export function makeExecOpenCli({ spawnImpl = spawn } = {}) {
  return function execOpenCli(args, { timeoutMs = 60000 } = {}) {
    return new Promise((resolve, reject) => {
      const p = spawnImpl('opencli', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const out = [];
      const err = [];
      let timer = null;
      if (timeoutMs && Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          p.kill('SIGKILL');
          reject(new Error(`opencli timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      p.stdout.on('data', (d) => out.push(d));
      p.stderr.on('data', (d) => err.push(d));
      p.on('error', (e) => {
        if (timer) clearTimeout(timer);
        reject(new Error(`opencli spawn failed: ${e.message}`));
      });
      p.on('close', (code) => {
        if (timer) clearTimeout(timer);
        const stdout = Buffer.concat(out).toString('utf8');
        const stderr = Buffer.concat(err).toString('utf8');
        if (code !== 0) {
          reject(new Error(`opencli failed (code ${code})\n${stderr}`));
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  };
}

// Coerce assorted YAML shapes into a flat array of row objects.
export function coerceRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const key of ['items', 'data', 'results', 'rows', 'posts']) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return [];
}

// Build the argv for an OpenCLI command and run it, returning parsed rows.
//   runOpenCli({ platform:'twitter', cmd:'search', query:'ai', limit:20 })
//   → opencli twitter search "ai" --limit 20 -f yaml
export async function runOpenCli({
  platform,
  cmd,
  query,
  limit,
  extraArgs = [],
  timeoutMs = 60000,
  exec = makeExecOpenCli(),
}) {
  const args = [platform, cmd];
  if (query) args.push(query);
  if (limit != null) args.push('--limit', String(limit));
  args.push(...extraArgs, '-f', 'yaml');

  const { stdout } = await exec(args, { timeoutMs });
  let parsed;
  try {
    parsed = YAML.parse(stdout);
  } catch (e) {
    throw new Error(
      `opencli ${platform} ${cmd}: output not YAML: ${e?.message || e}`
    );
  }
  return coerceRows(parsed);
}
