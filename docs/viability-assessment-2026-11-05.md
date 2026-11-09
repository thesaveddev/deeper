# DEEPER — market viability assessment

**Date:** 5 November 2026
**Subject:** Is there a market for DEEPER, is there demand for it, and is it worth completing and investing in?
**Scope:** External market evidence only. DEEPER has zero users, no store listing and no analytics SDK, so there is **no first-party product data** anywhere in this assessment. Every number below is a category prior, not a measurement of DEEPER.

> **Status: frozen research snapshot, not a live recommendation.** This report
> was written on 5 November 2026, before the decision to stop the project. Its
> "yes, complete it as a cheap validation vehicle" verdict was subsequently
> **not taken**: the distribution work it recommended was judged not worth
> doing, and the source was published under MIT instead. It is kept here
> unaltered as the evidence base for that decision. For the outcome, read
> [POSTMORTEM.md](POSTMORTEM.md). Details such as "42/42 site gates" and
> "pre-launch" describe the repository as it was on that date.

---

## 0. Executive verdict

| Question | Answer | Confidence |
|---|---|---|
| Is there a market? | **Yes — a real but small, slow-growing niche.** Analogue conversation decks have proven sell-through at scale; the digital couples-relationship category is roughly $0.3–2B depending on which (unreliable) estimate you believe, and the gamified-quiz slice is plausibly $100–300M. | Medium |
| Is there demand? | **Yes for the behaviour, unproven for this product.** People demonstrably buy question decks and use couples question apps. There is **no verified evidence of unmet demand** for a synchronous, all-players-install, host-pays mobile implementation — and several free browser products already ship that mechanic. | High on the absence |
| Is it worth completing? | **Yes.** The remaining work is a few hundred dollars and days of effort, and completion converts an untestable asset into a testable one. | High |
| Is it worth investing into? | **No — not yet, and not in its current configuration.** Paid acquisition, a content studio, or a team would be capital into a model that sits on the wrong side of nearly every published subscription benchmark. | High |

**One-line recommendation:** finish DEEPER as a *cheap validation vehicle*, change three things before launch (no-install guest join, monetisation shape, measurement/sharing), validate against explicit gates, and only then commit money. Treat the realistic ceiling as a **$200K–2M ARR niche indie product, not a venture-scale business**. With the current design the most likely outcome is under $1K MRR.

---

## 1. What is being assessed

DEEPER is a pre-launch, synchronous 2–8 player mobile conversation game. A host creates a room, guests join with a 4-character code, everyone sees the same question and answers privately, then answers are revealed simultaneously, players react, and the host advances through 10 questions. Eight decks / 800 questions; one prediction mode; an age-gated deck. Hosts get 10 free games, then DEEPER+ unlocks three premium decks. The engineering is essentially complete: typecheck clean, 70/70 unit tests, 42/42 site gates, three-job CI including a two-client end-to-end smoke test. What is missing is distribution: no EAS project ID, no submitted build, no public HTTPS server, no RevenueCat products, no web client, no ad/analytics/crash SDK, no accounts, no support address.

That distinction matters. This is **not** a "build the product" question — the product is built. It is a **"does the go-to-market model have a right to exist"** question.

---

## 2. Is there a market?

### 2.1 The honest answer on TAM

No analyst firm publishes a measured market size for "mobile party/social games", "couples apps", "conversation card games" or "social connection apps" as distinct categories. What exists are large generic proxies and modelled estimates that disagree badly:

