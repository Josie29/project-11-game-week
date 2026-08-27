/*
 * The twelve pieces The Gilded Hanger sells, as data.
 *
 * Each list is authored in its own slot's frame — the origin is wherever
 * `anchorFor` puts that slot on the body, so a hat's parts are measured from
 * the crown and a shoe's from the floor at the ankle. Placement stays in
 * `anchors.ts`, shape lives here, and neither knows about the other. That is
 * the same split `tableLayout.ts` and the felt components have, and it is what
 * lets `itemParts.test.ts` assert that a cane holds together without a
 * renderer being involved.
 *
 * The fidelity pass lives here too. Every item was previously a handful of
 * boxes with six-sided cylinders between them; the shapes below are tapered,
 * capped and segmented, and each one is checked for the two failures the old
 * rig had — a piece attached to nothing, and two faces at the same plane.
 *
 * Colours are roles, not hex. `Primary`, `Secondary` and `Accent` map onto the
 * `ItemColors` every catalogue entry carries, so the same list paints a gold
 * chain on a player and the identical shape on a shop fixture.
 */

import { ItemShape, type ShopItem } from './catalog'
import { ColorRole, Finish, PartShape, type Part, type Vec3 } from './parts'
import {
  armRadius,
  CHEST_TOP_Y,
  chestRadius,
  CROTCH_Y,
  HIP_LINE_Y,
  forearmRadius,
  GARMENT_CLEARANCE,
  hipRadius,
  NATURAL_WAIST_Y,
  NECK_BASE_Y,
  torsoRadiusAt,
} from './bodyParts'
import { SHOULDER_TORSO_FRACTION, type BodyProportions } from './proportions'

/**
 * Turned a quarter circle about X: rings that lie flat, cases that face front.
 *
 * This is the turn every band, strap and chain wants. A torus starts in the XY
 * plane, so turning it about *Z* leaves it exactly where it began — which is
 * how the watch strap came to be a hoop standing up beside the wrist instead of
 * a band around it. Arms, fingers and waists all run along Y, so anything
 * encircling one lies in XZ and gets this.
 */
const LIE_FLAT: Vec3 = [Math.PI / 2, 0, 0]

/** One squashed, tapered section of a garment worn over the torso. */
function limbPiece(
  name: string,
  at: Vec3,
  size: Vec3,
  role: ColorRole,
  scale: Vec3,
): Part {
  return {
    name,
    shape: PartShape.Cylinder,
    at,
    size,
    role,
    finish: Finish.Cloth,
    segments: 22,
    scale,
  }
}

function piece(
  name: string,
  shape: PartShape,
  at: Vec3,
  size: Vec3,
  role: ColorRole,
  extra: Partial<Part> = {},
): Part {
  return { name, shape, at, size, role, ...extra }
}

/* --------------------------------------------------------------- headwear */

