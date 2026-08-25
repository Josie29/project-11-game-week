# Neon Strip — Game Week Spec

> Brief: [BRIEF.md](BRIEF.md) · Deadline: **Thursday 2026-08-27, midnight** (~3.5 working days from Mon 08-24)

## Concept

A third-person 3D casino crawl. You walk a stylized Vegas strip at night, enter
casinos, and play table games with a persistent bankroll. Blackjack first, craps
second.

## Deliverable

A public Vercel URL that loads in a desktop browser and is playable without
install. Native iOS is explicitly **post-Game-Week** (see Non-Goals).

## The 5-minute demo script

Everything gets built toward this path. If a feature is not on it, it is cut.

1. Spawn on the strip at night, neon lit. (0:00)
2. Walk ~15s past signage toward a casino entrance. (0:15)
3. Enter — camera transitions to the blackjack table. (0:45)
4. Bet chips, play one hand, win. Bankroll updates. (1:30)
5. Exit, walk to the second casino. (2:30)
6. Craps: place a pass-line bet, physics dice roll, resolve. (3:30)
7. Return to the strip, bankroll persisted. (4:30)

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Renderer | `three` | 0.185 |
| React bindings | `@react-three/fiber` (needs React 19) | 9.7 |
| Helpers | `@react-three/drei` | 10.7 |
| Physics (craps dice only, from Wed) | `@react-three/rapier` | 2.2 |
| Character controller | hand-rolled, transform-based | — |
| State | `zustand` | 5.0 |
| Build / host | Vite + TypeScript → Vercel | — |

Chosen over Godot 4 because judging is **staff + student vote**: a clickable URL
beats a better game behind a download. Godot's advantage is native iOS export,
which is deferred.

TypeScript is pinned to **^6**, not the newly-GA 7.x — R3F's JSX namespace
augmentation plus the large `@types/three` surface is the wrong thing to put on
a brand-new compiler during a four-day build.

The town character is **not** physics-driven. The strip is flat and the only
interaction is walking through a doorway, so movement is transform-based with a
damped follow camera. Rapier enters on Wednesday scoped solely to the craps
dice, inside the craps scene's own `<Physics>` provider — the two never
interact, so this is a permanent boundary rather than a shortcut to unwind.

## Architecture

The one rule that matters:

**Game rules are pure TypeScript with zero rendering imports.**

```
src/
  games/
    blackjack/{engine.ts, types.ts}   # pure state machine, seeded RNG
    craps/{engine.ts, types.ts}       # pure state machine, seeded RNG
  scenes/                             # R3F: strip, casino interiors
  ui/                                 # HUD, betting overlay
  store/                              # zustand: bankroll, location, game session
src/__tests__/                        # rules tests (see testing rules)
```

Why: craps becomes cheap to add on day 3 because the hard part is isolated;
rules are unit-testable instead of hand-played 50 times; and the engines port
unchanged to a native iOS rewrite later.

## Art pipeline — as built

The plan was downloaded assets plus Comfy-generated textures. What shipped is
almost entirely procedural, and the change was an improvement rather than a
compromise.

| Asset | Planned | Shipped |
| --- | --- | --- |
| Card faces and backs | Comfy textures | drawn to canvas at runtime |
| Table felt, both games | Comfy textures | drawn to canvas at runtime |
| Casino marquees and blade signs | Comfy → emissive quads | drawn to canvas at runtime |
| Building facades, night sky, dice pips | Comfy / Kenney | drawn to canvas at runtime |
| Player and dealer | Mixamo rigged GLB | procedural primitives with named joints |
| Buildings and street props | Kenney / Quaternius kits | procedural primitives |
| Audio | Kenney / Freesound | **cut** |

Drawing textures at runtime turned out to beat generating them: no asset
pipeline, no download, crisp at any resolution, and the text on a card or a
felt is guaranteed correct rather than whatever a diffusion model produced.
Building the characters from jointed primitives is what made the casino hand
signals possible at all — they are authored by rotating named joints, which no
imported rig would have allowed on this timescale.

**Comfy earned its place as reference, not as assets.** The renders in
`art/refs/` are what the dealer's suit, the D-shaped felt, the printed rules
and the neon strip were matched against. They were the most efficient
direction given on the project; they simply were not shipped.

## Acceptance criteria — all met

