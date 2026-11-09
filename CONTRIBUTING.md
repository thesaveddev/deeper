# Contributing

**DEEPER was never launched and is not maintained.** It is published as a
reference implementation and a record of a product decision. There is no
hosted service, no store listing, no roadmap, and no one triaging issues.

That means:

- **Forks are the intended use.** Copy it, strip it down, take the Socket.IO
  state machine, reuse the Redis rehydration, or rewrite the whole thing. MIT
  asks only that you keep the copyright and permission notice.
- **Pull requests are welcome but will not be merged.** Please do not open one
  expecting a review. If you fix something, a fork or a gist is more useful to
  you and to anyone else reading this.
- **Issues are open as a public notebook**, not a support queue. Bug reports
  about the code are genuinely interesting; questions about when the app will
  ship have a simple answer: it will not.
- **No security SLA.** This code was never deployed to production. If you do
  deploy a fork, you are the operator and you own its security posture. See
  [docs/privacy-policy.md](docs/privacy-policy.md) for what the code stores.

## If you want to run it

Everything you need is in the [README](README.md), including the local
Postgres and Redis setup, the two-client smoke test, and why a physical phone
needs `EXPO_PUBLIC_SOCKET_URL` set to a LAN address.

Two things will bite you:

1. `extra.eas.projectId` in `app.json` is still a placeholder. Any real build
   needs an Expo account and `eas init`.
2. The RevenueCat integration is inert. No products, entitlements, API keys or
   webhook secret were ever configured. Set `PREMIUM_ENFORCEMENT=off` for local
   play, or delete the entitlement layer entirely.

## Where the interesting parts are

| If you want | Start here |
| --- | --- |
| An authoritative multiplayer state machine | `services/server/src/game-room.ts`, `packages/shared/src/state-machine.ts` |
| Room restore after a restart | `services/server/src/live-store.ts`, `room-registry.ts` |
| A typed Socket.IO protocol | `packages/shared/src/types.ts` |
| Answer privacy by design | `infra/postgres/001_initial.sql` (no answers table), `docs/privacy-policy.md` |
| Webhook correctness | `services/server/src/revenuecat.ts`, `persistence.ts` |
| A hand-built static site with enforced honesty | `tools/audit-site.mjs`, `site/` |
| Why this was never shipped | [docs/POSTMORTEM.md](docs/POSTMORTEM.md), [docs/viability-assessment-2026-11-05.md](docs/viability-assessment-2026-11-05.md) |
