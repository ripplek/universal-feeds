import { runReachCommand } from './reach/cli.js';
import { formatValidationReport } from './judgments.js';
import {
  resolveRunContext,
  emitCandidates,
  runFullDigest,
  validateJudgmentsFile,
  daily,
} from './operations.js';

function parseArgs(argv, from = 2) {
  const args = { config: 'config/feeds.yaml', date: 'today' };
  for (let i = from; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      args.config = argv[++i] || args.config;
      args.configExplicit = true;
    } else if (a === '--date') args.date = argv[++i] || args.date;
    else if (a === '--stage') args.stage = argv[++i] || args.stage;
    else if (a === '--judgments') args.judgments = argv[++i] || args.judgments;
    else if (a === '--validate-judgments')
      args.validateJudgments = argv[++i] || args.validateJudgments;
    else if (a === '--run') args.run = argv[++i] || args.run;
    else if (a === '--refetch') args.refetch = true;
    else if (a === '--no-judge') args.noJudge = true;
    else if (a === '--allow-config-drift') args.allowConfigDrift = true;
    else if (a === '--strict-exit') args.strictExit = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = [
  'Usage: universal-feeds [daily] --config <path> [--date today|YYYY-MM-DD] [--json]',
  '                       [--stage candidates] [--judgments <file>] [--run <runId>]',
  '                       [--validate-judgments <file>] [--refetch] [--no-judge]',
  '                       [--allow-config-drift] [--strict-exit]',
  '',
  'Every fetch freezes a run snapshot under out/runs/<date>-<seq>/; candidates,',
  'validation and rendering are all bound to that run (no drift).',
  '',
  'AI relevance filtering (filter.mode: llm/hybrid):',
  '    digest --config c.yaml --stage candidates      # creates/reuses the run',
  '    digest --config c.yaml --judgments out/runs/<runId>/judgments.jsonl',
  "  Validate an agent's judgments before rendering (no digest written):",
  '    digest --config c.yaml --validate-judgments out/runs/<runId>/judgments.jsonl',
  '',
  '`daily` is the state machine for scheduled agent sessions:',
  '  awaiting_judgments → (agent judges) → ok; keyword mode closes in one call.',
  '',
  '--json prints one JSON object to stdout:',
  '  {status, health, runId, sourceHealth, digestPath, count, ...}',
  '  status: ok | awaiting_judgments | error (exit != 0)',
  '  health: ok | warning | degraded (source-level integrity)',
  '--strict-exit: also exit non-zero when health >= warning (cron semantics).',
  '',
  'Tip: copy config/feeds.example.yaml to config/feeds.yaml',
].join('\n');

export async function main() {
  // Subcommands: `digest reach <cmd>` manages the auth-gated fetch layer.
  if (process.argv[2] === 'reach') {
    await runReachCommand(process.argv.slice(3));
    return;
  }

  const isDaily = process.argv[2] === 'daily';
  const args = parseArgs(process.argv, isDaily ? 3 : 2);
  if (isDaily) args.stage = 'daily';
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

// Cron semantics opt-in: degraded content also fails the invocation.
function applyStrictExit(args, normalized) {
  if (!args.strictExit) return;
  const h = normalized?.health;
  if (h === 'warning' || h === 'degraded') process.exitCode = 1;
}

async function runCli(args) {
  const ctx = resolveRunContext(args.config, args.date, {
    explicitConfig: args.configExplicit === true,
  });

  // --validate-judgments: dry-run gate against the run snapshot. No fetch, no
  // digest; exit non-zero on hard errors (malformed / unknown id / duplicate).
  if (args.validateJudgments) {
    const report = await validateJudgmentsFile(ctx, args.validateJudgments, {
      runId: args.run,
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
  let normalized;
  if (stage === 'daily') {
    normalized = await daily(ctx, {
      refetch: args.refetch,
      noJudge: args.noJudge,
      allowConfigDrift: args.allowConfigDrift,
    });
  } else if (stage === 'candidates') {
    normalized = await emitCandidates(ctx, { refetch: args.refetch });
  } else {
    normalized = await runFullDigest(ctx, {
      judgmentsPath: args.judgments,
      runId: args.run,
      allowConfigDrift: args.allowConfigDrift,
    });
  }

  if (args.json) {
    // judgingTask is inlined for MCP convenience; keep CLI stdout compact.
    const { judgingTask, ...compact } = normalized;
    console.log(JSON.stringify(compact));
    applyStrictExit(args, normalized);
    return;
  }

  if (normalized.status === 'awaiting_judgments') {
    console.log(`Run ${normalized.runId}: awaiting judgments.`);
    console.log(
      `Candidates: ${normalized.candidatesPath} (${normalized.count})`
    );
    console.log(`Judging task: ${normalized.judgingTaskPath}`);
    console.log('Next: judge them, then re-run `daily` (same run picks up).');
    applyStrictExit(args, normalized);
    return;
  }
  if (normalized.candidatesPath && !normalized.digestPath) {
    console.log(
      `Wrote: ${normalized.candidatesPath} (${normalized.count} candidates, run ${normalized.runId})`
    );
    if (normalized.judgingTaskPath) {
      console.log(
        `Wrote: ${normalized.judgingTaskPath} (judging task for the agent)`
      );
    }
    console.log(
      'Next: have the agent judge these, then re-run with --judgments <file>.'
    );
    applyStrictExit(args, normalized);
    return;
  }
  console.log(`Wrote: ${normalized.itemsPath}`);
  console.log(`Wrote: ${normalized.digestPath}`);
  if (normalized.health && normalized.health !== 'ok') {
    console.log(`Health: ${normalized.health} — see ${normalized.reportPath}`);
  }
  applyStrictExit(args, normalized);
}