function fedora(body: BodyProportions): Part[] {
  const hw = body.headWidth

  /*
   * A fedora, and not the pork pie it was.
   *
   * What separates the two is entirely in the crown: a fedora's is tall, tapers
   * inward toward the top and is *pinched* — creased down the middle with a
   * dent either side of the front. A flat-topped cylinder with a band round it
   * is a pork pie, which is what a straight cylinder plus a rounded lid gave.
   *
   * The pinch is two dents rather than a modelled crease, because a dent is a
   * shape a sphere can make and a crease is not; between them they leave a ridge
   * down the centre line, which is the whole read at any distance.
   */
  return [
    /*
     * The brim, tapered so it turns up at the edge, and sloped.
     *
     * A flat disc is what the old hat had and it read as a plate. Two radii and
     * a slight forward tip are the whole of the shape: a hat brim is lower at
     * the front than at the back.
     */
    piece('brim', PartShape.Cylinder, [0, -0.075, 0.006], [hw * 0.88, 0.016, hw * 0.78], ColorRole.Primary, {
      segments: 32,
      rotation: [0.075, 0, 0],
      finish: Finish.Cloth,
    }),
    /*
     * Sat down onto the skull rather than balanced on the crown.
     *
     * The brim's underside was a millimetre above the top of the head — close
     * enough to fight, and not deep enough to count as attached to anything.
     * A hat is worn *on* a head.
     */
    piece('crown', PartShape.Cylinder, [0, -0.012, 0], [hw * 0.32, 0.126, hw * 0.46], ColorRole.Primary, {
      segments: 28,
      finish: Finish.Cloth,
      // Oval in plan, as a head is. A circular crown on an oval skull leaves a
      // gap at the temples and squeezes the brow.
      scale: [1, 1, 1.18],
    }),
    /*
     * The pinch, as the shape of the crown's top rather than as dents in it.
     *
     * A fedora is creased front to back with the sides falling away, and the
     * obvious way to build that — two hollows pressed into the top — cannot be
     * done with additive primitives: a sphere in the crown's own colour *adds*
     * material, so the two "dents" rendered as a pair of dark lumps on the
     * crown and the hat read as a bear's head. An ellipsoid narrow in x and
     * full in z leaves a ridge down the centre line with the sides sloping off
     * it, which is the same silhouette arrived at from the other direction.
     */
    piece('crown-top', PartShape.Sphere, [0, 0.036, 0], [hw * 0.34, 0.052, hw * 0.42], ColorRole.Primary, {
      segments: 26,
      finish: Finish.Cloth,
    }),
    // The band, which is what a fedora is recognised by at any distance.
    piece('band', PartShape.Torus, [0, -0.054, 0], [hw * 0.53, 0.019, hw * 0.53], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 28,
      finish: Finish.Cloth,
    }),
  ]
}

/* --------------------------------------------------------------- eyewear */

function shades(body: BodyProportions): Part[] {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  /*
   * Sized off the head rather than typed in.
   *
   * They were absolute — a 96mm lens spacing that was right for a 195mm head
   * and is a pair of reading glasses on a 285mm one. Everything a worn item
   * has to line up with is a fraction of the body, so the item has to be too.
   * The lens sits on `EYE_Y`'s own line for the same reason.
   */
  const lensX = hw * 0.215
  const templeX = hw * 0.335

  return [
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'lens-right' : 'lens-left',
        PartShape.Sphere,
        [side * lensX, 0, 0.005],
        [hw * 0.165, hh * 0.095, 0.012],
        ColorRole.Primary,
        { segments: 20, finish: Finish.Glass },
      ),
    ),
    piece(
      'bridge',
      PartShape.Box,
      // Stood clear of the head's own front plane, which the anchor sits on:
      // half a millimetre behind it and the two faces fight.
      [0, hh * 0.016, 0.014],
      [hw * 0.14, 0.011, 0.009],
      ColorRole.Secondary,
      { finish: Finish.Metal },
    ),
    /*
     * The temple arms, which the old shades did not have at all.
     *
     * Two lenses and a bridge floating in front of a face read as a domino
     * mask. The arms are what make them sit *on* someone.
     *
     * Rods rather than the square bars they were. An arm is round, and a round
     * arm has no flat face to land on the jaw's plane, the bridge's or the
     * pupil's — all three of which a bar with a flat inner face managed in
     * turn, each on a different silhouette, as it was moved about trying to
     * satisfy the last one.
     *
     * Swept back along the head rather than straight out from it. Standing
     * square they projected past the temple as a bright sliver of metal at any
     * three-quarter angle, which on a dark figure is the brightest thing on the
     * face.
     */
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'temple-right' : 'temple-left',
        PartShape.Capsule,
        [side * templeX, hh * 0.02, -hd * 0.1],
        [0.006, 0.085, 0.006],
        ColorRole.Secondary,
        { rotation: [Math.PI / 2, 0, side * 0.16], segments: 10, finish: Finish.Metal },
      ),
    ),
  ]
}

/* ------------------------------------------------------------------ necks */

/** How far a hanging stone tips back against the chest, in radians. */
const STONE_TILT = 0.3

/**
 * Where the chain sits relative to the neck anchor, and how big it has to be.
 *
 * Both neck items rendered as a small gold lozenge stuck to the sternum, and
 * two mistakes compounded to do it. The anchor was at chest height rather than
 * neck height — fixed in `anchors.ts` — and the ring's radius was a fifth of
 * the torso's width while the body at that height is half of it, so the ring
 * was *inside* the wearer and only its front edge ever showed.
 *
 * Read off `torsoRadiusAt` now, which is the same function the yoke is drawn
 * from, so the chain cannot go back to being narrower than the neck it is on.
 */