- Couples/relationship apps: **$265.4M (2025) → $599.7M (2032), 12.35% CAGR** [S1]; a separate estimate says **$1.35B (2025) → $4.38B (2035)** and another **$2.0B (2025)** [S2]. Same category, ~7.5× apart.
- The $265.4M source breaks out **"Gamified Intimacy and Quizzes" at 45.67% / $121.2M (2025)** — the closest thing to DEEPER's addressable slice [S1].
- Wellness apps (includes fitness, meditation, nutrition): **$11.3B (2024) → $26.2B (2030)** [S3]. Playing cards & board games: **$19.9B (2024) → $31.9B (2030)** [S4]. Both from the same modelled-report vendor, whose two game-market reports imply incompatible growth rates.
- Mobile games IAP: **$81B (2024)**, with game downloads **−6% to 49.6B** [S5]; by 2025 **non-game IAP ($85B, +20%) surpassed games for the first time**, while game IAP grew only 1.3% and game downloads fell 7.2% [S6]. AppMagic's 2026 landscape isolates mobile Party Games specifically: **downloads +7.9% but IAP revenue −16.2%** [S7].

**Conclusion:** use these as context, never as a TAM calculation. The defensible read is a global digital category in the **hundreds of millions**, with the question/quiz slice around **$100–300M**, growing ~10–15%/yr, inside an App Store where supply is exploding and game monetisation is stagnating.

### 2.2 Hard evidence that people pay for this behaviour

This is the strongest part of the bull case:

- **TableTopics: 3.5 million copies sold** (NYT, 2019) [S8]. An older retail claim says "over 2 million" — the 3.5M figure is later and press-reported.
- **We're Not Really Strangers (WNRS):** $25 core game, sold DTC plus Target and Urban Outfitters, a Valentino collaboration (Jan 2021), ~**3M TikTok followers in 12 months / 336M views**, and **one viral video lifted a single product's sales +950% day-over-day** (Modern Retail, 2021) [S9][S10][S11]. WNRS **declined to disclose revenue**. A secondary synthesis claimed ~$5.5M annual revenue / 250,000+ games sold; **I could not verify this from a primary source — treat as unverified.**
- **Hella Awkward** reportedly reached ~$600K lifetime sales and retail distribution in Walmart (1,000 stores) and Target (520 stores) after Shark Tank, with ~$2.80 COGS against $24.99 retail [S2 — secondary synthesis].
- Pandemic-era corroboration: US games & puzzles sales **+42% in 2020** (Toy Association), NPD **+43% H1 2020**, and DW reporting a "digital detox" shift with **"family games and games for two" the fastest-growing segment** [S12][S13].
- **Official tailwind:** the 2023 US Surgeon General's advisory — ~half of US adults report loneliness; in-person time with friends fell from ~60 min/day two decades earlier to ~20 min/day in 2020; it explicitly asks technology companies to build products that strengthen relationships [S14]. WHO frames loneliness as affecting 1 in 6 people [S2].
- **Adjacent market signal:** dating app revenue fell for the first time in 2025 (**−2% to $6B**; Tinder −5.2%, Bumble −9.5%) while **Hinge, the intent-led, prompt-and-conversation-driven product, grew ~25%** [S15]. Consumers are not rejecting conversation products; they are rejecting aggressive monetisation. That is an opening — and also a warning.

### 2.3 What the market does *not* support

- No measured demand for a **synchronous** version of the category.
- No willingness-to-pay data for a **couples/friends conversation subscription at DEEPER's price point**.
- No retention benchmarks for same-room, separate-phone group play.
- No revenue distribution published by Apple or Google; all app-level figures are third-party panels or estimates.

---

## 3. Is there demand — specifically for DEEPER?

**Weak or absent signals (verified as absent, not merely unsearched):**

- **Google Trends / absolute search volume** for "we're not really strangers", "conversation cards", "questions for couples", "deep questions to ask", "how well do you know me questions": no credible published volume series found. Google Trends returns a 0–100 relative index, so any "X searches/month" claim would be invented.
- **Reddit / forum / TikTok "is there an app that does X" threads**: none verifiable.
- **WNRS units/revenue**: undisclosed.
- **Direct quantification of "both players must install" failure rates**, or of content-exhaustion churn for finite question banks: no reliable source found.

