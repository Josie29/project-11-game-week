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
import type { BodyProportions } from './proportions'

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

  return [
    /*
     * The brim, tapered so it turns up at the edge.
     *
     * A flat disc is what the old hat had and it read as a plate. The
     * difference between the two radii is the whole of the shape.
     */
    piece('brim', PartShape.Cylinder, [0, 0.008, 0], [hw * 1.04, 0.014, hw * 0.94], ColorRole.Primary, {
      segments: 28,
      finish: Finish.Cloth,
    }),
    piece('crown', PartShape.Cylinder, [0, 0.068, 0], [hw * 0.42, 0.115, hw * 0.5], ColorRole.Primary, {
      segments: 24,
      finish: Finish.Cloth,
    }),
    // Rounds the top, so the crown stops reading as a paper cup.
    piece('crown-top', PartShape.Sphere, [0, 0.1255, 0], [hw * 0.42, 0.022, hw * 0.42], ColorRole.Primary, {
      segments: 20,
      finish: Finish.Cloth,
    }),
    // The band, which is what a fedora is recognised by at any distance.
    piece('band', PartShape.Torus, [0, 0.036, 0], [hw * 0.47, 0.016, hw * 0.47], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 24,
      finish: Finish.Cloth,
    }),
  ]
}

/* --------------------------------------------------------------- eyewear */

function shades(): Part[] {
  return [
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'lens-right' : 'lens-left',
        PartShape.Sphere,
        [side * 0.048, 0, 0.005],
        [0.032, 0.021, 0.009],
        ColorRole.Primary,
        { segments: 18, finish: Finish.Glass },
      ),
    ),
    piece('bridge', PartShape.Box, [0, 0.004, 0.004], [0.046, 0.009, 0.008], ColorRole.Secondary, {
      finish: Finish.Metal,
    }),
    /*
     * The temple arms, which the old shades did not have at all.
     *
     * Two lenses and a bridge floating in front of a face read as a domino
     * mask. The arms are what make them sit *on* someone.
     */
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'temple-right' : 'temple-left',
        PartShape.Box,
        [side * 0.078, 0.006, -0.028],
        [0.008, 0.007, 0.074],
        ColorRole.Secondary,
        { finish: Finish.Metal },
      ),
    ),
  ]
}

/* ------------------------------------------------------------------ necks */

/**
 * The ring both neck items hang from.
 *
 * Set back from the anchor rather than centred on it. The anchor sits on the
 * front of the chest, so a ring centred there stood half of its diameter proud
 * of the body — a hoop in front of someone rather than a chain around their
 * neck.
 */
function chainRing(): Part {
  return piece('chain', PartShape.Torus, [0, 0.014, -0.055], [0.078, 0.009, 0.078], ColorRole.Primary, {
    rotation: LIE_FLAT,
    segments: 28,
    finish: Finish.Metal,
  })
}

function ropeChain(): Part[] {
  return [
    chainRing(),
    // The heavier front section — this one is sold on being seen.
    piece('chain-front', PartShape.Torus, [0, 0.006, -0.05], [0.07, 0.013, 0.07], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 24,
      finish: Finish.Metal,
    }),
  ]
}