function chainRadius(body: BodyProportions): number {
  return torsoRadiusAt(body, NECK_BASE_Y) * 1.06
}

/** How far in front of the anchor the chain's front link sits. */
function chainFrontZ(body: BodyProportions): number {
  return chainRadius(body) * (body.torsoDepth / body.torsoWidth)
}

function chainRing(body: BodyProportions): Part {
  const ring = chainRadius(body)

  return piece('chain', PartShape.Torus, [0, 0, 0], [ring, ring * 0.09, ring], ColorRole.Primary, {
    rotation: LIE_FLAT,
    segments: 32,
    finish: Finish.Metal,
    // Squashed front-to-back to follow the neck, which is a scale on the local
    // Y a quarter-turn about X sends to world Z — see `ringAround`.
    scale: [1, body.torsoDepth / body.torsoWidth, 1],
  })
}

function ropeChain(body: BodyProportions): Part[] {
  const ring = chainRadius(body)
  const front = chainFrontZ(body)

  return [
    chainRing(body),
    /*
     * The heavier front section, hanging onto the chest.
     *
     * This is the item that is sold on being seen, so it drops below the
     * collarbone rather than sitting flat on the neck ring — which is what
     * makes a rope chain read as a rope chain rather than as a torc.
     */
    piece(
      'chain-front',
      PartShape.Torus,
      [0, -ring * 0.34, front * 0.5],
      [ring * 0.68, ring * 0.15, ring * 0.68],
      ColorRole.Secondary,
      { rotation: [Math.PI / 2 - 0.5, 0, 0], segments: 26, finish: Finish.Metal },
    ),
  ]
}

function pendant(body: BodyProportions): Part[] {
  const ring = chainRadius(body)
  const front = chainFrontZ(body)
  const stone = body.torsoWidth * 0.055

  /** Where the drop hangs: below the ring, on the front of the chest. */
  const dropY = -ring * 0.46
  const dropZ = front * 0.78

  return [
    chainRing(body),
    /*
     * The bail: the link between the chain and the stone.
     *
     * Its absence is why the old pendant's stone hung in space. Bounding boxes
     * overlapped, so nothing complained, but a ring around a neck and a stone
     * below it share no actual geometry — a chain needs something joining them
     * and now has one.
     */
    piece('bail', PartShape.Capsule, [0, dropY * 0.55, dropZ * 0.68], [0.005, ring * 0.5, 0.005], ColorRole.Primary, {
      // A rounded link, so its ends have no flat face to land on a tie knot's.
      rotation: [-0.5, 0, 0],
      segments: 10,
      finish: Finish.Metal,
    }),
    /*
     * A brilliant cut rather than a bare octahedron: a table and crown above
     * the girdle, a pavilion below. Two cones, and it reads as a cut stone
     * instead of a diamond-shaped bead.
     */
    /*
     * Both halves of the stone are tipped back against the chest.
     *
     * A pendant hanging on a chain lies against whoever is wearing it rather
     * than dangling square, so this is what the thing does — and being tipped,
     * neither cone presents an axis-aligned face any more. That matters: a
     * cone's flat girdle is a horizontal disc, and it landed within half a
     * millimetre of the neck's own bottom cap, the tie knot's and the bail's in
     * turn, each on a different silhouette, as it was moved to satisfy the last.
     */
    piece('stone-crown', PartShape.Cone, [0, dropY, dropZ], [stone, stone * 0.78, stone], ColorRole.Accent, {
      rotation: [STONE_TILT, 0, 0],
      segments: 18,
      finish: Finish.Gem,
    }),
    piece(
      'stone-pavilion',
      PartShape.Cone,
      [0, dropY - stone * 0.86, dropZ + stone * 0.14],
      [stone, stone * 1.48, stone],
      ColorRole.Accent,
      { rotation: [Math.PI + STONE_TILT, 0, 0], segments: 18, finish: Finish.Gem },
    ),
  ]
}

/* ------------------------------------------------------------- outerwear */

