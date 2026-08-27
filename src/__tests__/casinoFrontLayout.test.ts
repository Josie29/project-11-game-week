import { describe, expect, it } from 'vitest'
import {
  ACE_BOTTOM_Y,
  BAY_HALF_Z,
  BAY_HEIGHT,
  CANOPY_HALF_Z,
  CANOPY_OUT,
  CANOPY_TOP_Y,
  APPROACH_CLEAR_HEIGHT,
  APPROACH_CLEAR_OUT,
  CANOPY_UNDER_Y,
  canopyClearsMarquee,
  clearsApproach,
  CARPET_HALF_Z,
  CARPET_TO_OUT,
  clearsEntrance,
  COLUMN_OUT,
  COLUMN_RADIUS,
  COLUMN_Z,
  DOORWAY_KEEP_CLEAR,
  DRUM_OUT,
  DRUM_RADIUS,
  isOnPavement,
  PALM_RADIUS,
  PALM_Z,
  PAVEMENT_DEPTH,
  PALM_OUT,
  STANCHION_HEIGHT,
  STANCHION_OUT,
  STANCHION_Z,
} from '../scenes/casinoFrontLayout'
import { MARQUEE_BOTTOM_Y, MARQUEE_TOP_Y } from '../scenes/stripLayout'
import { DOOR_TRIGGER_RADIUS } from '../world/venues'

