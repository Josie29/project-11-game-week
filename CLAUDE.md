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

**`src/character/` follows the same rule.** Body measurements, the appearance
model, the wardrobe catalogue and every accessory attachment point are pure and
tested; `CasinoCharacter` decides nothing about where things go and only draws
them. Three silhouettes times eight hairstyles times four garments times twelve
items is far more figures than anyone would check by hand, so the placement has
to be assertable rather than eyeballed.

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

  There are now three of these predicates and they all exist for the same
  reason: `isOnFelt`, `isOnBody` in `src/character/anchors.ts`, and
  `isOnShopFloor` in `src/scenes/shopLayout.ts`. Each one is paired with a test
  that feeds it a point it must *reject* — a predicate that returned true
  everywhere would leave its whole suite passing while proving nothing.

  Not everything geometric is reachable this way. The arms hung inside the
  torso on every silhouette because `shoulderX` was set inside `torsoWidth / 2`;
  every anchor was legitimately on the body and the figure still rendered
  armless. That one was found by looking at a capture, and only then pinned with
  a test.
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

Held as whole dollars throughout. That includes the marker: a debt repaid as a
*share* of every win is where a percentage sneaks back in, so `splitWinnings` in
`src/world/money.ts` is integer-only and the odd dollar goes to the player.

There are two credit paths and the difference matters. `adjustBankroll` is the
raw mover — wagers, shop purchases, and the clinic's payout. `creditWinnings`
routes a table settlement through the debt split first. The clinic deliberately
uses the raw one: skimming a donation would mean a broke player in debt earns
nothing from the one place that exists to get them out, which is a trap rather
than a mechanic.

 Payout values are **chips returned including
the stake**, so a caller debits on wager and credits on settlement and the two
always net out.

Ratios (3:2, 6:5, 2:1) are stored as numerator/denominator and applied with
integer arithmetic. Never as decimals.

## Visual work

## Delivering a feature

A feature is not delivered until it has been driven and deployed. Both, every
time, before saying it is done:

1. **Drive it.** `npm run walkthrough [baseUrl]` plays the app the way a player
   does — clicks the buttons, holds the movement keys, asserts on what is on
   screen and captures each beat. `npm run shots` covers the individual scenes
   via `?boot=`, but those links are stripped from production builds, so the
   walkthrough is the only check that runs against a deployed URL. It is also
   the only one that tests the path *between* scenes.
2. **Deploy it, then check that the deploy took.** `npx vercel --prod --yes`,
   then compare the bundle the alias actually serves against the one `npm run
   build` just produced:

   ```
   curl -s https://project-11-game-week.vercel.app/ | grep -o 'index-[^"]*\.js'
   ```

   The CLI has reported `Ready` and `Aliased` three times in a row while
   https://project-11-game-week.vercel.app went on serving the previous build.
   The walkthrough passed against it, because the walkthrough tests the paths
   between scenes rather than the change, and the capture of the new feature
   showed the old geometry. The filename is a content hash, so this is a
   two-second check that the thing being handed over is the thing that was
   written. Then hand over the URL — a description of a change is not a change
   anyone can look at.
3. **Say what was not verified.** Plainly, in the same breath as what was.

Both steps have already earned it. The walkthrough found that one long frame
teleported the player down the street, because movement integrated an unclamped
`delta` — invisible in every screenshot and in every test. It also found that
the door prompt never painted for an open venue at all, because `Player` entered
in the same frame it set `nearbyVenue` — a prompt written, shipped and never once
seen, which is why doors now take a keypress.

**Run `npm run shot <url> <out.png>` and look at the image before claiming
visual work is done.** An entire session's worth of table work shipped with
four visible bugs in it because it was written without ever being viewed.

**Check that the dev server is serving what you just wrote.** Vite caches
transformed modules and only invalidates them on a watcher event, so anything
that stops the watcher seeing a file makes the server go on serving the last
version indefinitely — which is indistinguishable from code that does not run.
An hour went into a `Celestial` component that was correct from the first draft
and had simply never been reloaded, because a `'**' + '/.claude/**'` ignore glob
added for the *main* checkout also matched every source file of a dev server
started inside a worktree. `npm run locate` is the quickest way to tell the two
apart: an object that is absent from the scene graph is not a rendering problem.

**Geometry is only correct relative to the camera that sees it.** A scene with a
fixed camera can render a hand-placed object perfectly and show nothing. The
line from the needle to the blood bag was twice the right shape in the right
place and twice invisible — the second time because it ran almost exactly along
the chair camera's own axis, so 65cm of tubing projected to nine pixels and read
as a red post. Anything long and thin gets checked for extent *across* the view,
not just in the world. Where a fixed camera and a piece of geometry have to
agree, both belong in the layout module so a test can hold them to it — two
constants in two files that quietly disagree is not something a later reader
would think to look for.

The street is a canyon and that constrains anything in the sky. Facades seventeen
metres apart and fifteen high hide everything below about sixty degrees of
elevation to either side; the only clear sightlines are along the road, and they
are about eight degrees wide. The sun and moon in `Celestial` sit on the key
light's own direction, so making them visible meant moving the *light* — sunrise
and sunset now sit on the street's axis, which is also where the long shadows
come from.

The script drives headless Chrome, so it works regardless of window focus, and
it reports frames rendered — a blank capture cannot pass as a success. It takes
a key sequence, so interactions can be verified too.

Dev-only deep links, stripped from production builds:

| URL | Scene |
| --- | --- |
| `?boot=casino` | seated at blackjack, awaiting a bet |
| `?boot=table` | a hand dealt |
| `?boot=settled` | a hand played out |
| `?boot=split` | a stacked pair, ready to split |
| `?boot=resplit` | a pair, with a third of the same rank behind it |
| `?boot=push` | two twenties, so a push's wording can be read |
| `?boot=draw` | a dealer who must draw twice |
| `?boot=craps` | at the craps rail with a pass line down |
| `?boot=placed` | craps with a point set and all six numbers covered |
| `?boot=floor` | standing on the casino floor, between the tables |
| `?boot=clinic` | standing on Red River Plasma's floor |
| `?boot=clinicfront` | at the clinic's door, prompt up |
| `?boot=broke` | at blackjack with nothing, marker on offer |
| `?boot=debt` | at blackjack with nothing and a marker outstanding |
| `?boot=designer` | the dressing-room stage |
| `?boot=shop` | The Gilded Hanger, bankroll topped up |
| `?boot=shopfront` | at the shop's door, prompt up, to look at the storefront |
| `?boot=dressed` | the shop, every wardrobe slot filled |
| `?boot=strip` | the street, with the first-run designer skipped |
| `?boot=northend` | at the north junction, where the strip meets its cross street |
| `?boot=southend` | the same at the south end |
| `?look=DEGREES` | swings the strip camera round before it settles |
| `?time=HH:MM` | opens at that hour, clock still running |
| `?freeze` | holds the clock, so a capture is reproducible |

`?time=` and `?freeze` compose with any `?boot=`. Every scene in
`npm run shots` pins both — the clock runs during the settle delay, so an
unpinned capture lands on a different sky and different HUD digits each run.
`?freeze` also holds the two turntables, for the same reason.

`?boot=strip` exists because captures run in a fresh browser profile, so
`hasDesigned` is false and a bare `/` opens the character designer. Without it
every strip regression shot is a picture of a menu.

`?look=` exists because the play camera trails the player down the street, so
every facade is seen at a glancing angle. A shop window is a bright sliver from
there whether it is built correctly or not — `?boot=shopfront&look=-90` is what
turned "the window is dark" into three separately diagnosable bugs.

**When something is invisible, build the diagnostic before the fix.** A missing
die looked identical to a die that had tunnelled out of the world;
`window.devRender.locate()` found it at `y = -18` in one run. `npm run locate
<url> [prefix]` is that call from the command line — it printed all nine
`worn:<slot>` anchors sitting exactly where `anchorFor` said they should be,
which turned "the cane is not rendering" into "the cane is too dark to see" and
changed the fix from geometry to a hex value.

## Interaction

**Nothing happens to the player because they walked somewhere.** Proximity
offers; F accepts. One key for every offer — a table, a recliner, a venue door,
the way back out — because only one is ever in range at a time, and the prompt on
screen says which. `useActionKey` is the only listener; it guards `event.repeat`,
without which a held F walks out of a room and back into it several times a
second.

That rule is written here because the opposite was the whole design and it made
the strip feel like it was grabbing at you. Entering fired on contact, so you
could not walk past a venue; the exit fired on contact too, so in the clinic
walking over to the end recliner put you out on the street instead; and leaving
set you down inside the door's own trigger, so stepping out and being dragged
back in were the same gesture.

**Two things that offer must not overlap**, because the handler takes the nearest
and does not rank. `venueDoors.test.ts` holds it for every door and every seat,
and it is what lets those handlers stay three lines long.

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
  Shop geometry lives in `src/scenes/shopLayout.ts`, the street in
  `src/scenes/stripLayout.ts`, and body geometry in
  `src/character/proportions.ts`, on the same principle.

  The strip's is the clearest case for why. Its walk limit and its last building
  row were two unrelated numbers, so the player could walk six units past the
  last thing there was to look at, onto a road that ran on another thirty-eight
  before ending in mid-air against open sky. Nothing was broken and no test
  could have said so — there was no relationship to assert. The limit is derived
  from a kerb now. `BLOCK_DEPTH` is the same story: the towers, the doors and
  the road markings had all silently agreed on 8 for months.
- **Characters are procedural primitives** with named joint groups, so gestures
  can be authored directly, and now so the player can be built at runtime from a
  saved appearance.
- **Anything read out of a save is coerced, never trusted.** `localStorage` is
  user-writable and the wardrobe save feeds geometry directly, so
  `sanitizeAppearance`, `sanitizeOwned` and `sanitizeEquipped` are total: they
  never throw and always return something drawable. A save naming a
  since-removed hairstyle must produce a character with hair, not a hole.
- **Comfy is reference, never assets** — see `SPEC.md`. `art/refs/` gained a
  character sheet, a hairstyle grid and a wardrobe flat-lay; every palette in
  `src/character/palette.ts` and every colour in the catalogue was read off
  them, and nothing generated ships. New sheets are made by copying an existing
  workflow in `workflows/` and changing only the positive prompt, the
  `SaveImage` prefix and the seed — the sampler and the negative prompt are
  tuned and should be left alone.
- Physics (`@react-three/rapier`) is scoped to the craps **table** — its
  `<Physics>` provider lives inside `CrapsTable.tsx`. Everything else, the
  walking characters and the blackjack table included, is transform-driven and
  never touches it.

  It used to be scoped to the craps *scene*, which stopped being true when both
  tables moved into one room: the world is now mounted the whole time the player
  is in the casino rather than only while playing craps. One world, two sleeping
  bodies, four fixed colliders.

  **The craps table stays at the world origin.** A `<Physics>` provider under a
  translated parent is the kind of thing that works until it does not, so the
  blackjack table takes the offset instead — see `CRAPS_ORIGIN` in
  `src/scenes/casinoFloorLayout.ts`, which is asserted.
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
npm run locate <url> [prefix]   # world positions of named objects
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