/*
 * How much shallower a torso is than it is wide.
 *
 * Outerwear is worn over the body, so it has to be built in the same language:
 * the torso is a stack of squashed, tapered cylinders, and a box laid over it
 * reads as a crate strapped to a person. The gown's bodice was exactly that —
 * a rectangular slab with four hard corners standing proud of a rounded chest.
 */
function squash(body: BodyProportions): Vec3 {
  return [1, 1, body.torsoDepth / body.torsoWidth]
}

/*
 * Every section below is deliberately wider than the body section it covers.
 *
 * The first rebuild gave the gown's bodice exactly the chest's own radius, so
 * the two surfaces were the same surface — and the capture came back with
 * vertical stripes crawling down the front of the dress. That is the flicker,
 * found at last: not the millimetre offsets anyone suspected, but a garment and
 * the body under it occupying one plane. `itemParts.test.ts` now dresses the
 * torso and checks the pair, which is the only place it could ever have been
 * caught — the item and the body were each correct on their own.
 */

/**
 * The frame outerwear is authored in has its origin at the *centre* of the
 * torso, not the hip, because that is where `Slot.Outerwear` anchors. These are
 * the body's own section heights rebased into it.
 */
function jacket(body: BodyProportions): Part[] {
  const { torsoWidth: tw, torsoHeight: th } = body
  const shell = squash(body)

  /**
   * How much wider than the body a jacket is, everywhere.
   *
   * Every radius below is the body's own at that height times this, rather
   * than a fraction of `torsoWidth` chosen to look about right. The two were
   * within half a millimetre of each other on the broad build once the three
   * silhouettes stopped sharing one chest fraction — and a garment the same
   * width as the body it covers is one surface drawn twice, which is the
   * vertical-stripe flicker this project has already chased once.
   */
  const over = 1.09
  // The chest section's surface, which the lapels and placket lie on.
  const chestZ = chestRadius(body) * over * (body.torsoDepth / body.torsoWidth)

  /*
   * The jacket's own sections, straddling the body's.
   *
   * `Slot.Outerwear` anchors at the middle of the torso, so everything here is
   * half a torso-height below the frame `bodyParts.ts` uses — hence the shift.
   * Each boundary is one clearance either side of a body boundary, which is
   * what keeps the two stacks from ever sharing a plane. See
   * `GARMENT_CLEARANCE`.
   */
  const at = (torsoY: number): number => th * (torsoY - 0.5)
  const span = (fromY: number, toY: number): { at: number; height: number } => ({
    at: at((fromY + toY) / 2),
    height: th * (toY - fromY),
  })

  // A dinner jacket ends at the hip. It used to run most of the way down the
  // thigh, which made an ivory tuxedo read as a lab coat.
  const waist = span(CROTCH_Y + 0.02, NATURAL_WAIST_Y + GARMENT_CLEARANCE)
  const chest = span(NATURAL_WAIST_Y - GARMENT_CLEARANCE, CHEST_TOP_Y + GARMENT_CLEARANCE)
  const yoke = span(CHEST_TOP_Y - GARMENT_CLEARANCE, 1 - GARMENT_CLEARANCE)

  /** The body's own half-width at a height, plus the room a jacket takes. */
  const around = (torsoY: number): number => torsoRadiusAt(body, torsoY) * over

  return [
    /*
     * Down to the hip, not to the ribs.
     *
     * It stopped at the waist, which left the body's own hips showing below it
     * — from behind, a dinner jacket read as a cropped band across the chest.
     * A jacket covers the hip.
     */
    limbPiece(
      'jacket-waist',
      [0, waist.at, 0],
      [around(NATURAL_WAIST_Y + GARMENT_CLEARANCE), waist.height, hipRadius(body) * over],
      ColorRole.Primary,
      shell,
    ),
    limbPiece(
      'jacket-chest',
      [0, chest.at, 0],
      [chestRadius(body) * over, chest.height, around(NATURAL_WAIST_Y - GARMENT_CLEARANCE)],
      ColorRole.Primary,
      shell,
    ),
    /*
     * Stopped just short of the body's own shoulder mass rather than level
     * with it. Two hand-placed boundaries that happen to coincide is a plane
     * the depth buffer cannot resolve, and this pair coincided exactly.
     */
    limbPiece(
      'jacket-yoke',
      [0, yoke.at, 0],
      [around(1 - GARMENT_CLEARANCE), yoke.height, chestRadius(body) * over],
      ColorRole.Primary,
      shell,
    ),
    /*
     * Rounded shoulders, as one mass reaching both sockets.
     *
     * The single change that does most to stop a jacket reading as a crate. A
     * shoulder is the one part of a suit that is deliberately shaped, and a box
     * has a hard corner exactly where it should be soft.
     *
     * Two separate balls set inboard of the arms was the first attempt and it
     * had the body's own defect: the arms hang at `shoulderX`, so anything that
     * stops short of `shoulderX` leaves the sleeve's top cap on show. The
     * jacket's colour is carried down the arm by `armPalette`, so the deltoid
     * under this is already wearing the jacket.
     */
    piece(
      'jacket-shoulders',
      PartShape.Sphere,
      [0, th * (SHOULDER_TORSO_FRACTION - 0.5), 0],
      [body.shoulderX + armRadius(body) * 0.5, th * 0.1, body.torsoDepth * 0.44],
      ColorRole.Primary,
      { segments: 24, finish: Finish.Cloth },
    ),
    // Lapels, turned out from the centre line.
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'lapel-right' : 'lapel-left',
        PartShape.Box,
        // Kept inboard: at a fifth of the torso out, the top-outer corner of a
        // turned lapel reaches past the shoulder and shows from behind as a
        // dark patch on each shoulder blade.
        [side * tw * 0.155, at(0.74), chestZ - 0.01],
        // Measured off the torso, like everything else the jacket is built
        // from: an absolute 27cm lapel is a different garment on each build.
        // Half the width it was, too — at a quarter of the torso across and
        // nearly half its height, two of these are most of the front of a
        // jacket, and on the ivory tuxedo they read as a black bib.
        [tw * 0.14, th * 0.34, 0.026],
        ColorRole.Secondary,
        { rotation: [0, 0, side * 0.26], finish: Finish.Leather },
      ),
    ),
    /*
     * There is no placket, and that is the fix rather than an omission.
     *
     * It was a slab in the jacket's *secondary* colour down the centre of the
     * chest, which on the ivory tuxedo is black — so the one garment sold on
     * being pale rendered as a white coat with a black bib. What a
     * single-breasted jacket has between its lapels is the jacket, and the
     * lapels turning out from the centre line are what draw the V.
     */
    /*
     * The collar, at the base of the neck and *under* the shirt's own.
     *
     * The old jacket stopped short of the neck entirely. Sat level with the
     * shirt collar instead, the two rings are within a millimetre of each other
     * on three silhouettes in turn — and tailoring already says where it goes: a
     * shirt collar stands above a jacket collar, which is the point of a shirt
     * collar.
     */
    piece('collar', PartShape.Torus, [0, at(0.99), 0], [around(1) * 1.1, 0.028, around(1) * 1.1], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 26,
      finish: Finish.Cloth,
      // Squashed front-to-back, which after a quarter-turn about X is a scale
      // on the local Y. On Z it was flattening the ring vertically instead.
      scale: [1, body.torsoDepth / body.torsoWidth, 1],
    }),
  ]
}

