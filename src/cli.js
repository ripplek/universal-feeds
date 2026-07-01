import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { runDigest } from './pipeline.js';
import { runReachCommand } from './reach/cli.js';
import {
  parseJudgments,
  indexJudgments,
  validateJudgments,
  formatValidationReport,
} from './judgments.js';

function parseArgs(argv) {
  const args = { config: 'config/feeds.yaml', date: 'today' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i] || args.config;
    else if (a === '--date') args.date = argv[++i] || args.date;
    else if (a === '--stage') args.stage = argv[++i] || args.stage;
    else if (a === '--judgments') args.judgments = argv[++i] || args.judgments;
    else if (a === '--validate-judgments')
      args.validateJudgments = argv[++i] || args.validateJudgments;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function ymdInTz(d = new Date(), tz = 'Asia/Shanghai') {
  // Simple YYYY-MM-DD using Intl; good enough for reports.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Normalize the shape returned by runDigest into a single stable object that an
// agent can parse regardless of stage. `--json` prints exactly this object.
export function normalizeCliResult(result = {}, { date, stage }) {
  const out = {
    status: 'ok',
    stage,
    date,
    itemsPath: result.itemsPath ?? null,
    digestPath: result.digestPath ?? null,
    candidatesPath: result.candidatesPath ?? null,
    count: typeof result.count === 'number' ? result.count : 0,
  };
  // Present only for the candidates stage (see docs/FILTERING.md).
  if (result.judgingTaskPath) out.judgingTaskPath = result.judgingTaskPath;
  return out;
}

const HELP = [
  'Usage: universal-feeds --config <path> [--date today|YYYY-MM-DD] [--json]',
  '                       [--stage candidates] [--judgments <file>]',
  '                       [--validate-judgments <file>]',
  '',
  'AI relevance filtering (filter.mode: llm): emit candidates, judge them',
  '  (see AGENTS.md / docs/FILTERING.md), then apply:',
  '    digest --config c.yaml --stage candidates',
  '    digest --config c.yaml --judgments out/judgments-<date>.jsonl',
  "  Validate an agent's judgments before rendering (no digest written):",
  '    digest --config c.yaml --stage candidates   # emits candidates + judging-task.json',
  '    digest --config c.yaml --validate-judgments out/judgments-<date>.jsonl',
  '',
  '--json prints one JSON object to stdout:',
  '  {status, stage, date, itemsPath, digestPath, candidatesPath, count}',
  'Exit code is non-zero on failure.',
  '',
  'Tip: copy config/feeds.example.yaml to config/feeds.yaml',
].join('\n');

export async function main() {
  // Subcommands: `digest reach <cmd>` manages the auth-gated fetch layer.
  if (process.argv[2] === 'reach') {
    await runReachCommand(process.argv.slice(3));
    return;
  }

  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  // In --json mode every failure (config parse, fetch, render) must still be a
  // single JSON object on stdout with a non-zero exit — agents parse stdout.
  try {
    await runCli(args);
  } catch (err) {
    if (args.json) {
      console.log(
        JSON.stringify({
          status: 'error',
          stage: args.stage || (args.validateJudgments ? 'validate' : 'full'),
          error: String(err?.message || err),
        })
      );
      process.exitCode = 1;
      return;
    }
    throw err; // bin/digest prints the stack and exits non-zero
  }
}

async function runCli(args) {
  // Allow using example config without copying.
  const configPath = fs.existsSync(args.config)
    ? args.config
    : 'config/feeds.example.yaml';

  const cfg = loadConfig(configPath);
  const tz = cfg?.output?.tz || 'Asia/Shanghai';
  const date = args.date === 'today' ? ymdInTz(new Date(), tz) : args.date;

  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });

  // --validate-judgments: dry-run gate. Re-emit candidates (post pre-filter) to
  // learn the valid id set, then validate the agent's judgments against it and
  // the config thresholds. Writes no digest; exits non-zero on hard errors.
  if (args.validateJudgments) {
    const cand = await runDigest({ cfg, date, outDir, stage: 'candidates' });
    const candidateIds = fs
      .readFileSync(cand.candidatesPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).id);
    const judgments = parseJudgments(
      fs.readFileSync(args.validateJudgments, 'utf8')
    );
    const report = validateJudgments(judgments, {
      candidateIds,
      minRelevance: cfg?.filter?.min_relevance ?? 0.5,
    });
    if (args.json) {
      console.log(
        JSON.stringify({ status: report.ok ? 'ok' : 'error', ...report })
      );
    } else {
      console.log(formatValidationReport(report, args.validateJudgments));
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }

  const stage = args.stage || 'full';
  const result = await runDigest({
    cfg,
    date,
    outDir,
    stage,
    judgmentsPath: args.judgments,
  });

  const normalized = normalizeCliResult(result, { date, stage });

  if (args.json) {
    console.log(JSON.stringify(normalized));
    return;
  }

  if (normalized.candidatesPath) {
    console.log(
      `Wrote: ${normalized.candidatesPath} (${normalized.count} candidates)`
    );
    if (normalized.judgingTaskPath) {
      console.log(
        `Wrote: ${normalized.judgingTaskPath} (judging task for the agent)`
      );
    }
    console.log(
      'Next: have the agent judge these, then re-run with --judgments <file>.'
    );
    return;
  }
  console.log(`Wrote: ${normalized.itemsPath}`);
  console.log(`Wrote: ${normalized.digestPath}`);
}
