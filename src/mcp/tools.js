// Thin, runtime-agnostic tool layer behind the MCP server (src/mcp/server.js).
//
// Each tool is an adapter: it maps MCP arguments onto the shared operations
// (src/operations.js) and returns a plain JSON-serializable object — no MCP
// types here, so the logic is unit-testable without a transport. The server
// file only maps these onto the MCP protocol.

import fs from 'node:fs';
import {
  resolveRunContext,
  materializeJudgments,
  emitCandidates,
  runFullDigest,
  applyJudgments,
} from '../operations.js';
import { ReachConfig } from '../reach/config.js';
import { fetchViaReach } from '../sources/reach.js';

export async function runDigestTool(args = {}) {
  const ctx = resolveRunContext(args.config, args.date);
  const judgmentsPath = materializeJudgments({
    judgments: args.judgments,
    judgmentsPath: args.judgmentsPath,
    outDir: ctx.outDir,
    date: ctx.date,
  });
  return runFullDigest(ctx, { judgmentsPath });
}

export async function emitCandidatesTool(args = {}) {
  const ctx = resolveRunContext(args.config, args.date);
  const out = await emitCandidates(ctx);
  // Inline the judging task so an MCP client needn't read the file separately.
  try {
    out.judgingTask = JSON.parse(fs.readFileSync(out.judgingTaskPath, 'utf8'));
  } catch {
    // best effort
  }
  return out;
}

export async function applyJudgmentsTool(args = {}) {
  const ctx = resolveRunContext(args.config, args.date);
  // Single fetch: validate + render share one candidate set (see operations.js).
  return applyJudgments(ctx, {
    judgments: args.judgments,
    judgmentsPath: args.judgmentsPath,
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
