#!/usr/bin/env node
// Agent-session delivery: what a scheduled Clawdbot/Claude task runs to post
// the daily digest in-chat. It drives the `daily` state machine and decides
// what to say from `status` + `health` + `sourceHealth` alone — the whole
// point of the run-snapshot/health contract (see AGENTS.md → daily).
//
// Unlike examples/cron/daily-digest.sh (a bare cron + $UF_DELIVER seam that
// can only do the keyword path), this is meant to run INSIDE an agent session:
// on `awaiting_judgments` the agent judges the candidates and re-invokes.
//
// Usage (from the repo root, inside an agent that can read/write files):
//   node examples/cron/agent-session-digest.mjs [--config config/feeds.yaml]
//
// It prints a single JSON envelope describing what to broadcast:
//   { action: "post" | "judge_then_repeat" | "post_failure",
//     message, digestPath?, runId?, judgingTaskPath?, health, sourceHealth }
// The agent reads `action` and acts; `message` is a ready-to-send summary.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const cfg = argv.includes('--config')
  ? argv[argv.indexOf('--config') + 1]
  : 'config/feeds.yaml';

function runDaily() {
  const out = execFileSync(
    'node',
    ['bin/digest', 'daily', '--config', cfg, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.trim().split('\n').pop());
}

// One line naming what failed today, if anything — the reader-facing signal.
function healthNote(res) {
  const bad = (res.sourceHealth || []).filter(
    (e) => !e.optional && (e.severity === 'warning' || e.severity === 'error')
  );
  if (!bad.length) return 'all sources healthy';
  const empty = bad
    .filter((e) => e.severity === 'warning')
    .map((e) => e.platform);
  const broken = bad
    .filter((e) => e.severity === 'error')
    .map((e) => e.platform);
  const parts = [];
  if (empty.length) parts.push(`empty: ${empty.join(', ')}`);
  if (broken.length) parts.push(`failed: ${broken.join(', ')}`);
  return parts.join(' · ');
}

function envelope(res) {
  // error: the run threw (bad config, etc.) — surface it, never post silence.
  if (res.status === 'error') {
    return {
      action: 'post_failure',
      message: `Digest failed to run: ${res.error}`,
      health: 'error',
      sourceHealth: res.sourceHealth || [],
    };
  }

  // awaiting_judgments: the agent must judge, write judgments into the run dir,
  // then re-run this script (or call apply_judgments with the runId).
  if (res.status === 'awaiting_judgments') {
    return {
      action: 'judge_then_repeat',
      message:
        `Run ${res.runId}: ${res.count} candidates awaiting judgment. ` +
        `Judge them against judgingTask.profile, write JSONL to the run's ` +
        `output.path, then re-run. (${healthNote(res)})`,
      runId: res.runId,
      candidatesPath: res.candidatesPath,
      judgingTaskPath: res.judgingTaskPath,
      health: res.health,
      sourceHealth: res.sourceHealth || [],
    };
  }

  // ok: digest rendered. health tells the reader how much to trust it.
  const digest = fs.existsSync(res.digestPath)
    ? fs.readFileSync(res.digestPath, 'utf8')
    : '';
  const banner =
    res.health === 'ok'
      ? `Daily digest (${res.count} items).`
      : `Daily digest (${res.count} items) — health: ${res.health} [${healthNote(res)}]. ` +
        `Some sources came up short today; the digest below reflects that.`;
  return {
    action: 'post',
    message: banner,
    digestPath: path.resolve(res.digestPath),
    digestMarkdown: digest,
    runId: res.runId,
    health: res.health,
    sourceHealth: res.sourceHealth || [],
  };
}

try {
  const env = envelope(runDaily());
  process.stdout.write(JSON.stringify(env, null, 2) + '\n');
} catch (e) {
  process.stdout.write(
    JSON.stringify(
      {
        action: 'post_failure',
        message: `Digest driver crashed: ${e?.message || e}`,
        health: 'error',
        sourceHealth: [],
      },
      null,
      2
    ) + '\n'
  );
  process.exitCode = 1;
}
