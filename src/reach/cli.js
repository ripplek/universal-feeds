// `digest reach <cmd>` — manage the auth-gated fetch layer.
//
//   digest reach doctor    health report for all reach channels
//   digest reach configure <key> <value>   set a reach config value (0o600)
//   digest reach fetch <platform> [query]  one-off fetch (prints JSONL)

import { ReachConfig } from './config.js';
import { checkAll, formatReport } from './doctor.js';
import { runWatch } from './watch.js';
import { fetchViaReach } from '../sources/reach.js';

function help() {
  return [
    'Usage: digest reach <command>',
    '',
    '  doctor                         Show reach channel health',
    '  watch                          Compact health + update check (cron-friendly exit code)',
    '  configure <key> <value>        Set a reach config value (~/.universal-feeds/config.yaml)',
    '  fetch <platform> [query]       One-off fetch; prints normalized FeedItem JSONL',
    '',
  ].join('\n');
}

export async function runReachCommand(argv) {
  const [cmd, ...rest] = argv;
  const config = new ReachConfig();

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(help());
    return;
  }

  if (cmd === 'doctor') {
    console.log(formatReport(checkAll(config)));
    return;
  }

  if (cmd === 'watch') {
    await runWatch({ config });
    return;
  }

  if (cmd === 'configure') {
    const [key, ...valueParts] = rest;
    if (!key || valueParts.length === 0) {
      console.error('Usage: digest reach configure <key> <value>');
      process.exitCode = 1;
      return;
    }
    config.set(key, valueParts.join(' '));
    console.log(`Set ${key} in ${config.configPath}`);
    return;
  }

  if (cmd === 'fetch') {
    const [platform, ...queryParts] = rest;
    if (!platform) {
      console.error('Usage: digest reach fetch <platform> [query]');
      process.exitCode = 1;
      return;
    }
    const query = queryParts.join(' ') || undefined;
    const items = await fetchViaReach({
      platform,
      query,
      config,
      fetchedAt: new Date().toISOString(),
    });
    for (const it of items) console.log(JSON.stringify(it));
    console.error(`# ${items.length} items from ${platform}`);
    return;
  }

  console.error(`Unknown reach command: ${cmd}\n\n${help()}`);
  process.exitCode = 1;
}
