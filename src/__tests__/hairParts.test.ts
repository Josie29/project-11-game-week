import { describe, expect, it } from 'vitest'
import { HairStyle } from '../character/appearance'
import { hairParts, skullBounds } from '../character/hairParts'
import {
  ColorRole,
  fightingSurfaces,
  floatingParts,
  listBounds,
  MIN_SURFACE_GAP,
  PartShape,
  type Part,
} from '../character/parts'
import { PROPORTIONS, Silhouette } from '../character/proportions'

const STYLES = Object.values(HairStyle)
const SILHOUETTES = Object.values(Silhouette)

/** The skull as a part, so it takes part in the surface checks like anything else. */
function skullPart(silhouette: Silhouette): Part {
  const body = PROPORTIONS[silhouette]

  return {
    name: 'skull',
    shape: PartShape.Box,
    at: [0, 0, 0],
    size: [body.headWidth, body.headHeight, body.headDepth],
    role: ColorRole.Skin,
  }
}

describe('hairParts', () => {
  /*
   * The assertion this whole module exists for.
   *
   * The shipped ponytail was a capsule floating 8cm behind the skull and a
   * gather sphere floating beside that, and every test in the repository
   * passed: `isOnBody` checks the slot's single attachment anchor, which was
   * correct, and nothing at all looked at the shape hanging off it. Remove
   * this and hair can come adrift from the head again with nothing to say so.
   */
  it('attaches every piece of every style to the head', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      const skull = skullBounds(body)

      for (const style of STYLES) {
        const adrift = floatingParts(hairParts(style, body), [skull])

        expect(adrift, `${style} on ${silhouette} has pieces attached to nothing`).toEqual([])
      }
    }
  })

  /*
   * Catches the strobing the whole figure showed as it turned.
   *
   * The old hair met the skull at millimetre offsets — a cap whose flat side
   * faces landed within a millimetre of the head's, brows 1mm off the face —
   * and a depth buffer cannot separate two surfaces that close, so they
   * alternate frame to frame. Every piece must now either be buried in what it
   * sits on or clear it outright.
   */
  it('never leaves two surfaces close enough to fight', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      for (const style of STYLES) {
        const conflicts = fightingSurfaces([skullPart(silhouette), ...hairParts(style, body)])

        expect(
          conflicts,
          `${style} on ${silhouette}: ${conflicts
            .map((c) => `${c.a}/${c.b} ${c.gap.toFixed(4)} apart on ${c.axis}`)
            .join(', ')}`,
        ).toEqual([])
      }
    }
  })

  /*
   * A predicate that passed everything would leave this whole suite green
   * while proving nothing — the same trap `isOnFelt` and `isOnBody` are each
   * paired against a point they must reject.
   */
  it('rejects a piece that has come adrift', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]
    const detached: Part = {
      name: 'runaway',
      shape: PartShape.Sphere,
      at: [0, 0, -body.headDepth * 3],
      size: [0.02, 0.02, 0.02],
      role: ColorRole.Hair,
    }

    const parts = [...hairParts(HairStyle.Crop, body), detached]

    expect(floatingParts(parts, [skullBounds(body)])).toEqual(['runaway'])
  })

  /** And a surface check that passed everything would be just as worthless. */
  it('rejects two surfaces a hair apart', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]
    const half = body.headWidth / 2

    const conflicts = fightingSurfaces([
      skullPart(Silhouette.Androgynous),
      {
        name: 'decal',
        shape: PartShape.Box,
        // A fifth of a millimetre proud of the face: far below what the depth
        // buffer can separate, which is the case this threshold is really for.
        at: [0, 0, body.headDepth / 2 + 0.0001],
        size: [half, half, 0.0002],
        role: ColorRole.Hair,
      },
    ])

    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts[0]?.gap).toBeLessThan(MIN_SURFACE_GAP)
  })

  /*
   * Every style has to cover the crown.
   *
   * A style whose parts all sat below the top of the skull would render as a
   * bald figure wearing a collar, which is a failure no colour or lighting
   * change could rescue and which reads as "the hair is not loading".
   */
  it('covers the crown on every style', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      for (const style of STYLES) {
        const bounds = listBounds(hairParts(style, body))

        expect(bounds, `${style} on ${silhouette} has no parts at all`).not.toBeNull()
        expect(
          bounds?.maxY ?? 0,
          `${style} on ${silhouette} does not reach the top of the head`,
        ).toBeGreaterThan(body.headHeight / 2)
      }
    }
  })

  /*
   * The styles named for what hangs behind them have to hang behind.
   *
   * This is the "reads as the thing it is named after" check, and it is the
   * one a screenshot from the front cannot make — which is exactly how a
   * ponytail that pointed sideways survived. A ponytail, a long fall and a bun
   * must all reach further back than the skull does.
   */
  it('hangs the back-weighted styles behind the head', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      const behind = -body.headDepth / 2

      for (const style of [HairStyle.Ponytail, HairStyle.Long, HairStyle.Updo, HairStyle.Bob]) {
        const bounds = listBounds(hairParts(style, body))

        expect(bounds?.minZ ?? 0, `${style} on ${silhouette} does not sit behind the head`).toBeLessThan(
          behind,
        )
      }
    }
  })

  /*
   * And the long styles have to be long.
   *
   * A ponytail that stops at the jaw is a bob with a bead on it. Measured
   * against head height so it holds on all three skulls.
   */
  it('drops the long styles below the chin', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      const chin = -body.headHeight / 2

      for (const style of [HairStyle.Ponytail, HairStyle.Long]) {
        const bounds = listBounds(hairParts(style, body))

        expect(bounds?.minY ?? 0, `${style} on ${silhouette} is too short to read`).toBeLessThan(chin)
      }
    }
  })
})