function pendant(): Part[] {
  return [
    chainRing(),
    /*
     * The bail: the link between the chain and the stone.
     *
     * Its absence is why the old pendant's stone hung in space. Bounding boxes
     * overlapped, so nothing complained, but a ring around a neck and a stone
     * below it share no actual geometry — a chain needs something joining them
     * and now has one.
     */
    piece('bail', PartShape.Cylinder, [0, -0.018, 0.024], [0.005, 0.078, 0.005], ColorRole.Primary, {
      segments: 12,
      finish: Finish.Metal,
    }),
    /*
     * A brilliant cut rather than a bare octahedron: a table and crown above
     * the girdle, a pavilion below. Two cones, and it reads as a cut stone
     * instead of a diamond-shaped bead.
     */
    piece('stone-crown', PartShape.Cone, [0, -0.0605, 0.028], [0.023, 0.018, 0.023], ColorRole.Accent, {
      segments: 16,
      finish: Finish.Gem,
    }),
    piece('stone-pavilion', PartShape.Cone, [0, -0.081, 0.028], [0.023, 0.034, 0.023], ColorRole.Accent, {
      rotation: [Math.PI, 0, 0],
      segments: 16,
      finish: Finish.Gem,
    }),
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
  // The chest section's surface, which the lapels and placket lie on.
  const chestZ = tw * 0.56 * (body.torsoDepth / body.torsoWidth)

  return [
    /*
     * Down to the hip, not to the ribs.
     *
     * It stopped at the waist, which left the body's own hips showing below it
     * — from behind, a dinner jacket read as a cropped band across the chest.
     * A jacket covers the hip.
     */
    limbPiece('jacket-waist', [0, -th * 0.2, 0], [tw * 0.5, th * 0.44, tw * 0.52], ColorRole.Primary, shell),
    limbPiece('jacket-chest', [0, th * 0.19, 0], [tw * 0.56, th * 0.36, tw * 0.5], ColorRole.Primary, shell),
    limbPiece('jacket-yoke', [0, th * 0.4, 0], [tw * 0.46, th * 0.15, tw * 0.52], ColorRole.Primary, shell),
    /*
     * Rounded shoulders.
     *
     * The single change that does most to stop a jacket reading as a crate. A
     * shoulder is the one part of a suit that is deliberately shaped, and a box
     * has a hard corner exactly where it should be soft.
     */
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'shoulder-right' : 'shoulder-left',
        PartShape.Sphere,
        [side * tw * 0.41, th * 0.4, 0],
        [tw * 0.14, th * 0.11, body.torsoDepth * 0.5],
        ColorRole.Primary,
        { segments: 18, finish: Finish.Cloth },
      ),
    ),
    // Lapels, turned out from the centre line.
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'lapel-right' : 'lapel-left',
        PartShape.Box,
        [side * tw * 0.22, th * 0.2, chestZ - 0.01],
        [0.1, 0.26, 0.026],
        ColorRole.Secondary,
        { rotation: [0, 0, side * 0.28], finish: Finish.Cloth },
      ),
    ),
    // The open front, showing what is worn under it as a dark gap.
    /*
     * Kept on the chest section and off the waist.
     *
     * Its back face and the waist section's front face landed within a third of
     * a millimetre of each other, and *which* silhouette it happened on changed
     * with the torso's depth ratio — so no single offset fixed all three. A
     * placket that only ever overlaps the chest is never compared with the
     * waist at all, which is the more honest fix: it is a lapel gap, and lapel
     * gaps stop at the waist.
     */
    piece('placket', PartShape.Box, [0, th * 0.18, chestZ - 0.012], [0.12, th * 0.3, 0.018], ColorRole.Secondary, {
      finish: Finish.Cloth,
    }),
    // Collar round the back of the neck, which the old jacket stopped short of.
    piece('collar', PartShape.Torus, [0, th * 0.47, 0], [tw * 0.26, 0.026, tw * 0.26], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 22,
      finish: Finish.Cloth,
      scale: [1, 1, body.torsoDepth / body.torsoWidth + 0.24],
    }),
  ]
}

function gown(body: BodyProportions, compact: boolean): Part[] {
  const { torsoWidth: tw, torsoHeight: th } = body
  const shell = squash(body)

  /** Floor length standing; above the knee once the hips drop onto a stool. */
  const skirt = compact ? 0.34 : 0.95
  /** Where the bodice ends and the skirt takes over. */
  const waistY = -th * 0.25

  return [
    limbPiece('bodice', [0, th * 0.17, 0], [tw * 0.54, th * 0.4, tw * 0.48], ColorRole.Primary, shell),
    limbPiece('bodice-waist', [0, -th * 0.14, 0], [tw * 0.48, th * 0.32, tw * 0.5], ColorRole.Primary, shell),
    ...[1, -1].map((side) =>
      piece(
        side === 1 ? 'strap-right' : 'strap-left',
        PartShape.Sphere,
        [side * tw * 0.4, th * 0.34, 0],
        [tw * 0.1, th * 0.1, body.torsoDepth * 0.46],
        ColorRole.Primary,
        { segments: 18, finish: Finish.Cloth },
      ),
    ),
    /*
     * The skirt, in two flares rather than one.
     *
     * A single truncated cone is a traffic cone: straight-sided from waist to
     * hem, which is what the first rebuild of this looked like and what the
     * capture showed. Two sections, the lower one flaring much harder, give the
     * A-line the reference sheet has.
     *
     * Open-ended, so each is a shell rather than a solid with a lid where the
     * waist is — which puts a disc across the figure at hip height in any shot
     * taken from below.
     */
    piece(
      'skirt-upper',
      PartShape.Cylinder,
      [0, waistY - skirt * 0.26, 0],
      [tw * 0.62, skirt * 0.56, tw * 0.7],
      ColorRole.Primary,
      { segments: 26, open: true, finish: Finish.Cloth },
    ),
    piece(
      'skirt-lower',
      PartShape.Cylinder,
      [0, waistY - skirt * 0.72, 0],
      [tw * 0.7, skirt * 0.56, tw * 0.92],
      ColorRole.Primary,
      { segments: 26, open: true, finish: Finish.Cloth },
    ),
    // The waist seam, which is what makes bodice and skirt read as one garment.
    piece('waist', PartShape.Torus, [0, waistY + 0.01, 0], [tw * 0.38, 0.018, tw * 0.38], ColorRole.Accent, {
      rotation: LIE_FLAT,
      segments: 26,
      finish: Finish.Cloth,
      scale: [1, 1, body.torsoDepth / body.torsoWidth + 0.16],
    }),
  ]
}

