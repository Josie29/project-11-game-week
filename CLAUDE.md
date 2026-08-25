# Neon Strip

A third-person 3D casino crawl: walk a neon Vegas strip, enter casinos, play
blackjack and craps against a persistent bankroll. React Three Fiber → Vercel.
See [SPEC.md](SPEC.md) for scope and acceptance criteria.

Every rule below is here because breaking it produced a real bug in this
repository. They are not style preferences.

## Architecture

**Game rules are pure TypeScript with zero rendering imports.** Engines live in
`src/games/`, take a seed, and are covered by tests. Scenes read engine state;
they never contain rules.

This is the decision the project rests on. Adding split touched five files and
stayed correct because the rules were isolated. Craps went from nothing to
playable in one sitting for the same reason.

Corollary: **do not make an engine time-dependent to serve an animation.** When
the dealer needed to reveal cards slowly, the fix was a presentation-only
reveal clock in the store, not a slower engine. Same for the dice: the engine
decides the roll, physics only performs it.

## Testing

Vitest, `node` environment, tests in `src/__tests__/`. Everything tested is
pure — there are no rendering tests, by design.

**Test anything that would be invisible in a screenshot.** That is the filter.
Concretely, the three categories that have caught real bugs here:

- **Hand-derived 3D coordinates.** Any anchor placed by hand gets asserted
  against `isOnFelt` in `src/scenes/tableLayout.ts` before it is rendered. This
  has caught a stash overhanging the rail, a split payout falling off the table
  edge, and a chip tray corner clipping a split hand.
- **Money invariants.** Every offered stake must pay whole dollars on every
  outcome. A $25 blackjack stake pays $62.50 on a natural, and 6:5 odds held as
  the decimal `1.2` pay `22.000000000000004`. Both shipped past review and were
  caught by property tests.
- **Ordering and timing.** `src/scenes/revealTimeline.ts` is pure precisely so
  the "result is announced before the card that caused it" case is assertable.
  It also caught a seven-card dealer hand stalling the demo for 4.2 seconds.

Every non-trivial test carries a comment naming the user-facing behaviour it
protects.

## Money

Held as whole dollars throughout. Payout values are **chips returned including
the stake**, so a caller debits on wager and credits on settlement and the two
always net out.

Ratios (3:2, 6:5, 2:1) are stored as numerator/denominator and applied with
integer arithmetic. Never as decimals.

## Visual work

**Run `npm run shot <url> <out.png>` and look at the image before claiming
visual work is done.** An entire session's worth of table work shipped with
four visible bugs in it because it was written without ever being viewed.

The script drives headless Chrome, so it works regardless of window focus, and
it reports frames rendered — a blank capture cannot pass as a success. It takes
a key sequence, so interactions can be verified too.

Dev-only deep links, stripped from production builds:

| URL | Scene |
| --- | --- |
| `?boot=casino` | Golden Ace, awaiting a bet |
| `?boot=table` | a hand dealt |
| `?boot=settled` | a hand played out |
| `?boot=split` | a stacked pair, ready to split |
| `?boot=draw` | a dealer who must draw twice |
| `?boot=craps` | Lucky Viper with a pass line down |
| `?time=HH:MM` | opens at that hour, clock still running |
| `?freeze` | holds the clock, so a capture is reproducible |

`?time=` and `?freeze` compose with any `?boot=`. Every scene in
`npm run shots` pins both — the clock runs during the settle delay, so an
unpinned capture lands on a different sky and different HUD digits each run.

**When something is invisible, build the diagnostic before the fix.** A missing
die looked identical to a die that had tunnelled out of the world;
`window.devRender.locate()` found it at `y = -18` in one run.

## Timers

Delayed transitions are cancellable and identity-guarded: capture the state
they were scheduled against and abandon if it has changed, so abandoning a
round cannot mutate the next one.

**Never park an animation on a handle that gates player input.** Parking the
chip travel time on the action guard silently swallowed every hit and stand for
the first 420 ms of a round.

## Conventions in use

- **Textures are drawn to canvas at runtime**, not shipped as images — cards,
  felt, signage, facades, sky, dice pips. No asset pipeline, crisp at any
  resolution, and text is guaranteed correct. This is also what made the
  day/night cycle affordable: a daytime sky was five more hex values, not a
  generated image.
- **Anything that varies with the hour reads `src/world/timeOfDay.ts`**, which
  is pure and holds every keyframe. Scenes never contain the curve.

  A texture authored for one hour cannot be rescued by lighting at another.
  The facades are painted dark enough for night that no plausible daylight rig
  lifted them, and noon showed a row of night towers with their lights on until
  the texture itself started following the clock.

  Two curves driving one impression have to arrive together. The sky was
  keyframed separately from the facades and neon, and for a while 07:00 showed
  daylit buildings under a night sky.
- **Table geometry lives in `src/scenes/tableLayout.ts`**, not in components.
- **Characters are procedural primitives** with named joint groups, so gestures
  can be authored directly.
- Physics (`@react-three/rapier`) is scoped to the craps scene alone. The strip
  character and the blackjack table are transform-driven and never touch it.
- Use a **fixed physics timestep**. `timeStep="vary"` ties the simulation to
  the frame rate and small fast objects tunnel through walls on a slow frame.
- Set **velocity, not impulse**, on small bodies. A 0.16 m die masses about
  four grams; impulses that look reasonable send it to hundreds of m/s.

## Commands

```
npm run dev         # vite, port 5180 by convention
npm test            # vitest
npm run typecheck   # tsc --noEmit, strict + exactOptionalPropertyTypes
npm run build
npm run shot <url> <out.png> [settleMs] [keys]
```

TypeScript is pinned to **^6**, not 7.x — R3F's JSX namespace augmentation plus
the `@types/three` surface is the wrong thing to put on a brand-new compiler.

## Working style

- Prefer a reference image over a description for anything visual. The Comfy
  renders in `art/refs/` are the most efficient direction given on this project.
- Do a product-owner pass unprompted after a feature lands: read the screen as a
  player, not as the author. One such pass found seven problems including a real
  correctness bug — the dealer's upcard is public and was being hidden.
- State plainly what has and has not been verified. "Typecheck passes" is not
  "I looked at it".
