import { describe, expect, it } from 'vitest'
import { Garment, HairStyle } from '../character/appearance'
import { Silhouette } from '../character/proportions'
import {
  appearanceOverrides,
  hasAppearanceOverride,
  turnRadians,
  wornItems,
} from '../dev/appearanceLinks'

const query = (search: string) => new URLSearchParams(search)

describe('appearance deep links', () => {
  it('reads every field it offers', () => {
    const overrides = appearanceOverrides(
      query('build=feminine&hair=ponytail&garment=suit&skin=umber&haircolor=silver&garmentcolor=plum'),
    )

    expect(overrides).toEqual({
      silhouette: Silhouette.Feminine,
      hairStyle: HairStyle.Ponytail,
      garment: Garment.Suit,
      skinTone: 'umber',
      hairColor: 'silver',
      garmentColor: 'plum',
    })
  })

  /*
   * A typo leaves the figure alone rather than resetting it.
   *
   * These are typed by hand into a URL bar far more often than they are
   * generated, and a mistyped `?hair=ponytale` that silently returned a default
   * character would send someone hunting for a rendering bug in a figure that
   * is not the one they asked for.
   */
  it('drops anything it does not recognise instead of defaulting it', () => {
    expect(appearanceOverrides(query('build=octopus&hair=ponytale&skin=beige'))).toEqual({})
    expect(appearanceOverrides(query(''))).toEqual({})
  })

  /*
   * `?wear=` must not hand the renderer an id this build no longer sells.
   *
   * The same guarantee `sanitizeOwned` gives a save, for the same reason: both
   * are strings from outside, and a since-removed item must produce a character
   * without it rather than a hole where geometry was expected.
   */
  it('keeps only items the catalogue still knows', () => {
    expect(wornItems(query('wear=felt-fedora,not-a-thing,lacquer-cane'))).toEqual([
      'felt-fedora',
      'lacquer-cane',
    ])
    expect(wornItems(query('wear=felt-fedora,felt-fedora'))).toEqual(['felt-fedora'])
    expect(wornItems(query('wear='))).toEqual([])
    expect(wornItems(query(''))).toEqual([])
  })

  it('knows when it has been asked for anything at all', () => {
    expect(hasAppearanceOverride(query('hair=bob'))).toBe(true)
    expect(hasAppearanceOverride(query('wear=signet-ring'))).toBe(true)
    expect(hasAppearanceOverride(query('boot=designer&time=21:00'))).toBe(false)
  })

  /*
   * The turn that makes a back view reachable.
   *
   * Worth a test of its own because it is the parameter this whole rebuild
   * needed and did not have: every character capture ever taken on this project
   * was a front view, and the defect that started the work only reads as wrong
   * from behind.
   */
  it('turns degrees into radians, and refuses nonsense', () => {
    expect(turnRadians(query('turn=180'))).toBeCloseTo(Math.PI, 10)
    expect(turnRadians(query('turn=-90'))).toBeCloseTo(-Math.PI / 2, 10)
    expect(turnRadians(query('turn=0'))).toBe(0)
    expect(turnRadians(query('turn=sideways'))).toBeNull()
    expect(turnRadians(query(''))).toBeNull()
  })
})
