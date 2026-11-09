# Privacy and data handling — DEEPER

**Last updated:** 9 November 2026
**Applies to:** the DEEPER source code in this repository, and to any server you run yourself.

**Status: no service is operated.** DEEPER was built and never launched. There is
no published app, no hosted server, no database run by the author, no
payment account and no support desk. Nobody is collecting data through this
project today.

This is not a privacy policy for a service, because there is no service. It is a
description of what the code does with data when you build and run it yourself.
If you self-host DEEPER, you are the operator, and the obligations below are
yours.

---

## 1. The short version

DEEPER is a conversation game for two to eight people on separate phones. Each
phone joins a room, answers the same question in private, and every answer is
revealed at the same moment.

**Answers are the point of the game, and they are the one thing the code does not
persist.** There is no answers table in the schema. There is no account, no
email address, no password, no advertising identifier, and no analytics or
crash reporting SDK wired up in the build.

---

## 2. What the client creates

### 2.1 A random device identifier

On first launch the client generates a random string and stores it in the app's
own private storage (AsyncStorage, under `deeper.identity`). It is not a
hardware identifier: the code reads no IDFA, IDFV, Android Advertising ID, IMEI,
MAC address or serial number, and declares no iOS tracking permission string.

The identifier is sent to the server and stored in `users.device_id`. An
operator of a self-hosted server can see that several rows belong to the same
install, but cannot see who the person is.

`app/profile.tsx` offers "Delete local data", which clears the identifier and
resets the free-game counter. A new identifier creates a new user row with a
fresh allowance. This is a known limitation, documented in the README and the
postmortem, not a privacy control.

### 2.2 Display name

An optional display name is stored with the device identifier and shown to
other players in the room. If left blank, the code assigns a random short name.
The code does not validate the content of a display name, so a self-hoster
should say plainly that names are visible to everyone in the room.

### 2.3 Room and game activity

| What | Why |
| --- | --- |
| A room code, the deck chosen, when it was created | to let players join |
| Who joined, when, and under what display name | to build the player list |
| Which question IDs were served, in what order | to run the round and avoid repeats |
| Reactions and their timestamps | to show reaction totals |
| When a game started and ended, and why | session records |

This is gameplay history, never a transcript. The question text is generated in
`packages/content/src/index.ts`; the answers are not stored.

---

## 3. Answers, the important part

Answers are never written to PostgreSQL. There is no column and no table for
them, which is the part that actually guarantees it.

While a game is live, an answer exists in two places:

- In the client's memory, before submission.
- In an encrypted Redis cache, so every phone can reveal at the same instant.
  The value is sealed with AES-256-GCM under a scrypt-derived key from
  `LIVE_STATE_SECRET`, which lives only in server environment variables.

The cache entry is deleted when the game ends and independently expires after
two hours. If `LIVE_STATE_SECRET` is missing,
`services/server/src/live-store.ts` refuses to write cleartext: the round is
lost and a warning is logged. Losing a round is the intended failure, not a
hidden trade-off.

The code does not write answer text to PostgreSQL, to server logs, to crash
reports, or to any third party, and does not use it for training. It is shown
only to the other players in the same room, at the reveal. The fact that a
player submitted something in a given position is recorded, so the room can
synchronise; the content is not.

---

## 4. Third parties

| Recipient | What it would get | Status in this repository |
| --- | --- | --- |
| RevenueCat | device identifier, purchase status | adapter present, never configured |
| Apple or Google | payment details | never used, no store build exists |
| Ad networks | nothing | no SDK, console-only stub |
| Analytics and crash reporting | nothing | no SDK, console-only stubs |

`src/lib/premium.ts` lazily loads `react-native-purchases` and
`services/server/src/revenuecat.ts` verifies webhook signatures, but no
products, API keys or webhook secrets were ever created. `src/lib/ads.ts`,
`src/lib/analytics.ts` and `src/lib/sentry.ts` log to the console and do
nothing else. No advertising identifier is read.

The copy that once described a between-games ad placement described a plan,
not an implementation. That plan was dropped.

---

## 5. Retention

| Data | Retention |
| --- | --- |
| Encrypted answers in Redis | deleted at game end, hard expiry 2 hours |
| Answers in PostgreSQL | never stored |
| Device identifier, display name, entitlement rows | no automatic deletion |
| Room and game history | 90 days |
| Webhook delivery records | 365 days |

`services/server/src/retention.ts` runs a sweep every six hours and deletes
expired rooms, games, player lists, question orders, reactions and webhook
records. It never deletes users, profiles, entitlements or purchases.

No hosted deployment exists, so no sweep is running anywhere today.

---

## 6. If you self-host

You become the data controller. At minimum:

- Set `LIVE_STATE_SECRET`, and keep it out of version control. The server will
  refuse to cache answers without it.
- Terminate TLS in front of the server. A development server without TLS is not
  a deployment.
- Decide how you will handle access and erasure requests. The client has no
  account and no "delete my server data" control, so there is no way for a
  player to identify themselves to you.
- Write your own privacy notice and your own terms for your own deployment.
  This file describes the code, not your service.
- Decide whether the game is appropriate for younger players. The After Dark
  deck is age gated in the client; nothing here is a COPPA compliance claim.

Uninstalling the app removes the local identifier, which is the only link to
the server-side row. The server does not treat that as an erasure request.

---

## 7. Known gaps, stated plainly

- The ten-game hosting allowance is stored against a local identity and can be
  reset by clearing local data. There is no server-side identity to prevent it.
- There is no account deletion path and no support address.
- There is no web client. Every player needs the native app, and the invite is
  a `deeper://` custom-scheme link that only resolves where the app is present.
- The RevenueCat webhook is implemented but was never connected to a real
  account, so the entitlement path was never exercised with live purchases.

These are reasons the project was not launched, not claims that it handles
them. See the [postmortem](https://github.com/thesaveddev/deeper/blob/main/docs/POSTMORTEM.md)
and the [viability assessment](https://github.com/thesaveddev/deeper/blob/main/docs/viability-assessment-2026-11-05.md).

---

## 8. Changes and contact

This file is version-controlled alongside the code it describes. No one is
maintaining it. If you fork the project, rewrite it to describe your own
deployment.

There is no support address and no security contact for the original project.
Issues opened on the repository are not triaged and pull requests are not
merged; see [CONTRIBUTING.md](https://github.com/thesaveddev/deeper/blob/main/CONTRIBUTING.md).
