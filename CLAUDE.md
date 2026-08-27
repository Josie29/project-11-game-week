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

  There are now six of these predicates and they all exist for the same
  reason: `isOnFelt`, `isOnBody` in `src/character/anchors.ts`,
  `isOnShopFloor` in `src/scenes/shopLayout.ts`, `isOnClinicFloor` in
  `src/scenes/clinicLayout.ts`, `isOnStrip` in `src/scenes/stripLayout.ts` and
  `partsOverFace` in `src/character/hairParts.ts`. Each one is paired with a
  test that feeds it a point it must *reject* — a predicate that returned true
  everywhere would leave its whole suite passing while proving nothing.

  **A predicate whose window is a box will condemn correct art.** The first
  `partsOverFace` drew a rectangle across the face and asked whether any hair
  reached into it. Every style failed, because a hairline legitimately dips at
  the temples and any rectangle wide enough to hold the eyes also holds the
  patch of temple beside them. It samples the *features themselves* now — the
  eyes, nose and mouth, each at points just proud of its own front face — and
  skips samples where the feature is behind the skull at that point, because
  the corners of a flat panel on a curved head are inside the skull and hair
  behind a skull covers nothing. Brows are exempt on purpose: a fringe over the
  eyebrows is a haircut, a fringe over the eyes is a bug.

  `containsPoint` in `parts.ts` is what makes that possible — a solid test per
  shape rather than a bounding box. A fringe's box reaches the chin and its
  surface at the chin has receded inside the skull.

  Where a fixed camera has to see something, the *angle it subtends across the
  view* is the assertable thing, not its size in the world.
  `mirrorSubtendedAngle` in `shopLayout.ts` is that, and it earned its place
  immediately: pulling the shop's fitting camera back far enough to stop
  cropping the player at the knees took the mirror under the threshold, and the
  fix was a wider mirror rather than a lower bar.

- **Geometry itself, not just where it attaches.** `src/character/parts.ts` is
  the vocabulary every piece of the character is built from — hair, the twelve
  wearables, the body and the four garments are all part lists in
  `hairParts.ts`, `itemParts.ts` and `bodyParts.ts`, and the components below
  `src/scenes/` only draw them. Two predicates hold them: `floatingParts`
  refuses a piece attached to nothing, and `fightingSurfaces` refuses two
  parallel faces closer than a millimetre.

  This exists because of a bug no test in the repository could have seen. The
  ponytail's anchor was correct and `isOnBody` passed it — while the shape
  hanging off that anchor was two primitives floating in space behind the head.
  An anchor is not a shape.

  Three things learned building those predicates, all of them the hard way:

  - **A curved surface has no face to fight with.** Two spheres side by side
    share a bounding-box plane and nothing else, and reported as conflicts they
    had the coil ring pulled apart for nothing. Only a flat, axis-aligned face
    counts.
  - **Coincident is the worst case, not the safest.** Requiring a gap strictly
    greater than zero let a lapel and a placket sit on exactly the same plane
    and reported nothing. Faces on the same side are caught down to and
    including zero; faces meeting back-to-back are flush and fine.
  - **The threshold is arithmetic, not taste.** At this camera the depth buffer
    resolves about 0.01mm at four metres. The old rig's 1–2mm offsets were never
    the flicker, whatever they looked like.

  **Worn geometry is only correct relative to what it is worn over.** The item
  lists and the body list each passed alone while the gown's bodice was authored
  at exactly the chest's own radius — one surface, two meshes, and vertical
  stripes crawling down the front of the dress. The same class of error put a
  wedge of bare leg at each hip, because a skirt narrower than the thigh it
  covers is correct in the torso's frame and wrong on a person.
  `itemParts.test.ts` dresses the figure and checks the pair.

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

**`npm run shots` takes an output directory, not a URL** — the server is
`SHOTS_BASE_URL`, defaulting to the conventional port. Handed a URL it makes a
directory called `http:` and photographs whatever is on 5180, which on a
machine running two sessions is somebody else's app and on a machine running
one is nothing at all. Both look exactly like the scene failing to load.

**Check that the dev server is serving what you just wrote.** Vite caches
transformed modules and only invalidates them on a watcher event, so anything
that stops the watcher seeing a file makes the server go on serving the last
version indefinitely — which is indistinguishable from code that does not run.
An hour went into a `Celestial` component that was correct from the first draft
and had simply never been reloaded, because a `'**' + '/.claude/**'` ignore glob
added for the *main* checkout also matched every source file of a dev server
started inside a worktree. `npm run locate` is the quickest way to tell the two
apart: an object that is absent from the scene graph is not a rendering problem.

