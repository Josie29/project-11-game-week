import { describe, expect, it } from 'vitest'
import {
  AWNING_FRONT_OUT,
  DOOR_HALF_WIDTH,
  DOOR_HEIGHT,
  FRONT_OUT,
  isInWindow,
  isOnShopFront,
  isSolidFrontage,
  MANNEQUIN_OUT,
  MANNEQUIN_PLATFORM_Y,
  MANNEQUIN_Z,
  outToWorldX,
  SIGN_MAX_Y,
  SIGN_MIN_Y,
  STOREFRONT_HEIGHT,
  STOREFRONT_MAX_Z,
  STOREFRONT_MIN_Z,
  WINDOW_MAX_Z,
  WINDOW_MIN_Z,
  WINDOW_SILL_Y,
  WINDOW_TOP_Y,
} from '../scenes/storefrontLayout'
import {
  DOOR_TRIGGER_RADIUS,
  FACADE_X,
  ROAD_HALF_WIDTH,
  STREET_BOUNDS,
  VenueKind,
  VENUES,
} from '../world/venues'

/** The one shop on the strip. Every measurement below is relative to its door. */
const SHOP = VENUES.find((venue) => venue.kind === VenueKind.Shop)

/** A figure is about 1.8 tall, which is what has to fit behind the glass. */
const FIGURE_HEIGHT = 1.8

describe('shop front layout', () => {
  it('has a shop on the strip to lay out', () => {
    expect(SHOP).toBeDefined()
  })

  // The storefront's own `isOnFelt`. The window, the door and the sign are all
  // hand-placed on one panel, and anything that runs off its edge hangs in the
  // air beside the building.
  it('keeps the window, door and sign on the storefront panel', () => {
    for (const [z, y] of [
      [WINDOW_MIN_Z, WINDOW_SILL_Y],
      [WINDOW_MIN_Z, WINDOW_TOP_Y],
      [WINDOW_MAX_Z, WINDOW_SILL_Y],
      [WINDOW_MAX_Z, WINDOW_TOP_Y],
      [-DOOR_HALF_WIDTH, 0],
      [DOOR_HALF_WIDTH, DOOR_HEIGHT],
    ] as const) {
      expect(isOnShopFront(z, y), `(${z}, ${y}) is off the storefront`).toBe(true)
    }

    expect(SIGN_MAX_Y).toBeLessThanOrEqual(STOREFRONT_HEIGHT)
    expect(SIGN_MIN_Y).toBeGreaterThan(WINDOW_TOP_Y)
  })

  // The mannequins are the reason the window exists. One placed past the glass
  // is standing in the wall, and one too close to an edge is half hidden by the
  // frame — neither is visible from the street, which is where they have to
  // read from.
  it('stands every mannequin fully inside the display window', () => {
    for (const z of MANNEQUIN_Z) {
      expect(isInWindow(z, MANNEQUIN_PLATFORM_Y + FIGURE_HEIGHT / 2), `mannequin at z=${z}`).toBe(
        true,
      )
      // Clear of the frame either side, not merely between its edges.
      expect(z - WINDOW_MIN_Z).toBeGreaterThan(0.4)
      expect(WINDOW_MAX_Z - z).toBeGreaterThan(0.4)
    }

    // And they must not overlap each other.
    const sorted = [...MANNEQUIN_Z].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      expect((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)).toBeGreaterThan(0.6)
    }
  })

  // A figure standing on the platform has to clear the window head-height, or
  // the mannequins are decapitated by the frame.
  it('leaves headroom for a full-height figure behind the glass', () => {
    expect(WINDOW_TOP_Y - MANNEQUIN_PLATFORM_Y).toBeGreaterThan(FIGURE_HEIGHT)
  })

  // The visible door has to sit inside the proximity trigger it represents.
  // Offset from it and the player walks toward the doorway and is teleported
  // inside from somewhere beside it, which reads as the door being in the
  // wrong place rather than the trigger being.
  it('centres the visible door on the entry trigger', () => {
    expect(DOOR_HALF_WIDTH).toBeLessThan(DOOR_TRIGGER_RADIUS)
    expect(isOnShopFront(0, DOOR_HEIGHT / 2)).toBe(true)
  })

  // The awning projects further toward the road than anything else on the
  // building. Over the road it would hang above traffic; behind the facade it
  // would be inside the wall.
  it('keeps the awning over the sidewalk, not the road', () => {
    if (!SHOP) return
    const [doorX] = SHOP.doorPosition
    const tipX = Math.abs(outToWorldX(doorX, AWNING_FRONT_OUT))

    expect(tipX).toBeGreaterThan(ROAD_HALF_WIDTH)
    expect(tipX).toBeLessThan(FACADE_X)
  })

  // The player can walk to the edge of the sidewalk. If the glazing reaches
  // further out than that, they walk through the shop window.
  it('keeps the storefront clear of where the player can walk', () => {
    if (!SHOP) return
    const [doorX] = SHOP.doorPosition
    const frontX = Math.abs(outToWorldX(doorX, FRONT_OUT))
    const playerLimit = doorX < 0 ? Math.abs(STREET_BOUNDS.minX) : STREET_BOUNDS.maxX

    expect(frontX).toBeGreaterThan(playerLimit)
    // The mannequins sit behind the glass, so further still.
    expect(Math.abs(outToWorldX(doorX, MANNEQUIN_OUT))).toBeGreaterThan(frontX)
  })

  // The bug this file was extended for. The frontage was one solid box with
  // the glass laid over it, so the display window was a sheet of glass in front
  // of a wall and the lit interior, the rails and all three mannequins were
  // invisible from the street — the entire point of the storefront, missing.
  it('leaves the window and the door as openings, not wall', () => {
    const windowMidY = (WINDOW_SILL_Y + WINDOW_TOP_Y) / 2

    for (const z of MANNEQUIN_Z) {
      expect(isSolidFrontage(z, windowMidY), `wall across the window at z=${z}`).toBe(false)
    }
    expect(isSolidFrontage(0, DOOR_HEIGHT / 2), 'wall across the doorway').toBe(false)
  })

  // ...and the complement: everything that is not an opening has to be wall,
  // or the storefront has holes through to the tower behind it.
  it('fills every part of the frontage that is not an opening', () => {
    const solid: readonly (readonly [number, number])[] = [
      // Below the window, and above it.
      [WINDOW_MIN_Z + 0.5, WINDOW_SILL_Y / 2],
      [WINDOW_MIN_Z + 0.5, WINDOW_TOP_Y + 0.5],
      // The piers either side of the window.
      [STOREFRONT_MIN_Z + 0.2, 1.5],
      [WINDOW_MAX_Z + 0.1, 1.5],
      // Beside and above the door.
      [DOOR_HALF_WIDTH + 0.2, 1.5],
      [0, DOOR_HEIGHT + 0.5],
    ]

    for (const [z, y] of solid) {
      expect(isSolidFrontage(z, y), `hole in the frontage at (${z}, ${y})`).toBe(true)
    }
  })

  // As with the other two layout predicates, one that returned true everywhere
  // would leave this whole file passing while proving nothing.
  it('rejects points beyond the storefront', () => {
    expect(isOnShopFront(STOREFRONT_MAX_Z + 1, 1)).toBe(false)
    expect(isOnShopFront(0, STOREFRONT_HEIGHT + 1)).toBe(false)
    expect(isInWindow(0, 2)).toBe(false)
    expect(isInWindow(WINDOW_MIN_Z + 0.5, WINDOW_TOP_Y + 1)).toBe(false)
  })
})
