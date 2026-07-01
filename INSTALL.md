# Install

English below · [中文见下](#安装)

## English

### 1. Prerequisites

- Node.js 20+ (the CLI uses the built-in test runner and `fetch`).
- macOS or Linux. The reach layer is desktop-only — skip it on a headless box.

### 2. Get the code and dependencies

```bash
git clone https://github.com/ripplek/universal-feeds.git
cd universal-feeds
npm ci
```

Verify:

```bash
npm test          # unit tests + a digest smoke run
node bin/digest --help
```

### 3. Configure your digest

```bash
cp config/feeds.example.yaml config/feeds.yaml
```

Edit `config/feeds.yaml`: pick platforms, topics, and `output` options. Run it:

```bash
node bin/digest --config config/feeds.yaml --date today
# → out/items-<date>.jsonl, out/digest-<date>.md
```

Public sources (RSS, V2EX, Hacker News, 36Kr) work with no further
setup. `config/feeds.yaml` is git-ignored — it's your private config.
(YouTube is served via the reach layer — desktop-only; see `docs/REACH.md`.)

### 4. Reach layer (optional, for auth-gated platforms)

Needed for Reddit, Weibo, Xiaohongshu, Bilibili, X-following, etc. One-time,
desktop only:

1. Install OpenCLI: `npm install -g @jackwener/opencli`
2. Install its Chrome extension (one manual click):
   <https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk>
3. Log into the target sites in that Chrome profile. Small/dedicated accounts are
   safer against platform detection.
4. Check health:

```bash
node bin/digest reach doctor
```

Then enable a platform in `config/feeds.yaml`:

```yaml
platforms:
  reddit:
    reach:
      enabled: true
      mode: search # feed | search | trending
      query: 'AI agents'
      tags: [ai]
```

More in [`docs/REACH.md`](docs/REACH.md).

### 5. AI relevance filtering (optional)

Instead of keyword matching, let a Clawdbot agent judge relevance against a
natural-language profile. In `config/feeds.yaml`:

```yaml
filter:
  mode: llm # keyword | llm | hybrid
  model: claude-haiku-4-5
  profile: |
    I care about agentic AI, model releases, dev tooling; not crypto or ads.
```

The run becomes a three-step hand-off (candidates → agent judges → render). The
contract is in [`docs/FILTERING.md`](docs/FILTERING.md) and
`skill/universal-feeds/SKILL.md`.

### 6. Install as a Clawdbot skill (optional)

```bash
bash scripts/install_skill.sh
```

### 7. Scheduled delivery (optional)

Run the digest on a schedule with `cron`. Keyword mode works headless; reach and
LLM modes must run on the desktop where Chrome is logged in. Example (daily 08:00):

```cron
0 8 * * *  cd /path/to/universal-feeds && /usr/bin/node bin/digest --config config/feeds.yaml --date today >> out/cron.log 2>&1
```

Pipe `out/digest-<date>.md` into your messaging channel of choice.

---

## 安装

### 1. 前置条件

- Node.js 20+（CLI 用到内置测试运行器和 `fetch`）。
- macOS 或 Linux。reach 层只能在桌面运行，无头机器上跳过。

### 2. 拉代码、装依赖

```bash
git clone https://github.com/ripplek/universal-feeds.git
cd universal-feeds
npm ci
```

验证：

```bash
npm test          # 单元测试 + 一次 digest 冒烟
node bin/digest --help
```

### 3. 配置简报

```bash
cp config/feeds.example.yaml config/feeds.yaml
```

改 `config/feeds.yaml`：选平台、话题和 `output` 选项。跑：

```bash
node bin/digest --config config/feeds.yaml --date today
# → out/items-<date>.jsonl、out/digest-<date>.md
```

公开源（RSS、V2EX、Hacker News、36 氪）不用再配。`config/feeds.yaml`
已在 gitignore 里，是你的私有配置。（YouTube 走 reach 层，仅桌面端，见 `docs/REACH.md`。）

### 4. reach 层（可选，用于需登录的平台）

Reddit、微博、小红书、B 站、X 关注流等需要它。一次性设置，仅桌面：

1. 装 OpenCLI：`npm install -g @jackwener/opencli`
2. 装它的 Chrome 扩展（需手动点一次）：
   <https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk>
3. 在那个 Chrome 里登录目标站点。用小号更能规避平台风控。
4. 查健康：

```bash
node bin/digest reach doctor
```

然后在 `config/feeds.yaml` 里开启某个平台：

```yaml
platforms:
  reddit:
    reach:
      enabled: true
      mode: search # feed | search | trending
      query: 'AI agents'
      tags: [ai]
```

更多见 [`docs/REACH.md`](docs/REACH.md)。

### 5. AI 相关性过滤（可选）

不用关键词匹配，改由 Clawdbot agent 按一段自然语言画像判断相关性。在 `config/feeds.yaml`：

```yaml
filter:
  mode: llm # keyword | llm | hybrid
  model: claude-haiku-4-5
  profile: |
    我关注 agentic AI、模型发布、dev tooling；不关心币圈和带货。
```

这时一次运行变成三段 hand-off（候选 → agent 判审 → 渲染）。契约见
[`docs/FILTERING.md`](docs/FILTERING.md) 和 `skill/universal-feeds/SKILL.md`。

### 6. 作为 Clawdbot skill 安装（可选）

```bash
bash scripts/install_skill.sh
```

### 7. 定时投递（可选）

用 `cron` 定时跑。关键词模式可无头运行；reach 和 LLM 模式必须在已登录 Chrome 的桌面上跑。
示例（每天 08:00）：

```cron
0 8 * * *  cd /path/to/universal-feeds && /usr/bin/node bin/digest --config config/feeds.yaml --date today >> out/cron.log 2>&1
```

把 `out/digest-<date>.md` 接到你想要的消息渠道。
