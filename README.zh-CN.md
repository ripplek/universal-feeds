# universal-feeds

[English](README.md) | 中文

给 [Clawdbot/OpenClaw](https://github.com/jackwener/opencli) 用的信息聚合器。
它从中美一批平台抓取热榜、热搜和关注流，统一成同一套 `FeedItem` 结构，排序去重后
生成一份每日 Markdown 简报。

个人聚合器真正难的不是排序，而是跨平台拿到需要登录的内容。universal-feeds 直接抓公开源；
对需要登录的平台，则通过 OpenCLI 的浏览器桥接复用你已登录的真实 Chrome（reach 层），
而不是去凑各家的 API token。

## 能做什么

- **数据源** —— 原生支持 X（`bird` 或 reach）、RSS 源包、V2EX；
  再加 reach 层的 34 个平台（OpenCLI，桌面端）：YouTube、Twitter、Reddit、B 站、小红书、Facebook、Instagram、
  LinkedIn、雪球、微博、知乎、Medium、即刻、LINUX DO，以及免登录的科技/AI/学术源 ——
  GitHub Trending、arXiv、dblp、Google Scholar、PubMed、Stack Overflow、Lobsters、DEV、LessWrong、
  OpenReview、AIbase、今日头条、BBC、Bloomberg、Hacker News、Product Hunt、36 氪、掘金、TikTok、Substack。
- **统一结构** —— 每个源都归一到 `FeedItem`（见 `docs/SCHEMA.md`），排序、去重、渲染
  都不用关心条目来自哪里。
- **两种过滤** —— 默认是关键词/anchor 匹配（零配置）；也可以让 Clawdbot agent 按一段
  自然语言的兴趣画像给每条打相关性分（`filter.mode: llm`，见 `docs/FILTERING.md`）。
- **排序** —— 互动量 + 时效 + 每源权重/可靠度；去重时保留同一 URL 里信息更全的那条。
- **产物** —— `out/items-YYYY-MM-DD.jsonl`、面向读者的
  `out/digest-YYYY-MM-DD.md`（清洗去重、按主题组织），以及
  `out/digest-inspection-YYYY-MM-DD.md`（同一批条目，带分数、标签、命中词，供调试排序用）。

## 现状

已可用，自 2026 年初起作为每日简报自用。reach 层只能在桌面跑（复用运行中的 Chrome，
见 `docs/adr/0001-*.md`）；CI 跑单元测试加一个 digest 冒烟测试。公开源（RSS /
V2EX / HN / 36 氪）不需登录，其余（含 YouTube）按需开启、前提是你已登录对应站点。

## 实际效果

这是一次真实运行、未经编辑——2026-07-08，`filter.mode: hybrid`，启用了 9 个源
（RSS + V2EX + 8 个 reach 渠道）：**203 条候选 → 渲染出 40 条**，数据源健康横幅
把 `v2ex` 的空抓取直接曝光出来，而不是悄悄生成一份变薄的简报：

```text
# 每日简报 — 2026-07-08

> ⚠ 数据源健康 — 今日无产出：v2ex

## Agentic AI / 工作流

- 我们常用的Fable 5使用模式之一：把它当"顾问"——由执行者（Sonnet 5）调用Fable 5获取指导 — ClaudeDevs (X, 2026-07-07)
  https://x.com/ClaudeDevs/status/2074606058128224365
- Anthropic将Claude Cowork上线移动端和网页端 (RSS, 2026-07-07)
  https://www.theverge.com/ai-artificial-intelligence/961978/anthropic-claude-cowork-mobile-web
```

完整简报、运行报告，以及一张早期截图见
[`docs/SHOWCASE.md`](docs/SHOWCASE.md)。

## 快速开始

```bash
npm ci
cp config/feeds.example.yaml config/feeds.yaml   # 然后按需改偏好
node bin/digest --config config/feeds.yaml --date today
```

这会把今天的简报写进 `out/`。想先不带话题过滤试一下：

```bash
node bin/digest --config config/feeds.demo.yaml --date today
```

完整配置——reach 平台、AI 过滤、定时投递——见 [`INSTALL.md`](INSTALL.md)。
日常更新维护见 [`UPDATE.md`](UPDATE.md)。

## reach 层（需登录的平台）

```bash
node bin/digest reach doctor    # 各渠道健康状况
node bin/digest reach watch     # 紧凑健康 + 更新检查（适合 cron）
node bin/digest reach fetch reddit "AI agents"   # 单次抓取 → FeedItem JSONL
```

需要装好 OpenCLI 及其 Chrome 扩展，在你已登录目标站点的桌面上运行。
细节见 [`docs/REACH.md`](docs/REACH.md)。

## 配置

配置是 YAML，从 `config/feeds.example.yaml` 开始。单个源条目可带质量参数：

```yaml
- name: OpenAI News
  url: https://openai.com/news/rss.xml
  type: rss
  weight: 1.2 # 排序偏好
  reliability: 1.0 # 0..1 稳定性/可信度
  tags: [ai, model-releases]
```

按源开启需登录的平台：

```yaml
platforms:
  reddit:
    reach:
      enabled: true
      mode: search # feed | search | trending
      query: 'AI agents'
      tags: [ai]
```

## 文档

| 主题            | 文件                                           |
| --------------- | ---------------------------------------------- |
| 展示 / 真实运行 | [`docs/SHOWCASE.md`](docs/SHOWCASE.md)         |
| 安装 / 配置     | [`INSTALL.md`](INSTALL.md)                     |
| 更新 / 维护     | [`UPDATE.md`](UPDATE.md)                       |
| reach 层        | [`docs/REACH.md`](docs/REACH.md)               |
| 相关性过滤      | [`docs/FILTERING.md`](docs/FILTERING.md)       |
| 条目结构        | [`docs/SCHEMA.md`](docs/SCHEMA.md)             |
| 配置参考        | [`docs/CONFIG.md`](docs/CONFIG.md)             |
| 架构            | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 路线图          | [`docs/ROADMAP.md`](docs/ROADMAP.md)           |
| 决策记录（ADR） | [`docs/adr/`](docs/adr/)                       |

## 贡献 / 安全 / 许可

见 [`CONTRIBUTING.md`](CONTRIBUTING.md)、[`SECURITY.md`](SECURITY.md) 和
[`LICENSE`](LICENSE)（MIT）。reach 层移植自
[Agent-Reach](https://github.com/Panniantong/Agent-Reach)（MIT）。
