/**
 * How far above the player's feet the trailing camera aims, and orbits around.
 *
 * Roughly the top of a standing figure's head, so the character sits in the
 * lower half of the frame and the room fills the rest.
 *
 * This lives out here rather than inside `WalkingPlayer` because a layout
 * module now has to be able to work out where the camera actually ends up:
 * `entranceCamera` in `casinoFloorLayout.ts` sizes the casino's waterfall
 * against what that camera can see of it, and geometry sized against a camera
 * constant copied into a second file is the kind of quiet disagreement that
 * shows up as "it looked fine on my screen" and never as a failing test.
 *
 * Pure and free of `three`, so the node test environment can read it.
 */
export const CAMERA_LOOK_HEIGHT = 2.2

/**
 * The play camera's vertical field of view, in degrees, as `App.tsx` sets it.
 *
 * Out here for a sharper version of the same reason. The casino's waterfall was
 * first sized by the angle it spans *across* the entrance view, which it passed
 * comfortably at 22.6 degrees — and it was still cut off, because more than
 * half of it was above the top of the frame. Width says nothing about whether
 * something is on screen; only the frustum does, and the frustum needs this.
 */
export const PLAY_FOV = 55

/* ------------------------------------------------------------------ framing */

/** A point in world space, as the layout modules hold them. */
export type Point3 = readonly [number, number, number]

/**
 * The widest angle any two of `points` subtend at `cameraAt`, in radians.
 *
 * Three copies of this arc-cosine had grown up independently —
 * `mirrorSubtendedAngle`, `counterSubtendedAngle` and `waterfallSubtendedAngle`
 * each carried their own — and a fourth was needed for the tables. It is one
 * function now, and taking a *set* of points rather than a pair is what lets a
 * caller hand it the corners of whatever actually has to be on screen instead
 * of picking the widest pair by hand.
 *
 * @param cameraAt Where the camera sits, world space.
 * @param points The subject's extremities; the corners of a box are enough.
 * @returns The angle between the two most widely separated, in radians. Zero
 *   for fewer than two points.
 */
export function subtendedAngle(cameraAt: Point3, points: readonly Point3[]): number {
  let widest = 0

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]
      const b = points[j]
      if (!a || !b) continue

      const ax = a[0] - cameraAt[0]
      const ay = a[1] - cameraAt[1]
      const az = a[2] - cameraAt[2]
      const bx = b[0] - cameraAt[0]
      const by = b[1] - cameraAt[1]
      const bz = b[2] - cameraAt[2]

      const lengths = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)
      if (lengths === 0) continue

      const cosine = (ax * bx + ay * by + az * bz) / lengths
      const between = Math.acos(Math.min(1, Math.max(-1, cosine)))
      if (between > widest) widest = between
    }
  }

  return widest
}

/**
 * How wide the view is *across* the screen, in radians.
 *
 * `three` states a perspective camera's field of view **vertically**, so the
 * horizontal frame is not a property of the camera at all — it collapses as the
 * window narrows. At 1600x900 a 45-degree camera sees 72.7 degrees across; on a
 * 390x844 phone the same camera sees 21.7. Every subtended-angle measure in
 * this project was written against the first number and silently assumed it.
 *
 * @param vFovDegrees The camera's vertical field of view, in degrees.
 * @param aspect Viewport width divided by height.
 * @returns The horizontal field of view, in radians, to match `subtendedAngle`.
 */
export function frameWidth(vFovDegrees: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((vFovDegrees * Math.PI) / 360) * aspect)
}

/**
 * The canonical phone, so tests and captures quote one number.
 *
 * A 390x844 viewport — an iPhone 14 or 15 held upright, and the narrowest
 * common shape the game has to survive.
 */
export const PORTRAIT_ASPECT = 390 / 844

/**
 * The reference desktop shape, which is also what `npm run shots` captures at.
 */
export const LANDSCAPE_ASPECT = 1600 / 900

/**
 * The widest a camera may open before the cure is worse than the disease.
 *
 * Past about seventy degrees vertical the perspective distortion at the edges
 * of the frame is more objectionable than the crop it is fixing. Where this cap
 * binds and the subject still does not fit, the answer is to move the camera
 * back instead — see `seatedView` in `casinoFloorLayout.ts`, which is the only
 * shot in the game wide enough to need it.
 */
export const MAX_FOV = 70

/**
 * How much clear frame a subject gets either side of it, as a multiplier.
 *
 * Exactly fitting is not fitting. The walking cameras drift, the orbit cameras
 * are draggable, and a subject that sits edge to edge reads as cropped even
 * when every pixel of it is present.
 */
export const FRAME_MARGIN = 1.25