**Blackjack** (must ship) — **shipped**, plus splitting, which was a non-goal
- Hit, stand, double down, bust, dealer stands on soft 17, blackjack pays 3:2
- Ace counts as 1 or 11 correctly, including multi-ace hands
- Chip bet placed before deal; bankroll debits on bet, credits on win
- Engine is deterministic under a fixed seed and covered by tests

**Craps, simplified** (ships if the Tuesday checkpoint passes) — **shipped**;
the checkpoint passed
- Pass line, don't pass, free odds, field — no come/place/prop bets
- Come-out roll → point established → point or seven-out resolution
- Physics dice roll visibly on the table (rapier)

**World** — **shipped**
- Third-person character walks a single street loop at 60fps on a laptop
- Two enterable casino doors with a camera transition
- Bankroll persists across a page reload (localStorage)

**Ship** — **shipped**
- Deployed to Vercel on **day one** and on every subsequent day
- Full demo script runs start to finish without a crash or a reload

## Non-goals

Explicitly not this week — listing them so they stop being tempting.
**Splitting pairs was on this list and shipped anyway**: the pure-engine split
meant it cost a day rather than the week that was feared, and it is covered by
tests.

- Native iOS build, App Store submission, TestFlight
- Multiplayer, accounts, backend, leaderboards
- Real money or in-app purchases of any kind
- Open-world town, interior NPCs, traffic, day/night cycle
- Card counting, side bets, insurance
- Craps: come bets, place bets, hardways, any prop bet
- Mobile touch controls (desktop keyboard/mouse only)

## Schedule and checkpoints

| Day | Target |
| --- | --- |
| **Mon 08-24** | R3F skeleton, character walking one block, door trigger. Blackjack engine + tests. **Deploy to Vercel today** so deploy is never a Thursday problem. |
| **Tue 08-25** | Blackjack playable end to end: 3D table, dealt cards, chip betting, persisted bankroll. Comfy: skybox + 2 neon signs. |
| **Tue 9pm** | **CHECKPOINT — is blackjack demo-quality?** No → craps is cut, Wednesday goes to slots (2-3h) or town polish. |
| **Wed 08-26** | Craps: simplified bet layout + rapier dice. Second casino interior. |
| **Thu 08-27** | **Feature freeze at noon.** Audio, lighting polish, rehearse the demo, submit. |

Delivered on schedule. Audio was cut by choice rather than by time.

## What the plan got wrong

Worth recording, because the misses were more instructive than the hits.

- **The art pipeline was the biggest miss** and the happiest one. Every texture
  is drawn to canvas at runtime instead of generated or downloaded. See the
  pipeline table above.
- **Splitting pairs was listed as a non-goal and shipped anyway.** The
  pure-engine rule made it affordable. The non-goals that held were the ones
  about scope of *world*, not scope of *rules*.
- **Physics arrived only in craps**, exactly as scoped, and the boundary held:
  the strip character and the blackjack table never touch rapier.
- **The riskiest thing was not any feature — it was working without seeing the
  result.** A whole session of table work shipped with four visible bugs
  because it was written blind. The headless capture loop that fixed it
  (`npm run shot`, `npm run shots`) should have existed on day one, and is now
  the first thing `CLAUDE.md` asks for.
- **Hand-derived 3D coordinates were wrong more often than the game rules
  were.** Unit-testing anchors against the felt outline caught three placement
  bugs that no amount of squinting had.

## Risks

| Risk | Mitigation |
| --- | --- |
| Craps bet-placement UI is the hardest UI in casino gaming | The 4-bet simplification is the mitigation. Slots is the fallback: ~3h, huge juice. |
| 3D scope creep eats the games | One street loop, two doors. Non-goals list is binding. |
| Asset wrangling (Mixamo rigs, GLB export) burns a day | Timebox to Monday afternoon; ship a capsule character if it slips. |
| Perf tanks with many emissive neon materials | Low-poly kits, baked lighting, instanced meshes. Budget: 60fps on a laptop. |
| App Store guideline 5.3 (simulated gambling) | Post-week concern, but shapes monetization: 17+ rating, and selling chips for real money invites rejection. Decide before building economy features. |

## Award targeting

Four separate prizes; the plan deliberately spans three.

- **Best Visuals** — neon strip + Comfy-generated skybox and signage
- **Staff Pick / Technical Achievement** — 3D, physics dice, character controller
- **Most Creative / Fun** — the walk-between-casinos framing is the differentiator; anyone can build a blackjack UI
- **Best Overall** — depends on the demo running clean, hence the Thursday freeze
