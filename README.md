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

The server persists rooms, players, games, game questions and reactions to PostgreSQL at runtime. Answer and prediction text is never written to the database — it lives only in memory for the active round and is discarded when the round advances. If PostgreSQL is unreachable the server still runs, using in-memory state only, and logs a `[DB]` warning.

## Database

The schema lives in `infra/postgres/001_initial.sql`. `DATABASE_URL` defaults to `postgresql://deeper:deeper@localhost:5432/deeper` and can be overridden in `.env`.

```bash
npm --workspace infra/postgres run migrate   # apply SQL migrations
npm --workspace infra/postgres run seed      # seed categories
npm --workspace infra/postgres run reset     # drop everything (then re-run migrate)
```

On boot the server syncs the question catalog (8 categories, 800 questions) into the database so room and game foreign keys always resolve.

Free-game accounting is enforced by the unique `games.credit_consumption_key` column: a room is charged at most once, ever. The host's `free_hosted_games_remaining` is decremented atomically when the game starts; guests are never charged.

### Two-client integration smoke test

Boots an isolated server on port 4100, plays a full host/guest round over Socket.IO, asserts answer privacy and synchronised reveal, then verifies the persisted rows (and that no answers table exists):

```bash
npm --workspace @deeper/server run smoke
```

It creates and removes its own `smoke-%` rows, so it is safe to run against a local development database.

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