**What the supply side tells us:** developers keep shipping near-identical question apps (Duoly, Kumustahan, "questions for couples!", teller, Open Up, Qwava, Qoobitz, 21 Questions, Reveal, Spill). That is a demand proxy, but also a commoditisation signal. Store-intelligence snapshots of these long-tail apps mostly show **<5K downloads and <$5K/month revenue**, e.g. "Couple Game: Relationship Quiz" ~$1K/month [S16][S17]. One Play review of "21 Questions" complains specifically about a hard paywall — anecdotal, but directionally consistent with paywall resistance in this niche [S18].

**The category leader is instructive:** Paired claims 8M downloads, 1M+ Play installs, 4.65–4.7 rating across ~300K+ ratings, $79.99/yr, and was Apple App of the Day (Aug 2026). Appfigures estimates **~$460K/month (Sep 2026, estimate, not audited)** [S19]. It raised **$1M (2020) and $3.6M seed (2021)** [S20]. But Paired is **asynchronous, daily-cadence, one subscription covering both partners, with 128+ packs and 1,000+ expert-led quizzes** — the opposite of DEEPER on almost every axis.

**Counter-case worth taking seriously:** a self-reported 2026 solo-founder iOS couples app reached **34,000 users and 713 paying subscribers in 3 months**, ~$2.6K MRR, 4.4% install-to-paid, ~$200/month costs, profitable from month one, **almost entirely via organic TikTok faceless slideshows** [S21]. It is a sale listing with internally inconsistent revenue figures — directional only — but it proves a small organic-funnel product in this niche can be profitable at trivial cost.

**Verdict on demand:** real for the *category*, unverified for the *configuration*. There is no evidence anyone is waiting for a 2–8 player, all-install, host-pays, 10-question synchronous app — and there is evidence of free substitutes that already do the core mechanic.

---

## 4. Competition — the moat is thinner than it looks

| Type | Examples | Why it matters |
|---|---|---|
| Funded category leader | Paired ($79.99/yr, 8M downloads claim, $3.6M seed) | Owns "couples deep questions" mindshare; rotating library beats a fixed 800 |
| Free / therapy-adjacent | Gottman Card Decks (22 decks, 1,000+ cards, **free**), Lasting free starters, Agapé, Between | Free expert-branded content removes the content premium |
| Direct mechanic, browser | **Cronote** (2–30 players, private answers, simultaneous reveal, no app/account, free), **SyncWithLove** (private link, answers reveal together in real time), **CrowdSurf** (3–20 players, browser, no account), **play-reveal.com** (couples memory-card reveal) [S22][S23] | **"Synchronous multi-phone reveal" is not a first-mover claim.** Cronote even ships "36 Questions", "Deep Questions for Your Partner" and "How Well Do You Know Me" |
| Browser room-code habit | Jackbox (phones as controllers, $29.99 one-off), Gartic Phone (free, 30 players), Spyfall Online (free, code-sharing) | The behaviour DEEPER needs is already learned — and free |
| Crowded long tail | Couple Game, Duoly, Kumustahan, 21 Questions, Reveal, Spill, teller, Open Up | Commoditised; most earn <$5K/month |
| Physical / zero-friction substitutes | WNRS $25 deck, TableTopics, Arthur Aron's free 36 Questions, printable decks, TikTok templates, ChatGPT | Gifting/occasion value, infinite free content, no install coordination |
| Distribution platforms | Discord Activities (reported 80M+ monthly players, games inside voice channels with no install), WhatsApp in-chat games (up to 8, Nov 2025), Plato | Can absorb the mechanic with zero install friction [S2 — secondary] |

**Important correction to any pitch deck:** DEEPER's "nobody does simultaneous reveal on separate phones" differentiation **fails**. Cronote and SyncWithLove already ship it free in a browser with no install. No *scaled, mobile-native, deep-personal-question* synchronous product was found — that narrower claim holds — but that is a much weaker wedge.

