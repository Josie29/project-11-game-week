# Welcome screen, accounts, and shared craps

> Decided by grilling session, 2026-08-26. Deadline: **Thu 2026-08-27 midnight**.
> Sequenced so Deliverable 1 stands alone if Deliverable 2 does not land.

## Objective

A welcome screen is the first thing a new player sees. They choose to play as a
guest or sign in with Google, choose Single Player or Multiplayer, and can read
the controls before they start. Multiplayer builds toward strangers betting on
the same craps roll.

## Non-goals

- **Shared blackjack.** Later. A shared shoe needs turn order, a blocking
  timer, and a shared `revealTimeline`; split and resplit multiply the seats.
- **Server-authoritative money.** Every table is played against the house, so
  no player's payout comes from another player's stake. There is no pot, so
  there is nothing to secure. Bankrolls stay client-side.
- **Room codes, lobbies, friends lists.** One global room.
- **A guided tutorial.** The game has one verb — proximity offers, F accepts —
  so it gets a reference card, not a sequence.
- **Native iOS.** Already out of scope per SPEC.

## Decisions

| # | Decision |
|---|---|
| 1 | Welcome screen comes before the character designer |
| 2 | Guest is the default; Google sign-in optional; cherry-picked from `feature/supabase-accounts` |
| 3 | The designer becomes skippable into a default appearance |
| 4 | Guests type a name; generated fallback if blank |
| 5 | Toggle reads "Single Player" / "Multiplayer" |
| 6 | The toggle *is* the socket — Single Player never connects |
| 7 | Toggle shows disabled with a reason when `VITE_MULTIPLAYER_URL` is unset |
| 8 | Static controls card, no guided tutorial |
| 9 | Shared craps first; shared blackjack later |
| 10 | One global room, no codes |
| 11 | FIFO shooter queue by arrival, passing on seven-out |
| 12 | Absent shooter: 30s timeout force-rolls, play continues |
| 13 | Arriving mid-point: place and come immediately, pass line waits for the come-out |
| 14 | Deliverable 1 ships before Deliverable 2 |
| 15 | Presence is already on main; auth cherry-picks on top |
| 16 | `?boot=` skips the welcome screen; `?boot=welcome` added |
| 17 | The Durable Object generates the dice, and knows nothing else about craps |

Decision 17 is forced by 12: a timeout that force-rolls on behalf of a shooter
whose tab has closed cannot ask that tab for the numbers.

---

## Deliverable 1 — Welcome screen and accounts

### Phase 0: worktree

Own worktree, because other sessions are committing to the main checkout.

- Copy `.vercel/` in, or a deploy silently creates a stray project and the live
  URL never changes.
- Check no ignore glob shadows the worktree's own sources — a `.claude/**`
  pattern has previously stopped Vite's watcher seeing every file, which is
  indistinguishable from code that does not run.
- Expect a CLAUDE.md conflict on merge. Three sessions are appending to it.

### Phase 1: cherry-pick auth

From `origin/feature/supabase-accounts`, auth-only files:

| File | Lines on branch | Note |
| --- | --- | --- |
| `src/store/supabase.ts` | 36 | client + `isSupabaseConfigured` |
| `src/store/useAuthStore.ts` | 108 | `AuthStatus.Restoring \| Guest \| SignedIn` |
| `src/ui/AccountBadge.tsx` | 57 | HUD affordance |
| `src/store/saveSync.ts` | 228 | **see below** |
| `src/world/saveSync.ts` | 183 | **see below** |

**Open question for the survey, not an assumption:** the branch shows *two*
`saveSync` files at different paths and different sizes. One is likely a move
the diff did not detect. Establish which is current before either is picked.

The branch predates the shop and strip work, so a straight merge shows it
deleting `shopLayout.ts`, `stripLayout.ts` and `useActionKey.ts`. It is behind,
not in conflict. Pick files, do not merge the branch.

**External configuration, and the most likely thing to eat an evening:** Google
OAuth needs the redirect URL registered in both the Supabase dashboard (project
ref `otsnbopzcorftjypuxda`) and the Google Cloud console, for the production
alias *and* for `localhost:5180`. This is manual, cannot be scripted from here,
and sign-in fails in production while working locally if only one is set.

Acceptance:

- With `VITE_SUPABASE_URL` unset, the game starts as a guest immediately and
  behaves exactly as it does today. This is what protects every capture.
- Signing in with Google returns to the strip, not to a `?boot=` link — the
  redirect drops the query string, or the shortcut re-runs on return.

### Phase 2: the welcome screen

New: `src/ui/WelcomeScreen.tsx`. Modified: `src/App.tsx`, `src/store/useAppearanceStore.ts`.

`App.tsx:31` currently derives the first run from the wardrobe save:

```ts
const isDesigning = location === Location.Designer || (!hasDesigned && location === Location.Strip)
```

The welcome screen goes in front of that, on a persisted flag of its own.
Do not overload `hasDesigned` — decision 3 makes designing skippable, so
"has been welcomed" and "has designed" become genuinely different states and a
player who skips the designer must not be shown the welcome screen forever.

Contents: guest or Google; a name field for guests; Single Player / Multiplayer;
a link to the controls card.

Acceptance:

- Fresh profile lands on the welcome screen, not the designer.
- Skipping the designer produces a **drawable** character, not a hole —
  `sanitizeAppearance` already guarantees a total default; use it rather than
  inventing a second one.
- Picking Single Player means no socket is opened at all. Verifiable in the
  network panel, and the reason `shouldSend`'s cost model survives.
