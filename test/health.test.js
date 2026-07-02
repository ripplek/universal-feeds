import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceHealth,
  overallHealth,
  formatHealthLine,
} from '../src/health.js';

test('severity is judged on fetched, not candidates: empty source → warning', () => {
  const entries = buildSourceHealth({
    perSource: [
      { source: 'v2ex', platform: 'v2ex', fetched: 0 },
      { source: 'rss', platform: 'rss', fetched: 12 },
    ],
    cfg: {},
  });
  assert.equal(entries.find((e) => e.platform === 'v2ex').severity, 'warning');
  assert.equal(entries.find((e) => e.platform === 'rss').severity, 'ok');
  assert.equal(overallHealth(entries), 'warning');
});

test('fetch error or unavailable channel → error → overall degraded', () => {
  const entries = buildSourceHealth({
    perSource: [
      {
        source: 'reach',
        platform: 'youtube',
        channel: 'youtube',
        fetched: 0,
        outcome: 'unavailable',
        message: 'asleep',
      },
      {
        source: 'reach',
        platform: 'reddit',
        channel: 'reddit',
        fetched: 0,
        error: 'spawn failed',
      },
      { source: 'rss', platform: 'rss', fetched: 3 },
    ],
    cfg: {},
  });
  assert.equal(entries.find((e) => e.platform === 'youtube').severity, 'error');
  assert.equal(entries.find((e) => e.platform === 'reddit').severity, 'error');
  assert.equal(overallHealth(entries), 'degraded');
});

test('misconfiguration outcomes (no-command / missing-query) are errors', () => {
  const entries = buildSourceHealth({
    perSource: [
      {
        source: 'reach',
        platform: 'xiaohongshu',
        channel: 'xiaohongshu',
        fetched: 0,
        outcome: 'missing-query',
      },
    ],
    cfg: {},
  });
  assert.equal(entries[0].severity, 'error');
  assert.match(entries[0].message, /missing-query/);
});

test('optional sources are demoted to info and never lift overall health', () => {
  const cfg = { platforms: { tiktok: { health: 'optional' } } };
  const entries = buildSourceHealth({
    perSource: [
      {
        source: 'reach',
        platform: 'tiktok',
        channel: 'tiktok',
        fetched: 0,
        error: 'boom',
      },
      { source: 'rss', platform: 'rss', fetched: 5 },
    ],
    cfg,
  });
  const tk = entries.find((e) => e.platform === 'tiktok');
  assert.equal(tk.severity, 'info');
  assert.equal(tk.optional, true);
  assert.equal(overallHealth(entries), 'ok');
});

test('per-feed rss detail is carried through', () => {
  const entries = buildSourceHealth({
    perSource: [
      {
        source: 'rss',
        platform: 'rss',
        fetched: 10,
        feeds: [
          { feed: 'Anthropic', fetched: 0, error: 'timeout' },
          { feed: 'TechCrunch', fetched: 10 },
        ],
      },
    ],
    cfg: {},
  });
  assert.equal(entries[0].feeds.length, 2);
  assert.equal(entries[0].feeds[0].error, 'timeout');
});

test('formatHealthLine names empty and broken platforms; silent when healthy', () => {
  const cfg = { output: { language: 'zh' } };
  const entries = buildSourceHealth({
    perSource: [
      { source: 'v2ex', platform: 'v2ex', fetched: 0 },
      {
        source: 'reach',
        platform: 'youtube',
        channel: 'youtube',
        fetched: 0,
        error: 'x',
      },
      { source: 'rss', platform: 'rss', fetched: 9 },
    ],
    cfg,
  });
  const line = formatHealthLine(entries, cfg);
  assert.match(line, /v2ex/);
  assert.match(line, /youtube/);
  assert.equal(
    formatHealthLine(
      buildSourceHealth({
        perSource: [{ source: 'rss', platform: 'rss', fetched: 9 }],
        cfg,
      }),
      cfg
    ),
    ''
  );
});