**A hemisphere capping a cylinder of its own radius meets it tangentially, and
tangential is the worst case there is.** Two low-poly surfaces crossing at a
shallow angle have a polygon boundary that staggers, so the seam comes out as a
dotted, stair-stepped ring — the old hairline, the sleeve/skin boundary and the
deltoid were all one phenomenon, and no segment count fixes any of them. The
two ways out are to *steepen* the crossing, which turns a shoulder cap into a
mushroom, or to remove the boundary: the arms are single capsules now, and a
sleeve is its own shell ending on a flat rim rather than a colour change part
way down a limb. A cuff is what real clothing uses at exactly this seam, for
exactly this reason.

Corollary: **a garment shell has to stay outside the limb it covers along its
whole length.** The forearm sleeve tapered toward a "wrist" that was a fraction
of the forearm's radius — arithmetic left over from when the forearm was a
tapered cylinder — so against the capsule that replaced it the cloth was
narrower than the arm below the elbow and the bare arm came *through* it.

**Rounded and tapered, never boxes.** Every figure on
`art/refs/character_sheet.png` has a chest wider than its waist, sloped
shoulders and limbs that narrow toward the joint. What shipped first was a
rectangular slab with capsules hanging off it, and it read as a crate with
limbs. The body is a stack of squashed, tapered cylinders now, the head is an
ellipsoid, and the face features are set into the skull rather than laid on it
— `faceSurfaceZ` in `src/character/face.ts` is what keeps an eye on a curved
cheek.

Corollary: **a hanging cylinder is a rectangle in silhouette**, however many
segments it has. Side panels of hair, a ponytail and a row of coils were all
cylinders, and from the one angle each of them exists to be seen from they read
as boards bolted to a head. Anything that hangs is a capsule or is tapered and
tipped with a sphere.

**A shaping piece must not have a silhouette of its own.** The masses that pull
a hairline down at the temples were sized as a fraction of the *head* and
overshot the hair shell by a couple of centimetres, so every style grew a small
dark nub out of each side. They are fractions of `capOuterX` now, summing to
less than one — which is the whole guarantee. The same rule caught the shoulder
mass: carried out over the arm, something that flat tapers to a point above the
sleeve, so each shoulder ended in a spike with a hard crease running to the neck.

**The head takes its room from the torso, so the torso has to be given some
back.** Anatomically the leg is about 1.6 times the torso and at seven and a
half heads that reads fine; under a head at 5.5 heads it reads as a small body
on long legs. Four centimetres came off each leg and went into every torso.

**The figure is stylised, and one number says how far.** `HEADS_TALL` in
`proportions.ts` is 5.5, against the reference sheet's seven and a half. The
sheet is life drawing; at the size a figure occupies on the strip that leaves no
room on the head for a face anyone can see. `STANDING_HEIGHT` does *not* move —
the follow camera, the stool, the door triggers and every table anchor are tuned
against it — so the stylisation is spent on how the height is divided up.

**Limb thickness is a fraction of the torso, never a constant.** They were
absolute, which meant the broad silhouette and the narrow one had identical
arms and legs — half of what makes them different bodies, thrown away below the
shoulder — and when the figure was restyled chunkier the limbs stayed behind and
it came out as a heavy torso on wire legs.

**A face at this scale is flat graphic panels, not modelled features.** A
rounded, glossy version — an eyeball with a catchlight, a mouth with lifted
corners — is fussy up close and mush at any distance. Hard-edged eyes with a
plain dark pupil is what the figure had before anyone tried to improve on it,
and it was better. The nose is the exception and stays a rounded bump: a flat
panel on the centre line has nothing to catch the light and disappears.

**A drawn feature has to read against six skins.** The lip colour sat within a
shade of the palette's darker tones and the mouth simply vanished on three of
them — a face with eyes, brows and no mouth, on half the swatches the designer
offers.

**Two joined solids show their join wherever the outer one is narrower.** The
neck ran up to a centimetre below the lip, and at that height a stylised head
has narrowed almost to its pole, so the top of the neck came *through* the chin
as a bright oval under the mouth. It was mistaken for a jaw seam twice. A neck
ends at the jaw; only the join belongs inside the head.

**Shadow bias is a function of how big the geometry is.** `shadow-normalBias`
was tuned against a 24cm head. On the stylised one it drew a hard arc across
both cheeks at nose level — chased as geometry, and it was the light all along.

