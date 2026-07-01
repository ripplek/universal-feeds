// Thin, runtime-agnostic tool layer behind the MCP server (src/mcp/server.js).
//
// Each tool wraps an existing pipeline/reach entry point and returns a plain
// JSON-serializable object — no MCP types here, so the logic is unit-testable
// without a transport. The server file only maps these onto the MCP protocol.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { runDigest } from '../pipeline.js';
import { normalizeCliResult } from '../cli.js';
import { parseJudgments, validateJudgments } from '../judgments.js';
import { ReachConfig } from '../reach/config.js';
import { fetchViaReach } from '../sources/reach.js';

function ymdInTz(d = new Date(), tz = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function resolveConfig(configPath) {
  const p = configPath || 'config/feeds.yaml';
  const resolved = fs.existsSync(p) ? p : 'config/feeds.example.yaml';
  return loadConfig(resolved);
}

function resolveDate(cfg, date) {
  const tz = cfg?.output?.tz || 'Asia/Shanghai';
  return !date || date === 'today' ? ymdInTz(new Date(), tz) : date;
}

function ensureOutDir() {
  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

// Accept judgments as a file path, a JSONL/JSON string, or an array of objects.
// Returns a path on disk (writing inline data to out/judgments-<date>.jsonl).
function materializeJudgments({ judgments, judgmentsPath, outDir, date }) {
  if (judgmentsPath) return judgmentsPath;
  if (judgments == null) return undefined;
  const arr = Array.isArray(judgments)
    ? judgments
    : parseJudgments(String(judgments));
  const p = path.join(outDir, `judgments-${date}.jsonl`);
  fs.writeFileSync(
    p,
    arr.map((j) => JSON.stringify(j)).join('\n') + '\n',
    'utf8'
  );
  return p;
}

export async function runDigestTool(args = {}) {
  const cfg = resolveConfig(args.config);
  const date = resolveDate(cfg, args.date);
  const outDir = ensureOutDir();
  const judgmentsPath = materializeJudgments({
    judgments: args.judgments,
    judgmentsPath: args.judgmentsPath,
    outDir,
    date,
  });
  const result = await runDigest({
    cfg,
    date,
    outDir,
    stage: 'full',
    judgmentsPath,
  });
  return normalizeCliResult(result, { date, stage: 'full' });
}

export async function emitCandidatesTool(args = {}) {
  const cfg = resolveConfig(args.config);
  const date = resolveDate(cfg, args.date);
  const outDir = ensureOutDir();
  const result = await runDigest({ cfg, date, outDir, stage: 'candidates' });
  const out = normalizeCliResult(result, { date, stage: 'candidates' });
  // Inline the judging task so an MCP client needn't read the file separately.
  try {
    out.judgingTask = JSON.parse(
      fs.readFileSync(result.judgingTaskPath, 'utf8')
    );
  } catch {
    // best effort
  }
  return out;
}

export async function applyJudgmentsTool(args = {}) {
  const cfg = resolveConfig(args.config);
  const date = resolveDate(cfg, args.date);
  const outDir = ensureOutDir();
  const judgmentsPath = materializeJudgments({
    judgments: args.judgments,
    judgmentsPath: args.judgmentsPath,
    outDir,
    date,
  });
  if (!judgmentsPath) {
    throw new Error(
      'apply_judgments requires `judgments` (array/JSONL) or `judgmentsPath`'
    );
  }
  // Validate against the current candidate set so the caller gets feedback
  // instead of silent drops.
  let validation = null;
  try {
    const cand = await runDigest({ cfg, date, outDir, stage: 'candidates' });
    const candidateIds = fs
      .readFileSync(cand.candidatesPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).id);
    validation = validateJudgments(
      parseJudgments(fs.readFileSync(judgmentsPath, 'utf8')),
      {
        candidateIds,
        minRelevance: cfg?.filter?.min_relevance ?? 0.5,
      }
    );
  } catch {
    // validation is advisory; proceed to render regardless
  }
  const result = await runDigest({
    cfg,
    date,
    outDir,
    stage: 'full',
    judgmentsPath,
  });
  const out = normalizeCliResult(result, { date, stage: 'full' });
  if (validation) out.validation = validation;
  return out;
}

export async function reachFetchTool(args = {}) {
  if (!args.platform) throw new Error('reach_fetch requires `platform`');
  const config = new ReachConfig();
  const items = await fetchViaReach({
    platform: args.platform,
    query: args.query || undefined,
    config,
    fetchedAt: new Date().toISOString(),
  });
  return { platform: args.platform, count: items.length, items };
}

// Tool descriptors (plain JSON Schema — consumed by the MCP server's ListTools).
export const TOOLS = [
  {
    name: 'run_digest',
    description:
      'Run the full digest (fetch → dedup → rank → render). Optionally pass agent judgments to gate relevance. Returns paths + counts.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'string',
          description:
            'Path to feeds.yaml (default config/feeds.yaml, falls back to the example).',
        },
        date: {
          type: 'string',
          description: 'YYYY-MM-DD or "today" (default).',
        },
        judgmentsPath: {
          type: 'string',
          description: 'Path to a judgments JSONL file.',
        },
        judgments: {
          type: 'array',
          description:
            'Inline judgments (array of {id,relevant,score,...}); written to out/ and applied.',
          items: { type: 'object' },
        },
      },
    },
    handler: runDigestTool,
  },
  {
    name: 'emit_candidates',
    description:
      'Emit the compact candidate list (post cheap pre-filters) plus a self-contained judging task. Step 1 of AI relevance filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        date: { type: 'string' },
      },
    },
    handler: emitCandidatesTool,
  },
  {
    name: 'apply_judgments',
    description:
      'Validate agent judgments against the current candidates, then render the digest with them. Step 3 of AI relevance filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        date: { type: 'string' },
        judgmentsPath: { type: 'string' },
        judgments: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: applyJudgmentsTool,
  },
  {
    name: 'reach_fetch',
    description:
      'One-off fetch of an auth-gated platform via the reach layer (OpenCLI browser bridge; desktop-only). Returns normalized FeedItems.',
    inputSchema: {
      type: 'object',
      required: ['platform'],
      properties: {
        platform: {
          type: 'string',
          description: 'e.g. reddit, hackernews, twitter, bilibili, 36kr',
        },
        query: { type: 'string', description: 'Optional search/topic query.' },
      },
    },
    handler: reachFetchTool,
  },
];

export async function dispatch(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args || {});
}
