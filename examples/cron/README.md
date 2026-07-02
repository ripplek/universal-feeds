# Scheduled delivery template

Two entry points, depending on who's driving:

- [`daily-digest.sh`](daily-digest.sh) — a **bare cron** template: runs the
  digest (keyword path) and pipes the Markdown to a delivery command. Delivery is
  a **seam**: `$UF_DELIVER` is any command that reads the digest on stdin. Add
  `--strict-exit` inside the script if you want cron to fail the job when a
  required source comes up empty.
- [`agent-session-digest.mjs`](agent-session-digest.mjs) — for a **scheduled
  agent session** (Clawdbot/Claude). It drives the `daily` state machine and
  prints a JSON envelope (`action`, `message`, `digestPath`, `health`,
  `sourceHealth`). On `judge_then_repeat` the agent judges the candidates and
  re-invokes; on `post` / `post_failure` it posts the message in-chat. This is
  the AI-judged loop the bare cron can't do (see below).

## Cron

```cron
# every day at 08:00 local time
0 8 * * *  UF_REPO=/path/to/universal-feeds \
           UF_CONFIG=config/feeds.yaml \
           UF_DELIVER='imessage-send +15551234567' \
           /path/to/universal-feeds/examples/cron/daily-digest.sh >> /tmp/uf.log 2>&1
```

## Environment

| Var          | Default             | Meaning                                            |
| ------------ | ------------------- | -------------------------------------------------- |
| `UF_REPO`    | script's repo root  | Where to `cd` before running                       |
| `UF_CONFIG`  | `config/feeds.yaml` | Config passed to `--config`                        |
| `UF_DATE`    | `today`             | Passed to `--date`                                 |
| `UF_DELIVER` | _(unset)_           | Command that receives the digest Markdown on stdin |

## Delivery examples

```bash
UF_DELIVER='mail -s "Daily digest" you@example.com'
UF_DELIVER='curl -s -X POST -H "Content-Type: text/markdown" --data-binary @- https://hooks.example/…'
UF_DELIVER='cat'   # just print it
```

## AI-judged runs

With `filter.mode: llm`, a bare cron run can't judge candidates and falls back to
the keyword gate. To run the **judged** loop on a schedule, drive the repo from an
agent session with [`agent-session-digest.mjs`](agent-session-digest.mjs): it
returns `awaiting_judgments` with the run's `candidatesPath` + `judgingTaskPath`,
the agent judges them into the run's `judgments.jsonl`, then re-runs to render and
post. Full contract in [`../../AGENTS.md`](../../AGENTS.md) (→ `daily`).
