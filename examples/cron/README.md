# Scheduled delivery template

[`daily-digest.sh`](daily-digest.sh) runs the digest on a schedule and hands the
rendered Markdown to a delivery command of your choosing. Delivery is a **seam**:
`$UF_DELIVER` is any command that reads the digest on stdin.

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
the keyword gate. To run the **judged** loop on a schedule, have your agent drive
the repo (emit → judge → render, see [`../../AGENTS.md`](../../AGENTS.md)); the
delivery block here still applies to the digest it produces.