function gown(body: BodyProportions, compact: boolean): Part[] {
  const { torsoWidth: tw, torsoHeight: th } = body
  const shell = squash(body)
  const ratio = body.torsoDepth / body.torsoWidth

  /*
   * A gown, and not the traffic cone it was.
   *
   * Every radius used to be a fraction of `torsoWidth` chosen by eye, and the
   * fractions happened to increase monotonically from the bust to the floor —
   * so the garment widened the whole way down and had no waist at all. From the
   * front it was a cone with a head on it. Taking the bodice's radii off
   * `torsoRadiusAt` fixes that by construction: the gown is nipped exactly
   * where the body is, because it is the body plus a fixed allowance.
   */
  const over = 1.07
  const around = (torsoY: number): number => torsoRadiusAt(body, torsoY) * over
  const at = (torsoY: number): number => th * (torsoY - 0.5)
  const span = (fromY: number, toY: number): { at: number; height: number } => ({
    at: at((fromY + toY) / 2),
    height: th * (toY - fromY),
  })

  const bodice = span(NATURAL_WAIST_Y - GARMENT_CLEARANCE, CHEST_TOP_Y + GARMENT_CLEARANCE)
  const waist = span(HIP_LINE_Y - GARMENT_CLEARANCE, NATURAL_WAIST_Y + GARMENT_CLEARANCE)

  /** Floor length standing; above the knee once the hips drop onto a stool. */
  const hipY = at(HIP_LINE_Y)
  const hem = hipY - (compact ? 0.34 : 0.95)
  const drop = hipY - hem

  return [
    limbPiece(
      'bodice',
      [0, bodice.at, 0],
      [
        chestRadius(body) * over,
        bodice.height,
        around(NATURAL_WAIST_Y - GARMENT_CLEARANCE),
      ],
      ColorRole.Primary,
      shell,
    ),
    limbPiece(
      'bodice-waist',
      [0, waist.at, 0],
      [around(NATURAL_WAIST_Y + GARMENT_CLEARANCE), waist.height, hipRadius(body) * over],
      ColorRole.Primary,
      shell,
    ),
    /*
     * The straps, as bands over the shoulder rather than two beads beside it.
     *
     * They were spheres set out at four tenths of the torso's width, which is
     * outboard of the bodice — so they read as a pair of bright lumps stuck to
     * the collarbones with a gap either side. A strap runs over a shoulder.
     */
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'strap-right' : 'strap-left',
        PartShape.Capsule,
        [side * body.shoulderX * 0.72, at(0.95), 0],
        [tw * 0.032, th * 0.2, tw * 0.032],
        ColorRole.Primary,
        { rotation: [0, 0, side * 0.16], segments: 14, finish: Finish.Cloth },
      ),
    ),
    /*
     * The skirt, in two flares rather than one.
     *
     * A single truncated cone is straight-sided from waist to hem. Two
     * sections, the lower one flaring much harder, give the A-line the
     * reference sheet has — and the upper takes the body's own front-to-back
     * squash while the lower comes round toward a circle, for the same reason
     * the starter skirt does: a waist has to meet an oval torso and a hem has
     * to be a hem.
     *
     * Open-ended, so each is a shell rather than a solid with a lid where the
     * waist is — which puts a disc across the figure at hip height in any shot
     * taken from below.
     */
    piece(
      'skirt-upper',
      PartShape.Cylinder,
      [0, (hipY + th * 0.04 + (hem + drop * 0.52)) / 2, 0],
      [hipRadius(body) * over, hipY + th * 0.04 - (hem + drop * 0.52), tw * 0.56],
      ColorRole.Primary,
      { segments: 28, open: true, finish: Finish.Cloth, scale: shell },
    ),
    piece(
      'skirt-lower',
      PartShape.Cylinder,
      [0, (hem + drop * 0.64 + hem) / 2, 0],
      [tw * 0.62, drop * 0.64, tw * 0.82],
      ColorRole.Primary,
      { segments: 30, open: true, finish: Finish.Cloth, scale: [1, 1, ratio * 0.3 + 0.7] },
    ),
    // The waist seam, which is what makes bodice and skirt read as one garment.
    piece(
      'waist',
      PartShape.Torus,
      [0, at(NATURAL_WAIST_Y), 0],
      [around(NATURAL_WAIST_Y) * 1.03, tw * 0.026, around(NATURAL_WAIST_Y) * 1.03],
      ColorRole.Accent,
      { rotation: LIE_FLAT, segments: 28, finish: Finish.Leather, scale: [1, ratio, 1] },
    ),
    // And a piped hem, so the skirt does not end on a hard polygonal edge.
    piece(
      'hem',
      PartShape.Torus,
      [0, hem, 0],
      [tw * 0.82, tw * 0.022, tw * 0.82],
      ColorRole.Accent,
      { rotation: LIE_FLAT, segments: 32, finish: Finish.Cloth, scale: [1, ratio * 0.3 + 0.7, 1] },
    ),
  ]
}