- With `VITE_MULTIPLAYER_URL` unset the toggle is visibly disabled and says why.

### Phase 3: controls card

New: `src/ui/ControlsCard.tsx`. Static. Reachable from the welcome screen and
from a key in-game. Content is WASD and F, because that is the whole game.

### Phase 4: capture harness

Modified: `src/dev/bootShortcut.ts`, `scripts/shots.mjs`.

- Every existing `?boot=` link skips the welcome screen, exactly as it already
  skips the designer and suppresses the socket.
- `?boot=welcome` added, so the screen itself is capturable. Pin `?time=` and
  `?freeze` like every other shot.

Acceptance: `npm run shots` passes and gains one image. `npm run walkthrough`
passes unchanged — it must not have to click through a new screen.

---

## Deliverable 2 — Shared craps

Starts only when Deliverable 1 is deployed and verified. Phases 5 and 6 are
pure TypeScript and touch nothing in Deliverable 1, so they can begin early in
parallel if there is a second session to run them.

### Phase 5: the engine takes a roll

`src/games/craps/engine.ts`, `types.ts`.

Today `CrapsState.rngState` carries mulberry32 forward because craps rolls
indefinitely. Shared, the roll arrives from outside. Change the engine to
**accept a `DiceRoll` as a parameter**: solo passes one from its own seeded
generator, shared passes the one the room sent. `rngState` stays for solo.

This keeps the engine pure and seeded, keeps every existing craps test, and
stops generation being the only way a roll can enter. It does not make the
engine time-dependent — the rule that the engine decides and physics performs
is unchanged, only *who* decides moves.

### Phase 6: bets become per-player

`CrapsBets` is one `Readonly<Record<CrapsBet, number>>` — a single bettor.
Shared, `phase`, `point`, `lastRoll` and `rngState` stay shared while bets go
one-record-per-player. Payouts still come from the house.

Acceptance: money invariants hold per player. Every offered stake pays whole
dollars on every outcome, as the existing property tests already require.

### Phase 7: the room owns dice and queue

`worker/index.ts`.

- Generates two numbers on request and broadcasts them. It learns what a die
  is, not what craps is — no phase, point, bets or payouts.
- Derives the FIFO shooter queue from the roster it already keeps. `JoinMessage`
  already carries `seated`; `rollCount` is already "rolls since the current
  shooter took the dice" and `SevenOut` is already "the shooter's turn is over".
- `acceptWebSocket`, never `accept()`. Identity in `serializeAttachment`, never
  a `Map` — a hibernating object keeps its sockets and loses its memory.
- **The alarm is the one thing that can put the bill above zero.** A 30s
  force-roll timer is a Durable Object alarm, and an alarm wakes a hibernated
  object on purpose. Set it *only* while a point is live and a shooter is
  seated; clear it on seven-out. Test it in the same spirit as `shouldSend`:
  an alarm that can be set at an idle table is a rented server by another route.

### Phase 8: wire the client

Acceptance, and the reason `npm run multiplayer` exists — it drives two browser
contexts with separate `localStorage`, so genuinely two players:

- Two players at one table see the same faces on the same roll.
- The dice pass on seven-out, in arrival order.
- A player joining mid-point can place and come, and cannot bet the pass line
  until the come-out.
- Closing the shooter's tab does not freeze the table for the other player.

---

## The cut line

Roughly a day and a half remains. Deliverable 1 is achievable. Deliverable 2 is
four phases including a worker change and a distributed-timing case, and it is
**not** on SPEC's five-minute demo script.

If the clock runs out, ship Deliverable 1 with the toggle live and multiplayer
meaning presence. Do not ship a half-wired shared table: the failure mode is a
player sitting at craps waiting for dice that never arrive, which is worse than
a game that is honestly solo.

The label is the known cost of this order. Between the two deliverables
"Multiplayer" buys other people walking the same street and solo tables.
Accepted deliberately — it is the destination, not a description of the
intermediate state.

## Verification

Per CLAUDE.md, both, every time, before it is called done:

1. `npm run walkthrough` against the deployed URL, plus `npm run multiplayer`
   for anything in Deliverable 2. The walkthrough drives one browser and cannot
   tell a room that never connected from one that did.
2. `npx vercel --prod --yes`, then compare the served bundle against the local
   build — the CLI has reported `Ready` and `Aliased` while the alias went on
   serving the previous build:

   ```
   curl -s https://project-11-game-week.vercel.app/ | grep -o 'index-[^"]*\.js'
   ```

   The production alias is shared between sessions and another checkout can
   take it minutes after a deploy, so verify against the immutable deployment
   URL, not the alias.
3. `npm run shot` the welcome screen and **look at the image**. A screen that
   has never been viewed ships with bugs in it.
4. Say plainly what was not verified.

**Against a deployed URL is the run that counts.** `wrangler dev` is miniflare
with no network in front of it, so anything racing the WebSocket handshake
passes locally and fails in production — which is exactly how the first pose
went missing for a player who joined and stood still.

## Assumptions, stated rather than buried

1. **An absent shooter's staked bets are abandoned.** Their client debited on
   placement and is gone; nothing credits back. The alternative is replaying
   missed rolls into a reconnecting client, which costs more than the fairness
   it buys.
2. **30s** on the force-roll timer. Tunable, not load-bearing.
3. **Peers see different tumbles, same faces.** `CrapsDice` already turns
   settled dice to the face the engine decided, so shared rolls need no
   deterministic physics. Two players will see the dice land at slightly
   different moments. Believed invisible; the assumption most likely to be
   wrong, and cheap to check with `npm run multiplayer`.