**Tessellation is cosmetic everywhere except the hairline.** Hair is a shell
that breaks the surface of the skull, and the two meet at a very shallow angle,
so the polygon boundary between them moves a long way for a very small error.
It came out as a visible sawtooth on all eight styles at 20 segments and was
still ragged at 40; the shell runs at 96 and the skull at 48. Nothing else on
the figure needs more than 24.

That geometry is also why there is no separate fringe part any more. Two shells
crossing the skull at two shallow angles is two ragged boundaries, and the fix
that worked was to merge them: **a fringe is a low hairline**, which is also what
a fringe is. `cap` in `hairParts.ts` takes the hairline as an argument and
*derives* the depth it has to sit at — given where the crossing has to be there
is exactly one answer, so it is arithmetic rather than a number anyone tunes.

**Two things that cannot both be visible should not both be drawn.** The eyes
are not rendered under opaque sunglasses (`eyesCovered`), the same way a shirt
front is not rendered under a jacket. That is worth doing for its own sake, and
it also deletes a whole family of near-coincident planes: four hand-placed
rectangles in one small patch of face meant every attempt to position a temple
arm landed one of its faces within a millimetre of a sclera's or a pupil's, on
one silhouette or another.

**A flat panel laid on a curved head has to be turned to face along the
surface, not pushed back until it fits.** A face panel set at the depth of the
skull under its own centre stands nearly two centimetres proud at its outer
corners, so from any angle past three-quarters the far eye rendered as a white
rectangle *outside* the head's silhouette. Pushing it back is the obvious fix
and is worse — the panel is then buried by however far the surface fell away
across it, and the capture came back with no eyes at all. Turning it to the
normal costs the sagitta, about three millimetres for an eye on this head.

That change is also what caught a hidden defect in `parts.ts`: Euler `'XYZ'`
builds the matrix `RX · RY · RZ`, so a *point* is turned by Z first and X last,
and `rotatePoint` had it the other way round. It agrees for every part rotated
about a single axis and quietly disagrees for any part rotated about two or
three, which nothing on the figure was until the face panels.

**A straight bar cannot arch, and both directions it can tilt are expressions.**
Tilted up toward the temple a brow is a scowl and tilted down it is a worried
face; both shipped here in turn, and the second was a "fix" read off a
forty-pixel capture. A brow rises to a peak about two thirds out and falls to a
tail, so it takes two segments — which is also the fewest that has a peak at all.

**Check the sign on a rotation against what it does, not what it is called.**
`IDLE_ARM_SPLAY` was documented as holding the arms clear of the body and was
doing the exact opposite on both sides: rotating a limb about Z by a positive
angle swings it toward +x, so the right arm needs a positive roll and the left a
negative one, and the rig had them backwards. Both hands sat seven centimetres
inside the hips. The figure read as having no hands at all, and `npm run locate`
is what separated "not rendering" from "rendered inside the pelvis".

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
| `?seat=N` | which blackjack stool, 0 (first base) to 4 (third base) |
| `?boot=northend` | at the north junction, where the strip meets its cross street |
| `?boot=southend` | the same at the south end |
| `?look=DEGREES` | swings the walking camera round before it settles |
| `?tilt=DEGREES` | tilts it up or down; negative looks up, at a ceiling |
| `?sheet=hair` | every hairstyle in one frame, labelled |
| `?sheet=items` | every catalogue item, one per figure |
| `?sheet=garments` | the four starter garments |
| `?sheet=builds` | three silhouettes across four garments |
| `?sheet=skin` | every skin, hair and garment swatch |
| `?build=` `?hair=` `?garment=` | one appearance field, by enum member |
| `?skin=` `?haircolor=` `?garmentcolor=` | one palette swatch, by id |
| `?wear=id,id` | grants and equips catalogue items |
| `?turn=DEGREES` | turns the dressing-room stage; 180 is the back |
| `?pitch=DEGREES` | raises the dressing-room camera; positive looks down |
| `?zoom=METRES` | how far it stands off; under 2.4 it frames the head |
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

**`?pitch=` and `?zoom=` exist because half of a character audit is invisible
from eye level and at full length.** Bare skin at a skirted waist, the pelvis
block, the plate under a shoe and a collar's section only show from above; and
at the stage's default distance a head is forty pixels tall, which is enough to
say the hair is there and not enough to say it is right. Both angles were
reachable only by scripting a pointer drag and a wheel event against the canvas,
which makes a finding nobody can retake from a link. `?zoom=` also moves the
camera's own look target up toward the head as it comes in, because a zoom that
frames the collarbone is not a zoom.

