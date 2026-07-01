# Judging self-test fixture

A minimal, offline round-trip of the AI relevance loop (see
[`../../docs/FILTERING.md`](../../docs/FILTERING.md) and
[`../../AGENTS.md`](../../AGENTS.md)). Use it to confirm your agent produces
judgments the digest will accept — before wiring it into a real run.

- `candidates-sample.jsonl` — four candidates in the exact shape
  `node bin/digest --stage candidates` emits.
- `judgments-sample.jsonl` — a valid judgment for each, in the shape your agent
  must produce (echo `id`, add `relevant`/`score`, optional `topics`/`why`).

Validate the sample judgments against the sample candidates:

```bash
node --test test/judging_fixture.test.js
```

It loads both files and asserts `validateJudgments` reports `ok: true` with full
coverage. To dry-run the CLI gate against your own judgments (any config):

```bash
node bin/digest --config config/feeds.yaml --validate-judgments out/judgments-<date>.jsonl
```

Copy `judgments-sample.jsonl`'s shape for your own agent output.
