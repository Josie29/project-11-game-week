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