**`?wear=` is authoritative about every slot, not additive.** It used to grant
what it named and leave whatever was already saved in place, so a per-item
capture run accumulated: by the seventh item the figure was in a hat, sunglasses,
heels and a cane, and every shot after the first was of the wrong subject.
`?wear=` with nothing after it strips the figure, which is the capture that says
what an item is worth wearing.

**`?turn=` exists because for months there was no way to photograph the back of
a character.** `?freeze` pinned the designer's turntable at rotation zero, so
every capture of a figure this project ever took was a front view — and the
ponytail rendered as a bare capsule floating eight centimetres behind the skull,
with a gather bead beside it, which from the front is invisible and from behind
reads as a limb growing out of the neck. Anything with a front and a back gets
photographed from both.

**`?sheet=` exists because the audit was otherwise three hundred captures.**
Three builds by eight hairstyles, four garments, twelve items on and off, front
and back. A sheet is one frame per sweep, labelled, and `contactSheet.test.ts`
asserts the item sheet covers the catalogue exactly — a thirteenth item that
quietly failed to appear would make the sheet claim a coverage it no longer had.
Sheets are capped at two rows: a third stands behind the second and cannot be
seen at all, which is what a four-by-three grid did to the first item sheet.

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

**A circle is the wrong shape for a five-metre table.** Craps was one, and to be
walkable into anywhere along the rail it had to reach 3.2 — which is two metres
past the end of the table, across the floor in front of the blackjack table's
third-base stool. Nothing said so while blackjack had a single prompt out at
x = -7.5; the moment its five stools spread out, walking up to one of them was
offered craps. A `halfLength` on a proximity target makes it a capsule, so the
prompt covers the rail and stops where the table does. Anything long gets one.

**A seat you cannot choose is not a seat.** Blackjack has five stools and the
player walks up to the one they want, on exactly the clinic recliner pattern:
one prompt each, deliberately overlapping so the row is gapless, `WalkingPlayer`
reporting the nearest. Prompts for stools somebody else is on are not offered at
all. That is only a prediction over the last seat map the room sent — the room
is what makes it true when two people reach for the same stool at once.

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

**A seat is claimed, and only the room can settle a claim.** Everything else
here is a relay — the shoe is a shared seed, an illegal action is refused
identically by every client, and the server never learns what blackjack is. A
stool is the one exception, because two players can each press F at the same
one inside a single round trip and *no* shared rule separates them. The room
takes the first claim and broadcasts the whole `{seat → player}` map;
`world/seating.ts` is everything a client does with that answer, and it is pure
and tested for the usual reason — two figures drawn one inside the other and
two figures on their own stools are the same still image until you count the
chairs. The loser of a contested stool is stood back up by `claimRefused`.

That map is also what *places* a seated peer. It used to be the roster the deal
was dealt against, which does not exist until a round is dealt — so two people
who had sat down and were still choosing a stake had no seats at all and were
both drawn at their last walking pose, which is the one patch of carpet they
had both walked to. **A seated peer has to be placeable before anything is
dealt**, because that is the state a table spends most of its time in.

**The engine's seats are compact and the stools are not.** Only the players who
bet get an engine seat, and they get them in order; the stools are wherever
people chose to sit. `seatStools` is the map between the two, and without it a
hand is dealt in front of nobody. The room stamps each wager with its stool and
sorts by it, so the order the wagers go out in is the order the hands are
played — first base round to third base, which is the only order a table deals
in. Arrival order would have third base taking their turn first.

**One Durable Object, one alarm — and three kinds of clock across two tables.**
Holding it as a single table-and-kind meant every new clock cancelled whatever
was pending, and `armRollTimeout` deleted it outright whenever a table had
nobody eligible to shoot, which is *always* true at blackjack. So: one player
stakes, the deal window is armed, and the next thing anybody does at either
table — sitting down, changing a jacket, arriving — cancels it and the table
never deals. Not in thirty seconds; ever. From a player's chair that reads as
the bet buttons having stopped working, which is how it was reported. The
deadlines are a map now, the alarm is set to the earliest, and each clock can
only cancel itself. `npm run seat-claims` holds both of these against a real
room.

