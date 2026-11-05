# Privacy Policy — DEEPER

**Last updated:** 26 September 2026
**Applies to:** DEEPER ("Better questions. Better conversations."), for iOS and Android.

This policy describes what the shipped DEEPER application actually does with your
data. It is written to match the code in this repository, not an aspiration.

---

## 1. The short version

DEEPER is a two-or-more-people conversation game. People on their own phones join
a private room, answer the same question privately, and then reveal their answers
to each other at the same moment.

The design rule underneath everything below is:

> **Your answers are the point of the game, and they are the one thing DEEPER does
> not keep.**

There is no account to create. We never ask for your name, email address, phone
number, or contacts. We do not read your camera, microphone, photos or files. We do
not read your contacts list. We do not build an advertising profile of you.

---

## 2. What we collect

### 2.1 A random device identifier

The first time you open DEEPER, the app generates a random string (for example
`m4k2zp-9fq1x`) and saves it in the app's own private storage on your phone.

- It is **not** your device's hardware identifier. DEEPER does not read the IDFA,
  the IDFV, the Android Advertising ID, or any IMEI, MAC address or serial number.
- It is not derived from anything about you. It is a random value.
- We generate it ourselves. It is not supplied by Apple, Google, or any advertising
  network.

We send this identifier to our server so that we can keep your free-game allowance,
your display name, and your premium status attached to you across app restarts and
reconnects. On our servers it is stored in a column called `device_id`.

**What it lets someone do:** an operator of our servers, or anyone who obtains our
database, can see that these records belong to the same install — they cannot see
who the person is.

### 2.2 Your display name

If you type a display name, we use it in the room so other players can see who is
who, and we store it alongside your device identifier. Please do not put your real
name, phone number, or social handle in it. If you leave it blank, DEEPER assigns
you a short random name.

### 2.3 Room and game activity

To make a game work, the server records the shape of a session:

| What | Why |
| --- | --- |
| A room code, the deck you chose, when it was created | to let players join it |
| Who joined, when, and under what display name | to build the player list |
| Which questions were served, in what order | to run the round |
| Which reactions you tapped and when | to show reaction totals |
| When a game started and ended, and why it ended | session records |

This is gameplay history. It is **not** a transcript of what was said. The questions
are written by us; we do not store the answers.

### 2.4 Your answers and predictions — the important part

**Answers are not written to our database.** There is no answers table. This is a
deliberate design decision, not an oversight, and it is enforced by the database
schema itself.

So where do answers live while the game is running?

- **On your phone, in memory** — while you are typing and before you submit.
- **On the game server, in an encrypted cache.** To make everyone's phones reveal at
  the same instant, an answer has to be held centrally for a moment. We hold it in
  an in-memory cache (Redis), **encrypted with AES-256-GCM**, using a key that is
  stored on the server and never on your device.
- **It is deleted when the game ends**, and independently expires after **2 hours**
  even if the game never formally ends and the server is never contacted again.

What we specifically do **not** do with answers:

- We do not write them to PostgreSQL. Ever.
- We do not write them to server logs, error logs or crash reports.
- We do not send them to analytics, advertising, or any third party.
- We do not use them to train anything.
- We do not show them to anyone except the other players in your own room, at the
  reveal.

When the game ends, the encrypted copy is deleted. The fact that a player submitted
*something* in a given position is recorded (so the game can be scored and
synchronised); the content is not.

**One deliberate exception, stated plainly:** in a local development setup where the
encryption key has not been configured, DEEPER will not silently downgrade to
storing answers unencrypted. The room keeps working, the round is lost, and the
server logs a warning. Losing a round is the intended failure, not a hidden
trade-off.

### 2.5 Purchases

If you buy DEEPER+, the app uses RevenueCat (a third-party subscription service) to
talk to the App Store and Google Play on your behalf. RevenueCat receives your
purchase, subscription status, and an identifier that is your DEEPER device
identifier from section 2.1.

RevenueCat then sends our server a notification when your subscription starts,
renews, expires, or is refunded. We store the fact that this happened, the product
you bought, and the store transaction reference. **We do not store your card
details — we never see them.** They go directly between you and Apple/Google.

---

## 3. Advertising

**In the current build, DEEPER contains no advertising SDK, shows no ads, and does
not track you.** The ad module is a placeholder that logs to the console, and the
iOS build declares no tracking permission string at all.

This is worth being blunt about, because an earlier revision of the iOS
configuration did declare an App Tracking Transparency usage string while the app
never requested tracking. We removed it. Declaring a string is not asking for
anything — iOS only shows the tracking prompt if the app calls the permission
request — but a permission string with no permission behind it is a misleading
thing to ship, so it is gone. No prompt appears, no tracking identifier is read, and
no data is shared with any ad network.