**What DEEPER can honestly claim:** (i) group-first 2–8 players rather than the couple-only 2-player format that dominates; (ii) a host-paced live session with reactions rather than a daily async drip; (iii) structured deck taxonomy plus prediction mode; (iv) genuinely no accounts, no ad SDK, no analytics SDK, answers never persisted unencrypted. Note (iv) is also a weakness: no cross-device continuity, no social graph, no attribution, no re-engagement loop.

**Power-law reality check:** Steam's "Party Game" tag generated $804.5M lifetime across 103.53M units, but of 1,443 released titles only **643 earned any premium revenue and the median earner made $8K**; Fall Guys alone is $253.6M [S7]. The category is a hits business.

---

## 5. Unit economics — where the current design breaks

All figures below are from **RevenueCat State of Subscription Apps 2026** (published Mar 2026; **2025 metrics; 115,000+ apps, $16B+ revenue, 1B+ transactions**), which I verified directly against the primary report [S24]. It is an **opt-in, subscription-only panel**, so it likely *understates* failure across all apps.

| Benchmark | Value | DEEPER's position |
|---|---|---|
| Median D35 download-to-paid | **2.0%** | — |
| Gaming D35 conversion | **1.0% (lowest category)** | DEEPER is positioned as a game |
| Health & Fitness D35 | **2.9% (highest)** | Relationship/wellness positioning would roughly triple the prior |
| Hard paywall vs freemium | **10.7% vs 2.1% (5×)**, with near-identical year-one retention | DEEPER is delayed freemium — the worst cell |
| Conversions on Day 0 | **~50.6%**, 60%+ within week one | 10 free *group sessions* pushes the gate past the conversion window |
| Apps reaching $1K monthly revenue within 2 years | **17.3%** | ~83% never do |
| Apps reaching $10K monthly | **4.6%** | — |
| Median monthly revenue 1 year after launch | **~$72** | — |
| Median revenue per install | **$0.23 D14 / $0.34 D60**; Gaming **$0.08 / $0.14** | — |
| New subscription apps launched/month | **~2,000 (Jan 2022) → 14,700+ (Jan 2026), 7×** | Discovery is getting harder |
| Apps launched pre-2020 | **69% of all subscription revenue**; 2025+ launches only 3% | Incumbency dominates |
| Top cancellation reason | **"Not enough usage", 32–47%** across categories | A finite 800-question bank is structurally exposed |
| Annual subscriptions cancelled in month 1 | **~30%** | — |
| Lowest retention categories | **Gaming and Social & Lifestyle** | DEEPER sits in both |

**Acquisition:** Adjust 2026 median CPI is **$0.56 global, $1.68 North America, $1.47 Card vertical** [S25]. Illustrative arithmetic (derived, not sourced): at 1.0–2.1% conversion, acquiring one paying host costs roughly **$70–170 in ad spend**, before the 15% small-business store commission [S26][S27] and before ~30% month-one churn. Against Gaming median pricing of **$4.99/mo or $24.99/yr** [S24], payback is implausible without a near-zero-CAC organic funnel.

**Store/platform costs:** Apple Developer Program **$99/yr** [S28]; Google Play **$25 one-time** (secondary sources only — no official page verified) [S29]. Apple/Google take **15%** under the small-business / first-$1M thresholds, 30% above [S26][S27]. A comparable 2026 solo-founder couples app running Supabase + RevenueCat + push reports **~$200/month all-in** [S21]. That is the realistic order of magnitude for DEEPER's Socket.IO + Postgres + Redis stack at small scale.

### Five structural problems specific to DEEPER

