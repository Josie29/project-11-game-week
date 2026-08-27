import { describe, expect, it } from 'vitest'
import { DESKTOP_LAYOUT, isTouchLayout, layoutFor } from '../world/viewport'

describe('isTouchLayout', () => {
  it('is on for a phone', () => {
    expect(isTouchLayout(true, false)).toBe(true)
  })

  /*
   * The case it exists to reject, and the reason it is not
   * `navigator.maxTouchPoints > 0`.
   *
   * A touchscreen laptop reports touch points. Keying the on-screen stick off
   * that would put a thumbstick over the bottom-left corner of the game for
   * anybody on a Surface or a touch MacBook — a regression on the primary
   * target, introduced to serve the secondary one. A finger is a coarse pointer
   * that cannot hover; a trackpad on the same machine is a fine one that can.
   */
  it('is off for a laptop that happens to have a touchscreen', () => {
    expect(isTouchLayout(false, true)).toBe(false)
    // Both reported, as a hybrid does: the primary pointer still hovers.
    expect(isTouchLayout(true, true)).toBe(false)
  })
})

describe('layoutFor', () => {
  it('calls a phone portrait and a desktop not', () => {
    expect(layoutFor(390, 844, true, false).portrait).toBe(true)
    expect(layoutFor(1600, 900, false, true).portrait).toBe(false)
  })

  /*
   * A phone reports a height of zero for a frame or two mid-rotation. An
   * aspect of Infinity puts every camera in the game at MAX_FOV for that frame,
   * which is a visible flash of fish-eye every time the player turns the
   * device.
   */
  it('falls back to the desktop shape rather than dividing by zero', () => {
    expect(layoutFor(390, 0, true, false).aspect).toBe(DESKTOP_LAYOUT.aspect)
  })

  it('reports the aspect it was given', () => {
    expect(layoutFor(1600, 900, false, true).aspect).toBeCloseTo(16 / 9, 9)
  })
})
