# Neon Strip

A third-person 3D casino crawl: walk a neon Vegas strip, enter casinos, play
blackjack and craps against a persistent bankroll. React Three Fiber → Vercel.
Scope and acceptance criteria in [SPEC.md](SPEC.md); dev deep links in
[docs/dev-links.md](docs/dev-links.md).

Every rule below is here because breaking it produced a real bug in this
repository. They are not style preferences.

## Architecture

- **Game rules are pure TypeScript with zero rendering imports.** Engines live
  in `src/games/`, take a seed, and are tested. Scenes read engine state; they
  never contain rules. This is the decision the project rests on.
- **`src/character/` is pure the same way** — measurements, appearance model,
  wardrobe and every attachment point are tested; `CasinoCharacter` decides
  nothing and only draws.
- **Never make an engine time-dependent to serve an animation.** Presentation
  clocks live in the store (`src/scenes/revealTimeline.ts`); the engine decides
  the roll and physics only performs it.
- **Layout constants live in layout modules, never in components**:
  `tableLayout.ts`, `shopLayout.ts`, `stripLayout.ts`, `clinicLayout.ts`,
  `casinoFloorLayout.ts`, `character/proportions.ts`. Derive related numbers
  from each other — the strip's walk limit from a kerb, `BLOCK_DEPTH` shared by
  towers, doors and road markings — so a disagreement becomes impossible rather
  than merely untested. Where a fixed camera and a piece of geometry have to
  agree, both belong in the same module so a test can hold them to it.

## Testing

Vitest, `node` environment, tests in `src/__tests__/`. Everything tested is
pure — there are no rendering tests, by design. Every non-trivial test carries a
comment naming the user-facing behaviour it protects.

**Test what a screenshot cannot show.** The categories that have caught real
bugs here:

- **Hand-placed 3D coordinates**, against a containment predicate: `isOnFelt`,
  `isOnBody`, `isOnShopFloor`, `isOnClinicFloor`, `isOnStrip`, `partsOverFace`.
  Each is paired with a test feeding it a point it must *reject* — a predicate
  that returns true everywhere leaves its whole suite passing while proving
  nothing.
- **Geometry itself, not just where it attaches.** An anchor is not a shape.
  `floatingParts` refuses a piece attached to nothing; `fightingSurfaces`
  refuses two parallel flat faces closer than a millimetre. Only flat
  axis-aligned faces count (curved surfaces share a bounding-box plane and
  nothing else); coincident is a conflict, back-to-back is flush and fine; the
  threshold is arithmetic — the depth buffer resolves ~0.01mm at four metres.
- **Worn geometry against the body it covers** (`itemParts.test.ts`). Item and
  body lists each pass alone while a bodice sits at exactly the chest's radius.
- **A predicate whose window is a box will condemn correct art.** Sample the
  feature itself, skipping samples where it is behind the surface;
  `containsPoint` in `parts.ts` gives a solid test per shape rather than a
  bounding box.
- **Money invariants** — every offered stake must pay whole dollars on every
  outcome. Property tests caught both a $62.50 natural and 6:5 held as `1.2`.
- **Ordering and timing** — `revealTimeline.ts` is pure precisely so "the result
  is announced before the card that caused it" is assertable.
- **What a fixed camera can see**: the **angle a thing subtends across the
  view** (`mirrorSubtendedAngle`), plus **headroom** for anything tall
  (`waterfallHeadroom`, which needs `PLAY_FOV` from `src/world/camera.ts`).
  Width alone passes on a six-metre cascade drawn five metres off the top of
  the frame.

Not everything geometric is reachable this way — armless silhouettes from a
`shoulderX` inside `torsoWidth / 2` were found in a capture and only then
pinned with a test.

## Money

- **Whole dollars throughout**, including the marker: `splitWinnings` in
  `src/world/money.ts` is integer-only and the odd dollar goes to the player.
- **Ratios (3:2, 6:5, 2:1) are numerator/denominator** applied with integer
  arithmetic. Never decimals.
- **Payout values are chips returned including the stake**, so a caller debits
  on wager and credits on settlement and the two net out.
- `adjustBankroll` is the raw mover — wagers, purchases, the clinic's payout.
  `creditWinnings` routes a table settlement through the debt split first. The
  clinic uses the raw one deliberately: skimming the one place that exists to
  get a broke player out of debt is a trap, not a mechanic.

## Interaction

- **Nothing happens to the player because they walked somewhere.** Proximity
  offers, F accepts — one key for everything, because only one offer is ever in
  range and the prompt says which. `useActionKey` is the only listener and
  guards `event.repeat`.
