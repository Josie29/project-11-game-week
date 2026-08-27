/*
 * The maths behind the on-screen stick.
 *
 * Pure and tested, on the same rule as the game engines and `presence.ts`:
 * none of it survives a screenshot. A stick with no dead zone and one with a
 * good one are the same picture, and the difference between them is whether a
 * thumb resting on the glass walks the player slowly into a wall.
 */

/** A movement request, as the walk loop wants it. */
export interface StickVector {
  /** Right is positive. */
  readonly x: number
  /** Forward is positive — screen y runs the other way and is flipped here. */
  readonly y: number
  /** How far the stick is pushed, in `[0, 1]`. Zero inside the dead zone. */
  readonly magnitude: number
}

/** Nothing pushed. Shared so the idle case allocates nothing. */
export const STICK_IDLE: StickVector = { x: 0, y: 0, magnitude: 0 }

/**
 * How far the knob travels from the centre of the stick, in CSS pixels.
 *
 * Also the radius at which the stick is fully pushed. Sized against a thumb
 * rather than against the artwork: comfortable travel without lifting off the
 * glass is about a centimetre and a half.
 */
export const STICK_TRAVEL = 56

/**
 * How much of that travel means "not moving".
 *
 * A thumb resting on a touchscreen is never still, and without this the player
 * drifts. Beyond it the response is rescaled from zero rather than jumping
 * straight to 0.2, so the stick has no step in it at the edge of the zone.
 */
export const STICK_DEAD_ZONE = 0.18

/**
 * The movement request for a thumb at `pointer`, on a stick centred at
 * `origin`.
 *
 * @param originX Stick centre, CSS pixels from the left of the viewport.
 * @param originY Stick centre, CSS pixels from the top.
 * @param pointerX Where the thumb is now.
 * @param pointerY Where the thumb is now.
 * @param travel Distance at which the stick reads as fully pushed.
 * @param deadZone Fraction of `travel` that reads as not moving.
 * @returns A direction and a magnitude in `[0, 1]`.
 */
export function stickVector(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  travel: number = STICK_TRAVEL,
  deadZone: number = STICK_DEAD_ZONE,
): StickVector {
  const dx = pointerX - originX
  // Screen y grows downward and forward is up, so this is the one flip.
  const dy = originY - pointerY

  const distance = Math.hypot(dx, dy)
  if (distance === 0) return STICK_IDLE

  const pushed = Math.min(1, distance / travel)
  if (pushed <= deadZone) return STICK_IDLE

  // Rescaled so the edge of the dead zone is zero rather than a step up to it.
  const magnitude = (pushed - deadZone) / (1 - deadZone)

  return { x: (dx / distance) * magnitude, y: (dy / distance) * magnitude, magnitude }
}

/**
 * Where the knob is drawn, relative to the stick's centre, in CSS pixels.
 *
 * Deliberately *not* the same as `stickVector` — the knob follows the thumb
 * right through the dead zone, because a control that visibly ignores the first
 * few millimetres of a drag reads as broken rather than as considerate.
 *
 * @returns The knob offset, clamped to the stick's travel.
 */
export function stickKnob(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  travel: number = STICK_TRAVEL,
): { readonly x: number; readonly y: number } {
  const dx = pointerX - originX
  const dy = pointerY - originY

  const distance = Math.hypot(dx, dy)
  if (distance <= travel) return { x: dx, y: dy }

  return { x: (dx / distance) * travel, y: (dy / distance) * travel }
}

/**
 * Combines the keyboard's direction with the stick's.
 *
 * The keys give a direction and nothing else; the stick gives a direction and
 * an amount. Adding them and clamping the result means a keyboard-only session
 * comes out at exactly magnitude 0 or 1 — arithmetically the behaviour that
 * shipped — while a thumb halfway over walks at half speed.
 *
 * @param keyX Right minus left, so -1, 0 or 1.
 * @param keyY Forward minus back, so -1, 0 or 1.
 * @param stick The on-screen stick, or `STICK_IDLE` when there is not one.
 * @returns A direction and a speed multiplier in `[0, 1]`.
 */
export function moveVector(keyX: number, keyY: number, stick: StickVector): StickVector {
  const x = keyX + stick.x
  const y = keyY + stick.y

  const length = Math.hypot(x, y)
  if (length === 0) return STICK_IDLE

  const magnitude = Math.min(1, length)

  return { x: (x / length) * magnitude, y: (y / length) * magnitude, magnitude }
}
