import { FACADE_X, MARQUEE_BOTTOM_Y, MARQUEE_TOP_Y, ROAD_HALF_WIDTH } from './stripLayout'
import { FACADE_OUT } from './storefrontLayout'

/*
 * The Golden Ace's entrance, as seen from the street.
 *
 * Matched to `art/refs/casino_exterior.png`: a porte-cochere on two fluted gold
 * columns, a bank of revolving doors glowing warm behind it, and a lit ace of
 * spades standing above the marquee.
 *
 * The brief that reference answers is the same one the storefronts answered.
 * The casino's frontage was two emissive rectangles — a 3 x 3.2 slab for the
 * door and a 4.4 x 0.55 band above it — so the grandest building on the street
 * was also the only one with nothing on it. The marquee overhead was doing all
 * the work, and it belongs to the tower rather than to the entrance.
 *
 * Coordinates use the storefronts' convention, so the two cannot drift:
 *
 * - `out` runs from the building toward the road. Positive is toward the road,
 *   whichever side of the street the venue sits on.
 * - `z` runs along the street, measured from the door position.
 */

/** How much pavement there is between the tower's face and the kerb. */
export const PAVEMENT_DEPTH = FACADE_X - ROAD_HALF_WIDTH

/* ------------------------------------------------------------ the entrance */

/**
 * The glazed bay cut into the tower's face.
 *
 * Wide enough to hold a revolving door with a glass flank either side, which is
 * what the reference has and what stops the entrance reading as a single slab.
 *
 * Its height is bounded by the canopy, not chosen: at 3.05 the bay's head stood
 * three centimetres above `CANOPY_UNDER_Y`, so a strip of lit glazing showed
 * over the top of the roof that is supposed to cover it.
 */
export const BAY_HALF_Z = 2.9
export const BAY_HEIGHT = 2.82
export const BAY_OUT = FACADE_OUT + 0.02

/** The glass, standing just proud of the bay's back so it can be lit behind. */
export const GLASS_OUT = BAY_OUT + 0.1

/** The brass drum in the middle of the bay. */
export const DRUM_RADIUS = 0.92
export const DRUM_HEIGHT = 2.5
export const DRUM_OUT = GLASS_OUT + 0.55

/** The flanking door leaves, one either side of the drum. */
export const LEAF_HALF_Z = 0.62
export const LEAF_HEIGHT = 2.4
export const LEAF_Z: readonly number[] = [-1.95, 1.95]

/* ---------------------------------------------------------- the porte-cochere */

/**
 * The canopy's underside, and the one number on this frontage that is not free.
 *
 * The tower's marquee hangs at `MARQUEE_BOTTOM_Y`, and a canopy that reaches it
 * cuts the sign the entrance exists to sit under. `canopyClearsMarquee` holds
 * the two apart; raising the canopy without moving the marquee fails there
 * rather than in a capture nobody takes.
 */
export const CANOPY_UNDER_Y = 3.02
export const CANOPY_THICKNESS = 0.34
export const CANOPY_TOP_Y = CANOPY_UNDER_Y + CANOPY_THICKNESS

/** How far it projects over the pavement, and how far along the street it runs. */
export const CANOPY_OUT = 2.5
export const CANOPY_HALF_Z = 3.9

/**
 * The columns, engaged against the facade rather than standing on the pavement.
 *
 * The reference has them out at the canopy's corners, and that is right for the
 * picture it is: a hero shot taken square to the building. It is wrong for this
 * game, because the play camera trails the player *along* the street — so a
 * column standing up-street of the door sits exactly between the camera and the
 * entrance. The first version put a 2.4-metre pillar dead centre in the frame at
 * the moment the player is offered the door.
 *
 * This is the third time this project has stood something tall on a pavement in
 * front of an entrance. The strip's colonnade did it to all three venues at
 * once; `clearsDoorways` came out of that. The rule that catches this one is
 * `clearsApproach`, and it is about depth rather than width: on a street walked
 * end to end, the pavement in front of a door has to stay empty.
 *
 * The canopy cantilevers instead, on tie-rods thin enough to see past.
 */
export const COLUMN_RADIUS = 0.34
export const COLUMN_OUT = 0.12
export const COLUMN_Z: readonly number[] = [-3.4, 3.4]

/** Rods from the facade to the canopy's outer corners, in place of posts. */
export const TIE_ROD_RADIUS = 0.05
export const TIE_ROD_TOP_Y = CANOPY_UNDER_Y + CANOPY_THICKNESS + 0.9

/**
 * Recessed downlights in the canopy's soffit, on a grid.
 *
 * The reference's canopy is read almost entirely from these — a dark underside
 * with two rows of warm discs in it. Emissive discs, and a single real lamp for
 * the whole canopy rather than one each: a point light close to the surface it
 * is set into is a visible object, which the casino's interior has already paid
 * for once.
 */
export const DOWNLIGHT_SPACING_Z = 1.3
export const DOWNLIGHT_OUT: readonly number[] = [0.75, 1.85]
export const DOWNLIGHT_RADIUS = 0.15