- **Two targets offering *different* things must not overlap** — the handler
  takes the nearest and does not rank. `venueDoors.test.ts` holds it for every
  door, seat and the shop's mirror.
- **Two targets offering the *same* thing should overlap**, because circular
  prompts along a row cannot be both non-overlapping and gapless, and gapless is
  what matters. A prompt is also only as good as the width of floor it covers.
- **Anything long gets a `halfLength`**, making its prompt a capsule. A circle
  wide enough to reach a five-metre craps rail reaches across the room and steals
  the blackjack stools' prompts.
- **A seat you cannot choose is not a seat.** One prompt per stool; stools
  someone else holds are not offered at all.

## Timers

Delayed transitions are cancellable and identity-guarded: capture the state they
were scheduled against and abandon if it has changed, so abandoning a round
cannot mutate the next one. **Never park an animation on a handle that gates
player input** — chip travel time on the action guard swallowed every hit and
stand for 420ms.

## Multiplayer

Presence only, deliberately. Both tables are played against the house, so there
is no pot and nothing needs authority, accounts, or server-authoritative money.

- **A room is derived, not invented** — `roomIdFor(location, activeVenue)`. Two
  players are in the same room exactly when they can see each other.
- **`src/world/presence.ts` and `src/world/seating.ts` are pure and tested**,
  because none of it survives a screenshot: a figure that teleports and one that
  interpolates are the same still image, as are two figures on one stool.
  `interpolateAt` draws peers 120ms behind live and takes the short way through
  the ±180° wrap.
- **Poses never enter React state.** `WalkingPlayer` writes a mutable transform
  each frame and the sender samples it on its own timer; routing 60Hz through
  zustand re-renders the world to move one figure.
- **A seat is claimed, and only the room settles a claim.** Everything else is a
  relay. The room broadcasts the whole `{seat → player}` map, which is also what
  *places* a seated peer — that has to work before anything is dealt, which is
  the state a table spends most of its time in. Losers are stood back up by
  `claimRefused`.
- **The engine's seats are compact and the stools are not.** `seatStools` maps
  between them; the room stamps each wager with its stool and sorts by it, so
  play runs first base round to third base rather than in arrival order.
- **One alarm, many deadlines.** Deadlines are a map and each clock can only
  cancel itself. A single table-and-kind handle meant any action at either table
  killed the pending deal — permanently, which reads as the bet buttons having
  stopped working.
- **A wager handed to the room has to be relayed back**, because nothing local
  changes when you bet at a shared table and the felt has to show it arriving.
- **A check that reaches past the UI cannot tell you the UI works** —
  `sharedBlackjack.mjs` clicks buttons rather than calling `sendBet`.
- **`acceptWebSocket`, never `accept()`** — the plain accept pins the Durable
  Object in memory and bills duration for the life of the socket. Identity lives
  in `serializeAttachment`, not a `Map`: a hibernating object keeps its sockets
  and loses its memory.
- `shouldSend` is the cost model written as a test — a stationary player sends
  nothing and the room hibernates. If it ever returns true for one, the running
  cost silently becomes a rented server.
- `?boot=` links suppress the socket; `?mp=1` opts back in. The feature is off
  entirely without `VITE_MULTIPLAYER_URL` (in `.env.local`, uncommitted), which
  is what keeps a fresh clone and every existing capture unchanged.

## Visual work

**Run `npm run shot <url> <out.png>` and look at the image before claiming
visual work is done.** A whole session of table work shipped with four visible
bugs because it was written without ever being viewed. Anything with a front and
a back gets photographed from both.

**When something is invisible, build the diagnostic before the fix.** A missing
die and a die that tunnelled out of the world look identical; `npm run locate
<url> [prefix]` separates "not rendering" from "rendered inside the pelvis" or
"too dark to see".

**Check the dev server is serving what you just wrote.** Vite only invalidates
on a watcher event, so anything hiding a file from the watcher — an ignore glob,
a worktree — makes stale code indistinguishable from code that does not run.

Geometry, all of it paid for:

- **Rounded and tapered, never boxes.** Stacked squashed tapered cylinders for
  the body, an ellipsoid head, face features set *into* the skull
  (`faceSurfaceZ`). Anything that hangs is a capsule or tapered and
  sphere-tipped — a hanging cylinder is a rectangle in silhouette however many
  segments it has.
- **A hemisphere capping a cylinder of its own radius meets it tangentially**,
  and two low-poly surfaces crossing shallowly give a staggered, dotted seam. No
  segment count fixes it: steepen the crossing, or remove the boundary. Arms are
  single capsules and a sleeve is its own shell ending on a flat rim — a cuff is
  what real clothing uses at that seam, for that reason.
