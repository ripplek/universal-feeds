// Thin, runtime-agnostic tool layer behind the MCP server (src/mcp/server.js).
//
// Each tool is an adapter: it maps MCP arguments onto the shared operations
// (src/operations.js) and returns a plain JSON-serializable object — no MCP
// types here, so the logic is unit-testable without a transport. The server
// file only maps these onto the MCP protocol.

import fs from 'node:fs';
import {
  resolveRunContext,
  emitCandidates,
  runFullDigest,
  applyJudgments,
} from '../operations.js';
import { ReachConfig } from '../reach/config.js';
import { fetchViaReach } from '../sources/reach.js';

const ctxOf = (args) =>
  resolveRunContext(args.config, args.date, {
    explicitConfig: typeof args.config === 'string' && args.config.length > 0,
  });

export async function runDigestTool(args = {}) {
  const ctx = ctxOf(args);
  if (args.judgments != null || args.judgmentsPath) {
    // Judgments imply the run-bound path — same contract as apply_judgments.
    return applyJudgments(ctx, {
      judgments: args.judgments,
      judgmentsPath: args.judgmentsPath,
      runId: args.runId,
      allowConfigDrift: args.allowConfigDrift === true,
    });
  }
  return runFullDigest(ctx, {});
}

export async function emitCandidatesTool(args = {}) {
  const ctx = ctxOf(args);
  const out = await emitCandidates(ctx, { refetch: args.refetch === true });
  // Inline the judging task so an MCP client needn't read the file separately.
  try {
    out.judgingTask = JSON.parse(fs.readFileSync(out.judgingTaskPath, 'utf8'));
  } catch {
    // best effort
  }
  return out;
}

export async function applyJudgmentsTool(args = {}) {
  const ctx = ctxOf(args);
  // Bound to the run the judgments were written against (runId required in
  // llm/hybrid mode — echo judgingTask.runId; "today" may have rolled over).
  return applyJudgments(ctx, {
    judgments: args.judgments,
    judgmentsPath: args.judgmentsPath,
    runId: args.runId,
    allowConfigDrift: args.allowConfigDrift === true,
  });
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
            'Inline judgments (array of {id,relevant,score,...}); written into the run dir and applied.',
          items: { type: 'object' },
        },
        runId: {
          type: 'string',
          description:
            'Run to bind to (from emit_candidates / judgingTask.runId). Required with judgments in llm/hybrid mode.',
        },
      },
    },
    handler: runDigestTool,
  },
  {
    name: 'emit_candidates',
    description:
      "Create (or reuse) the day's run snapshot and emit the candidate list plus a self-contained judging task. Step 1 of AI relevance filtering. Returns runId — echo it to apply_judgments.",
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        date: { type: 'string' },
        refetch: {
          type: 'boolean',
          description:
            "Force a fresh snapshot instead of reusing the day's run.",
        },
      },
    },
    handler: emitCandidatesTool,
  },
  {
    name: 'apply_judgments',
    description:
      'Validate agent judgments against their run snapshot, then render the digest. Step 3 of AI relevance filtering. Pass the runId returned by emit_candidates (required in llm/hybrid mode — do not re-resolve "today").',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        date: { type: 'string' },
        judgmentsPath: { type: 'string' },
        judgments: { type: 'array', items: { type: 'object' } },
        runId: {
          type: 'string',
          description: 'Run to bind to (echo judgingTask.runId).',
        },
        allowConfigDrift: {
          type: 'boolean',
          description:
            'Render even if filter/topics config changed since the run was judged.',
        },
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