/* ------------------------------------------------------------ wrist, hand */

function watch(): Part[] {
  return [
    // The strap, around the wrist.
    piece('strap', PartShape.Torus, [0, 0, 0], [0.036, 0.009, 0.036], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 24,
      finish: Finish.Metal,
    }),
    // The case, on the outside of the wrist rather than through it.
    piece('case', PartShape.Cylinder, [0, 0, 0.038], [0.026, 0.014, 0.026], ColorRole.Primary, {
      rotation: LIE_FLAT,
      segments: 20,
      finish: Finish.Metal,
    }),
    piece('dial', PartShape.Cylinder, [0, 0, 0.043], [0.02, 0.004, 0.02], ColorRole.Accent, {
      rotation: LIE_FLAT,
      segments: 20,
      finish: Finish.Glass,
    }),
  ]
}

function ring(): Part[] {
  return [
    piece('band', PartShape.Torus, [0, 0, 0], [0.014, 0.005, 0.014], ColorRole.Primary, {
      rotation: LIE_FLAT,
      segments: 18,
      finish: Finish.Metal,
    }),
    piece('setting', PartShape.Cylinder, [0, 0, 0.016], [0.009, 0.006, 0.009], ColorRole.Secondary, {
      rotation: LIE_FLAT,
      segments: 14,
      finish: Finish.Metal,
    }),
    piece('stone', PartShape.Cone, [0, 0, 0.022], [0.011, 0.014, 0.011], ColorRole.Accent, {
      rotation: [-Math.PI / 2, 0, 0],
      segments: 14,
      finish: Finish.Gem,
    }),
  ]
}

/* ---------------------------------------------------------------- footwear */

function oxford(): Part[] {
  return [
    piece('sole', PartShape.Box, [0, -0.026, 0.008], [0.118, 0.016, 0.246], ColorRole.Secondary, {
      finish: Finish.Leather,
    }),
    piece('upper', PartShape.Box, [0, 0.004, -0.012], [0.11, 0.058, 0.2], ColorRole.Primary, {
      finish: Finish.Leather,
    }),
    /*
     * The toe, rounded and dropped.
     *
     * A shoe that is one box has its highest point at the toe, which is the
     * one place a real shoe is lowest, and it is why the old pair read as
     * blocks. The vamp curves down to it.
     */
    piece('toe', PartShape.Sphere, [0, -0.002, 0.08], [0.052, 0.03, 0.048], ColorRole.Accent, {
      segments: 18,
      finish: Finish.Leather,
    }),
    piece('heel', PartShape.Box, [0, -0.0215, -0.088], [0.09, 0.019, 0.062], ColorRole.Secondary, {
      finish: Finish.Leather,
    }),
  ]
}

function heel(): Part[] {
  return [
    piece('sole', PartShape.Box, [0, 0.004, 0.014], [0.086, 0.012, 0.2], ColorRole.Primary, {
      rotation: [0.16, 0, 0],
      finish: Finish.Leather,
    }),
    piece('vamp', PartShape.Sphere, [0, 0.006, 0.05], [0.046, 0.032, 0.078], ColorRole.Primary, {
      segments: 18,
      finish: Finish.Leather,
    }),
    // The post: the reason this is a different item and not a recolour.
    piece('post', PartShape.Cylinder, [0, -0.014, -0.075], [0.011, 0.04, 0.017], ColorRole.Secondary, {
      segments: 14,
      finish: Finish.Leather,
    }),
    piece('counter', PartShape.Sphere, [0, 0.004, -0.062], [0.04, 0.036, 0.036], ColorRole.Primary, {
      segments: 16,
      finish: Finish.Leather,
    }),
    // The ankle strap, which is what a heel this height would actually need.
    piece('strap', PartShape.Torus, [0, 0.03, -0.03], [0.042, 0.005, 0.042], ColorRole.Accent, {
      rotation: LIE_FLAT,
      segments: 20,
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
      segments: 16,
      finish: Finish.Leather,
    }),
    piece('knob', PartShape.Sphere, [0, 0.022, 0], [0.031, 0.028, 0.031], ColorRole.Accent, {
      segments: 20,
      finish: Finish.Metal,
    }),
    // The collar under the knob, which is what makes it read as fitted rather
    // than as a ball balanced on a stick.
    piece('collar', PartShape.Cylinder, [0, -0.008, 0], [0.017, 0.016, 0.02], ColorRole.Accent, {
      segments: 16,
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
      return shades()
    case ItemShape.Chain:
      return ropeChain()
    case ItemShape.Pendant:
      return pendant()
    case ItemShape.Jacket:
      return jacket(body)
    case ItemShape.Gown:
      return gown(body, compact)
    case ItemShape.Watch:
      return watch()
    case ItemShape.Ring:
      return ring()
    case ItemShape.Oxford:
      return oxford()
    case ItemShape.Heel:
      return heel()
    case ItemShape.Cane:
      return cane()
  }
}