1. **The 10-free-games paywall is a delayed freemium gate in the worst-converting category.** It arrives after ten coordinated multiplayer sessions — well past the Day-0/week-one window where ~50–60% of conversions happen — and after the group has plausibly exhausted the novelty.
2. **Host-pays plus all-players-install is a compounded cold start.** Each session needs 2–8 simultaneous native installs, but only one participant can ever pay. Facebook's "7 friends in 10 days" threshold [S30] and Draw Something's asynchronous, invite-loop-driven 50M downloads [S31] show coordinated adoption is solvable — with async play and viral invites, neither of which DEEPER has. No web client means a guest cannot join from a link.
3. **A fixed 800-question bank is the wrong shape for a recurring subscription.** 100 questions per deck, one shared question per round. Incumbents answer this with rotating libraries, daily cadence and streaks. "Not enough usage" is already the top churn reason category-wide.
4. **Privacy-first removes the measurement loop.** No analytics SDK, no accounts, no attribution, no sharing loop beyond a code. The site's honesty gates are admirable, but a product that cannot measure its funnel cannot optimise one — and the top 5% of apps depend on that loop.
5. **Monetisation is single-stream.** ~60% of subscription games and 61.7% of Gaming apps mix in IAP/consumables/lifetime [S24]. DEEPER has no ads, no one-time purchase, no lifetime tier — precisely the configuration with the lowest conversion and lowest RPI.

**Regulatory flag (unverified):** secondary reports suggest Apple will require 18+ ratings for apps with dating/romance features from 16 Nov 2026. Apple's primary page did not confirm this when checked. Given the couples and "after-dark" decks, verify before submission — it would materially affect discovery.

---

## 6. Cost to complete vs cost to invest

**Completing (cheap, bounded):**

| Item | Order of magnitude |
|---|---|
| EAS project ID + first dev build | Account action; free tier likely sufficient |
| Apple Developer / Google Play | $99/yr + $25 one-time |
| Public HTTPS server + Postgres + Redis | ~$20–$200/month at small scale |
| RevenueCat products, keys, webhook secret | Dashboard configuration; check current free tier |
| Age rating, store assets, privacy review | Days of work, already largely prepared |
| **Total cash** | **Roughly $200–$500 to get a testable build live** |

The code is done. The remaining blocker is almost entirely account setup and configuration, not engineering. **Sunk cost is high, marginal cost to launch is low** — which is exactly why finishing is the rational move.

**Investing (expensive, unbounded, currently unjustified):** paid UA, content production at Paired's scale (128+ packs), a web client, social/sharing infrastructure, or a team. At $1.68 NA CPI and 1–2% conversion, paid growth is LTV-negative on the current model. Content is not a moat — a competitor can replicate 800 questions in weeks. The two things that actually worked in this niche were **organic short-form video** (WNRS's +950% day, the 2026 solo app's 34K users in 3 months) and **editorial/retail distribution** (Paired's App of the Day, Hella Awkward's Walmart/Target) — neither is bought with a media budget.

---

## 7. Recommendation

### Yes: complete it, but as a measurement instrument, not a launch

The purpose of the next two weeks is **not revenue**. It is to convert "zero users" into a defensible retention and willingness-to-pay number. Do not spend on acquisition.

### Three changes before the first store build

1. **Remove the install barrier.** A web/no-install guest client (room link, browser join) is the single highest-leverage change. Jackbox, Gartic Phone, Spyfall, Cronote, SyncWithLove and CrowdSurf all prove the room-code browser pattern. This also directly addresses the 2–8 coordinated-install problem. Note: the site's `no web-client claim` audit gate is coupled to `app.json` — adding a web target requires updating that gate, which is a feature, not a bug.
2. **Fix the monetisation shape.** Replace "10 free games then subscription" with one of: (a) a Day-0/hard paywall or short trial, (b) **one-time deck packs at $5–15**, or (c) a single group subscription that covers all players rather than host-only. The evidence strongly favours one-time purchases for a burst-use product; weekly/annual subscriptions on finite content are the highest-churn instrument in the industry. Also consider positioning as **relationship/wellness rather than Gaming** (2.9% vs 1.0% conversion).
3. **Add measurement and a share loop.** Minimal privacy-preserving instrumentation (session counts, second-session rate, funnel events — never answer text) and a real invite/share surface. These can be added without violating the product's privacy promise: the promise is about answer content, not about counting sessions.

