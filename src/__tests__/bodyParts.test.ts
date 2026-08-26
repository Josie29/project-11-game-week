import { describe, expect, it } from 'vitest'
import { Garment, PLAYER_GARMENTS } from '../character/appearance'
import {
  DEFAULT_BODY_OPTIONS,
  restPoseSegments,
  thighParts,
  torsoParts,
  upperArmParts,
  type BodyOptions,
} from '../character/bodyParts'
import { faceParts, faceSurfaceZ, FACES } from '../character/face'
import {
  fightingSurfaces,
  floatingParts,
  listBounds,
  partHalfExtents,
  translateParts,
  type Part,
} from '../character/parts'
import { metricsFor, PROPORTIONS, Silhouette } from '../character/proportions'

const SILHOUETTES = Object.values(Silhouette)

/** Every combination the player can actually put on the designer's figure. */
function playerOutfits(): BodyOptions[] {
  return PLAYER_GARMENTS.flatMap((garment) =>
    [false, true].map((seated) => ({
      ...DEFAULT_BODY_OPTIONS,
      garment,
      hasSkirt: garment === Garment.CocktailDress || garment === Garment.ShirtAndSkirt,
      seated,
    })),
  )
}

/** The whole figure in the rest pose, every segment moved into the root frame. */
function wholeFigure(silhouette: Silhouette, options: BodyOptions): Part[] {
  return restPoseSegments(silhouette, PROPORTIONS[silhouette], options).flatMap((segment) =>
    translateParts(segment.parts, segment.origin).map((part) => ({
      ...part,
      name: `${segment.name}/${part.name}`,
    })),
  )
}

