// Reach environment health checker — powered by channels.
//
// Ported from Agent-Reach (github.com/Panniantong/Agent-Reach, MIT).
// Each channel checks itself; doctor collects results. A single misbehaving
// channel must never take the whole report down.

import { checkChannel } from './channels/base.js';
import { getAllChannels } from './channels/index.js';

export function checkAll(config = null, deps = {}) {
  const results = {};
  for (const ch of getAllChannels()) {
    try {
      const { status, message, activeBackend } = checkChannel(ch, config, deps);
      results[ch.name] = {
        status,
        message,
        activeBackend,
        description: ch.description,
        tier: ch.tier,
        backends: ch.backends,
      };
    } catch (e) {
      results[ch.name] = {
        status: 'error',
        message: `check failed: ${e?.message || e}`,
        activeBackend: null,
        description: ch.description,
        tier: ch.tier,
        backends: ch.backends,
      };
    }
  }
  return results;
}

const ICON = { ok: '✅', warn: '[!]', off: '[X]', error: '[E]' };

export function formatReport(results) {
  const lines = [];
  lines.push('universal-feeds · reach status');
  lines.push('='.repeat(40));
  lines.push(
    'legend: ✅ ready  [!] installed, needs login/setup  [X] unavailable  [E] error'
  );
  lines.push('');

  let ok = 0;
  for (const [name, r] of Object.entries(results)) {
    if (r.status === 'ok') ok += 1;
    let line = `${ICON[r.status] || '?'} ${name} — ${r.description}: ${r.message}`;
    if (r.activeBackend && (r.backends || []).length > 1) {
      line += ` (backend: ${r.activeBackend})`;
    }
    lines.push(line);
  }

  lines.push('');
  lines.push(`${ok}/${Object.keys(results).length} channels ready`);
  return lines.join('\n');
}
