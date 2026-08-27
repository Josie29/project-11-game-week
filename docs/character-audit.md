# Character audit

**Status: acted on.** Every point below has been addressed; the resolution is
recorded under each one in *italics*. Where the fix turned out to be something
other than what the note proposed, that is written down too — three of them
were, and in each case the note had the symptom right and the cause wrong.

A handful of defects were found *while* fixing these and are recorded at the
end, under [Found in the doing](#found-in-the-doing).

Every observation below comes from a capture, and every capture is named so it
can be retaken. The harness is `scripts/shot.mjs` and the deep links in
`CLAUDE.md`, plus a scripted pointer drag for the angles no deep link reaches
(see [Harness gaps](#h-harness-gaps)).

Angles used: front, high three-quarter (~35° above, ~30° round), profile
(`?turn=90`), rear three-quarter (`?turn=135`), back (`?turn=180`), and one
low angle. **Most of what follows is invisible from the front**, which is the
only angle this project's regression shots used to cover.

Severity: **P1** reads as broken to a player · **P2** reads as cheap · **P3**
polish.

---

## A. Body structure

### A1 · The figure has no depth (P1)

*Fixed.* `torsoDepth` is about three quarters of `torsoWidth` on all three
builds, and it is now documented in `BodyProportions` as a ratio rather than a
number. The S in the profile comes from a `seat` mass rather than from z offsets
on whole sections: offsetting a section breaks the one thing the stack does well,
which is every radius meeting its neighbour's exactly. A matching mass at the
chest was tried and removed — a bulge on the *front* of a torso has a silhouette
edge, and a silhouette edge in the middle of a garment reads as a second garment
worn over the first.

`?boot=designer&turn=90`, any garment.

In profile the whole body is a vertical plank. `torsoDepth / torsoWidth` is
0.60–0.62, and every torso section is then *additionally* squashed by
`depthRatio`, so the chest, waist and hips are all the same shallow slab. There
is no chest in front, no seat behind, no belly. The head is a proper ellipsoid,
so the head reads as a solid object and the body reads as cardboard — which is
worse than if both were flat.

- Raise `torsoDepth` to about 0.72–0.78 of `torsoWidth` on all three
  silhouettes.
- Depth alone will not fix it: the sections need to be *offset in z* as well as
  scaled — the chest forward of the centre line, the hips back — so the profile
  has an S rather than a straight edge. Nothing in `torsoParts` currently sets a
  z offset on any section.

### A1b · The legs have no hip and no seat either (P2)

*Fixed with A1.* `hipRadius` is derived from the leg now, so the pelvis is as
wide as the thighs hanging off it on every build.

Same capture. From the side the torso and the legs are the same width, and the
line from armpit to ankle is very nearly straight. Whatever is done about A1
should carry into the hips and the thigh, or the figure gains a chest and keeps
a plank below it.

### A2 · Skirts are blades in profile (P1)

*Fixed.* The skirt is two sections: the upper takes the body's own squash so its
waistband meets the torso all the way round, the lower comes most of the way to a
circle. One section could never do both, which is why the single cone had to pick
and picked wrong.

`?boot=designer&garment=cocktail-dress&turn=90`, and the same for
`shirt-and-skirt` and the gown.

The skirt inherits `depthRatio + 0.1` (≈0.72) as its z scale, so a skirt 26cm
across is 19cm deep and, seen from the side, is a narrow wedge. A torso is
oval; a skirt is very nearly a circle in plan. This is the same constant being
reused for two things that are not alike.

### A3 · Bare skin at the waist on every skirted garment (P1) — the reported one

*Fixed*, and the second option in the note was the right one — plus a third the
note did not have. The skirt's top rim now meets the torso (`torsoRadiusAt` is
exported for exactly this), and a waistband torus seals the free edge, which is
the only edge a camera above the figure can find. The hem is piped rather than
cut square.

`?boot=designer&garment=cocktail-dress`, high three-quarter.

Two crescents of skin show at both hips, between the bodice's hem and the
skirt's waist. From straight on they are hidden by the bodice; from above they
are unmistakable, which is why this shipped.

The cause is that the `hips` section takes `ColorRole.Skin` whenever
`hasSkirt`, and the skirt does not cover it. `bodyParts.test.ts` asserts the
skirt is wider than `hipWidth + thighRadius` — which it is — but that says
nothing about the *vertical* overlap between the skirt's waist and the bodice's
hem, and nothing about the hips section's own widest point.

Two candidate fixes, and they are not equivalent:

- Give the skirt a real waist: start it above the bodice's hem and make its top
  radius exceed the hips section's widest point, not just the thigh's reach.
- Or stop colouring the pelvis as skin under a skirt at all. A skirt covers the
  pelvis; the skin should start at the thigh. This is the smaller change and it
  removes the whole class of defect rather than tuning one overlap.

Whichever is chosen, the missing assertion is the one to add: **the skirt's top
must overlap the bodice's bottom, in y as well as in radius.**

Two more things are visible in the same capture and are worth fixing together:
the skirt's top edge *overhangs*, so the underside of its rim shows as a lighter
band above the gap; and the skirt is a plain truncated cone with a hard polygonal
hem, which reads as a lampshade. A gathered or flared hem, or simply a rounded
lower edge, would cost one part.

### A4 · The hips section reads as shorts (P2)

*Fixed.* The trouser line is at the natural waist and carries a waistband.

`?boot=designer&garment=suit` or `tee-and-jeans`, front and high.

On trousered garments the `hips` section is a distinctly wider block from the
waist to the crotch, in the Secondary colour, with a hard top edge. It reads as
gym shorts worn over trousers. The silhouette wants the trouser line at the
natural waist, and the hips not flaring wider than the waist above them.

### A5 · The thighs step out of the hips (P2)

*Fixed.* `hipRadius` and `crotchRadius` are both derived from `hipWidth +
thighRadius`, the same relationship `shoulderX` has with the arm.

`hipWidth + thighRadius` (0.115 + 0.132 on androgynous) exceeds the hips
cylinder's radius at the hip line, so both thighs poke out sideways with a
visible horizontal step. The hips' bottom radius should be derived from
`hipWidth + thighRadius` rather than chosen independently — the same
relationship `shoulderX` already has with the arm.

### A6 · Every joint is a visible ring (P2)

*Fixed, by deleting the joints.* The arms are single capsules — no cap, no ball,
no seam — and the knee sphere is derived from `JOINT_TAPER`, the one number the
thigh's end and the shin's start both come from.

Knee and elbow both. The parent limb's end radius, the joint sphere and the
child limb's start radius are three numbers chosen separately, so at each joint
there is a step *and* a shading seam. Deriving the joint sphere from the two
radii it bridges would close it.

In profile the shin also sits noticeably *forward* of the thigh, so the knee is a
step in z as well as in radius.

### A6b · The ankle is a wire (P3)

*Fixed.* `ANKLE_TAPER`, as a fraction of the knee rather than of the shin.

The calf is full and the ankle is `shinRadius * 0.6`, which on a chunky figure
reads as a stick pushed into a shoe. It is most obvious with bare legs.

### A7 · The sleeve/skin boundary is a ragged serration (P1)

*Fixed*, and by the second route the note proposed. A sleeve is its own shell
over a skin arm, ending on a flat rim or a rolled hem. The note called this the
last place the defect survived; it was not — the deltoid had it too, for the
same reason, and the fix was the same.

`?boot=designer&garment=cocktail-dress`, close on the arm — a dotted, stair-
stepped ring around each forearm and around each shoulder. It reads as a torn
sleeve or a scar.

This is the *same defect as the old hairline*: two low-poly surfaces of very
similar radius meeting at a shallow angle, so the polygon boundary between them
staggers. It is now the last place on the figure where it survives.

Two ways out, and the second is better:

- Raise the segment count on the elbow sphere and the forearm, as was done for
  the hair shell.
- Or stop making it an intersection at all: end a sleeve on a short cylinder in
  the sleeve's colour, whose flat cap is the boundary. A cuff is what real
  clothing uses for exactly this reason.

### A8 · The deltoid reads as a separate pad (P2)

*Fixed by removing the deltoid.* A capsule caps its own socket.

From above and behind there is a groove between the deltoid and the torso's
shoulder mass. They abut rather than overlap. Sinking the deltoid or widening
the shoulder mass would merge them.

### A9 · The shoulder mass reads as a bandeau (P2)

*Fixed.* The mass is held *shallower* than the yoke it sits on, so it has no
front-facing silhouette edge at all and shows only out at the sockets.

`?boot=designer&garment=cocktail-dress`, close on the chest.

The `shoulders` ellipsoid's own silhouette crosses the chest and creates a hard
shading break across the top of the torso, which on a dress reads as a separate
strapless band worn over it. It is one colour and one material, so this is
purely the shape: the ellipsoid is too distinct from the chest below it.

### A10 · The neck is a stub in profile (P3)

*Fixed.* The collar and the crew neck both moved to the top of the yoke, which
is where a collar goes and which is what was eating the neck.

Barely two centimetres of neck show between jaw and collar from the side. Either
the head rises slightly or the collar drops.

### A11 · Feet are too small and stand on a visible plate (P2)

*Fixed.* Every sole is a rounded solid. A rectangle inscribed under a rounded
upper still shows its corners, which is what this was — the extents were already
inside the shoe.

From above, `foot-sole` is a rectangular slab extending past the shoe in every
direction — it reads as a display plinth. Both purchased shoes have the same
problem. The sole should sit inside the upper's silhouette.

The feet are also small for the build: the figure is chunky everywhere else and
finishes in two small caps.

### A12 · The hands read as three-fingered paws (P2)

*Fixed.* Curled capsule fingers, close together, and the hand is sized off the
wrist rather than off a leg taper — which is what had made it a third narrower
than the arm above it.

Two fat fingers and a thumb, splayed, hanging open. At this stylisation a
closed mitt with one split reads better and still supports the finger-tap
gesture. Whatever is done, the fingers want to be closer together and slightly
curled.

### A13 · The head has no profile (P3)

*Fixed.* The nose stands proud enough to break the outline at ninety degrees.

At `?turn=90` the nose does not break the head's silhouette, so the face in
profile is a plain egg. The nose needs to stand proud enough to read at 90°.

### A14 · The ear is a blob outside the hair (P2)

*Fixed.* Further back, smaller, and given a bowl so it reads as an ear.

At profile and rear three-quarter the ear is a pale oval sitting on the cheek,
in front of the hairline, with no shape of its own. It reads as an earbud or a
blemish. It wants to be further back, smaller, and tucked under the hair shell
— or given a rim so it is recognisably an ear.

---

### A15 · A vertical seam runs down the front of every limb (P3)

*Fixed with A7*, which raised every limb's segment count on the way past.

The cylinder's own UV/normal seam. Visible on the thigh and shin at close range.
Not worth chasing on its own, but if limb segment counts are raised for A7 it
would go with them.

---

## B. Face

The face is the strongest part of the figure from the front. Both problems are
off-axis.

### B1 · The eye and brow panels poke out of the head (P1)

*Fixed*, and none of the three options in the note was right. Narrowing loses
the face; curving loses the graphic edge; setting them deeper is actively worse
and was tried — the panel is then buried by however far the surface fell away
across it, and the capture came back with no eyes at all. A panel is *turned to
face along the surface normal* now, which costs the sagitta: three millimetres
for an eye rather than seventeen. The assertion the note asked for exists, with
`panelSagitta` as its allowance so it stays honest.

`?turn=90` and `?turn=135`, every hairstyle. The far eye shows as a white
rectangle *outside* the skull's silhouette, and the brow as a dark bar.

The cause is structural: a face panel is a flat box placed at the surface depth
computed at its own *centre*, so its outer corners are further forward than the
curved head is at that x. From the front the head hides them; from the side it
does not.

Options: curve the panels (a thin ellipsoid rather than a box, which loses some
of the graphic crispness), narrow them, or set them deeper so the corners stay
inside the skull. The check that would have caught it: **every corner of every
face panel must be behind `faceSurfaceZ` at that corner's own x and y** —
`partsOverFace` already computes exactly this and throws the information away.

### B2 · The mouth is faint on the lighter skins (P3)

*Fixed*, and the note had the skins backwards — a fixed dark lip vanishes on the
*darkest* ones. `lipFor` derives it from the skin, so the relationship holds on
all six instead of the colour holding on some.

Darkened once already. Still low-contrast on porcelain and sand.

---

## C. Hair

### C0 · The ear renders *over* the hair (P2)

*Fixed with A14.* The ear sits behind the hairline now, so there is nothing for
it to float on.

Related to A14 but a distinct fault: at profile the ear is drawn on top of the
hair shell rather than under it, so on every style with volume the ear floats on
the surface of the hair. The ear is part of `torsoParts` and the hair is a
separate group; nothing decides which is on the outside.

### C1 · The hairline is a straight diagonal cut in profile (P1)

*Fixed*, by the route the note proposed: the crossing plane is kept and
interrupted. `temples` pulls the hairline down at the sides and `sideburns`
breaks the last of it past the ear.

`?turn=90`, every one of the eight styles. Because the hair shell and the skull
are the same ellipsoid at two sizes, they cross on a *plane* — and a plane seen
edge-on is a razor-straight line running from the brow up and back at about 45°.
It reads as a swim cap or a mask edge.

The plane is what makes the hairline derivable and it is worth keeping; what is
missing is anything to break it. A few short locks at the temple, or a second
small shell overlapping the first, would interrupt the line without giving up
the arithmetic.

### C2 · The nape is bare on the short styles (P2)

*Not reproducible after C1.* The shell already reaches the neck at the back on
every style; the capture the note was written from was of the crossing plane, not
of bare skin.

buzz, crop, pompadour and updo all end in a smooth dome well above the neck,
leaving a wide band of bare skin at the back of the head. The shell should reach
lower at the back — which the derivation already allows, since the crossing
plane is tilted.

### C3 · coils reads as a croissant (P2)

*Fixed.* The ring covers the whole head bar the face and the coils fall to the
jaw. The count is not free — see the comment: two coils land near the skull's own
widest point and the spacing has to clear it.

The coils sit only on a crown-to-back arc and are neatly parallel. They do not
reach the sides, do not hang, and are too evenly spaced. On `hair_sheet.png` the
whole head is covered and the coils fall to the jaw.

### C4 · pompadour reads as a bun (P2)

*Fixed.* A wave off the brow and a crest sweeping back over the crown, which is
the arrangement the old one had exactly backwards.

The quiff is a lump at the crown-front. A pompadour is tall *at the hairline*
and falls away behind; this is the opposite arrangement.

### C5 · The ponytail is a rigid rod (P2)

*Fixed.* Two segments: the upper keeps some of the lean, the lower hangs nearly
straight and tapers hard.

At profile it stands out backward at 45° with a knob on the end — a baseball
bat. It should hang closer to vertical, taper harder, and probably break into
two segments so it reads as hair rather than a handle.

### C6 · long's fall is a flat slab with a gap (P2)

*Fixed.* Wide enough at the top to swallow the side panels' back edges.

From the rear three-quarter the fall is a rectangle standing off the head, with
a visible seam between it and the side panels. It reads as a cape.

### C7 · bob has a seam where the side meets the back (P3)

*Fixed the same way.*

### C8 · The hairline is still faintly serrated at the front (P3)

*Fixed*, and the cause was not the segment count the note assumed. A sphere's
*height* rings were six tenths of its width segments, and the hairline runs
horizontally across the forehead — so it was being cut against a ring every six
degrees. They are nine tenths now, and the shell runs at 128 against a skull at
72.

Better at 96/48 segments than at 20, but not clean. Related to C1 — a boundary
that is not one long straight line would also hide what is left of the stagger.

---

## D. Items

### D1 · The fedora is a pork pie (P2)

*Fixed.* It sits down on the head, the crown tapers and is oval in plan, and the
pinch is the *shape of the crown's top* rather than dents in it — additive
primitives cannot dent, and the two that tried rendered as lumps.

Flat-topped cylinder crown, no crease or pinch, and a brim that is a hard-edged
disc. It also perches on the crown rather than sitting down on the head.

### D2 · Both neck chains are buried in the chest (P1)

*Fixed*, and the note had both causes right and a third one missing: the anchor
has to be high enough that the torso has actually narrowed toward the neck. At
the collarbone the body is still nearly shoulder-wide, and a ring sized to clear
it there is a hoop resting on both shoulders.

`?wear=gold-rope-chain` — the chain renders as a small horizontal gold lozenge
stuck to the sternum. `?wear=solitaire-pendant` has the same chain.

Two compounding causes: `Slot.Neck` anchors at `torsoTopY - torsoHeight * 0.22`,
which is chest height rather than the neck; and the ring's radius (`tw * 0.2`)
is smaller than the chest is wide at that height (`tw * 0.5`), so the ring is
inside the body and only its front edge shows.

The anchor is the real bug. A necklace goes round a neck.

### D3 · The signet ring renders in the middle of the palm (P1)

*Fixed.* `ringSeat` and `gripSeat` live in `bodyParts.ts`; `anchorFor` and
`CasinoCharacter` both read them, so the tested anchor and the rendered position
cannot drift apart again.

`?wear=signet-ring` — a white disc floating in the centre of the left hand. It
reads as a coin being held. The finger anchor was set against the old, smaller
hand and was not moved when the hand grew.

### D4 · The cane is not gripped (P2)

*Fixed with D3* — the grip seat is inside the curl of the fingers.

The knob sits beside the fingers rather than in them; the hand stays open. Either
the hand needs a grip pose for the Held slot, or the cane needs to pass through
the palm.

### D5 · Heels read as gold eggs on a plate (P2)

*Fixed.* A taller post, the sole tipped forward so the arch lifts, and the strap
up on the ankle where it shows.

Neither the post nor the ankle strap shows from the front, so the item that is
supposed to be *different from the oxfords* reads as the same shape in a
different colour. Same sole-plate problem as A11.

### D6 · The shades sit low and leak metal (P2)

*Fixed.* The eye anchor is lifted a fraction of an eye's height — glasses cover
the top of an eye — and the temple arms sweep back along the head.

They sit over the cheekbone rather than on the brow line, and at three-quarter
the temple arms show as a bright metal sliver past the edge of the face.

### D7 · The suit lapels have gone too far the other way (P2)

*Fixed.* `primaryTrim`, which is the jacket's cloth one shade up and already
existed, in satin.

Changed from a mid-grey `Trim` to the jacket's own colour in satin to stop them
reading as luggage labels. They now read as nothing at all: the suit is a plain
dark top with a tie. Somewhere between the two — the jacket colour, but a step
lighter, or a wider shape — is right.

### D8 · The tie knot is a red ball (P3)

*Fixed.* A tipped truncated cone. Being tipped it also has no axis-aligned face,
which is the second half of why the sphere was there.

### D9 · The shirt collar is a thick white donut (P2)

*Fixed*, and the note had the cause wrong — it was not the section depth. Every
ring on the figure was squashed on the wrong axis: `LIE_FLAT` sends a torus's
local Y to world Z, so a scale on Z flattens it *vertically* instead of
front-to-back. It was also drawn at the torso's radius three per cent down from
the top, which is halfway out to the shoulder.

From above it reads as a clerical collar. It is too deep in section for its
radius.

### D10 · shirt-and-skirt has a pocket-shaped patch on the chest (P2)

*Fixed.* The shirt front is a suit's and nothing else's — `hasShirt` was the
wrong question, since the panel is about the jacket over it.

The `shirt-panel` box shows as a lighter rectangle on the white shirt. It exists
to be a shirt front under a jacket and has nothing to do on a garment that is
already a shirt.

### D11 · The cuff shows on garments that should not have one (P3)

*Fixed.* `sleeveReach` decides, per garment.

`tee-and-jeans` and `cocktail-dress` both render a band at the wrist.

---

## E. Cross-cutting

Two of the P1s above are the same mistake in different places, and both were
introduced by the restyle rather than by the original rig:

**Anchors did not move when the body did.** The `Slot.Neck` chain (D2), the
finger ring (D3) and the shades' height (D6) are all anchors that were correct
for a 1.77-tall figure at seven and a half heads and are wrong at five and a
half. `Slot.Eyes` was caught and fixed during the restyle *because glasses on a
forehead is obvious*; the others were not, because a chain buried in a chest
just looks like a small gold shape. Worth checking every entry in `anchorFor`
against the current body before anything else here.

**Two low-poly surfaces of similar radius meeting at a shallow angle stagger.**
The hairline (fixed by raising segments and merging two shells into one), the
sleeve/skin boundary (A7, unfixed), and the elbow seam (A6, unfixed) are all one
phenomenon. A predicate could plausibly catch it: two parts whose surfaces cross
at less than some angle, at this segment count, will stagger.

---

## F. Captures this was written from

Kept so any of it can be re-checked. All at `?boot=designer&freeze&time=21:30`,
with `?build=`, `?garment=`, `?hair=` and `?wear=` varied.

| What | Angle | Shows |
| --- | --- | --- |
| 3 builds × 4 garments | front | A4, D7, D10, D11 |
| 4 garments | high 3/4 | **A3**, A4, A11 |
| 4 garments | profile | **A1**, A1b, A2, A13, B1, C1 |
| 4 garments | back | A7, C2 |
| 8 hairstyles | profile | **C1**, C0, A14, B1 |
| 8 hairstyles | rear 3/4 | C2, C3, C5, C6, C7, B1 |
| 8 hairstyles | high 3/4 | A11, A12, B1 |
| 12 items | front + high 3/4 | D1–D11 |
| cocktail dress | close, high | **A3**, A9, A11, A12 |
| tee and jeans | close, hip | A4, A5, A6, A7, D11 |
| tee and jeans | profile | A1, A1b, A10, A11, B1 |

---

## G. Suggested order

*Followed, roughly. The order held up except that A7 and A6 turned out to be
one fix rather than two, and B1 had to happen before the hair could be judged at
all — a face with no eyes is not a face you can look past.*

1. **A3** — the reported bug, and the one a player meets first.
2. **D2, D3** — anchors that are simply in the wrong place; small, contained.
3. **A1, A2** — depth. The largest single improvement to how the figure reads,
   and it touches only `proportions.ts` and the skirt's scale.
4. **A7, A6** — the ragged joints. One technique fixes both.
5. **B1** — face panels off-axis.
6. **C1, C2** — the hairline in profile and the bare nape.
7. Everything else.

---

<a id="h-harness-gaps"></a>

## H. Harness gaps found while doing this

*All three fixed. `?pitch=` and `?zoom=` are documented in `CLAUDE.md`; `?wear=`
is authoritative about every slot and an empty `?wear=` strips the figure. The
contact sheets were left alone — `?zoom=` under 2.4 frames a head, and the stage
now raises its own look target as the camera comes in, which is the same thing a
head-cropped sheet would have given and is useful to a player as well.*

- **`?wear=` never clears the other slots.** It grants and equips what it is
  given and leaves whatever was already saved in place, so consecutive per-item
  captures accumulate: by the seventh item the figure was wearing a hat, shades,
  heels and a cane. A per-item audit needs either a reset or `?wear=` to be
  authoritative about all twelve slots.
- **There is no deep link for camera pitch.** `?turn=` covers yaw only, so the
  high angle — the angle A3, A4, A11 and D9 only show from — can only be reached
  by scripting a pointer drag against the canvas. A `?pitch=` alongside `?turn=`
  would make every finding above reproducible from a URL.
- **The contact sheets are too small to judge anything above the neck.** Eight
  figures across a 16:9 frame gives each head about forty pixels. The sheets are
  good for "is it there"; they cannot answer "is it right". Head-framed variants,
  or a `?sheet=` that crops to the head, would close that.


<a id="found-in-the-doing"></a>

## I. Found in the doing

None of these were in the audit, and each is the kind of thing only a fix
turns up.

- **`rotatePoint` had the Euler order backwards.** Three.js `'XYZ'` builds
  `RX · RY · RZ`, so a *point* is turned by Z first and X last; `parts.ts`
  turned it X first. It agrees for every part rotated about a single axis and
  quietly disagrees for anything rotated about two or three — which nothing on
  the figure was, until the face panels were laid along the skull's normal. The
  predicates were measuring a different shape from the one being drawn, which is
  the one thing that module exists not to do.
- **Every `LIE_FLAT` torus was squashed on the wrong axis.** See D9. Collar,
  crew neck, jacket collar and the gown's waist seam were all affected.
- **The forearm sleeve was narrower than the forearm.** It tapered toward a
  "wrist" that was a fraction of the forearm's own radius — arithmetic left over
  from when the forearm was a tapered cylinder. Against the capsule that
  replaced it the bare arm came *through* the cloth. The watch strap had the
  same defect from the same cause: at 0.86 of the forearm's radius it was a band
  rendering inside a wrist.
- **The gown had no waist at all.** Every radius was a fraction of `torsoWidth`
  chosen by eye, and they happened to increase monotonically from bust to floor,
  so the garment widened the whole way down. From the front it was a traffic
  cone with a head on it. Both outer garments derive their radii from
  `torsoRadiusAt` now.
- **The jacket was a lab coat.** It ran most of the way down the thigh, and its
  placket was a slab in the *secondary* colour — black on the ivory tuxedo, so
  the one garment sold on being pale rendered with a black bib. A
  single-breasted jacket has its own cloth between the lapels.
- **The tie knot's third size component was a layer depth.** Deepening the front
  panels turned it into a twenty-centimetre red disc lying across the chest. A
  cylinder's `size` is `[radiusTop, height, radiusBottom]`, and the third of
  those had been fed the ladder's depth.
- **A brow's sign was wrong, and then wrong the other way.** Both directions a
  straight bar can tilt are expressions — a scowl and a worried face — and the
  first "fix" swapped one for the other on the strength of a forty-pixel
  capture. It takes two segments to have a peak.
