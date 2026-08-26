import type { Pose } from '../world/presence'

/*
 * Where this player is, right now, as a plain mutable object.
 *
 * Deliberately not in a store. `WalkingPlayer` updates the transform sixty
 * times a second inside `useFrame`, and routing that through zustand would
 * re-render the whole world every frame to move one figure — the same reason
 * the walk cycle takes a `speedRef` rather than a speed prop.
 *
 * `WalkingPlayer` writes it; the presence sender samples it on its own timer at
 * a much lower rate. Nothing subscribes to it.
 */

/** The mutable inside of a `Pose`. Only this module may write to it. */
type MutablePose = { -readonly [K in keyof Pose]: Pose[K] }

const localTransform: MutablePose = { x: 0, z: 0, yaw: 0, speed: 0 }

/** Called from the player's frame loop. Mutates in place, allocating nothing. */
export function setLocalTransform(x: number, z: number, yaw: number, speed: number): void {
  localTransform.x = x
  localTransform.z = z
  localTransform.yaw = yaw
  localTransform.speed = speed
}

/** Reads the current pose. The returned object is live; copy it if you keep it. */
export function getLocalTransform(): Pose {
  return localTransform
}