describe('the Golden Ace frontage', () => {
  /*
   * The entrance is built downward from a sign that belongs to the tower, and
   * the two are laid out in different files.
   *
   * Raise the canopy for headroom, or drop the marquee to make it more
   * readable, and one goes through the other — from the street that reads as a
   * shelf across the bottom of the sign, which looks like a modelling fault
   * rather than a layout one and would be fixed in the wrong place.
   */
  it('fits the canopy under the tower marquee', () => {
    expect(canopyClearsMarquee()).toBe(true)
    expect(CANOPY_TOP_Y).toBeLessThan(MARQUEE_BOTTOM_Y)

    // ...and leaves a player room to walk under it.
    expect(CANOPY_UNDER_Y).toBeGreaterThan(2.4)
  })

  // The ace stands above the marquee. Overlapping it would put a spade through
  // the letters, and floating it clear would leave a gap of dark facade.
  it('stands the ace on top of the marquee', () => {
    expect(ACE_BOTTOM_Y).toBeLessThan(MARQUEE_TOP_Y)
    expect(ACE_BOTTOM_Y).toBeGreaterThan(MARQUEE_BOTTOM_Y)
  })

  /*
   * The pavement is under four metres deep and the road beside it is at a
   * different height. Anything reaching past the kerb hangs over the traffic
   * lane with nothing under it.
   */
  it('keeps every part of the entrance on the pavement', () => {
    expect(PAVEMENT_DEPTH).toBeGreaterThan(3)

    expect(isOnPavement(CANOPY_OUT), 'the canopy overhangs the road').toBe(true)
    expect(isOnPavement(COLUMN_OUT + COLUMN_RADIUS)).toBe(true)
    expect(isOnPavement(DRUM_OUT + DRUM_RADIUS)).toBe(true)
    expect(isOnPavement(CARPET_TO_OUT)).toBe(true)

    for (const out of STANCHION_OUT) {
      expect(isOnPavement(out), `a stanchion at ${out} is off the pavement`).toBe(true)
    }
  })

  /*
   * Nothing may stand in the opening the player walks through.
   *
   * The strip's own `clearsDoorways` keeps street furniture three and a half
   * metres from every entrance, which would reject a porte-cochere's columns —
   * they belong to the door. This is the narrower rule, and the clinic already
   * showed what it is for: a queue rail put a stanchion five centimetres off a
   * doorway's centre line, so the entrance had a post growing out of it.
   */
  it('leaves the doorway itself clear', () => {
    for (const z of COLUMN_Z) {
      expect(clearsEntrance(z), `a canopy column stands at z = ${z}`).toBe(true)
    }
    for (const z of PALM_Z) {
      expect(clearsEntrance(z), `a palm stands at z = ${z}`).toBe(true)
    }
    for (const z of STANCHION_Z) {
      expect(clearsEntrance(z), `a stanchion stands at z = ${z}`).toBe(true)
    }

    // The drum is *in* the doorway, which is correct — it is the door. What
    // matters is that it does not spread wider than the opening.
    expect(DRUM_RADIUS).toBeLessThan(DOORWAY_KEEP_CLEAR)
  })

  // The predicates have to reject something, or the assertions above pass while
  // proving nothing. The seventh and eighth on this project to carry this.
  it('rejects furniture in the doorway and off the kerb', () => {
    expect(clearsEntrance(0)).toBe(false)
    expect(clearsEntrance(DOORWAY_KEEP_CLEAR - 0.1)).toBe(false)
    expect(isOnPavement(PAVEMENT_DEPTH + 1)).toBe(false)
    expect(isOnPavement(-5)).toBe(false)
  })

  /*
   * The carpet and the ropes have to leave the trigger walkable.
   *
   * `DOOR_TRIGGER_RADIUS` is measured from the door position, so the player is
   * offered the venue while standing on the carpet. A rope line narrower than
   * the approach would have them walking through it to get in.
   */
  it('runs the carpet out through the door trigger', () => {
    expect(CARPET_TO_OUT).toBeGreaterThan(DOOR_TRIGGER_RADIUS)
    expect(CARPET_HALF_Z).toBeLessThan(BAY_HALF_Z)

    // The rope lane is wider than the doorway it leads to.
    for (const z of STANCHION_Z) {
      expect(Math.abs(z)).toBeGreaterThan(CARPET_HALF_Z)
    }
  })

  /*
   * Nothing tall may stand out on the pavement in front of the door.
   *
   * The play camera trails the player *along* the street rather than facing the
   * building, so anything standing away from the facade ends up between the
   * camera and the entrance it decorates. The first version of this frontage
   * had the reference's free-standing columns at `out = 2.0`, and the capture
   * of the moment the player is offered the door is a 2.4-metre pillar filling
   * the middle of the frame.
   *
   * The strip's own `clearsDoorways` does not catch it — that rule is about
   * width along the street, and this one is about depth across the pavement.
   */
  it('leaves the pavement in front of the door clear', () => {
    for (const z of COLUMN_Z) {
      expect(
        clearsApproach(COLUMN_OUT, CANOPY_UNDER_Y),
        `a column stands out on the pavement at z = ${z}`,
      ).toBe(true)
    }

    // The palms are over waist height too, so they go against the wall.
    expect(clearsApproach(PALM_OUT, 2.0)).toBe(true)

    // The ropes are not, and may stand anywhere on the carpet.
    for (const out of STANCHION_OUT) {
      expect(clearsApproach(out, STANCHION_HEIGHT)).toBe(true)
    }
  })

  // ...and the rule has to reject the thing it was written for.
  it('rejects a column standing out on the pavement', () => {
    expect(clearsApproach(2.0, CANOPY_UNDER_Y)).toBe(false)
    expect(clearsApproach(APPROACH_CLEAR_OUT + 0.1, APPROACH_CLEAR_HEIGHT + 0.1)).toBe(false)
  })

  // The canopy has to cover what it stands over, or it reads as a shelf beside
  // the entrance rather than a roof over it.
  it('covers the bay and both columns with the canopy', () => {
    expect(CANOPY_HALF_Z).toBeGreaterThan(BAY_HALF_Z)
    for (const z of COLUMN_Z) {
      expect(Math.abs(z)).toBeLessThan(CANOPY_HALF_Z)
    }
    expect(CANOPY_OUT).toBeGreaterThan(COLUMN_OUT)
    expect(BAY_HEIGHT).toBeLessThan(CANOPY_UNDER_Y)
    expect(PALM_RADIUS).toBeGreaterThan(0)
  })
})
