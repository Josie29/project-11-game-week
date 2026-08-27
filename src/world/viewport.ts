/*
 * What shape of screen the game is being played on, and what is pointing at it.
 *
 * Pure and free of the DOM, on the same rule as the game engines: the two
 * decisions in here — whether to draw touch controls, and whether to re-frame
 * every camera — are both invisible in a screenshot of the thing they decide,
 * and both are wrong in a way that only shows up on hardware nobody has to
 * hand. `useLayout` is the one place that talks to `matchMedia`.
 */

/** How the game is being played, derived once and read everywhere. */
export interface Layout {
  /** Viewport width divided by height. */
  readonly aspect: number
  /** Taller than it is wide. */
  readonly portrait: boolean
  /** Draw the on-screen stick and make the prompts tappable. */
  readonly touch: boolean
}

/**
 * Whether the on-screen controls belong on this device.
 *
 * **Not** "does it have a touchscreen". A touchscreen laptop reports touch
 * points and would get a thumbstick over the bottom-left of the game, which is
 * a regression on the primary target to fix a secondary one. A finger is a
 * coarse pointer that cannot hover; a trackpad on a machine that also has a
 * touchscreen is a fine pointer that can. That is the distinction that matters
 * and it is the one the media query makes.
 *
 * @param coarsePointer `(pointer: coarse)` — the primary pointer is a finger.
 * @param canHover `(hover: hover)` — the primary pointer can rest on a thing
 *   without pressing it.
 * @returns True only for a device driven by touch alone.
 */
export function isTouchLayout(coarsePointer: boolean, canHover: boolean): boolean {
  return coarsePointer && !canHover
}

/**
 * The shape of the screen, and what is driving it.
 *
 * @param width Viewport width in CSS pixels.
 * @param height Viewport height in CSS pixels.
 * @param coarsePointer `(pointer: coarse)`.
 * @param canHover `(hover: hover)`.
 * @returns The layout every camera and control reads.
 */
export function layoutFor(
  width: number,
  height: number,
  coarsePointer: boolean,
  canHover: boolean,
): Layout {
  // A zero-height viewport happens for one frame during some orientation
  // changes, and an aspect of Infinity puts every camera at MAX_FOV for that
  // frame. Falling back to the desktop shape makes the glitch invisible.
  const aspect = height > 0 ? width / height : DESKTOP_LAYOUT.aspect

  return {
    aspect,
    portrait: aspect < 1,
    touch: isTouchLayout(coarsePointer, canHover),
  }
}

/**
 * What the game assumes before it has measured anything.
 *
 * The desktop shape on purpose: server-rendered nothing, a first frame at the
 * wrong FOV, and a capture harness that has to be told nothing to keep working
 * are all the same requirement, and this is it.
 */
export const DESKTOP_LAYOUT: Layout = {
  aspect: 1600 / 900,
  portrait: false,
  touch: false,
}

/**
 * How much of a phone screen a bottom sheet takes.
 *
 * The designer and the shop are side panels on a desktop and sheets on a phone,
 * and a sheet is not a cosmetic difference to the scene behind it — it is a
 * crop. The first portrait capture of the fitting room framed the mirror
 * perfectly and put the character behind the panel, which is the same class of
 * mistake as sizing the waterfall by its width: correct against the camera, and
 * invisible on the screen.
 *
 * The number is here, in the module both sides read, rather than in the
 * stylesheet. `applySheetFraction` publishes it to CSS as `--sheet` and
 * `fittingHeadroom` measures against it, so the panel and the shot cannot
 * disagree about where the fold is.
 */
export const SHEET_FRACTION = 0.45

/**
 * Publishes `SHEET_FRACTION` to the stylesheet as `--sheet`.
 *
 * Called once at start-up. CSS cannot import a constant and this is the one
 * number a layout module and the stylesheet both have to agree on.
 */
export function applySheetFraction(root: HTMLElement): void {
  root.style.setProperty('--sheet', `${SHEET_FRACTION * 100}dvh`)
}