/* ------------------------------------------------------------ wrist, hand */

/**
 * A wristwatch, sized to the wrist it goes round.
 *
 * The strap was a fixed 36mm hoop. The forearm is a fraction of the torso now,
 * so on the broad silhouette that hoop is smaller than the arm inside it — a
 * band that renders *through* a wrist, which reads as a bracelet cut in half.
 */
function watch(body: BodyProportions): Part[] {
  /*
   * Outside the arm, not inside it.
   *
   * At 0.86 of the forearm's radius the strap was smaller than the wrist it
   * went round, so most of the band was buried and what showed was a thin
   * gold sliver on the front of the arm. The forearm is a constant-radius
   * capsule now; a band round it has to clear that radius.
   */
  const wrist = forearmRadius(body) * 1.08

  return [
    // The strap, around the wrist.
    piece('strap', PartShape.Torus, [0, 0, 0], [wrist, wrist * 0.2, wrist], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 24,
      finish: Finish.Metal,
    }),
    // The case, on the outside of the wrist rather than through it.
    piece(
      'case',
      PartShape.Cylinder,
      [0, 0, wrist * 0.82],
      [wrist * 0.58, wrist * 0.3, wrist * 0.58],
      ColorRole.Primary,
      { rotation: LIE_FLAT, segments: 20, finish: Finish.Metal },
    ),
    piece(
      'dial',
      PartShape.Cylinder,
      [0, 0, wrist * 0.94],
      [wrist * 0.44, wrist * 0.09, wrist * 0.44],
      ColorRole.Accent,
      { rotation: LIE_FLAT, segments: 20, finish: Finish.Glass },
    ),
  ]
}

