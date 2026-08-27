import { describe, expect, it } from 'vitest'
import { anchorFor } from '../character/anchors'
import { Garment, PLAYER_GARMENTS } from '../character/appearance'
import { DEFAULT_BODY_OPTIONS, thighParts, torsoParts } from '../character/bodyParts'
import { CATALOG, ItemShape, Slot } from '../character/catalog'
import { EYE_Y } from '../character/face'
import { itemParts } from '../character/itemParts'
import {
  fightingSurfaces,
  floatingParts,
  listBounds,
  translateParts,
  type Vec3,
} from '../character/parts'
import { metricsFor, PROPORTIONS, Silhouette } from '../character/proportions'

const SILHOUETTES = Object.values(Silhouette)

/** How far above the eye a brim has to stop, as a fraction of head height. */
const BROW_CLEARANCE = 0.06

describe('itemParts', () => {
  /*
   * Every item has to be one object.
   *
   * The pendant is the case that earned this: its stone hung below a chain it
   * was not joined to, and the only thing between them was empty space. On a
   * figure the size of a chip that reads as a floating gem, which is precisely
   * the class of defect that survives a screenshot taken from the front.
   */
  it('holds every item together as a single assembly', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      for (const item of CATALOG) {
        const adrift = floatingParts(itemParts(item, body))

        expect(adrift, `${item.name} on ${silhouette} has pieces attached to nothing`).toEqual([])
      }
    }
  })

  /** The seated variant is a different assembly and has to hold together too. */
  it('holds every item together seated as well as standing', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      for (const item of CATALOG) {
        const adrift = floatingParts(itemParts(item, body, true))

        expect(adrift, `${item.name} on ${silhouette}, seated, has pieces adrift`).toEqual([])
      }
    }
  })

  it('never leaves two surfaces close enough to fight', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]

      for (const item of CATALOG) {
        for (const compact of [false, true]) {
          const conflicts = fightingSurfaces(itemParts(item, body, compact))

          expect(
            conflicts,
            `${item.name} on ${silhouette}${compact ? ' (seated)' : ''}: ${conflicts
              .map((c) => `${c.a}/${c.b} ${c.gap.toFixed(4)} apart on ${c.axis}`)
              .join(', ')}`,
          ).toEqual([])
        }
      }
    }
  })

  /*
   * Nothing may be so small it cannot be seen.
   *
   * The cane already taught this lesson once from the other direction — it was
   * rendering correctly and was simply too dark to make out, which is why
   * `npm run locate` exists. An item under a centimetre across has the same
   * symptom for a different reason and would be diagnosed the same slow way.
   */
  it('gives every item something big enough to see', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]

    for (const item of CATALOG) {
      const bounds = listBounds(itemParts(item, body))
      expect(bounds, `${item.name} has no parts`).not.toBeNull()
      if (!bounds) continue

      const widest = Math.max(
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY,
        bounds.maxZ - bounds.minZ,
      )

      expect(widest, `${item.name} is too small to read on a figure`).toBeGreaterThan(0.02)
    }
  })

  /*
   * A shoe sits on the floor, and only just above it.
   *
   * The shoes in the capture that started this work were boxes buried in the
   * shin capsules with their corners poking out at the ankle. The anchor puts
   * the slot at 0.035 above the floor, so a shoe whose parts run far below
   * that is underground and one that runs far above it is a boot floating at
   * the knee.
   */
  it('keeps footwear on the ground', () => {
    const body = PROPORTIONS[Silhouette.Androgynous]
    const ankle = 0.035

    for (const item of CATALOG.filter(
      (entry) => entry.shape === ItemShape.Oxford || entry.shape === ItemShape.Heel,
    )) {
      const bounds = listBounds(itemParts(item, body))
      if (!bounds) continue

      // The anchor is 0.035 up, so the sole may reach the floor and no further.
      expect(bounds.minY, `${item.name} sinks through the floor`).toBeGreaterThan(-ankle - 0.005)
      expect(bounds.maxY, `${item.name} rides too high up the leg`).toBeLessThan(0.14)
    }
  })

  /*
   * A hat sits above the eyes, not over them.
   *
   * The head anchor is the top of the skull, so anything reaching down past the
   * brow is a hat pulled over a face.
   *
   * Measured against the brow rather than against a flat -0.03, which is what
   * it was and which was a number written for a flat brim. A fedora's brim
   * genuinely dips at the front — that is what separates it from a pork pie —
   * and a threshold three centimetres under the crown of a thirty-centimetre
   * head condemns the shape for being the right shape. The eye line is the
   * thing anyone actually cares about, and it is derivable.
   */
  it('sits headwear above the eyes', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      // `EYE_Y` is measured from the head's centre; the hat's frame is the crown.
      const browBelowCrown = -body.headHeight * (0.5 + EYE_Y + BROW_CLEARANCE)

      for (const item of CATALOG.filter((entry) => entry.shape === ItemShape.Fedora)) {
        const bounds = listBounds(itemParts(item, body))
        if (!bounds) continue

        expect(
          bounds.minY,
          `${item.name} on ${silhouette} is pulled down over the face`,
        ).toBeGreaterThan(browBelowCrown)
        expect(bounds.minY, `${item.name} on ${silhouette} floats above the head`).toBeLessThan(0)
      }
    }
  })

  /*
   * A gown reaches the floor when standing and clears a stool when seated.
   *
   * Both halves matter and only one is visible in any given scene, which is
   * how the seated case went wrong before: the skirt hung through the seat and
   * the thighs, and it is invisible from anywhere except the table camera.
   */
  it('shortens the gown for a seated figure and not otherwise', () => {
    const body = PROPORTIONS[Silhouette.Feminine]
    const gown = CATALOG.find((entry) => entry.shape === ItemShape.Gown)
    expect(gown, 'the catalogue no longer sells a gown').toBeDefined()
    if (!gown) return

    const standing = listBounds(itemParts(gown, body, false))
    const seated = listBounds(itemParts(gown, body, true))

    expect(standing?.minY ?? 0).toBeLessThan(-0.8)
    expect(seated?.minY ?? 0).toBeGreaterThan(-0.6)
  })

  /*
   * A gown has to clear the leg at the hip, exactly as the starter skirt does.
   *
   * Same defect, same reason it went unseen: the item and the body are correct
   * apart and wrong together.
   */
  it('covers the top of the thigh with the gown', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      const gown = CATALOG.find((entry) => entry.shape === ItemShape.Gown)
      if (!gown) continue

      const upper = itemParts(gown, body).find((part) => part.name === 'skirt-upper')
      const thigh = thighParts(body, DEFAULT_BODY_OPTIONS).find((part) => part.name === 'thigh')
      if (!upper || !thigh) continue

      const legReach = body.hipWidth + thigh.size[0]

      expect(upper.size[0], `${silhouette} shows bare leg beside the gown`).toBeGreaterThan(legReach)
    }
  })

  /*
   * The check that was missing, and the one that mattered.
   *
   * Items were asserted on their own and the body was asserted on its own, and
   * both passed — while the gown's bodice was authored at exactly the chest's
   * own radius, so a garment and the body under it were the same surface. The
   * capture came back with vertical stripes crawling down the front of the
   * dress, which is the flicker this whole rebuild was asked to find.
   *
   * Neither list could have caught it alone. Worn geometry is only correct
   * relative to what it is worn over, so the two have to be checked dressed.
   */
  describe('worn over the body', () => {
    /** The slots that hang off the torso, which is where garments overlap. */
    const TORSO_SLOTS = [Slot.Outerwear, Slot.Neck, Slot.Head, Slot.Eyes]

    /** Rebases a root-frame anchor into the torso group, which sits at the hip. */
    function inTorso(slot: Slot, silhouette: Silhouette): Vec3 {
      const anchor = anchorFor(slot, silhouette)
      return [anchor[0], anchor[1] - metricsFor(silhouette).hipY, anchor[2]]
    }

    it('never leaves a worn item on the same plane as the body under it', () => {
      for (const silhouette of SILHOUETTES) {
        const body = PROPORTIONS[silhouette]

        for (const garment of PLAYER_GARMENTS) {
          const options = {
            ...DEFAULT_BODY_OPTIONS,
            garment,
            hasSkirt:
              garment === Garment.CocktailDress || garment === Garment.ShirtAndSkirt,
          }

          for (const item of CATALOG.filter((entry) => TORSO_SLOTS.includes(entry.slot))) {
            // A gown draws its own skirt, exactly as the rig arranges it.
            const dressed = {
              ...options,
              suppressSkirt: item.shape === ItemShape.Gown,
              coveredByOuterwear: item.slot === Slot.Outerwear,
              eyesCovered: item.slot === Slot.Eyes,
            }

            const worn = translateParts(
              itemParts(item, body),
              inTorso(item.slot, silhouette),
            ).map((part) => ({ ...part, name: `worn/${part.name}` }))

            const conflicts = fightingSurfaces([...torsoParts(body, dressed), ...worn])

            expect(
              conflicts,
              `${item.name} over ${garment} on ${silhouette}: ${conflicts
                .map((c) => `${c.a}/${c.b} ${c.gap.toFixed(4)} on ${c.axis}`)
                .join(', ')}`,
            ).toEqual([])
          }
        }
      }
    })

    /*
     * And a worn item has to actually touch the body.
     *
     * The other half of the same idea: a hat floating above a crown and a hat
     * resting on it are indistinguishable in the item's own frame, because in
     * that frame there is no head.
     */
    it('attaches every worn item to the body', () => {
      for (const silhouette of SILHOUETTES) {
        const body = PROPORTIONS[silhouette]
        const torso = torsoParts(body, DEFAULT_BODY_OPTIONS)

        for (const item of CATALOG.filter((entry) => TORSO_SLOTS.includes(entry.slot))) {
          const worn = translateParts(itemParts(item, body), inTorso(item.slot, silhouette))
          const adrift = floatingParts([...torso, ...worn])

          expect(
            adrift,
            `${item.name} on ${silhouette} floats clear of the body`,
          ).toEqual([])
        }
      }
    })
  })
})
