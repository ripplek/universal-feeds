import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { runDigest } from './pipeline.js';

function parseArgs(argv) {
  const args = { config: 'config/feeds.yaml', date: 'today' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i] || args.config;
    else if (a === '--date') args.date = argv[++i] || args.date;
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
    day: '2-digit'
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: universal-feeds --config <path> [--date today|YYYY-MM-DD]\n`);
    console.log(`Tip: copy config/feeds.example.yaml to config/feeds.yaml`);
    return;
  }

  // Allow using example config without copying.
  const configPath = fs.existsSync(args.config)
    ? args.config
    : 'config/feeds.example.yaml';

  const cfg = loadConfig(configPath);
  const tz = cfg?.output?.tz || 'Asia/Shanghai';
  const date = args.date === 'today' ? ymdInTz(new Date(), tz) : args.date;

  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });

  const result = await runDigest({ cfg, date, outDir });
  console.log(`Wrote: ${result.itemsPath}`);
  console.log(`Wrote: ${result.digestPath}`);
}
