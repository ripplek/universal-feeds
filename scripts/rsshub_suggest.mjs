#!/usr/bin/env node
// RSSHub route helper (best-effort)
//
// Strategy:
// - RSSHub public instance API may 403; fall back to parsing RSSHub-Radar default rules from GitHub.
// - We do a *text-level* extraction to surface candidate docs/routes quickly.
// - Not all rules have a static target route (many are functions); for those we still show docs links.

import fs from 'node:fs';
import path from 'node:path';
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
const inputUrl = process.argv.find((a) => a.startsWith('http'));
const keyword = !inputUrl ? process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.includes('config') && !a.includes('.yaml'))[0] : null;

console.log(`RSSHub base: ${base}`);
console.log(`Docs: https://docs.rsshub.app/`);
console.log(`Radar rules API (may be blocked): ${base}/api/radar/rules`);

if (!inputUrl && !keyword) {
  console.log('\nUsage:');
  console.log('  scripts/rsshub_suggest.mjs --config config/feeds.yaml <url>');
  console.log('  scripts/rsshub_suggest.mjs --config config/feeds.yaml <keyword>');
  process.exit(0);
}

if (keyword) {
  console.log(`\nKeyword: ${keyword}`);
}

let host = null;
let baseDomain = null;
if (inputUrl) {
  const u = new URL(inputUrl);
  host = u.hostname;
  baseDomain = host.split('.').slice(-2).join('.');

  console.log(`\nInput URL: ${inputUrl}`);
  console.log(`Host: ${host} (base: ${baseDomain})`);
}

const CACHE_DIR = path.resolve('out', 'cache');
const CACHE_PATH = path.join(CACHE_DIR, 'rsshub-radar-rules.ts');
const RULES_RAW_URL = 'https://raw.githubusercontent.com/DIYgod/RSSHub-Radar/master/src/lib/radar-rules.ts';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'universal-feeds/0.1' } });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return await res.text();
}

async function loadRulesText() {
  // Try cache first (fresh enough for day-to-day use)
  try {
    const t = fs.readFileSync(CACHE_PATH, 'utf8');
    if (t && t.length > 1000) return t;
  } catch {}

  // Fetch from GitHub raw
  const t = await fetchText(RULES_RAW_URL);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, t, 'utf8');
  return t;
}

function sliceDomainBlock(text, domain) {
  const key = `\"${domain}\"`;
  const idx = text.indexOf(key);
  if (idx === -1) return null;

  // Heuristic: domain blocks start at two-space indentation: "  \"domain\": {"
  const start = text.lastIndexOf('\n', idx);
  const after = text.slice(idx);

  // Find next domain block at the same indentation.
  const next = after.slice(1).search(/\n\s{2}\"[^\"]+\"\s*:\s*\{/);
  const end = next === -1 ? text.length : idx + 1 + next;
  return text.slice(start, end);
}

function extractCandidates(block) {
  const out = [];

  // Extract (title, docs, target) triples by loose proximity.
  const itemRe = /\{\s*\n\s*title:\s*\"([^\"]+)\"[\s\S]*?docs:\s*\"([^\"]+)\"[\s\S]*?(target:\s*(\([^\)]*\)\s*=>\s*\`[^\`]+\`|\"[^\"]+\"|\'[^\']+\'))?/g;
  let m;
  while ((m = itemRe.exec(block))) {
    const title = m[1];
    const docs = m[2];
    const targetRaw = m[4] || '';

    // If target is a plain string like "/163/dy2/:id" we can show it.
    let route = null;
    const s = targetRaw.trim();
    if (s.startsWith('"') || s.startsWith('\'')) {
      route = s.slice(1, -1);
    }

    out.push({ title, docs, route });
    if (out.length >= 20) break;
  }

  // If the regex fails, at least return docs links
  if (!out.length) {
    const docsRe = /docs:\s*\"([^\"]+)\"/g;
    while ((m = docsRe.exec(block))) {
      out.push({ title: '(route)', docs: m[1], route: null });
      if (out.length >= 20) break;
    }
  }

  // de-dupe by docs
  const seen = new Set();
  return out.filter((x) => {
    if (!x.docs) return false;
    if (seen.has(x.docs)) return false;
    seen.add(x.docs);
    return true;
  });
}

let rulesText;
try {
  rulesText = await loadRulesText();
} catch (e) {
  console.log(`\nFailed to load RSSHub-Radar rules from GitHub: ${e?.message || e}`);
  console.log('Fallback: search routes manually: https://docs.rsshub.app/routes/');
  process.exit(0);
}

if (inputUrl) {
  let block = sliceDomainBlock(rulesText, host);
  if (!block && baseDomain && baseDomain !== host) block = sliceDomainBlock(rulesText, baseDomain);

  if (!block) {
    console.log(`\nNo Radar rules block found for ${host}.`);
    console.log('Try manual route search: https://docs.rsshub.app/routes/');
    process.exit(0);
  }

  const cands = extractCandidates(block);
  console.log(`\nCandidates from RSSHub-Radar rules (${cands.length}):`);
  for (const c of cands.slice(0, 10)) {
    console.log(`\n- ${c.title}`);
    console.log(`  docs: ${c.docs}`);
    if (c.route) console.log(`  route: ${c.route}`);
  }

  console.log(`\nTo use in sources/*.yaml:`);
  console.log(`  rsshub_route: <route>`);
  console.log(`  # feed URL => ${base}/<route>`);
} else if (keyword) {
  // Keyword search: show docs links that mention the keyword.
  const kw = keyword.toLowerCase();
  const hits = [];
  const docsRe = /docs:\s*\"([^\"]+)\"/g;
  let m;
  while ((m = docsRe.exec(rulesText))) {
    const docs = m[1];
    const window = rulesText.slice(Math.max(0, m.index - 200), m.index + 200).toLowerCase();
    if (window.includes(kw)) hits.push(docs);
    if (hits.length >= 30) break;
  }
  const uniq = [...new Set(hits)];
  console.log(`\nDocs hits (${uniq.length}):`);
  for (const d of uniq.slice(0, 15)) console.log(`- ${d}`);
  if (!uniq.length) console.log('  (no matches)');
  console.log('\nTip: open a docs link above and copy a route into sources as rsshub_route.');
}
