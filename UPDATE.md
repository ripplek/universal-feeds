# Update & maintain

English below · [中文见下](#更新与维护)

## English

### Update the code

```bash
git pull
npm ci          # re-sync dependencies if package-lock changed
npm test        # unit tests + digest smoke — confirm nothing broke
```

`config/feeds.yaml` is git-ignored, so a pull never touches your preferences.
When `config/feeds.example.yaml` changes, diff it against your `feeds.yaml` to
pick up new options.

### Keep the reach layer healthy

The reach layer depends on OpenCLI + a logged-in Chrome, both of which drift over
time (Chrome updates, sessions expire, sites change). Check it before you rely on
a run:

```bash
node bin/digest reach doctor    # per-channel status
node bin/digest reach watch     # compact health + OpenCLI update check; exit≠0 if unhealthy
```

`reach watch` is cron-friendly — its non-zero exit lets a scheduler alert you.

Update OpenCLI itself when `watch` reports a new version:

```bash
npm install -g @jackwener/opencli
```

If a channel goes quiet, the usual causes, in order: the session expired
(re-login in Chrome), the extension worker was asleep (any real call wakes it),
or an RSS pack already covers the same URLs so the reach copy is de-duped away
(see the Reliability note in [`docs/REACH.md`](docs/REACH.md)).

### Add or tune a source

- Native source: add a descriptor in `src/fetch_sources.js` (`{ id, enabled,
fetch }`) — the pipeline picks it up with no other edits.
- Reach platform: add a channel descriptor in `src/reach/channels/index.js`.
  OpenCLI ships adapters for far more platforms than are wired here; `opencli
list` shows them.
- Field mapping is defensive (`src/reach/normalize.js`), so a new platform
  usually normalizes with no code change; add column aliases only if a field is
  missed.

After any change: `npm test`, then a live `node bin/digest reach fetch <platform>`
to confirm the mapping.

### Routine checks

- `npm test` after every change (the pre-commit hook runs unit tests too).
- Re-run `reach doctor` after a Chrome or OpenCLI update.
- Watch `out/cron.log` if you deliver on a schedule.

---

## 更新与维护

### 更新代码

```bash
git pull
npm ci          # 若 package-lock 变了，重新同步依赖
npm test        # 单元测试 + digest 冒烟——确认没坏
```

`config/feeds.yaml` 在 gitignore 里，`git pull` 不会动你的偏好。当
`config/feeds.example.yaml` 有变动时，和你的 `feeds.yaml` 比对一下，捡起新选项。

### 保持 reach 层健康

reach 层依赖 OpenCLI 和已登录的 Chrome，这两者会随时间漂移（Chrome 升级、会话过期、
站点改版）。在依赖某次运行前先检查：

```bash
node bin/digest reach doctor    # 各渠道状态
node bin/digest reach watch     # 紧凑健康 + OpenCLI 更新检查；不健康时退出码≠0
```

`reach watch` 适合 cron——非零退出码能让调度器报警。

当 `watch` 提示有新版本时，升级 OpenCLI：

```bash
npm install -g @jackwener/opencli
```

某个渠道没内容了，常见原因（按顺序排查）：会话过期（去 Chrome 重登）、扩展 worker
睡着了（任何真实调用会唤醒它）、或某个 RSS 源包已经覆盖了相同 URL，reach 的副本被去重
掉了（见 [`docs/REACH.md`](docs/REACH.md) 的 Reliability 一节）。

### 新增或调整数据源

- 原生源：在 `src/fetch_sources.js` 加一条描述符（`{ id, enabled, fetch }`），
  管线会自动接入，无需改别处。
- reach 平台：在 `src/reach/channels/index.js` 加一条 channel 描述符。OpenCLI 自带的
  adapter 远比这里接的多，`opencli list` 可以看到。
- 字段映射是防御式的（`src/reach/normalize.js`），新平台通常不改代码就能归一；只有某个
  字段没接上时才加别名。

改完之后：先 `npm test`，再 live 跑一次 `node bin/digest reach fetch <platform>`
确认映射。

### 日常检查

- 每次改动后 `npm test`（pre-commit 钩子也会跑单元测试）。
- Chrome 或 OpenCLI 升级后重跑 `reach doctor`。
- 定时投递的话，盯一下 `out/cron.log`。
