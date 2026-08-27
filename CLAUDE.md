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

  There are now five of these predicates and they all exist for the same
  reason: `isOnFelt`, `isOnBody` in `src/character/anchors.ts`,
  `isOnShopFloor` in `src/scenes/shopLayout.ts`, `isOnClinicFloor` in
  `src/scenes/clinicLayout.ts` and `isOnStrip` in `src/scenes/stripLayout.ts`.
  Each one is paired with a test that feeds it a point it must *reject* — a
  predicate that returned true everywhere would leave its whole suite passing
  while proving nothing.

  Where a fixed camera has to see something, the *angle it subtends across the
  view* is the assertable thing, not its size in the world.
  `mirrorSubtendedAngle` in `shopLayout.ts` is that, and it earned its place
  immediately: pulling the shop's fitting camera back far enough to stop
  cropping the player at the knees took the mirror under the threshold, and the
  fix was a wider mirror rather than a lower bar.

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

**A field of view is vertical, so the shape of the window is part of the
geometry.** `three` states `fov` vertically: at 1600x900 a 45-degree camera
sees 72.7 degrees across, and on a 390x844 phone the same camera sees 21.7.
Every subtended-angle measure in this project was written against the first
number without saying so, and they are all *floors* — "wide enough to read".
Portrait needs a ceiling as well, and there was not one: the shop's mirror is
24.4 degrees wide and its camera showed 20 across a phone, so the one surface
the fitting scene exists for was cropped at both edges with every test passing.
`frameWidth`, `fovToFit` and `playFov` in `src/world/camera.ts` are that
ceiling, and `camera.test.ts` holds every hero subject to it.

Two corollaries, both earned:

- **A panel over a fixed-camera scene is a crop, and no camera can see it.**
  The first portrait pass framed the mirror perfectly and put the character
  behind the fitting panel. Chasing it with a moved camera found no position
  that worked. The fix was to stop overlaying: on a phone those panels are
  sheets, `.stage` insets the canvas above them, and the scene is composed for
  the rectangle it actually gets — which also makes that rectangle 390x464
  rather than 390x844, and is most of why neither shop camera needed moving at
  all. `SHEET_FRACTION` lives in `src/world/viewport.ts` and is published to CSS
  as `--sheet`, so the panel and the canvas cannot disagree about where the fold
  is.
- **Cameras size themselves against the canvas, never the window.** Once a
  sheet is up those are two different rectangles — `useCanvasAspect`, not
  `useLayout`.

**Where a camera cannot be opened wide enough, move it — and derive how far.**
Blackjack's felt spans 53 degrees of the seated view and craps' spans 64, and no
field of view a phone can hold without a fish-eye fits either. `seatedView`
steps back until the shot fits, flattening the pitch as the camera climbs so it
stays under the ceiling and inside the walls. A hand-picked pullback is what was
there first, and 10.5 metres was right for a full-height phone screen and much
too far the moment the craps rail's controls became a sheet.

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

**A flat quad standing in for light reads as geometry.** The exit door painted
a rectangle on the floor to stand in for its own spill, and it passed on the
casino's carpet and the clinic's tile for months. On the shop's dark polished
floor the identical mesh was a solid plank lying in front of the door. Lowering
the opacity did not fix it, tone-mapping it did not fix it, and stacking three
into a gradient turned one hard edge into three — the fix was to let a room
whose floor already catches the door's `pointLight` opt out. A stand-in for
light only survives on a surface bright enough to hide its edges.

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

**Width across the view is not framing, and the subtended angle alone will say
it is.** The Golden Ace's waterfall passed `waterfallSubtendedAngle` at 22.6
degrees and was still cropped: the walking camera looked *down* at 37 degrees,
so the top of the frame landed on the back wall at about `y = 1.5` and five of
the cascade's six metres were being drawn off the top of the screen every frame.
The measure that catches it is `waterfallHeadroom` — the frustum's top edge on
the surface the thing is drawn on, which needs the field of view, which is why
`PLAY_FOV` sits in `src/world/camera.ts` next to `CAMERA_LOOK_HEIGHT` rather
than as a literal in `App.tsx`. Anything tall gets both checks. The fix was to
flatten the camera from 0.42 to 0.14 — a room with two storeys of architecture
in it wants a camera that looks at the room, not at the carpet.