/** A ring, sized to the finger it goes on — same reasoning as the watch. */
function ring(body: BodyProportions): Part[] {
  const finger = forearmRadius(body) * 0.32

  return [
    piece('band', PartShape.Torus, [0, 0, 0], [finger, finger * 0.34, finger], ColorRole.Primary, {
      rotation: LIE_FLAT,
      segments: 18,
      finish: Finish.Metal,
    }),
    piece(
      'setting',
      PartShape.Cylinder,
      [0, 0, finger * 1.1],
      [finger * 0.62, finger * 0.42, finger * 0.62],
      ColorRole.Secondary,
      { rotation: LIE_FLAT, segments: 14, finish: Finish.Metal },
    ),
    piece(
      'stone',
      PartShape.Cone,
      [0, 0, finger * 1.5],
      [finger * 0.76, finger * 0.96, finger * 0.76],
      ColorRole.Accent,
      { rotation: [-Math.PI / 2, 0, 0], segments: 14, finish: Finish.Gem },
    ),
  ]
}

/* ---------------------------------------------------------------- footwear */

/*
 * Every sole below is a rounded solid rather than a box.
 *
 * A rectangle inscribed under a rounded upper still shows its four corners, and
 * from above that is exactly what both bought pairs looked like: a slab
 * sticking out past the shoe, front, back and both sides — a display plinth
 * under each foot. Their extents were inside the upper's and they still read
 * wrong, because the shape was wrong rather than the size.
 */
function oxford(): Part[] {
  return [
    piece('sole', PartShape.Sphere, [0, -0.02, 0.006], [0.056, 0.016, 0.122], ColorRole.Secondary, {
      segments: 22,
      finish: Finish.Leather,
    }),
    piece('upper', PartShape.Sphere, [0, 0.008, -0.014], [0.058, 0.036, 0.104], ColorRole.Primary, {
      segments: 22,
      finish: Finish.Leather,
    }),
    /*
     * The toe, rounded and dropped.
     *
     * A shoe that is one box has its highest point at the toe, which is the
     * one place a real shoe is lowest, and it is why the old pair read as
     * blocks. The vamp curves down to it.
     */
    piece('toe', PartShape.Sphere, [0, -0.002, 0.076], [0.05, 0.026, 0.056], ColorRole.Accent, {
      segments: 20,
      finish: Finish.Leather,
    }),
    piece('heel', PartShape.Sphere, [0, -0.019, -0.084], [0.046, 0.017, 0.036], ColorRole.Secondary, {
      segments: 18,
      finish: Finish.Leather,
    }),
  ]
}

/**
 * A stiletto, and one that reads as different from an oxford.
 *
 * The pair it replaces had neither its post nor its ankle strap visible from
 * the front, so the item sold on being *not* the flat pair rendered as the same
 * shape in a different colour. Two changes carry it: the heel is high enough to
 * tip the whole foot, and the sole is a narrow rounded shell with an arch under
 * it instead of a flat plate.
 */
