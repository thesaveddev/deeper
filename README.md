# DEEPER

Better questions. Better conversations.

DEEPER is a native Expo SDK 57 / React Native 0.86 multiplayer conversation game with a TypeScript Node.js + Socket.IO backend and PostgreSQL as the durable database target.

**Privacy:** [docs/privacy-policy.md](docs/privacy-policy.md) — what the app actually stores, including the encrypted answer cache in Redis, the random device identifier, and the fact that no ad or analytics SDK ships today.

## Start the mobile app

The repository root is now the Expo project. From the project root:

```bash
npm install
npx expo start
```

Then press `a` for Android, `i` for iOS, or scan the QR code with a compatible Expo development client.

For a physical device on the same Wi-Fi network:

```bash
npx expo start --lan
```

In development the app derives the server address from Metro automatically, so `.env` needs no URL. Set `EXPO_PUBLIC_SOCKET_URL` only to override it (e.g. `http://192.168.1.100:4400`) or for EAS builds. Never use `localhost` from a physical phone.

The app is pinned to:

- Expo SDK `~57.0.24`
- Expo Router `~57.0.21`
- React Native `0.86.0`
- React `19.2.3`
- React DOM `19.2.3`
- React Native Web `0.21.0`
- New Architecture enabled

The React and React DOM versions are pinned together because npm otherwise attempts to install React DOM 19.3 and fails peer resolution against Expo SDK 57. React Native Worklets is pinned to the version required by the SDK 57 Expo Router dependency tree.

## Start the mobile app and multiplayer server together

Use one command from the project root:

```bash
npm run dev
```

This starts the Node.js Socket.IO server and Expo concurrently. Press `a`, `i`, or scan the Expo QR code once Expo is ready.

If you only want the mobile app:

```bash
npx expo start
```

If you only want the multiplayer server:

```bash
npm run dev:server
```

Health check:

```text
http://localhost:4400/health
```

The server persists rooms, players, games, game questions and reactions to PostgreSQL at runtime. Answer and prediction text is never written to the database. If PostgreSQL is unreachable the server still runs, using in-memory state only, and logs a `[DB]` warning.

## Live game state (Redis)

The authoritative state machine lives in `GameRoom`, but it is mirrored to Redis on every mutation and transparently rehydrated on cache miss. A deploy, crash or `tsx watch` rebuild no longer destroys games that are in progress — a player who reconnects lands back on the exact question they left, with their answer intact.

```bash
# Optional. With no Redis reachable the game is fully playable, it just
# won't survive a restart.
REDIS_URL=redis://localhost:6379
```

**This means answers are written outside the phone for the first time.** They are:

- encrypted with AES-256-GCM under `LIVE_STATE_SECRET`
- stored only for the lifetime of the room (2 hour TTL)
- dropped the moment the game ends, along with the room key
- never written to PostgreSQL, never logged, never analysed

Without `LIVE_STATE_SECRET` the server refuses to write answers in clear rather than storing them unencrypted: the room still survives a restart, but the in-flight round is lost. That is the safe failure direction.

```bash
openssl rand -hex 32   # generate a production value
```

Redis is also how you would scale past one server instance, since live state is no longer pinned to a single process. That is not yet wired up — there is no Redis pub/sub fan-out between instances, so two servers would each hold their own connection set.

## Database

The schema lives in `infra/postgres/001_initial.sql`. `DATABASE_URL` defaults to `postgresql://deeper:deeper@localhost:5432/deeper` and can be overridden in `.env`.

```bash
npm --workspace infra/postgres run migrate   # apply SQL migrations
npm --workspace infra/postgres run seed      # seed categories
npm --workspace infra/postgres run reset     # drop everything (then re-run migrate)
```

On boot the server syncs the question catalog (8 categories, 800 questions) into the database so room and game foreign keys always resolve.

Free-game accounting is enforced by the unique `games.credit_consumption_key` column: a room is charged at most once, ever. The host's `free_hosted_games_remaining` is decremented atomically when the game starts; guests are never charged.

## Two-client integration smoke test

Boots an isolated server on port 4100, plays a full host/guest round over Socket.IO, asserts answer privacy and synchronised reveal, then verifies the persisted rows (and that no answers table exists):

```bash
npm --workspace @deeper/server run smoke
```

It creates and removes its own `smoke-%` rows, so it is safe to run against a local development database.

Set `SMOKE_REDIS_URL` to additionally run the restart-survival check, which kills the server mid-round and asserts the room, the question and both encrypted answers are recovered. CI runs it against a real Redis service.