**A point light close to a lit surface is a visible object.** Three point lights
placed within a metre of the waterfall's stone wall each burned a small very
bright spot into it, and the bloom pass turned all three into glowing spheres —
a vertical line of cyan orbs hanging down the middle of the cascade, from a
lighting file containing nothing but lights. Two fixes and both are worth
knowing: hold the light back from what it lights, and where a surface is meant
to be dark and needs no shading at all, take it out of the lighting's reach with
`meshBasicMaterial`. The same effect at a grazing angle is a specular disc on
water — the pool needed roughness 0.78 before the blackjack seat stopped showing
a second small sun floating on it.

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
| `?boot=water` | at the pool at the far end of the same room, under the waterfall |
| `?boot=clinic` | standing on Red River Plasma's floor |
| `?boot=clinicfront` | at the clinic's door, prompt up |
| `?boot=broke` | at blackjack with nothing, marker on offer |
| `?boot=debt` | at blackjack with nothing and a marker outstanding |
| `?boot=designer` | the dressing-room stage |
| `?boot=shop` | on The Gilded Hanger's floor, bankroll topped up |
| `?boot=display` | at the sequin jacket, its prompt and price card up |
| `?boot=mirror` | on the fitting plinth, a gown and a pendant on approval |
| `?boot=checkout` | at the counter, the same bill, enough in hand to settle it |
| `?boot=short` | the same counter, $820 short of the bill |
| `?boot=held` | at the door in an unpaid gown, the clerk calling you back |
| `?boot=shopfront` | at the shop's door, prompt up, to look at the storefront |
| `?boot=casinofront` | the same at the Golden Ace, across the road; takes `?look=90` |
| `?boot=dressed` | the shop, every wardrobe slot filled |
| `?boot=strip` | the street, with the first-run designer skipped |
| `?boot=welcome` | the welcome screen, held up rather than skipped |
| `?mp=1` | re-enables multiplayer under a `?boot=` link, which otherwise suppresses it |
| `?boot=northend` | at the north junction, where the strip meets its cross street |
| `?boot=southend` | the same at the south end |
| `?look=DEGREES` | swings the walking camera round before it settles |
| `?tilt=DEGREES` | tilts it up or down; negative looks up, at a ceiling |
| `?time=HH:MM` | opens at that hour, clock still running |
| `?freeze` | holds the clock, so a capture is reproducible |

`?time=` and `?freeze` compose with any `?boot=`. Every scene in
`npm run shots` pins both — the clock runs during the settle delay, so an
unpinned capture lands on a different sky and different HUD digits each run.
`?freeze` also holds the two turntables, for the same reason.

`?boot=strip` exists because captures run in a fresh browser profile, so
`hasDesigned` is false and a bare `/` opens the character designer. Without it
every strip regression shot is a picture of a menu. There are two menus in front
of a fresh profile now — the welcome screen and then the designer — and every
`?boot=` link clears both.

`?boot=welcome` is the one that goes the other way, and it *resets*
`hasWelcomed` rather than merely declining to skip it. A capture profile has the
flag false already, so a link that only declined to skip would pass `npm run
shots` and show the strip to the person opening it by hand — which is the only
way anybody looks at that screen.

**The welcome screen is the one thing `?boot=` cannot verify.** Those links are
stripped from production builds, so the screen a real player actually meets is
reachable only from a bare `/`. `npm run walkthrough` clicks through it for that
reason; bypassing it there would have left the first screen of the game as the
one screen nothing checks.

`?tilt=` exists for the axis `?look=` does not cover, and the Golden Ace's vault
is why. The play camera looks *down* at the player, so the top of the frame
lands on the far wall well below the springing line: a two-storey coffered
ceiling was rendering every frame into nobody's view, and no regression shot
could have said so. A player drags to look up. A capture cannot, and a ceiling
nothing can photograph is a ceiling nobody can tell is broken.

`?look=` exists because the play camera trails the player down the street, so
every facade is seen at a glancing angle. A shop window is a bright sliver from
there whether it is built correctly or not — `?boot=shopfront&look=-90` is what
turned "the window is dark" into three separately diagnosable bugs. The shop's
own interior needs it too: the play camera trails the player down the length of
the room, so the window platform is behind it on arrival and every unswung
capture of the shop is a picture of the back wall.

**When something is invisible, build the diagnostic before the fix.** A missing
die looked identical to a die that had tunnelled out of the world;
`window.devRender.locate()` found it at `y = -18` in one run. `npm run locate
<url> [prefix]` is that call from the command line — it printed all nine
`worn:<slot>` anchors sitting exactly where `anchorFor` said they should be,
which turned "the cane is not rendering" into "the cane is too dark to see" and
changed the fix from geometry to a hex value.

## Interaction

**On a phone, the prompt *is* the accept key.** The game only ever offers one
thing at a time and the card on screen already names it and the verb, which is
what makes it the honest button — `useActionKey` listens for the tap as well as
the key, so all four scenes that accept an offer are unchanged. Two things this
cost: the card has to clear the on-screen stick (it did not, and the one control
the whole model rests on was also the only one a thumb could not reach), and the
standing hint has to keep naming the room's targets in both modes. "at a chair
or the door" is what tells somebody there are chairs, and it is what
`walkthrough.mjs` asserts on to know which room it is in.

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

**Two things that offer *different* things must not overlap**, because the
handler takes the nearest and does not rank. `venueDoors.test.ts` holds it for
every door, every seat and the shop's mirror, and it is what lets those handlers
stay three lines long.

Two things that offer the *same* thing may overlap, and should: circular prompts
along a row cannot be both non-overlapping and gapless, and gapless is what
matters. The clinic's recliners and the shop's twelve fixtures both rely on it —
`WalkingPlayer` reports the nearest, so a point between two of them resolves to
the one you are standing at.