function heel(): Part[] {
  return [
    // Tipped forward hard: a heel this height puts the ball of the foot down
    // and lifts the arch clear of the floor, which is the whole silhouette.
    piece('sole', PartShape.Sphere, [0, 0.012, 0.018], [0.042, 0.012, 0.108], ColorRole.Primary, {
      rotation: [0.34, 0, 0],
      segments: 22,
      finish: Finish.Leather,
    }),
    piece('vamp', PartShape.Sphere, [0, 0.016, 0.052], [0.042, 0.03, 0.072], ColorRole.Primary, {
      segments: 22,
      finish: Finish.Leather,
    }),
    // The post: the reason this is a different item and not a recolour, and
    // tall enough now to be seen from in front of the figure rather than only
    // from directly behind it.
    piece('post', PartShape.Cylinder, [0, -0.0045, -0.07], [0.009, 0.058, 0.015], ColorRole.Secondary, {
      segments: 16,
      finish: Finish.Leather,
    }),
    piece('counter', PartShape.Sphere, [0, 0.028, -0.056], [0.038, 0.038, 0.034], ColorRole.Primary, {
      segments: 18,
      finish: Finish.Leather,
    }),
    // The ankle strap, up on the ankle where one goes rather than round the
    // heel, so it shows above the shoe's own silhouette.
    piece('strap', PartShape.Torus, [0, 0.062, -0.028], [0.04, 0.0055, 0.04], ColorRole.Accent, {
      rotation: LIE_FLAT,
      segments: 22,
      finish: Finish.Leather,
    }),
  ]
}

/* -------------------------------------------------------------------- held */

function cane(): Part[] {
  return [
    /*
     * Length is set by where the hand is, not by what looks right alone: the
     * grip sits at the held anchor, roughly 0.74 above the floor, so a longer
     * shaft plants the tip underground and a shorter one leaves it dangling.
     *
     * Tapered now — thicker at the grip than at the tip, as a turned cane is.
     */
    piece('shaft', PartShape.Cylinder, [0, -0.35, 0], [0.014, 0.72, 0.009], ColorRole.Primary, {
      segments: 18,
      finish: Finish.Leather,
    }),
    piece('knob', PartShape.Sphere, [0, 0.03, 0], [0.032, 0.03, 0.032], ColorRole.Accent, {
      segments: 22,
      finish: Finish.Metal,
    }),
    // The collar under the knob, which is what makes it read as fitted rather
    // than as a ball balanced on a stick.
    piece('collar', PartShape.Cylinder, [0, -0.004, 0], [0.017, 0.016, 0.02], ColorRole.Accent, {
      segments: 18,
      finish: Finish.Metal,
    }),
    // Ferrule at the tip; without it the cane looks cut off.
    piece('ferrule', PartShape.Cylinder, [0, -0.723, 0], [0.0105, 0.042, 0.0105], ColorRole.Secondary, {
      segments: 14,
      finish: Finish.Leather,
    }),
  ]
}

/**
 * Every piece of one catalogue item, in its slot's frame.
 *
 * @param item The catalogue entry to build.
 * @param body The figure it is being fitted to. Only the items sized against
 *   the body — jackets and gowns — read it, but every shape takes it so the
 *   caller never has to know which.
 * @param compact Shortens anything floor-length, for a figure on a stool. A
 *   gown's skirt otherwise hangs through the seat and the thighs.
 * @returns The parts, in draw order.
 */
export function itemParts(item: ShopItem, body: BodyProportions, compact = false): readonly Part[] {
  switch (item.shape) {
    case ItemShape.Fedora:
      return fedora(body)
    case ItemShape.Shades:
      return shades(body)
    case ItemShape.Chain:
      return ropeChain(body)
    case ItemShape.Pendant:
      return pendant(body)
    case ItemShape.Jacket:
      return jacket(body)
    case ItemShape.Gown:
      return gown(body, compact)
    case ItemShape.Watch:
      return watch(body)
    case ItemShape.Ring:
      return ring(body)
    case ItemShape.Oxford:
      return oxford()
    case ItemShape.Heel:
      return heel()
    case ItemShape.Cane:
      return cane()
  }
}
