# DEEPER

Better questions. Better conversations.

DEEPER is a native Expo SDK 57 / React Native 0.86 multiplayer conversation game with a TypeScript Node.js + Socket.IO backend and PostgreSQL as the durable database target.

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
3. Point the webhook at your server (see the RevenueCat webhook work still to do) — the server is what actually unlocks decks, via `users.premium_entitlement`. The client flag alone grants nothing.
4. Identify the user by the same device key the server uses (`identity.playerId`), which is what lets the webhook attribute a sale to the right `users` row.

"Delete my data" deliberately does **not** call `Purchases.logOut()`. Detaching the RevenueCat identity would orphan an existing purchase and leave future renewals unattributable — it would destroy the user's paid access.

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