### Explicit go / no-go gates before any capital

| Gate | Threshold |
|---|---|
| Real sessions played | ≥100 sessions with ≥2 physical devices, from people outside the developer's network |
| Repeat play | ≥30% of groups start a **second** session within 14 days |
| Group size | ≥25% of sessions have 3+ players (validates the 2–8 wedge vs pass-the-phone) |
| Willingness to pay | ≥5% install-to-paid, or ≥10% of hosts choosing a paid option when offered |
| Organic acquisition | ≥1,000 installs from short-form content with CAC effectively $0 |
| Churn | ≥50% of payers still active after 90 days |

**If repeat play or willingness to pay fail, stop** — no amount of content or polish fixes a burst-use product that people do not come back to. If they pass, the sensible investment is content cadence and an organic video engine, not paid UA.

### What would change this verdict

- Verified first-party retention above 40% second-session and >5% install-to-paid would justify a real subscription build-out.
- A demonstrated organic short-video funnel at <$2/install would change the entire unit-economics picture.
- Evidence of demand from long-distance couples or 4–8 friend groups specifically — synchronisation is a genuine requirement there, not a tax. These are the two most addressable segments.
- A B2B/adjacent channel (team-building, classrooms, therapy adjunct) with institutional pricing would have far better economics than consumer subscriptions.

### Honest ceiling

With strong organic distribution and the fixes above, DEEPER is plausibly a **$200K–2M ARR niche indie product** with excellent gross margins and ~$200/month infrastructure. A >$10M outcome requires becoming a **social venue** (WePlay's 250M downloads / $319M lifetime revenue came from rooms and expressive gifting, not card content) or a **brand** (WNRS's TikTok/retail machine). Neither is what the current codebase is. **Do not fund it as a venture-scale bet.**

---

## 8. Sources and reliability notes

