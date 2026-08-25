import { describe, expect, it } from 'vitest'
import { anchorFor, isOnBody, Side } from '../character/anchors'
import { Slot, SLOT_ORDER } from '../character/catalog'
import { metricsFor, PROPORTIONS, Silhouette } from '../character/proportions'

const SILHOUETTES = Object.values(Silhouette)

describe('anchorFor', () => {
  // This is the character's `isOnFelt`. Hand-derived 3D coordinates have been
  // wrong more often on this project than the game rules have — a hat sitting
  // inside the skull on the narrow silhouette, or a pendant floating in front
  // of the chest, is invisible in a wide shot and obvious the moment anyone
  // zooms in on the avatar at the table.
  it('places every slot on the body, for every silhouette and both sides', () => {
    for (const silhouette of SILHOUETTES) {
      for (const slot of SLOT_ORDER) {
        for (const side of [Side.Left, Side.Right]) {
          const anchor = anchorFor(slot, silhouette, side)
          expect(
            isOnBody(anchor, silhouette),
            `${slot} on ${silhouette} (side ${side}) is off the body at ${anchor.join(', ')}`,
          ).toBe(true)
        }
      }
    }
  })

  // A hat that reads correctly on the broad silhouette can still be buried in
  // the head of the narrow one, because the crown moves with the proportions.
  it('sits a hat on the crown, above the face, on every silhouette', () => {
    for (const silhouette of SILHOUETTES) {
      const metrics = metricsFor(silhouette)
      const [, hatY] = anchorFor(Slot.Head, silhouette)

      expect(hatY).toBeGreaterThan(metrics.headCenterY)
      expect(hatY).toBeCloseTo(metrics.crownY, 5)
    }
  })

  // Glasses belong on the front of the face. Getting the sign wrong puts them
  // on the back of the head, which no screenshot of the player from behind —
  // the strip's default camera — would ever reveal.
  it('puts eyewear in front of the head, not behind it', () => {
    for (const silhouette of SILHOUETTES) {
      const [, eyesY, eyesZ] = anchorFor(Slot.Eyes, silhouette)
      const metrics = metricsFor(silhouette)

      expect(eyesZ).toBeGreaterThan(0)
      expect(eyesY).toBeGreaterThan(metrics.torsoTopY)
      expect(eyesY).toBeLessThan(metrics.crownY)
    }
  })

  // Shoes are the one anchor with an absolute answer: the floor. A pair that
  // rode up with the silhouette would leave the character walking on air.
  it('keeps shoes on the ground and apart from each other', () => {
    for (const silhouette of SILHOUETTES) {
      const [leftX, leftY] = anchorFor(Slot.Feet, silhouette, Side.Left)
      const [rightX, rightY] = anchorFor(Slot.Feet, silhouette, Side.Right)

      expect(leftY).toBeLessThan(0.1)
      expect(rightY).toBeLessThan(0.1)
      expect(leftX).toBeLessThan(0)
      expect(rightX).toBeGreaterThan(0)
    }
  })

  // The watch goes on the wrist, not the elbow or the palm — it has to land
  // between the shoulder and the fingertips on every arm length.
  it('places the wrist below the shoulder and above the fingertips', () => {
    for (const silhouette of SILHOUETTES) {
      const metrics = metricsFor(silhouette)
      const [, wristY] = anchorFor(Slot.Wrist, silhouette)
      const [, ringY] = anchorFor(Slot.Finger, silhouette)

      expect(wristY).toBeLessThan(metrics.shoulderY)
      expect(wristY).toBeGreaterThan(ringY)
    }
  })
})

describe('isOnBody', () => {
  // The test above is only worth anything if the predicate actually rejects
  // things. Without this, a bug that made `isOnBody` return true everywhere
  // would leave the whole anchor suite passing while proving nothing.
  it('rejects points that are clearly off the figure', () => {
    for (const silhouette of SILHOUETTES) {
      const metrics = metricsFor(silhouette)

      expect(isOnBody([0, metrics.crownY + 0.6, 0], silhouette)).toBe(false)
      expect(isOnBody([1.4, metrics.hipY, 0], silhouette)).toBe(false)
      expect(isOnBody([0, metrics.hipY, 1.2], silhouette)).toBe(false)
      expect(isOnBody([0, -0.5, 0], silhouette)).toBe(false)
    }
  })
})

describe('PROPORTIONS', () => {
  // The follow camera, the stool height and the door trigger are all tuned
  // against one height. A silhouette that came out noticeably taller would sit
  // wrong on the stool and be framed differently on the strip.
  it('holds every silhouette to the same overall height', () => {
    const heights = SILHOUETTES.map((silhouette) => metricsFor(silhouette).totalHeight)

    for (const height of heights) {
      expect(height).toBeGreaterThan(1.72)
      expect(height).toBeLessThan(1.86)
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.05)
  })

  // The arms hang from `shoulderX`. Set inside the torso's half-width and they
  // are swallowed by it: the figure renders with no arms at all from the front,
  // which is exactly how the first designer capture came out. Both the original
  // rig and the first pass at these three bodies had this wrong.
  it('hangs the arms clear of the torso on every silhouette', () => {
    for (const silhouette of SILHOUETTES) {
      const body = PROPORTIONS[silhouette]
      /** Radius of the upper-arm capsule in `CasinoCharacter`. */
      const armRadius = 0.055

      expect(
        body.shoulderX - body.torsoWidth / 2,
        `${silhouette} buries its arms in its torso`,
      ).toBeGreaterThan(armRadius * 0.6)
    }
  })

  // The sheet in art/refs/ is explicit about this: the feminine figures are
  // narrower through the shoulders and wider at the hip. If the three bodies
  // ever converge, the silhouette choice stops being visible at all and the
  // first designer control does nothing.
  it('keeps the silhouettes visibly distinct at the shoulder and hip', () => {
    const feminine = PROPORTIONS[Silhouette.Feminine]
    const masculine = PROPORTIONS[Silhouette.Masculine]

    expect(masculine.shoulderX - feminine.shoulderX).toBeGreaterThan(0.03)
    expect(masculine.torsoWidth - feminine.torsoWidth).toBeGreaterThan(0.05)
    // Longer leg, shorter torso — that is what reads as the difference.
    expect(feminine.thigh + feminine.shin).toBeGreaterThan(masculine.thigh + masculine.shin)
    expect(feminine.torsoHeight).toBeLessThan(masculine.torsoHeight)
  })
})