**A wager handed to the room has to say so.** Nothing local changes when you
bet at a shared table — no chips, no bankroll movement — and the room relays
every bet as it lands precisely so the felt can show them arriving. Dropping
that on the floor left the buttons looking dead for up to half a minute, and
`sharedBlackjack.mjs` did not catch it because it bet by calling `sendBet`
directly. **A check that reaches past the UI cannot tell you the UI works.** It
clicks the buttons now.

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
- **A garment's boundaries are derived from the body's, never chosen beside
  them.** Outerwear is a second stack of tapered sections over the first,
  authored in a different file against the same torso height, so every boundary
  in one had a standing chance of landing on a boundary in the other — and
  several did, one silhouette at a time as the depth ratios moved. Chasing them
  individually is a losing game: `torsoRadiusAt` and the four named section
  boundaries in `bodyParts.ts` are what `itemParts.ts` builds from, offset by
  `GARMENT_CLEARANCE`, so a coincidence is no longer something that can happen.

  The same rule catches the *other* direction: a jacket sized as its own
  fraction of `torsoWidth` was within half a millimetre of the body's chest on
  the broad build once the three silhouettes stopped sharing one chest fraction,
  and a garment the same width as the body under it is one surface drawn twice.

- **Three builds means three shapes, not one shape at three sizes.** Chest and
  waist half-widths are their own fields, because as fractions of `torsoWidth`
  the only difference below the shoulder was scale: the broad figure was the
  narrow figure enlarged, nip and all, and read as overweight rather than as
  big. Masculine is a V dropped onto a rectangle — shoulders well past the
  chest, waist and hip within a couple of centimetres of each other. Feminine is
  the opposite in every respect.

  Limb thickness is the same trap from the other end. As a fraction of the
  torso, the broad build's thigh came out as wide as its own hip.

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
- - **An item's size is a fraction of the body it is worn on.** The watch strap
  was a fixed 36mm hoop, which is smaller than the broad silhouette's wrist — a
  band rendering *through* an arm. The fedora's brim was `headWidth * 1.04` as a
  radius, which is a boater. Absolute numbers in `itemParts.ts` are the same
  trap `proportions.ts` was pulled out of `CasinoCharacter` to escape, and they
  survive until the body changes size.
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
npm run shots [outDir]          # every scene; SHOTS_BASE_URL picks the server
npm run locate <url> [prefix]   # world positions of named objects
npm run multiplayer [baseUrl]   # two players at once; needs the worker running
npm run shared-blackjack [url]  # two players at one table, one shoe
npm run seat-claims [wss://]    # seat exclusivity and the deal clock, over the wire
npm run worker:dev              # the presence worker, locally
npm run worker:deploy           # the presence worker, to Cloudflare
npm run typecheck:worker
```

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

### The browser-driven checks take turns

`walkthrough`, `shots` and `multiplayer` all drive headless Chrome on a software
renderer, which is the most expensive thing in this repository. Two at once do
not merely run slowly — they give *wrong answers*. The walkthrough asserts by
holding a movement key for a fixed number of bursts, so frame rate is distance
travelled: on a busy machine the player covers less ground and strolls past the
prompt they were sent to find. `MIRROR_RADIUS` in `shopLayout.ts` carries a note
about that being mistaken for a geometry bug once already, and a whole session
went the same way when two Claude sessions ran walkthroughs against each other.

So all three queue on one lock and refuse to start on a loaded machine:

- `lockf -t 2400 .verify.lock` wraps them in `package.json` — macOS ships no
  `flock`, and `lockf` is the equivalent it does ship. Waits up to 40 minutes
  for its turn, then gives up.
- `scripts/machineLoad.mjs` refuses above a one-minute load average of one per
  core. Override with `IGNORE_MACHINE_LOAD=1` when you know what the load is.

Both decline with exit **75**, which is deliberately not the code a failing
check uses. **Report which one happened.** Queued behind another session and
refused for load are both fine; a red walkthrough is not. Say that you are
waiting, or that you stopped and why — sitting silent for forty minutes reads as
a hang, and reporting a load refusal as a test failure sends the next hour after
a bug that is not there.

## Working style

- Prefer a reference image over a description for anything visual. The Comfy
  renders in `art/refs/` are the most efficient direction given on this project.
- Do a product-owner pass unprompted after a feature lands: read the screen as a
  player, not as the author. One such pass found seven problems including a real
  correctness bug — the dealer's upcard is public and was being hidden.
- State plainly what has and has not been verified. "Typecheck passes" is not
  "I looked at it".