A prompt is also only as good as the width of floor it covers. The shop's mirror
carried a 1.4 radius, which is the width of its own plinth and looks reasonable
written down; a scripted walk down the room passed within 1.75 of the only till
in the building and was offered nothing.

## Timers

Delayed transitions are cancellable and identity-guarded: capture the state
they were scheduled against and abandon if it has changed, so abandoning a
round cannot mutate the next one.

**Never park an animation on a handle that gates player input.** Parking the
chip travel time on the action guard silently swallowed every hit and stand for
the first 420 ms of a round.

## Multiplayer

Presence only, and deliberately: other players walk the same street and stand
in the same rooms, but every table is still played alone. Blackjack and craps
are against the house, so there is no pot to share — which is why none of this
needs authority, accounts, or server-authoritative money.

**A room is derived, not invented.** The street is a room and each venue floor
is a room, from `location` + `activeVenue` in `roomIdFor`. Two players are in
the same room exactly when they can see each other, which is exactly when it is
worth sending either of them the other's position.

**`src/world/presence.ts` is pure and tested**, on the same rule as the game
engines and for the same reason: none of it survives a screenshot. A figure
that teleports on every packet and one that interpolates smoothly are the same
still image. `interpolateAt` draws each peer 120 ms behind live, between the
two snapshots straddling that moment, taking the short way round through the
±180° wrap — without which a player turning from 170° to -170° spins 340° on
the spot.

**Poses never enter React state.** `WalkingPlayer` writes a mutable transform
each frame and the sender samples it on its own timer. Routing a
sixty-times-a-second transform through zustand re-renders the world to move one
figure — the same reason the walk cycle takes a `speedRef` rather than a prop.

Two traps, both of which cost money or captures rather than correctness:

- **`acceptWebSocket`, never `accept()`.** The plain accept pins the Durable
  Object in memory and bills duration for the entire time the socket is open,
  turning a free hibernating room into a rented server from a one-word
  difference. For the same reason identity lives in the socket's
  `serializeAttachment`, not a `Map`: a hibernating object keeps its sockets
  and loses its memory.
- **`?boot=` links suppress the socket.** Those links exist to make a capture
  reproducible and a stranger wandering into a regression shot is the opposite.
  `?mp=1` opts back in, for `npm run multiplayer` and nothing else.

`shouldSend` is the cost model written down as a test: a player stood at a
table sends nothing, the room hibernates, and the bill stays at zero. If it
ever returns true for a stationary player the running cost silently becomes a
rented server.

The whole feature is off without `VITE_MULTIPLAYER_URL`, which is what keeps a
fresh clone and every existing capture behaving exactly as before.

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

  Anything laid out on a *building's* rhythm collides with anything laid out on
  a *door's*, and the palms were only the first case. The towers' street-level
  colonnade put a column on every tower's centre line, and every venue door is
  on a tower's centre line, so a 3.4-metre pillar stood in front of all three
  entrances — splitting the shop's window and the clinic's blinds down the
  middle and covering a third of the Golden Ace's doorway — with the canopy
  above it lying across the casino's marquee and both fascia signs. It shipped
  because it was drawn as relief rather than as furniture and so never went
  through `clearsDoorways`. Everything that stands on the pavement does now,
  and `hasColonnade` derives the exemption rather than listing it.
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
npm run shot <url> <out.png> [settleMs] [keys] [WIDTHxHEIGHT]
npm run shots:mobile            # the same scene list at 390x844, touch on
npm run walkthrough:touch [url] # the same beats, driven by thumb
npm run locate <url> [prefix]   # world positions of named objects
npm run multiplayer [baseUrl]   # two players at once; needs the worker running
npm run worker:dev              # the presence worker, locally
npm run worker:deploy           # the presence worker, to Cloudflare
npm run typecheck:worker
```

`npm run walkthrough --touch` drives the same twenty beats on a phone: a
portrait viewport, and every key replaced by the on-screen control that does the
same job. Only `walk` and `press` know the difference, so every assertion and
every capture is shared — a phone build that reaches the same beats is a phone
build that works, and nothing else can say so. `npm run shots:mobile` renders
the whole scene list at 390x844 for the same reason.

`npm run multiplayer` drives two browser *contexts* — separate `localStorage`,
so genuinely two players — and asserts each sees the other, by name, moving.
`npm run walkthrough` drives one browser and cannot tell a room that never
connected from one that did.

It needs `VITE_MULTIPLAYER_URL` in `.env.local`, which is deliberately not
committed — without it the game runs exactly as it did before multiplayer and
the check silently passes over an empty room. Point it at the deployed worker
(`wss://neon-strip-presence.twobearslabs.workers.dev`) or at `npm run
worker:dev` on `ws://127.0.0.1:8787`.

**Against a deployed URL is the run that counts.** `wrangler dev` is miniflare
with no network in front of it, so anything racing the WebSocket handshake
passes locally and fails in production — which is exactly how the first pose
went missing for a player who joined and stood still.

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