- **A garment shell stays outside the limb it covers along its whole length**,
  and its boundaries are *derived* from the body's (`torsoRadiusAt` and the
  named section boundaries in `bodyParts.ts`, offset by `GARMENT_CLEARANCE`),
  never authored beside them.
- **Sizes are fractions of the body, never constants** — limb thickness as a
  fraction of the torso, an item's size as a fraction of what it is worn on.
  Absolute numbers survive exactly until the body changes size.
- **A shaping piece must not have a silhouette of its own** — size it as
  fractions of the shell it shapes, summing to less than one.
- **Three builds means three shapes, not one shape at three sizes.** Chest and
  waist half-widths are separate fields; as one fraction of `torsoWidth` the
  broad figure is just the narrow one enlarged.
- **The figure is stylised and `HEADS_TALL` (5.5) says how far.**
  `STANDING_HEIGHT` does *not* move — the camera, the stool, the door triggers
  and every table anchor are tuned against it, so the stylisation is spent on
  how the height is divided.
- **A face at this scale is flat graphic panels**, not modelled features; the
  nose is the exception and stays a rounded bump. A drawn feature has to read
  against all six skins.
- **A flat panel on a curved head is turned to face along the surface**, not
  pushed back until it fits — pushing it back buries it entirely. (This is what
  exposed `rotatePoint` applying Euler `'XYZ'` backwards: the matrix is
  `RX·RY·RZ`, so a point turns Z first. It agrees for any single-axis part and
  lies for the rest.)
- **A straight bar cannot arch, and both directions it can tilt are
  expressions** — a brow takes two segments, which is also the fewest that has a
  peak.
- **Check a rotation's sign against what it does, not what it is called.**
  `IDLE_ARM_SPLAY` was documented as holding the arms clear and did the exact
  opposite on both sides.
- **Two joined solids show their join wherever the outer one is narrower** — a
  neck ends at the jaw; only the join belongs inside the head.
- **Two things that cannot both be visible should not both be drawn**
  (`eyesCovered`). It is worth doing for its own sake and it deletes a whole
  family of near-coincident planes.
- **Tessellation is cosmetic except at the hairline** — hair shell 96, skull 48,
  nothing else above 24. There is no separate fringe part: a fringe is a low
  hairline, and `cap` derives its depth from the hairline rather than taking a
  tuned number.
- **Shadow bias is a function of how big the geometry is** —
  `shadow-normalBias` tuned on a larger head draws a hard arc across both cheeks.
- **A point light close to a lit surface is a visible object**, and bloom turns
  it into a glowing orb. Hold lights back from what they light; give a surface
  meant to be dark `meshBasicMaterial` and take it out of lighting's reach. The
  same effect at a grazing angle is a specular sun on water.
- **A flat quad standing in for light reads as geometry** on any floor dark
  enough not to hide its edges. Opacity, tone mapping and gradients all failed;
  letting rooms whose floor already catches the door's `pointLight` opt out
  worked.
- **Geometry is only correct relative to the camera that sees it.** Anything
  long and thin is checked for extent *across* the view — 65cm of tubing running
  along the camera's axis projects to nine pixels.
- **The street is a canyon.** Facades 17m apart and 15m high hide everything
  below ~60° of elevation to either side; the only clear sightlines are ~8° wide
  along the road, which is why the sun and moon sit on the street's axis.
- **Anything laid out on a building's rhythm collides with anything laid out on
  a door's.** Everything standing on the pavement goes through `clearsDoorways`,
  and `hasColonnade` derives the exemption rather than listing it.

## Conventions

- **Textures are drawn to canvas at runtime**, not shipped as images — cards,
  felt, signage, facades, sky, pips. No asset pipeline, crisp at any resolution,
  text guaranteed correct, and a daytime sky costs five hex values.
- **Anything that varies with the hour reads `src/world/timeOfDay.ts`**, which
  is pure and holds every keyframe; scenes never contain the curve. A texture
  authored for one hour cannot be rescued by lighting at another, and two curves
  driving one impression have to be keyframed together.
- **Characters are procedural primitives** with named joint groups, so gestures
  can be authored directly and the player built at runtime from a saved
  appearance.
- **Anything read out of a save is coerced, never trusted.** `localStorage` is
  user-writable and feeds geometry directly, so `sanitizeAppearance`,
  `sanitizeOwned` and `sanitizeEquipped` are total: never throw, always return
  something drawable. A save naming a removed hairstyle produces hair, not a hole.