## DEEPER+ (RevenueCat)

Purchases go through the RevenueCat SDK. Plan names, prices and the "save X%" figure are all read from the App Store / Play Store, so nothing is hardcoded and the numbers are correct in the user's own currency and locale.

```bash
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxx
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxx
```

**Purchases require a development build.** `react-native-purchases` is a native module and is not present in Expo Go, so the paywall shows an explicit "needs a development build" state there rather than failing. The module is required lazily behind try/catch for exactly this reason — a static import would take down the whole route graph.

Setup in the RevenueCat dashboard:

1. Create the products (monthly, annual, lifetime) and attach them to an offering.
2. Create an entitlement called `deeper_plus` and attach all three products.
3. Identify the user by the same device key the server uses (`identity.playerId`), which is what lets the webhook attribute a sale to the right `users` row.
4. Add a webhook pointing at `https://your-api/webhooks/revenuecat`, and set `REVENUECAT_WEBHOOK_SECRET` to the matching value.

### The webhook is what actually unlocks anything

The client flag only drives UI. A deck stays locked until the server has been told, by webhook, that the customer is entitled. It lives at `POST /webhooks/revenuecat` and does two things: write `entitlements` / `purchases` rows, and set `users.premium_entitlement`.

**Authentication** accepts either mechanism RevenueCat offers:

- **HMAC signing (preferred).** The dashboard signs each delivery with `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac>`, computed over `<timestamp>.<raw body>`. The route mounts `express.raw()` for this — verifying the *parsed* body would change the bytes and reject valid deliveries.
- **Static `Authorization: Bearer <secret>`.**

Either way the comparison is constant-time and the timestamp is checked against a 5-minute window to blunt replays. If `REVENUECAT_WEBHOOK_SECRET` is unset the endpoint returns 503 rather than accepting anything, so a misconfigured deploy can never accidentally grant access.

**Delivery handling:**

- Handlers answer 200 only *after* the event is durably applied, and 5xx on any failure so RevenueCat retries (5 attempts at 5/10/20/40/80 minutes). Unlike the rest of the persistence layer, these writes do not swallow errors — silently losing an entitlement row denies a paying customer.
- Deliveries are deduplicated on the event `id` in `webhook_events`, because RevenueCat guarantees only "at least one delivery" and reuses the id on retries.
- An event for an unknown `app_user_id` is acknowledged rather than retried. Retrying cannot conjure a row we deliberately did not create, and it would cause a retry storm. It is logged loudly instead.

**Event semantics** follow RevenueCat's documented behaviour rather than guesswork:

| Event | Effect | Why |
| --- | --- | --- |
| `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION`, `SUBSCRIPTION_EXTENDED` | grant | access is in place |
| `EXPIRATION`, `REFUND_REVOKE` | revoke | access has ended |
| `CANCELLATION`, `BILLING_ISSUE`, `SUBSCRIPTION_PAUSED` | no change | see below |

`CANCELLATION` deliberately does **not** revoke. It also fires for refunds, and a subscriber who simply turned off auto-renew has paid until the period ends. RevenueCat is explicit that access is removed on `EXPIRATION`, and that `SUBSCRIPTION_PAUSED` must not revoke either. Revoking on cancellation would lock out paying customers.

RevenueCat also recommends re-syncing via `GET /subscribers` after any webhook. That is not done here: it adds a second credential and a network round-trip to every delivery. Worth adding if you ever see entitlement drift.

"Delete my data" deliberately does **not** call `Purchases.logOut()`. Detaching the RevenueCat identity would orphan an existing purchase and leave future renewals unattributable — it would destroy the user's paid access.

## App icon, splash and adaptive icon

The artwork in `assets/` is **generated from code**, not exported from a design
tool:

```bash
npm run assets         # regenerate assets/*.png
npm run assets:preview # contact sheet → tools/preview-assets.html
node tools/ascii-mark.mjs   # print the mark as ASCII, at real screen sizes
```

`tools/generate-assets.mjs` draws the mark with a small signed-distance-field
rasteriser and writes the PNGs with a hand-rolled encoder (`tools/png.mjs`).
This machine has no sharp, ImageMagick or Pillow, and pulling in a native image
library to draw four flat shapes would be a poor trade. The upside is that the
mark is defined by geometry — reviewable in a diff, reproducible on any machine,
and tunable without a design tool.

