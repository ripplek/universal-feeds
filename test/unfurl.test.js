import test from 'node:test';
import assert from 'node:assert/strict';
import { unfurlUrl } from '../src/unfurl.js';

test('unfurlUrl extracts title + og description (mocked fetch)', async () => {
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="Hello World" />
    <meta property="og:description" content="Desc" />
    <title>Ignored</title>
  </head><body>ok</body></html>`;

  const fetchImpl = async (url) => {
    return {
      url,
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
      arrayBuffer: async () => new TextEncoder().encode(html).buffer
    };
  };

  const out = await unfurlUrl('https://t.co/x', { fetchImpl, timeoutMs: 1000 });
  assert.equal(out.title, 'Hello World');
  assert.equal(out.description, 'Desc');
});
