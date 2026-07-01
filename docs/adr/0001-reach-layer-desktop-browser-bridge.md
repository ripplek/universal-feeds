---
status: accepted
---

# Auth-gated fetching runs on a desktop via OpenCLI's browser bridge

For personalized feeds we need private, login-gated data (X Following, Reddit,
Xiaohongshu, Bilibili, etc.). We adopt a `reach` capability layer (ported from
[Agent-Reach](https://github.com/Panniantong/Agent-Reach), MIT) that fetches via
**OpenCLI**, which drives the user's real, already-logged-in Chrome through a
browser-bridge extension + local daemon — reusing the live session instead of
managing tokens or decrypting the cookie store. OpenCLI is **desktop-only (no
headless)**, so the digest run that touches auth-gated platforms must execute on
a desktop machine with Chrome open and logged in.

## Considered Options

- **A — Run the digest on the desktop (chosen).** cron runs on the machine
  where Chrome is logged in; every OpenCLI-backed platform is available. Simplest
  path and the closest fit to how OpenCLI actually works.
- **B — Split execution.** A headless server runs only tier-0 sources
  (RSS / YouTube / V2EX / GitHub); OpenCLI platforms are marked "desktop-only"
  and fetched opportunistically when the desktop is online. More moving parts,
  partial coverage on the server.
- **C — Cookie extraction + plain HTTP.** Decrypt Chrome's cookie DB and inject
  cookies into HTTP requests (no browser). Headless-capable but fragile
  (breaks on Chrome encryption changes), weak against JS challenges / dynamic
  tokens, and higher ban risk. Kept only as a possible per-platform fallback.

## Consequences

- The production cron → iMessage digest moves from a headless server onto the
  desktop; the desktop's Chrome must stay logged in for the target platforms.
- CI and any headless environment can only exercise tier-0 sources; reach-backed
  platforms are not testable there — `digest reach doctor` gates their health
  locally instead.
- The digest pipeline must tolerate an empty result from any single reach
  platform (extension asleep, session expired) — it already degrades per-source.
