# DEEPER Blueprint

**Tagline:** Better questions. Better conversations.

## Architecture

DEEPER is a native Expo SDK 57 / React Native 0.86 application. The repository root is the Expo project so `npx expo start` works directly. The Node.js TypeScript backend uses Express and Socket.IO. PostgreSQL is the durable data store target; active room state and private answers are ephemeral in V1, with Redis as the production room-state adapter.

## Repository layout

```text
app/               Expo Router native screens
src/               Mobile session, Socket.IO client, and game context
packages/shared/   Shared protocol and state machine
packages/content/  Original question catalog and category metadata
services/server/   Express + Socket.IO authoritative game server
infra/postgres/    PostgreSQL schema
```

## Expo SDK 57 lock

- Expo `~57.0.24`
- Expo Router `57.0.21`
- React Native `0.86.0`
- React `19.2.3`
- React DOM `19.2.3`
- React Native Web `0.21.0`
- New Architecture enabled
- Native scheme: `deeper://`

SDK 57-compatible standard Expo Router stacks are used; SDK 58-only APIs such as `expo-router/native-tabs` are not used.

## Multiplayer contract

The server is authoritative for room membership, host permissions, game phase, question index, answer submission, reveal readiness, progression, and early exit. The core loop is:

```text
CREATE ROOM -> JOIN ROOM -> SAME QUESTION -> PRIVATE ANSWERS
-> ALL SUBMIT -> ALL REVEAL -> SYNCHRONIZED REVEAL -> REACT -> NEXT
```

Answers are never included in pre-reveal snapshots, logs, analytics, push notifications, or error payloads. A host consumes exactly one free hosted-game credit when starting a session; creating/cancelling a lobby, joining as a guest, and reconnecting do not consume credits. The architecture supports 2–8 players.

## Commands

```bash
npm install
npx expo start
npm run dev
npm run typecheck
npm test
```