/* ----------------------------------------------------------- the red carpet */

/**
 * The carpet from the doors to the kerb, and the rope down each side.
 *
 * It runs the full depth of the pavement on purpose: stopping short would leave
 * a strip of bare paving between the carpet and the road, which reads as a rug
 * dropped on the pavement rather than as an entrance.
 */
export const CARPET_HALF_Z = 1.5
export const CARPET_FROM_OUT = FACADE_OUT + 0.1
export const CARPET_TO_OUT = PAVEMENT_DEPTH

export const STANCHION_Z: readonly number[] = [-CARPET_HALF_Z - 0.22, CARPET_HALF_Z + 0.22]
export const STANCHION_OUT: readonly number[] = [0.85, 1.95, 3.05]
export const STANCHION_HEIGHT = 0.95
export const ROPE_Y = 0.72

/* --------------------------------------------------------------- greenery */

/** Potted palms either side of the doors, inside the canopy. */
export const PALM_OUT = 0.55
export const PALM_Z: readonly number[] = [-2.45, 2.45]
export const PALM_RADIUS = 0.42

/* ------------------------------------------------------------- the ace sign */

/**
 * The illuminated ace of spades standing above the marquee.
 *
 * Face-on to the street, which is what makes it different from the tower's
 * blade sign: that one turns to face *along* the street so it can be read while
 * walking, and this one is the thing you see when you finally look up at the
 * building you are standing in front of.
 */
export const ACE_WIDTH = 2.5
export const ACE_HEIGHT = 3.0
export const ACE_BOTTOM_Y = MARQUEE_TOP_Y - 0.35
export const ACE_CENTER_Y = ACE_BOTTOM_Y + ACE_HEIGHT / 2
export const ACE_OUT = FACADE_OUT + 0.5

/* ------------------------------------------------------------- pinstripes */

/** Gold neon running up the facade either side of the bay. */
export const PINSTRIPE_Z: readonly number[] = [-BAY_HALF_Z - 0.5, BAY_HALF_Z + 0.5]
export const PINSTRIPE_TOP_Y = MARQUEE_BOTTOM_Y - 0.15
export const PINSTRIPE_WIDTH = 0.12

/* ------------------------------------------------------------- predicates */

/**
 * Whether the canopy clears the marquee it stands under.
 *
 * The entrance is built downward from a sign that belongs to the tower, and the
 * two are laid out in different files. A canopy raised for headroom, or a
 * marquee dropped to be more readable, silently puts one through the other —
 * and from the street the result is a sign with a shelf across its bottom edge,
 * which looks like a modelling error rather than a layout one.
 */
export function canopyClearsMarquee(): boolean {
  return CANOPY_TOP_Y < MARQUEE_BOTTOM_Y
}

/**
 * Whether everything standing on the pavement stays on it.
 *
 * The pavement is under four metres deep. A canopy projecting further than that
 * hangs over the road, and a stanchion does the same — both of which read as
 * furniture floating in the traffic lane, since nothing out there is at
 * pavement height.
 *
 * @param out Distance from the door position toward the road.
 * @param margin How much pavement must remain beyond it.
 */
export function isOnPavement(out: number, margin = 0): boolean {
  return out >= FACADE_OUT && out <= PAVEMENT_DEPTH - margin
}

/**
 * Whether something may stand at this point along the frontage.
 *
 * The narrower of the two doorway rules, for the same reason the storefronts
 * have their own: the strip's `clearsDoorways` keeps street furniture 3.5 from
 * every entrance, which would reject a porte-cochere's own columns. What must
 * hold is that nothing stands in the opening the player walks through.
 *
 * @param z Distance along the street from the door's centre line.
 */
export const DOORWAY_KEEP_CLEAR = 1.35

export function clearsEntrance(z: number): boolean {
  return Math.abs(z) > DOORWAY_KEEP_CLEAR
}

/**
 * How tall something may be before it has to keep off the open pavement.
 *
 * Waist height. A stanchion and a rope are below it and may stand anywhere on
 * the carpet; a column, a planter with a tree in it or a sign is above it and
 * has to go against the wall.
 */
export const APPROACH_CLEAR_HEIGHT = 1.2

/** How far from the facade counts as against the wall. */
export const APPROACH_CLEAR_OUT = 0.75

/**
 * Whether something of this height may stand this far out on the pavement.
 *
 * The play camera trails the player down the street rather than facing the
 * building, so anything tall standing away from the facade ends up between the
 * camera and the door it is decorating. The strip's own `clearsDoorways` does
 * not catch it: that rule is about *width* along the street, and this one is
 * about depth across the pavement.
 *
 * @param out Distance from the door position toward the road.
 * @param height How tall the thing is.
 */
export function clearsApproach(out: number, height: number): boolean {
  return height <= APPROACH_CLEAR_HEIGHT || out <= APPROACH_CLEAR_OUT
}