If advertising is enabled in a future version, the change would be:

- ads shown **only between games**, never during answering or reveal;
- shown **only to free hosts** — never to guests, never to premium users;
- optional, skippable, and never blocking;
- and this policy would be updated before that version shipped, describing the ad
  partners used, the App Tracking Transparency prompt, and the App Store privacy
  nutrition labels.

We will not quietly add tracking to a build that describes itself this way.

---

## 4. Analytics and crash reporting

**Not active.** There is no analytics SDK or crash-reporting SDK in the build. The
adapters exist as console-only placeholders and are inert.

If those are switched on later, the intended rule — already written into the
analytics adapter's source comments and enforced in review — is that answer text,
private conversation content, and display names are never sent as event
properties. Only structural events (a game started, a round completed) would be
sent.

---

## 5. Who we share data with

| Recipient | What they get | Why |
| --- | --- | --- |
| Apple / Google | everything about your purchase | we are not involved; payment goes store-to-store |
| RevenueCat | your device identifier and purchase status | to verify and deliver your subscription |
| Our hosting provider | everything described above | they run the servers |
| Our ad / analytics providers | **nothing — none are in use** | — |

We do not sell personal information. We have not done so and will not.

We do not share your answers, your display name, or your gameplay history with
anyone for advertising or marketing purposes.

---

## 6. How long we keep things

| Data | Retention |
| --- | --- |
| Encrypted answers in cache | deleted at game end, hard expiry 2 hours |
| Your answers in the database | **never stored** |
| Device identifier, display name, purchase status | for as long as your account exists |
| Room and game history (which questions, reactions, timestamps) | **90 days**, then deleted automatically |
| Store webhook delivery records | 365 days |
| Server logs | rotated; contain no answers |

The 90-day and 365-day windows are enforced by a scheduled sweep in the server
(`services/server/src/retention.ts`), not by good intentions. It runs every six
hours, deletes expired rooms, games, player lists, question orders, reactions and
webhook records, and is covered by the integration test suite.

The sweep **never** deletes your account, your display name, your premium
entitlement, or your purchase history. Retention housekeeping has no business
destroying billing records; if you want those gone, that is an erasure request
(see below), not a sweep.

---

## 7. Your rights

Depending on where you live (GDPR / UK GDPR, the California CCPA/CPRA, and similar
laws), you may have the right to:

- **access** the personal data we hold about you;
- **correct** it — you can change your display name in the app;
- **delete** it;
- **restrict** or **object** to processing;
- **port** it to another provider;
- **withdraw consent**, where processing relies on consent;
- **complain** to your local data protection authority.

Note that we do not rely on consent as our legal basis for the core service: the
game cannot be played without a device identifier, and the identifier is random
and carries no meaning outside your own install. Consent is relevant only to
advertising and analytics, neither of which is active.

### How to actually get your data

DEEPER has no account, no email address, and no in-app "delete my data" button, so
we cannot look you up from an email. To exercise any of these rights, contact us
from the **same device**, describing your DEEPER display name and roughly when you
last played, and we will identify and delete the matching record. We will respond
within 30 days.

Installing or deleting the app removes the local device identifier from your phone.
Because that identifier is the only thing linking our server-side record to your
install, **deleting the app makes you effectively unidentifiable to us**, though we
do not automatically treat that as a deletion request.

---

## 8. Security

- Answers held centrally are encrypted with **AES-256-GCM** under a scrypt-derived
  key held only in server environment variables.
- Store webhook deliveries are verified by **HMAC-SHA256** over the raw request body
  with constant-time comparison, and rejected if the timestamp is more than 5
  minutes old.
- In production this traffic must be TLS. A development server without TLS is not an
  acceptable deployment.

No system is perfect. If you discover a vulnerability, please tell us privately
rather than publicly.

---

## 9. Children

DEEPER is intended for adults and is **not directed at children under 13**. One
deck ("After Dark") is age-gated behind an explicit 18+ confirmation because of its
content.

We do not knowingly collect information from children. If you believe a child has
used DEEPER, contact us and we will delete the record.

DEEPER is not currently certified as COPPA-compliant and we do not claim to be.
Deciding whether to add a kids mode or to formally restrict the service is an open
product question, not a settled one, and we would rather say so than imply a
compliance posture we do not have.

---

## 10. Changes to this policy

If we change what we collect or what we do with it, we will update this file in the
DEEPER repository and the "last updated" date above, and — for material changes —
tell you in the app before the change takes effect.

---

## 11. Contact

Opeyemi Olorunfemi — [address removed]
Source: <https://github.com/thesaveddev/deeper> (this policy is version-controlled
alongside the code it describes)