**Primary / high confidence**
- [S24] RevenueCat, *State of Subscription Apps 2026* (Mar 2026, 2025 metrics) — https://www.revenuecat.com/state-of-subscription-apps-2026/ — verified directly: 115K+ apps, 2.0% D35, Gaming 1.0%, H&F 2.9%, hard paywall 10.7% vs freemium 2.1%, 17.3% / 4.6% reach $1K / $10K monthly, ~$72 median MTR at year 1, RPI $0.23/$0.34, 14,700 new sub apps/month Jan 2026.
- RevenueCat *State of Subscription Apps 2025* — https://www.revenuecat.com/state-of-subscription-apps-2025/ — churn, "not enough usage" 32–47%, ~30% annual subs cancelled in month 1.
- [S25] Adjust, *Mobile game user acquisition strategies / Gaming app insights 2026* (14 Oct 2026) — https://www.adjust.com/blog/mobile-game-user-acquisition-strategy/ — CPI $0.56 global / $1.68 NA / $1.47 Card.
- [S26] Apple Small Business Program (15%) — https://developer.apple.com/app-store/small-business-program/ ; [S28] Apple Developer Program $99/yr — https://developer.apple.com/programs/enroll/
- [S27] Google Play service fees — https://support.google.com/googleplay/android-developer/answer/112622
- [S15] Business of Apps, dating market −2% to $6B in 2025, Hinge +25% — https://www.businessofapps.com/news/dating-app-market-first-annual-revenue-decline/
- [S5][S6] Sensor Tower State of Mobile 2025 / 2026 Mobile Market Report — mobile game IAP $81B (2024); non-game IAP $85B (2025) overtaking games.
- [S14] US Surgeon General loneliness advisory, 2023, via CBS/AP — https://www.cbsnews.com/news/loneliness-surgeon-general-epidemic-covid/
- [S20] TechCrunch, Paired $1M (2020) and $3.6M seed (2021) — https://techcrunch.com/2021/05/27/paired-pulls-in-3-6m-to-encourage-more-couples-to-get-cosy-with-app-based-relationship-care/
- [S8] NYT, TableTopics 3.5M copies (2019) — https://www.nytimes.com/2019/11/27/style/self-care/conversation-starters-thanksgiving.html
- [S9] Modern Retail, WNRS TikTok +950% single-day sales, revenue undisclosed (2021) — https://www.modernretail.co/retailers/how-a-little-known-card-game-took-over-tiktok/
- [S10] OMR, WNRS $25 / $12 pricing — https://onlinemarketingrockstars.de/en/brand-playbook-tiktok/
- [S11] Hypebeast, Valentino x WNRS (Jan 2021) — https://hypebeast.com/zh/2021/1/valentino-were-not-really-strangers-card-game
- [S13] DW, board games +20% in 2020, "games for two" fastest-growing — digital-detox framing.
- [S12] KSTP / Toy Association, US games & puzzles +42% in 2020 — https://kstp.com/kstp-news/top-news/you-get-to-interact-and-spend-personal-time-with-the-people-you-love-board-game-puzzle-sales-skyrocket-during-pandemic/
- [S22] Cronote — https://www.cronote.com/ ; [S23] SyncWithLove — https://syncwithlove.com/ ; CrowdSurf — https://playcrowdsurf.com/ ; Reveal — https://play-reveal.com/ (all confirmed live 5 Nov 2026; **traction unverified**)
- [S30] Amplitude, Facebook "7 friends in 10 days" — https://amplitude.com/blog/measuring-active-users
- [S31] Draw Something / OMGPOP 50M downloads in <2 months, Zynga ~$200M acquisition (2012) — https://www.mactrast.com/2012/04/draw-something-sets-new-all-time-record-for-mobile-game-downloads/
- [S7] Game Industry Library, Steam Party Game median earner $8K / AppMagic party games IAP −16.2% — https://gameindustrylibrary.com/research/shared/18-show-me-how-much-money-party-games-can-make

**Estimates / treat with caution**
- [S1] PW Consulting / pmarketresearch, couples-app market $265.4M (2025), gamified quizzes $121.2M — https://pmarketresearch.com/?p=2310022 — modelled, single-vendor; other vendors price the same category up to 7.5× higher.
- [S3][S4] Grand View Research wellness apps / playing cards & board games — modelled projections, mutually inconsistent scopes.
- [S19] Appfigures Paired profile (~$460K/month, Sep 2026 *estimate*) — https://app.appfigures.com/reports/app-profile/ua_Hb5SUl
- [S21] Microns solo-founder couples app listing (34K users / 713 payers / 3 months, ~$200/mo costs, organic TikTok) — https://www.microns.io/startup-listings/relationship-app-for-ios — **self-reported sale listing with internally inconsistent revenue figures**.
- [S2] Aggregated synthesis (Hella Awkward $600K, WePlay 250M downloads / $319M, Discord Activities 80M monthly, WNRS ~$5.5M revenue). The WNRS revenue figure **could not be independently verified** and conflicts with WNRS's own refusal to disclose; do not cite as fact.
- [S16][S17] App-intelligence snapshots of long-tail couples apps (<$5K/month) — third-party estimates.
- [S18] Google Play "21 Questions" review complaining about paywall — anecdotal.
- [S29] Google Play $25 fee — secondary sources only.

**Known gaps (do not fill with guesses):** absolute search volumes; WNRS units/revenue; direct quantification of coordinated-install failure; measured content-exhaustion churn; 2024–2026 category-specific D1/D30 retention (newest split is Adjust 2022); any official Apple/Google revenue-per-app distribution; and — most importantly — **any first-party DEEPER data whatsoever**.

---

*Prepared from external research on 5 November 2026. This is a commercial assessment, not investment advice. All third-party figures are as reported by their sources and have not been independently audited.*