The mark is a `?` built from an arc, a quadratic Bézier and a dot, in the theme
colours (`#FF3B6B` → `#9B5CFF` on `#0D0D12`). The constants at the top of the
file are the whole design; change them and re-run.

| File | Size | Notes |
| --- | --- | --- |
| `assets/icon.png` | 1024² | iOS. Opaque, **no alpha channel** — App Store Connect rejects an icon that carries one |
| `assets/adaptive-icon.png` | 1024² | Android foreground. Transparent; mark sits inside the centre 64% so no OEM mask clips it |
| `assets/splash-icon.png` | 512² | Transparent mark over the `#0D0D12` splash background |
| `assets/favicon.png` | 48² | Web |

## Building a real dev build

`npm run build:check` reports what is still missing. It validates the committed
PNGs (dimensions, alpha, and that the mark actually covers the canvas rather than
rendering blank), the identifiers, and the EAS project id:

```
ok    app icon       ./assets/icon.png  1024x1024  opaque  14% covered
ok    splash         ./assets/splash-icon.png  512x512  alpha  12% covered
ok    adaptive icon  ./assets/adaptive-icon.png  1024x1024  alpha  10% covered
note  extra.eas.projectId is still a placeholder...
```

That check runs in CI, so a broken or blank icon cannot land on `main`.

### The one thing that needs your Expo account

`extra.eas.projectId` is **not** something that can be generated offline — Expo
assigns it server-side against a logged-in account, so a made-up UUID would look
done and then fail every build. As the account owner:

```bash
npx eas-cli@latest login
npx eas-cli@latest init --force   # rewrites app.json with a real projectId
```

Then commit the `app.json` it rewrites. `eas.json` already carries `development`,
`preview` and `production` profiles, so once the id is real:

```bash
npx eas-cli@latest build --profile development --platform ios
```

The `development` profile produces a dev client with a simulator build for iOS
and an APK for Android.

> The `development` profile points `EXPO_PUBLIC_SOCKET_URL` at a placeholder LAN
> address so the key is present. Two physical phones still cannot find each other
> until a publicly reachable HTTPS server exists — that is a deployment question,
> not a build one.

## Data retention

[`docs/privacy-policy.md`](docs/privacy-policy.md) promises a bounded retention
period, and `services/server/src/retention.ts` is what keeps that promise. Every
six hours the server sweeps expired history:

- **deleted:** rooms, room_players, games, game_players, game_questions, reactions
  (90 days), and webhook delivery records (365 days)
- **never deleted:** users, profiles, entitlements, purchases — a retention sweep
  has no business destroying a billing record

Both windows are configurable via `RETENTION_DAYS_GAMEPLAY` / `RETENTION_DAYS_WEBHOOKS`
in `.env`. Out-of-range values — including `0`, which would delete everything ever
written — are ignored in favour of the default rather than coerced, so a typo in a
deploy cannot wipe the table.

```bash
# Preview what a purge would delete. Pass --force to actually apply.
npm --workspace @deeper/server run retention
```

## Marketing site

[`site/`](site) is the public site: a hand-written static bundle, no framework and
no build step. Five pages, all sharing one stylesheet.

| Page | What it is |
| --- | --- |
| `index.html` | Hero, the four-step loop, prediction mode, all eight decks, what we keep, close |
| `how-to-play.html` | The full six-step loop, both game modes, and a table of the rules the server actually enforces |
| `decks.html` | Every deck with three verbatim questions, player counts and access |
| `faq.html` | Cost, privacy and technical questions, as native disclosures |
| `privacy-policy.html` | **Generated.** Do not edit by hand |

### Light and dark

The site ships both schemes. Dark is the default paint, light is a full peer
theme, not an inverted filter.

- **System first.** `prefers-color-scheme: light` is honoured through CSS alone,
  so a first-time visitor with a light system gets light before any JavaScript
  runs.
- **A manual choice wins and persists.** The toggle writes
  `localStorage['deeper-theme']` and sets `data-theme` on `<html>`. An explicit
  choice beats the system in *both* directions, and a small blocking script ahead
  of the stylesheet applies it, so the page never paints dark and then flips.
- **The control exists twice on purpose.** At 375px the nav row is already 314px
  of a 332px viewport, and there is no honest 44px left in it. So there is one
  icon button in the bar (desktop) and one full-width `Theme` row inside the
  menu disclosure (phones), with exactly one visible at any width. Both are
  driven by the same `querySelectorAll` script, so they cannot disagree, and a
  gate asserts there is exactly one of each per page.
