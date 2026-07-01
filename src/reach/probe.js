// Lightweight upstream-command probing for the reach layer.
//
// Ported from Agent-Reach (github.com/Panniantong/Agent-Reach, MIT).
// Distinguishes the failure modes that all look identical to `which`:
//   - missing: command not on PATH
//   - broken:  command exists but cannot execute (stale shim, bad interpreter)
//   - timeout: command ran but did not respond in time
//   - error:   command ran but exited non-zero
//   - ok:      command ran and exited zero
//
// Channels call probeCommand() inside their check() so `reach doctor` reports
// real health, not just file existence.

import { spawnSync } from 'node:child_process';

// Shell exit codes for "found but not executable" / "not found".
const BROKEN_EXIT_CODES = new Set([126, 127]);

export function reinstallHint(pkg) {
  return (
    `command exists but cannot execute — usually a stale global/venv shim. Reinstall to fix:\n` +
    `  npm install -g ${pkg}`
  );
}

// Default runner: executes the command and returns a POSIX-ish result.
// Injectable so tests never spawn a real process.
function defaultRun(cmd, args, timeoutMs) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    // spawnSync sets error.code = 'ENOENT' when the binary is missing.
  });
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') return { timedOut: true };
    if (r.error.code === 'ENOENT') return { notFound: true };
    // EACCES / exec format error etc. — present but unrunnable.
    return { execFailed: true };
  }
  return {
    code: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function classify(res, pkg) {
  if (res.notFound) return { status: 'missing', output: '', hint: '' };
  if (res.execFailed)
    return { status: 'broken', output: '', hint: reinstallHint(pkg) };
  if (res.timedOut)
    return { status: 'timeout', output: '', hint: `command timed out` };
  if (BROKEN_EXIT_CODES.has(res.code)) {
    return { status: 'broken', output: '', hint: reinstallHint(pkg) };
  }
  const output = ((res.stdout || '') + (res.stderr || '')).trim();
  if (res.code !== 0) return { status: 'error', output, hint: '' };
  return { status: 'ok', output, hint: '' };
}

// Probe `cmd args`, classify the outcome. SIDE-EFFECT-FREE commands only
// (version/status/check): retries re-run verbatim, so a non-idempotent command
// would repeat its effect.
export function probeCommand({
  cmd,
  args = ['--version'],
  timeoutMs = 10000,
  retries = 0,
  pkg,
  run = defaultRun,
} = {}) {
  let last = null;
  for (let i = 0; i <= retries; i++) {
    last = classify(run(cmd, args, timeoutMs), pkg || cmd);
    if (last.status === 'ok') return last;
    // missing/broken won't heal between retries — only transient failures do.
    if (last.status === 'missing' || last.status === 'broken') return last;
  }
  return last;
}