/**
 * The vertical field of view that puts `subtended` inside the frame.
 *
 * Never narrower than `designFov`, which is what keeps this whole change off
 * the primary target: for every subject in the game the answer at a landscape
 * aspect is `designFov` unchanged, and `camera.test.ts` asserts that rather
 * than trusting it. Only a genuinely narrow window widens anything.
 *
 * Capped at `MAX_FOV`, so this returns the best FOV available rather than a
 * promise that the subject fits — the caller still has to check.
 *
 * @param subtended How wide the subject sits across the view, in radians.
 * @param aspect Viewport width divided by height.
 * @param designFov The field of view the shot was composed at, in degrees.
 * @param margin Clear frame either side, as a multiplier on `subtended`.
 * @returns A vertical field of view in degrees, within `[designFov, MAX_FOV]`.
 */
export function fovToFit(
  subtended: number,
  aspect: number,
  designFov: number,
  margin: number = FRAME_MARGIN,
): number {
  // The vertical FOV whose horizontal frame is exactly the subject plus margin.
  const wanted = (2 * Math.atan(Math.tan((subtended * margin) / 2) / aspect) * 180) / Math.PI

  return Math.min(MAX_FOV, Math.max(designFov, wanted))
}

/**
 * How far down the frame a point lands, as a fraction from the top edge.
 *
 * Zero is the top of the screen and one is the bottom; outside that range is
 * off-screen. The horizontal companion to this is `subtendedAngle`, and the
 * pair exist for the same reason `waterfallHeadroom` had to be written after
 * `waterfallSubtendedAngle` already passed: width across the view says nothing
 * about whether a thing is in the frame, and on a phone neither does height,
 * because the bottom half of the screen has a panel on it.
 *
 * @param cameraAt Where the camera sits, world space.
 * @param lookAt What it is aimed at, world space.
 * @param vFovDegrees Its vertical field of view.
 * @param point The point to place.
 * @returns Fraction of frame height from the top. Negative is off the top;
 *   greater than one is off the bottom; `Infinity` for a point behind the
 *   camera, which is off-screen in the direction that matters here.
 */
export function framedFractionY(
  cameraAt: Point3,
  lookAt: Point3,
  vFovDegrees: number,
  point: Point3,
): number {
  const forward = normalize([
    lookAt[0] - cameraAt[0],
    lookAt[1] - cameraAt[1],
    lookAt[2] - cameraAt[2],
  ])

  // The camera's own up, which is world up with the forward component removed.
  const upDot = forward[1]
  const cameraUp = normalize([-forward[0] * upDot, 1 - forward[1] * upDot, -forward[2] * upDot])

  const toPoint: Point3 = [
    point[0] - cameraAt[0],
    point[1] - cameraAt[1],
    point[2] - cameraAt[2],
  ]

  const depth = dot(toPoint, forward)
  if (depth <= 0) return Infinity

  const height = dot(toPoint, cameraUp)
  const ndc = height / depth / Math.tan((vFovDegrees * Math.PI) / 360)

  return (1 - ndc) / 2
}

/**
 * The lowest any of `points` lands in the frame, as a fraction from the top.
 *
 * @returns The largest `framedFractionY` over the subject.
 */
export function framedBottom(
  cameraAt: Point3,
  lookAt: Point3,
  vFovDegrees: number,
  points: readonly Point3[],
): number {
  let lowest = -Infinity

  for (const point of points) {
    const fraction = framedFractionY(cameraAt, lookAt, vFovDegrees, point)
    if (fraction > lowest) lowest = fraction
  }

  return lowest
}

function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize(v: Point3): Point3 {
  const length = Math.hypot(v[0], v[1], v[2])
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * The narrowest the walking camera's view may get across the screen.
 *
 * The walking camera is global — `App.tsx` sets one FOV and the strip, the
 * casino floor, the shop floor and the clinic floor all use it — so it cannot
 * be sized against any one room. This is the floor that keeps the widest thing
 * any of them has to hold on screen: the Golden Ace's waterfall, at 22.6
 * degrees, with `FRAME_MARGIN` either side of it.
 *
 * The dependency deliberately points this way rather than importing the
 * waterfall's measure into the camera module. `casinoFloorLayout.test.ts`
 * asserts the cascade actually fits inside `playFov`, so if it ever grows the
 * failure lands there and points back here.
 */
export const MIN_PLAY_FRAME = (30 * Math.PI) / 180

/**
 * The walking camera's field of view for a given viewport shape.
 *
 * `PLAY_FOV` unchanged at every landscape aspect, and wider on a phone held
 * upright — where 55 degrees vertical is only 27 across, which is narrower than
 * the room the player is walking through.
 *
 * @param aspect Viewport width divided by height.
 * @returns A vertical field of view, in degrees.
 */
export function playFov(aspect: number): number {
  // Margin 1: MIN_PLAY_FRAME is already the subject plus its clear frame.
  return fovToFit(MIN_PLAY_FRAME, aspect, PLAY_FOV, 1)
}