describe('bodyParts', () => {
  /*
   * The figure has to be one connected object, segment to segment.
   *
   * This is the assertion the armless-figure bug needed and did not have. The
   * arms hung inside the torso on all three silhouettes because `shoulderX`
   * was set inside `torsoWidth / 2`; every anchor was legitimately on the body
   * and the character still rendered without visible arms. It was found by
   * looking at a capture. Assembling the rest pose is what makes it a test.
   */
  it('joins every segment of the figure to its neighbour', () => {
    for (const silhouette of SILHOUETTES) {
      for (const options of playerOutfits()) {
        const adrift = floatingParts(wholeFigure(silhouette, options))

        expect(
          adrift,
          `${silhouette} in ${options.garment}${options.seated ? ' (seated)' : ''}: ${adrift.join(', ')}`,
        ).toEqual([])
      }
    }
  })

  /*
   * Checked segment by segment rather than across the whole figure.
   *
   * Within a segment the parts are authored together and decorate each other —
   * a lapel lies on a chest, a brow sits on a face — which is where two
   * surfaces end up on one plane and where the check earns its keep.
   *
   * Across segments they are joined by deliberate deep interpenetration: the
   * top of a thigh is buried inside the hips and the top of an upper arm
   * inside the shoulder. Comparing those turns up the two thighs' bounding
   * boxes sharing a top plane, which is arithmetic rather than a defect —
   * neither cap is visible from anywhere, and pulling the legs apart to
   * satisfy it would be the predicate driving the art.
   */
  it('never leaves two surfaces close enough to fight', () => {
    for (const silhouette of SILHOUETTES) {
      for (const options of playerOutfits()) {
        for (const segment of restPoseSegments(silhouette, PROPORTIONS[silhouette], options)) {
          const conflicts = fightingSurfaces(segment.parts)

          expect(
            conflicts,
            `${silhouette} in ${options.garment}, ${segment.name}: ${conflicts
              .map((c) => `${c.a}/${c.b} ${c.gap.toFixed(4)} on ${c.axis}`)
              .join(', ')}`,
          ).toEqual([])
        }
      }
    }
  })

  /** The staff presets and the shop dummies share the rig and must hold up too. */
  it('joins the figure for staff and for shop dummies', () => {
    for (const silhouette of SILHOUETTES) {
      for (const extra of [{ staff: true }, { mannequin: true }, { suppressSkirt: true, hasSkirt: true }]) {
        const options = { ...DEFAULT_BODY_OPTIONS, garment: Garment.Scrubs, ...extra }

        expect(floatingParts(wholeFigure(silhouette, options))).toEqual([])

        for (const segment of restPoseSegments(silhouette, PROPORTIONS[silhouette], options)) {
          const conflicts = fightingSurfaces(segment.parts)
          expect(
            conflicts,
            `${silhouette} ${segment.name}: ${conflicts
              .map((c) => `${c.a}/${c.b} ${c.gap.toFixed(4)} on ${c.axis}`)
              .join(', ')}`,
          ).toEqual([])
        }
      }
    }
  })

  /*
   * The figure stands on the floor.
   *
   * Feet that sink through it, or hover above it, are invisible from the
   * follow camera and obvious in the designer — and the shoes in the capture
   * that started this work were doing the first of those.
   */
  it('stands the figure on the ground', () => {
    for (const silhouette of SILHOUETTES) {
      const bounds = listBounds(wholeFigure(silhouette, DEFAULT_BODY_OPTIONS))
      expect(bounds).not.toBeNull()
      if (!bounds) continue

      expect(bounds.minY, `${silhouette} sinks into the floor`).toBeGreaterThan(-0.02)
      expect(bounds.minY, `${silhouette} floats above the floor`).toBeLessThan(0.02)
    }
  })

  /*
   * And it is the height the follow camera is built for.
   *
   * `proportions.ts` holds every silhouette to the same total height so the
   * camera never has to know which one it is looking at. A rebuild that
   * quietly added a centimetre at the crown would break that silently.
   */
  it('keeps every silhouette the height the metrics promise', () => {
    for (const silhouette of SILHOUETTES) {
      const metrics = metricsFor(silhouette)
      const bounds = listBounds(wholeFigure(silhouette, DEFAULT_BODY_OPTIONS))
      if (!bounds) continue

      expect(Math.abs(bounds.maxY - metrics.totalHeight)).toBeLessThan(0.02)
    }
  })

  /*
   * A skirt has to cover the top of the leg it hangs over.
   *
   * The starter skirt's waist was narrower than the hip joint plus the thigh's
   * own radius, so a wedge of bare leg showed at each hip on the cocktail
   * dress and the shirt-and-skirt — plainly visible in any front-on capture,
   * and invisible to every test here, because a skirt is authored in the torso
   * and a thigh in its own segment and the two were only ever checked apart.
   *
   * Compared at the skirt's *narrow* end, which is where it is at its tightest
   * and where the leg is at its widest.
   */
  it('covers the top of the thigh with the skirt', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      const options = { ...DEFAULT_BODY_OPTIONS, garment: Garment.CocktailDress, hasSkirt: true }

      const skirt = torsoParts(body, options).find((part) => part.name === 'skirt')
      const thigh = thighParts(body, options).find((part) => part.name === 'thigh')

      expect(skirt, `${silhouette} has no skirt to check`).toBeDefined()
      expect(thigh, `${silhouette} has no thigh to check`).toBeDefined()
      if (!skirt || !thigh) continue

      // The hip joint's offset plus the thigh's own radius: the widest the leg
      // reaches where the skirt is narrowest.
      const legReach = body.hipWidth + thigh.size[0]

      expect(skirt.size[0], `${silhouette} shows bare leg at the hip`).toBeGreaterThan(legReach)
    }
  })

  /*
   * The face follows the curve of the skull.
   *
   * A flat `headDepth / 2` was fine on a box head and leaves an eye floating
   * off the cheek on a rounded one, further out the wider the face. This is
   * the arithmetic that stops it, so it is worth pinning directly.
   */
  it('follows the skull round with the face features', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]

    expect(faceSurfaceZ(body, 0)).toBeCloseTo(body.headDepth / 2, 6)
    // Out at the edge of the face the surface has come right back to the ear.
    expect(faceSurfaceZ(body, body.headWidth / 2)).toBeCloseTo(0, 6)
    expect(faceSurfaceZ(body, body.headWidth * 0.25)).toBeLessThan(body.headDepth / 2)
    // Never returns a value behind the centre of the head, whatever it is fed.
    expect(faceSurfaceZ(body, body.headWidth * 4)).toBeGreaterThanOrEqual(0)
  })

  /*
   * And it curves away going *down* the face as well as across it.
   *
   * The `y` argument arrived with the mouth: the mouth sits well below the
   * head's centre, where the skull has come back a centimetre, and a lip
   * placed at the centre-line depth floats clear of the chin. It defaulted to
   * zero for a long time and every caller took the default.
   */
  it('follows the skull down the face as well as across it', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]

    expect(faceSurfaceZ(body, 0, -body.headHeight * 0.3)).toBeLessThan(faceSurfaceZ(body, 0, 0))
    // And nowhere near the head it reports nothing at all.
    expect(faceSurfaceZ(body, 0, body.headHeight)).toBe(0)
  })

  /*
   * Every feature is set into the surface it sits on.
   *
   * The old face was six flat plates floating a millimetre or two off a flat
   * head, which is what reads as a sticker at any distance. A feature whose
   * centre is *outside* the skin is a bead glued on; one whose front is behind
   * the skin is invisible. Both are silent, and both have happened here.
   */
  it('sets every face feature into the skin rather than onto it', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      for (const part of faceParts(body)) {
        const [x, y, z] = part.at
        const surface = faceSurfaceZ(body, Math.abs(x), y)
        // Read off the part rather than its `size`, which means radii on a
        // sphere and full extents on a box — the face now uses both.
        const halfDepth = partHalfExtents(part)[2]

        expect(
          z - halfDepth,
          `${part.name} on ${silhouette} floats off the face`,
        ).toBeLessThan(surface)
        expect(
          z + halfDepth,
          `${part.name} on ${silhouette} is buried under the skin`,
        ).toBeGreaterThan(surface)
      }
    }
  })

  /*
   * The three silhouettes have three faces.
   *
   * The designer opens on the silhouette control, and it changed the shoulders,
   * the hip and the leg length and nothing at all above the neck — three
   * bodies wearing one face. Comparing the parts rather than the traits table
   * is the point: a trait nothing reads is a trait that does nothing.
   */
  it('gives each silhouette its own face', () => {
    const shapeOf = (silhouette: Silhouette) =>
      faceParts(PROPORTIONS[silhouette])
        .map((part) => `${part.name}:${part.size.join(',')}`)
        .join('|')

    const feminine = shapeOf(Silhouette.Feminine)
    const masculine = shapeOf(Silhouette.Masculine)

    expect(feminine).not.toEqual(masculine)
    expect(FACES[Silhouette.Feminine].eyeSize).toBeGreaterThan(
      FACES[Silhouette.Masculine].eyeSize,
    )
    expect(FACES[Silhouette.Masculine].browWeight).toBeGreaterThan(
      FACES[Silhouette.Feminine].browWeight,
    )
  })

  /*
   * The shoulders reach the sockets the arms actually hang from.
   *
   * They did not: two small spheres set well inboard of `shoulderX`, so each
   * arm's own flat top cap sat in the open under a ball that read as a shoulder
   * pad. This is the same class of error as `shoulderX` being set inside
   * `torsoWidth / 2` — a relationship between two numbers in two places, with
   * nothing holding them to each other.
   */
  it('carries the shoulders out to the sockets the arms hang from', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      const shoulders = torsoParts(body, DEFAULT_BODY_OPTIONS).find(
        (part) => part.name === 'shoulders',
      )
      const deltoid = upperArmParts(body, DEFAULT_BODY_OPTIONS).find(
        (part) => part.name === 'deltoid',
      )

      expect(shoulders, `${silhouette} has no shoulder mass`).toBeDefined()
      expect(deltoid, `${silhouette} has no deltoid to cap the arm`).toBeDefined()
      if (!shoulders || !deltoid) continue

      expect(
        shoulders.size[0],
        `${silhouette} leaves a gap between shoulder and arm`,
      ).toBeGreaterThan(body.shoulderX)

      // And the cap on the arm covers the cylinder's own top.
      const upperArm = upperArmParts(body, DEFAULT_BODY_OPTIONS).find(
        (part) => part.name === 'upper-arm',
      )
      expect(deltoid.size[0]).toBeGreaterThan(upperArm?.size[0] ?? 0)
      expect(deltoid.at[1] + deltoid.size[1], `${silhouette} leaves the arm's top cap bare`).toBeGreaterThan(0)
    }
  })

  /*
   * A dummy has no face, and that is the whole difference.
   *
   * A mannequin with eyes and a haircut reads as a person standing very still
   * behind glass, which is why the flag exists at all.
   */
  it('leaves the face off a shop dummy', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]

    const person = torsoParts(body, DEFAULT_BODY_OPTIONS).map((part) => part.name)
    const dummy = torsoParts(body, { ...DEFAULT_BODY_OPTIONS, mannequin: true }).map((p) => p.name)

    expect(person).toContain('eye-right')
    expect(person).toContain('nose')
    expect(dummy).not.toContain('eye-right')
    expect(dummy).not.toContain('nose')
  })

  /*
   * A suit has lapels and a tie; a tee has neither.
   *
   * The shirt panel on a tee reads as a bib stuck to the chest, which is the
   * bug this switch was written to avoid and which no test held.
   */
  it('gives each starter garment only its own detail', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]

    const named = (garment: Garment) =>
      torsoParts(body, { ...DEFAULT_BODY_OPTIONS, garment }).map((part) => part.name)

    expect(named(Garment.Suit)).toContain('tie')
    expect(named(Garment.Suit)).toContain('lapel-right')
    expect(named(Garment.TeeAndJeans)).not.toContain('tie')
    expect(named(Garment.TeeAndJeans)).not.toContain('shirt-panel')
    expect(named(Garment.TeeAndJeans)).toContain('neckline')
    expect(named(Garment.CocktailDress)).not.toContain('lapel-right')
  })

  /*
   * A gown covers the starter skirt, and nothing shorter does.
   *
   * Suppressing on any outerwear at all put a jacket over a cocktail dress and
   * left the character in bare legs.
   */
  it('drops the starter skirt only for a gown', () => {
    const body = PROPORTIONS[Silhouette.Feminine]
    const base = { ...DEFAULT_BODY_OPTIONS, garment: Garment.CocktailDress, hasSkirt: true }

    expect(torsoParts(body, base).map((p) => p.name)).toContain('skirt')
    expect(torsoParts(body, { ...base, suppressSkirt: true }).map((p) => p.name)).not.toContain(
      'skirt',
    )
  })
})
