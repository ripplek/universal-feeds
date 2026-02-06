function h(cfg, en, zh) {
  return cfg?.output?.language === 'zh' ? zh : en;
}

function fmtItem(item) {
  const title = item.title?.trim();
  const text = item.text?.trim();
  const head = title || (text ? text.slice(0, 140) : '(no text)');
  const author = item.author?.handle || item.author?.name;
  const score = typeof item.score === 'number' ? item.score.toFixed(2) : '';
  return `- ${head}${author ? ` — ${author}` : ''} (score ${score})\n  ${item.url}`;
}

export function renderDigestMarkdown(items, { cfg, date, fetchedAt }) {
  const title = h(cfg, `Daily Digest — ${date}`, `每日简报 — ${date}`);
  const subtitle = h(cfg, `Fetched at: ${fetchedAt}`, `抓取时间：${fetchedAt}`);
  const sectionX = h(cfg, 'X (Following)', 'X（关注）');

  const xItems = items.filter((x) => x.platform === 'x');

  let md = `# ${title}\n\n${subtitle}\n\n`;
  md += `## ${sectionX}\n\n`;
  if (!xItems.length) {
    md += h(cfg, '_No items._\n', '_暂无内容。_\n');
  } else {
    md += xItems.map(fmtItem).join('\n') + '\n';
  }

  return md;
}
