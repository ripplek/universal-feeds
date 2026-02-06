import { spawn } from 'node:child_process';

function execBird(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('bird', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', (e) => reject(new Error(`bird spawn failed: ${e.message}`)));
    p.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code !== 0) {
        reject(new Error(`bird failed (code ${code})\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function toIso(createdAt) {
  if (!createdAt) return undefined;
  const d = new Date(createdAt);
  return isNaN(d) ? undefined : d.toISOString();
}

function toUrl(username, id) {
  if (!username || !id) return undefined;
  return `https://x.com/${username}/status/${id}`;
}

function normalizeTweet(t, fetchedAt) {
  const id = t.id;
  const username = t.author?.username;
  const url = toUrl(username, id) || t.url;
  const text = (t.text || '').replace(/\s+/g, ' ').trim();

  return {
    platform: 'x',
    sourceType: 'following',
    source: { name: 'X Following' },
    id: String(id),
    url,
    text,
    author: {
      name: t.author?.name,
      handle: username ? `@${username}` : undefined
    },
    publishedAt: toIso(t.createdAt),
    fetchedAt,
    metrics: {
      like: t.likeCount ?? 0,
      repost: t.retweetCount ?? 0,
      reply: t.replyCount ?? 0,
      quote: t.quoteCount ?? 0
    }
  };
}

export async function fetchXFollowing({ limit = 200, mode = 'following', fetchedAt, timeoutMs = 60000 }) {
  const args = ['home'];
  if (mode === 'following') args.push('--following');
  args.push('-n', String(limit), '--json-full', '--plain', '--quote-depth', '0');
  if (timeoutMs && Number.isFinite(timeoutMs)) args.push('--timeout', String(timeoutMs));

  // Note: bird may emit warnings to stderr about Safari cookies; that’s fine.
  const { stdout } = await execBird(args);

  // bird may print warnings to stdout (e.g. Safari cookie EPERM).
  // Robust strategy: find the first line that *starts* with JSON.
  // Use the first non-whitespace '{' or '[' as the JSON start.
  // This is robust even if tweets contain '[' in their text.
  const m = /[\[{]/.exec(stdout);
  const jsonText = m ? stdout.slice(m.index).trim() : stdout.trim();

  let arr;
  try {
    arr = JSON.parse(jsonText);
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(`bird output not JSON after stripping warnings: ${msg}\n(first 200 chars): ${jsonText.slice(0, 200)}`);
  }

  if (!Array.isArray(arr)) return [];

  // Minimal spam filter (MVP): drop obvious token shill / address spam.
  const spamRe = /(airdrop|\bpump\b|\bca:\b|0x[a-fA-F0-9]{10,}|\$[A-Z]{2,8}\b.*\$[A-Z]{2,8}\b)/i;

  return arr
    .map((t) => normalizeTweet(t, fetchedAt))
    .filter((x) => x.url && (x.text || '').length > 0)
    .filter((x) => !spamRe.test(x.text));
}
