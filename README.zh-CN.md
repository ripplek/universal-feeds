# universal-feeds

[English](README.md) | 中文

给 [Clawdbot/OpenClaw](https://github.com/jackwener/opencli) 用的信息聚合器。
它从中美一批平台抓取热榜、热搜和关注流，统一成同一套 `FeedItem` 结构，排序去重后
生成一份每日 Markdown 简报。

个人聚合器真正难的不是排序，而是跨平台拿到需要登录的内容。universal-feeds 直接抓公开源；
对需要登录的平台，则通过 OpenCLI 的浏览器桥接复用你已登录的真实 Chrome（reach 层），
而不是去凑各家的 API token。

## 能做什么

- **数据源** —— 原生支持 X（`bird` 或 reach）、RSS 源包、V2EX、YouTube、微信公众号专辑；
  再加 reach 层的 15 个需登录平台：Twitter、Reddit、B 站、小红书、Facebook、Instagram、
  LinkedIn、雪球、微博、Hacker News、Product Hunt、36 氪、掘金、TikTok、Substack。
- **统一结构** —— 每个源都归一到 `FeedItem`（见 `docs/SCHEMA.md`），排序、去重、渲染
  都不用关心条目来自哪里。
- **两种过滤** —— 默认是关键词/anchor 匹配（零配置）；也可以让 Clawdbot agent 按一段
  自然语言的兴趣画像给每条打相关性分（`filter.mode: llm`，见 `docs/FILTERING.md`）。
- **排序** —— 互动量 + 时效 + 每源权重/可靠度；去重时保留同一 URL 里信息更全的那条。
- **产物** —— `out/items-YYYY-MM-DD.jsonl` 和 `out/digest-YYYY-MM-DD.md`。

## 现状

已可用，自 2026 年初起作为每日简报自用。reach 层只能在桌面跑（复用运行中的 Chrome，
见 `docs/adr/0001-*.md`）；CI 跑单元测试加一个 digest 冒烟测试。公开源（RSS / YouTube /
V2EX / HN / 36 氪）不需登录，其余按需开启、前提是你已登录对应站点。

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
