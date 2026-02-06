#!/usr/bin/env node
// Minimal helper: print RSSHub base + docs pointers.
// (Future: query Radar rules and match by URL.)

import fs from 'node:fs';
import YAML from 'yaml';

const cfgPath = process.argv.includes('--config')
  ? process.argv[process.argv.indexOf('--config') + 1]
  : 'config/feeds.yaml';

let cfg = {};
try {
  const raw = fs.readFileSync(cfgPath, 'utf8');
  cfg = YAML.parse(raw);
} catch {
  // ignore
}

const base = (cfg?.rsshub?.base_url || 'https://rsshub.app').replace(/\/+$/, '');
const url = process.argv.find((a) => a.startsWith('http'));

console.log(`RSSHub base: ${base}`);
console.log(`Docs: https://docs.rsshub.app/`);
console.log(`Radar rules API: ${base}/api/radar/rules`);
if (url) {
  console.log(`\nInput URL: ${url}`);
  console.log(`Next: use RSSHub Radar (browser extension) or manually find a route in docs, then add to sources as:`);
  console.log(`\n  rsshub_route: <route>`);
  console.log(`\nExample:`);
  console.log(`  rsshub_route: telegram/channel/awesomeRSSHub`);
  console.log(`  # feed URL => ${base}/telegram/channel/awesomeRSSHub`);
}