- **The palette is measured, not eyeballed.** `tools/contrast-math.mjs` is the
  only place OKLCH becomes a contrast ratio, and `tools/audit-site.mjs` imports
  it rather than keeping a second copy that could disagree. The light palette
  was solved against AA on the *paper* surfaces. The useful thing to know before
  you touch it: **the direction of an ink change reverses between schemes.** On a
  near-black ground a lighter ink is stronger; on paper a lighter ink is weaker,
  so `faint` is 62% lightness in dark and 52% in light. Rules invert too — a
  border on paper is a subtraction, not an addition, so `--rule` gets *lighter*.
  Solving a failing light-mode token by searching upward is how you conclude
  nothing exists.
- **A few tokens are scheme plumbing, not colour.** `--grain-blend` flips
  `overlay` to `soft-light`, `--grain-opacity` 0.5 to 0.35, `--glow-opacity`
  1 to 0.5, and `--light-catch` becomes a dark tint rather than the white inset
  line, which is invisible on paper. Per-placement glows are written as
  `calc(0.85 * var(--glow-opacity))` so a bare number cannot quietly defeat the
  scheme.
- **The light block is written twice in `site/tokens.css`, on purpose.** CSS
  cannot apply one declaration set to two different conditions
  (`:root:not([data-theme='dark'])` inside the media query, plus
  `:root[data-theme='light']`), so the duplication is real rather than a
  mistake, and the `light palette parity` gate holds the two copies
  token-identical instead of leaving that to a reviewer.
- **The contrast audit runs in a real browser too.** `tools/verify-schemes.mjs`
  walks every rendered element on all five pages in both schemes and counts
  real failures. Its maths is deliberately not the naive one: compute relative
  luminance straight on the linear-sRGB output of the OKLCH matrices, with no
  sRGB transfer function in between. Encoding gamma first reports a genuine
  7.17:1 as 2.70:1, which is a very convincing phantom.

### A mobile nav bug worth knowing about

At 320px the nav row needed 362px of a 282px viewport, which pushed the `Menu`
button 100px off-screen — mobile navigation was unreachable. Nothing caught it
because `overflow-x: clip` on the root hides the symptom from every
scroll-width check: "no horizontal overflow" was true and useless. The fix
(narrower gaps below 40rem, no inline padding on the nav button, wordmark hidden
below 22rem) is measured, not guessed. If you ever add anything to that row,
measure it at 320px, because the audit cannot see it for you.

Search plumbing is generated too: `sitemap.xml`, `robots.txt`, the
`canonical` / `og:url` / `twitter:*` / JSON-LD block in every page head, and one
1200x630 share image per page in `site/assets/og/`.

```bash
npm run site:serve   # http://localhost:4173
npm run site:audit   # 42 static design and truthfulness gates
npm run site:build   # policy page, then share images, then the SEO files
npm run site:og      # just the share images
npm run site:seo     # just the sitemap, robots and head tags
```

The share images are rendered in headless Chrome rather than drawn in Node,
because they are set in the real brand faces and built from the real token
block in `site/tokens.css`: the type metrics and the wrapping are the site's own
rather than an approximation. It drives Chrome over the DevTools protocol on a
plain WebSocket, so it adds no browser-automation dependency.

Two things about it are deliberate:

- **Every number and every quoted question is real.** The deck counts, player
  limits, question counts, room-code length and retention windows come from
  `packages/content`, `packages/shared` and the retention job. The questions
  quoted on the site are verbatim base prompts from the shipping catalogue. The
  illustrations of game states are HTML redrawn from the app's own strings, not
  screenshots, so they can be themed and scaled like anything else.
- **The structured data asserts nothing that is not true.** The JSON-LD carries
  no price, no store URL, no `aggregateRating` and no review, because no store
  listing exists to source any of them from, and the FAQ already tells the
  reader the till is the real price. This is enforced, not just intended: the
  `no fabricated structured data` gate rejects those fields, and it is deleted in
  the same commit that adds a real store listing and a real price. A rating block
  is the most common lie a site tells a crawler, so it gets a gate rather than a
  code review.
- **There is no social proof, because there is none.** No testimonials, no user
  counts, no logo wall, and the store buttons are disabled rather than pointing
  at a 404. A pre-launch product that invents its traction is worse than one that
  admits it is early.

