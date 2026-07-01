import { runReachCommand } from './reach/cli.js';
import { formatValidationReport } from './judgments.js';
import {
  resolveRunContext,
  emitCandidates,
  runFullDigest,
  validateJudgmentsFile,
} from './operations.js';

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
  const ctx = resolveRunContext(args.config, args.date);

  // --validate-judgments: dry-run gate. No digest is written; exit non-zero on
  // hard errors (malformed / unknown id / out-of-range score / duplicate).
  if (args.validateJudgments) {
    const report = await validateJudgmentsFile(ctx, args.validateJudgments);
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
  const normalized =
    stage === 'candidates'
      ? await emitCandidates(ctx)
      : await runFullDigest(ctx, { judgmentsPath: args.judgments });

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
