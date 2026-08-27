# Geometry and lighting rules

Read this before character work or scene art. Every rule cost a shipped bug.
The audit these came out of is [character-audit.md](character-audit.md).

## Form

- **Rounded and tapered, never boxes.** Stacked squashed tapered cylinders for
  the body, an ellipsoid head, face features set *into* the skull
  (`faceSurfaceZ`). Anything that hangs is a capsule or is tapered and
  sphere-tipped — a hanging cylinder is a rectangle in silhouette however many
  segments it has.
- **Three builds means three shapes, not one shape at three sizes.** Chest and
  waist half-widths are separate fields; as one fraction of `torsoWidth` the
  broad figure is just the narrow one enlarged, which reads as overweight rather
  than as big.
- **The figure is stylised and `HEADS_TALL` (5.5) says how far.**
  `STANDING_HEIGHT` does *not* move — the camera, the stool, the door triggers
  and every table anchor are tuned against it, so the stylisation is spent on how
  the height is divided up.
- **Sizes are fractions of the body, never constants** — limb thickness as a
  fraction of the torso, an item's size as a fraction of what it is worn on.
  Absolute numbers survive exactly until the body changes size.
- **A shaping piece must not have a silhouette of its own** — size it as
  fractions of the shell it shapes, summing to less than one.

## Seams

- **A hemisphere capping a cylinder of its own radius meets it tangentially**,
  and two low-poly surfaces crossing shallowly give a staggered, dotted seam. No
  segment count fixes it: steepen the crossing, or remove the boundary. Arms are
  single capsules and a sleeve is its own shell ending on a flat rim — a cuff is
  what real clothing uses at that seam, for that reason.
- **A garment shell stays outside the limb it covers along its whole length**,
  and its boundaries are *derived* from the body's (`torsoRadiusAt` and the named
  section boundaries in `bodyParts.ts`, offset by `GARMENT_CLEARANCE`), never
  authored beside them.
- **Two joined solids show their join wherever the outer one is narrower** — a
  neck ends at the jaw; only the join belongs inside the head.
- **Tessellation is cosmetic except at the hairline** — hair shell 96, skull 48,
  nothing else above 24. There is no separate fringe part: a fringe is a low
  hairline, and `cap` derives its depth from the hairline rather than taking a
  tuned number.
- **Two things that cannot both be visible should not both be drawn**
  (`eyesCovered`). Worth doing for its own sake, and it deletes a whole family of
  near-coincident planes.

## Face

- **A face at this scale is flat graphic panels**, not modelled features; the
  nose is the exception and stays a rounded bump, because a flat panel on the
  centre line catches no light. A drawn feature has to read against all six skins.
- **A flat panel on a curved head is turned to face along the surface**, not
  pushed back until it fits — pushed back it is buried entirely. This is what
  exposed `rotatePoint` applying Euler `'XYZ'` backwards: the matrix is
  `RX·RY·RZ`, so a point turns Z first. It agrees for any single-axis part and
  lies for the rest.
- **A straight bar cannot arch, and both directions it can tilt are
  expressions** — a brow takes two segments, the fewest that has a peak at all.
- **Check a rotation's sign against what it does, not what it is called.**
  `IDLE_ARM_SPLAY` was documented as holding the arms clear and did the opposite
  on both sides, putting both hands inside the hips.

## Light

- **Shadow bias is a function of how big the geometry is** —
  `shadow-normalBias` tuned on a larger head draws a hard arc across both cheeks.
- **A point light close to a lit surface is a visible object**, and bloom turns
  it into a glowing orb. Hold lights back from what they light; give a surface
  meant to be dark `meshBasicMaterial` and take it out of lighting's reach. The
  same effect at a grazing angle is a specular sun on water.
- **A flat quad standing in for light reads as geometry** on any floor dark
  enough not to hide its edges. Opacity, tone mapping and stacked gradients all
  failed; letting rooms whose floor already catches the door's `pointLight` opt
  out worked.

## Camera and site

- **Geometry is only correct relative to the camera that sees it.** Anything
  long and thin is checked for extent *across* the view — 65cm of tubing running
  along the camera's axis projects to nine pixels.
- **The street is a canyon.** Facades 17m apart and 15m high hide everything
  below ~60° of elevation to either side; the only clear sightlines are ~8° wide
  along the road, which is why the sun and moon sit on the street's axis.
- **Anything laid out on a building's rhythm collides with anything laid out on
  a door's.** Everything standing on the pavement goes through `clearsDoorways`,
  and `hasColonnade` derives the exemption rather than listing it.