`site/privacy-policy.html` is generated from [`docs/privacy-policy.md`](docs/privacy-policy.md)
so the markdown stays the single source of truth, and CI fails if the two drift.
The app icon, adaptive icon and favicon in `site/assets/` are written by
`npm run assets` rather than copied by hand.

The remaining honesty gaps are documented on the site itself, in the FAQ and in
`docs/privacy-policy.md`: no EAS project id, no submitted build, no support
address, no in-app account deletion, and **no web client**, so every player has
to install the app. That last one is enforced by an audit gate rather than by
good intentions: the site may not claim anyone can join from a browser unless
`app.json` gains a `web` target, because an early draft of the copy claimed
exactly that and it was false.

## Question selection

Each deck holds 100 questions and a game uses 10, so a deck comes all the way
round every ten games.

`getQuestions` in `packages/content` used to walk the pool from index 0, which
meant **every game of a deck played the identical ten questions** and 720 of the
800 questions could never appear. It is now a Fisher-Yates draw.

`services/server/src/question-selector.ts` adds the no-repeat window. The
exclusion set is read from `games` + `game_questions`, which already record what
was played, so there is no new table:

```sql
-- the questions used by the last 10 games of this deck
SELECT DISTINCT gq.question_id FROM game_questions gq JOIN games g ON g.id = gq.game_id
 WHERE g.category_id = $1 AND g.id IN (SELECT id FROM games WHERE category_id = $1
                                       ORDER BY started_at DESC NULLS LAST LIMIT $2)
```

Two properties worth knowing:

- **The window is 10 because that is the maximum useful value.** 10 games × 10
  questions is the whole pool, so a window larger than 10 excludes everything
  and changes nothing.
- **A game is never short.** If exclusion leaves fewer than 10, the shortfall is
  topped up from the excluded set rather than returning a five-question game. So
  the invariant is "every available fresh question is used before any stale one",
  not "never repeats" — once a deck has history, the two are different claims.

Every failure path degrades to a plain shuffled draw. A database outage must not
stop somebody playing.

## Adding a second paid product

`entitlements.entitlement_key` is a free-text key, so a second product needs no
migration. Two things were load-bearing and have been fixed:

- **`users.premium_entitlement` means "holds anything paid".** It used to be
  recomputed as "holds the entitlement named by the event that just arrived", so
  buying a second product silently revoked the first. It is now derived across
  `PREMIUM_ENTITLEMENTS` in `persistence.ts`.
- **The webhook records the entitlement the event is actually about.**
  `entitlementKeyFor()` in `revenuecat.ts` picks it from the event's own
  `entitlement_ids`, so a revoke for one product is not written against another.

Decided and deliberately not built: on-the-fly question generation, and a
separate erotic add-on product. Both are recorded in `.hallmark/log.json` and
this section. Generation in particular would contradict the privacy claim the
product is built on, and the writing is the product, so the useful version is an
offline seeding tool with human review rather than a live call.

## Other commands

```bash
npm run typecheck
npm test
npm run android
npm run ios
```

SDK 57 is deliberate. Do not use SDK 58-only APIs such as `expo-router/native-tabs`.

## Loading on a physical phone

1. Find the computer's LAN IP with `ipconfig` (for example `192.168.1.100`) and set it in `.env`:

```env
EXPO_PUBLIC_SOCKET_URL=http://192.168.1.100:4400
```

2. Start the stack and make sure Expo prints the LAN URL, not `localhost`:

```bash
npm run dev
```

3. The phone must be on the same Wi-Fi network as the computer.

## Important: Expo Go and SDK versions

The store version of Expo Go supports only one Expo SDK — the latest one. This project is intentionally pinned to SDK 57, so if the installed Expo Go app ships a newer SDK (for example SDK 58), the project will not load in Expo Go.

The supported way to run this project on a device is a development build:

```bash
npm run android
```

This builds a native dev client for Android (requires Android Studio). It matches the project's SDK exactly and is also required for production integrations such as AdMob and RevenueCat.

## Troubleshooting

- `Port 8081 is being used by another process` — a stale Metro process is running. Free it with `npx kill-port 8081 4400`, or find the PID with `netstat -ano | findstr :8081` and run `taskkill /PID <PID> /F`.
- QR code scans but the bundle never loads — Windows Firewall may be blocking inbound ports 8081/4400 on the private network; allow Node.js through the firewall.
- Socket errors in-game — the phone cannot reach the backend; confirm `EXPO_PUBLIC_SOCKET_URL` uses the LAN IP and both devices share the network.
- Verify the backend is healthy at `http://localhost:4400/health`.
