# Why DEEPER was never launched

**Date:** 9 November 2026
**Status:** project closed, source published under MIT

## What was built

A complete, working real-time multiplayer conversation game. Two to eight
people join a four-character room, see the same question, answer privately,
then reveal simultaneously, react, and move to the next of ten questions. Eight
decks, a prediction mode with scoring, an age-gated deck, reconnect and
restart survival, and a privacy design in which answer text is never written to
Postgres.

The engineering was finished. Typecheck clean, 70 unit tests, a two-client
Socket.IO smoke test that plays a full round and asserts answer privacy, a
45-gate static-site audit, and three CI jobs including Android/iOS bundle
export. The last CI run was green.

What was never done: an EAS project ID, a submitted store build, a publicly
reachable HTTPS server, RevenueCat products, a web client, a support address,
analytics, or a single real user session with people outside the developer's
network.

## Why it stopped

The product was built before its distribution model was tested. That is the
whole postmortem in one sentence, but the specific findings are worth writing
down.

**The differentiation did not hold.** "Synchronous reveal on separate phones"
was the core pitch. Cronote, SyncWithLove, CrowdSurf and play-reveal.com already
ship that mechanic free in a browser with no install. Jackbox, Gartic Phone and
Spyfall taught people the room-code pattern years ago. The narrower claim, no
scaled mobile-native deep-question synchronous product, survived, but that is
a much weaker wedge.

**The cold start was compounded.** Every session needed 2–8 simultaneous native
installs, but only the host could ever pay. There was no browser join, so a
guest could not follow a link. Facebook's "7 friends in 10 days" and Draw
Something's 50M downloads both solved coordinated adoption with asynchronous
play and viral invites. DEEPER had neither.

**Monetisation was the wrong shape.** Ten free games, then a subscription, is a
delayed freemium gate in the worst-converting category. RevenueCat's 2026
report (115,000+ apps) puts median D35 conversion at 2.0%, Gaming at 1.0%,
hard paywall at 10.7% against freemium at 2.1%, and ~50% of conversions on Day
0. A fixed question bank is also the wrong thing to put behind a recurring
charge: "not enough usage" is the top cancellation reason category-wide.

**The content bank was smaller than it looked.** Eight decks × 100 question IDs
reads as 800 questions. It is 160 hand-written prompts, each mechanically
expanded with one of five suffix phrases (`" — on a quiet morning?"`). A player
can meet the same base prompt several times in one session. The no-repeat
selector was built on the assumption that those 100 IDs were 100 distinct
questions.

**The paywall was bypassable by design.** "Delete local data" clears the
identity and the free-game counter. The device key changes, the server creates
a fresh user row, and ten more games appear. With no accounts there is no way
to fix that server-side without adding identity, which would break the privacy
promise. The whole credit system was theatre.

**The best mechanic was locked behind the wrong door.** Prediction mode, the
only part of the product that is a game rather than a card deck, was tied to
`know-me`, which is capped at two players. It could never be played in the 3–8
player sessions that were the only real differentiation.

**Privacy removed the measurement loop.** No analytics, no accounts, no
attribution, no share surface. Admirable as a data promise, fatal as a way to
learn whether anyone comes back. The promise should have been about answer
content, not about counting sessions.

**Effort was misallocated.** Generated OG images, a design-iteration log, a
headless-Chrome rendering pipeline, a hand-rolled PNG encoder and 45
static audit gates were built for a marketing site with zero visitors. All of
it is good craft. None of it produced information about demand.

For the full research with sources and reliability notes, see
[viability-assessment-2026-11-05.md](viability-assessment-2026-11-05.md).

## What the research concluded

A real but small niche exists. Physical question decks have proven sell-through
at scale (TableTopics, 3.5M copies; We're Not Really Strangers' viral TikTok
run), and Paired is a funded category leader. But no evidence was found of
unmet demand for a synchronous, all-players-install, host-pays mobile
implementation, and free substitutes already cover the core mechanic. Category
TAM estimates disagree by up to 7.5×, so none were used as a calculation.
Realistic ceiling with strong organic distribution: a $200K–2M ARR niche indie
product, not a venture-scale business.

The recommendation was to finish a *cheap validation vehicle*, not a launch.
On reflection even that was too generous: the native app is a confounded
instrument, because install friction is baked into the funnel. A "no demand"
result would be indistinguishable from "six people would not install an app".
The correct test was a web guest client, real groups, and pre-committed
repeat-play gates.

## Why open source instead of that test

Running a proper validation needs a willingness to do distribution work:
recruiting players, watching sessions, making short-form video, asking
strangers to come back. That is the remaining work, and it is not engineering.
It was not work the project owner wanted to do. Rather than leave a finished
codebase rotting in a private repo, the honest ending is to publish it, write
down what was learned, and stop.

So: no store accounts, no launch, no roadmap. The code is MIT. Fork it.

## What is still worth taking

- The authoritative `GameRoom` state machine and the typed Socket.IO contract
  in `packages/shared`.
- Redis live-state mirroring with AES-256-GCM encrypted in-flight answers, a
  safe failure direction when `LIVE_STATE_SECRET` is missing, and rehydration
  on cache miss.
- The deliberate absence of an answers table in Postgres, and the retention
  job that enforces the policy's windows.
- The RevenueCat webhook: raw-body HMAC verification, constant-time compare,
  replay window, event-id deduplication, and correct cancellation semantics.
- The site audit's core idea, that marketing claims should be enforced by code
  rather than by good intentions. It caught a false "play in your browser"
  claim before it shipped.

## If someone picks this up

The three changes that would matter, in order: a no-install browser guest
client; one-time deck packs instead of a subscription (and delete the
entitlement layer entirely); and prediction mode available to groups rather
than couples only. Then measure second-session rate before writing any more
content.

Do not add more questions. Do not add more decks. Do not polish the site.