- **Comfy is reference, never assets** — see SPEC.md. Every palette in
  `src/character/palette.ts` was read off `art/refs/`; nothing generated ships.
  New sheets copy a workflow in `workflows/` and change only the positive
  prompt, the `SaveImage` prefix and the seed.
- **Physics (`@react-three/rapier`) is scoped to `CrapsTable.tsx`** — one world,
  two sleeping bodies, four fixed colliders, mounted for the whole casino visit.
  Everything else, walking characters and blackjack included, is
  transform-driven. **The craps table stays at the world origin** (`CRAPS_ORIGIN`
  in `casinoFloorLayout.ts`, asserted); the blackjack table takes the offset.
  Use a **fixed timestep** — `timeStep="vary"` tunnels small fast objects on a
  slow frame — and set **velocity, not impulse**, on small bodies: a 0.16m die
  masses four grams.
- TypeScript is pinned to **^6**, not 7.x — R3F's JSX augmentation plus
  `@types/three` is the wrong thing to put on a brand-new compiler.

## Commands

```
npm run dev         # vite, port 5180 by convention
npm test            # vitest
npm run typecheck   # tsc --noEmit, strict + exactOptionalPropertyTypes
npm run build
npm run shot <url> <out.png> [settleMs] [keys]
npm run shots [outDir]          # every scene; SHOTS_BASE_URL picks the server
npm run locate <url> [prefix]   # world positions of named objects
npm run walkthrough [baseUrl]   # plays the app the way a player does
npm run multiplayer [baseUrl]   # two players at once; needs the worker running
npm run shared-blackjack [url]  # two players at one table, one shoe
npm run seat-claims [wss://]    # seat exclusivity and the deal clock, over the wire
npm run worker:dev              # the presence worker, locally
npm run worker:deploy           # the presence worker, to Cloudflare
npm run typecheck:worker
```

**`npm run shots` takes an output directory, not a URL.** Handed a URL it makes
a directory called `http:` and photographs whatever is on 5180 — another
session's app, or nothing, both of which look like the scene failing to load.

`npm run multiplayer` drives two browser *contexts* — genuinely two players —
and asserts each sees the other, by name, moving. **Against a deployed URL is
the run that counts**: `wrangler dev` is miniflare with no network in front of
it, so anything racing the WebSocket handshake passes locally and fails in
production.

### The browser-driven checks take turns

`walkthrough`, `shots` and `multiplayer` all drive headless Chrome on a software
renderer. Two at once do not merely run slowly — they give *wrong answers*,
because the walkthrough asserts by holding a movement key for a fixed number of
bursts, so frame rate is distance travelled.

- `lockf -t 2400 .verify.lock` wraps them in `package.json` (macOS ships no
  `flock`). Waits 40 minutes for its turn, then gives up.
- `scripts/machineLoad.mjs` refuses above a one-minute load average of one per
  core. Override with `IGNORE_MACHINE_LOAD=1`.

Both decline with exit **75**, deliberately not the code a failing check uses.
**Report which one happened.** Queued or load-refused is fine; a red walkthrough
is not. Sitting silent for forty minutes reads as a hang, and reporting a load
refusal as a test failure sends the next hour after a bug that is not there.

## Delivering a feature

Not delivered until it has been driven *and* deployed. Both, every time:

1. **Drive it.** `npm run walkthrough [baseUrl]` clicks the buttons, holds the
   movement keys and asserts on what is on screen. It is the only check that
   runs against a deployed URL, and the only one that tests the path *between*
   scenes — it found movement integrating an unclamped `delta`, and a door
   prompt that had never once painted. `npm run shots` covers individual scenes
   via `?boot=`, which production strips. **The welcome screen is the one thing
   `?boot=` cannot verify**, so the walkthrough clicks through it.
2. **Deploy it, then check the deploy took.** `npx vercel --prod --yes`, then
   confirm the alias actually serves the new build — the CLI has reported
   `Ready` and `Aliased` three times running while the URL served the previous
   bundle, and the walkthrough passed against it. Then hand over the URL: a
   description of a change is not a change anyone can look at.
3. **Say what was not verified**, plainly, in the same breath as what was.

## Working style

- Prefer a reference image over a description for anything visual. The Comfy
  renders in `art/refs/` are the most efficient direction given on this project.
- Do a product-owner pass unprompted after a feature lands: read the screen as a
  player, not as the author. One such pass found seven problems including a real
  correctness bug.
- State plainly what has and has not been verified. "Typecheck passes" is not
  "I looked at it".
