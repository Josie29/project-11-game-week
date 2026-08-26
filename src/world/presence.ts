import { type Appearance, sanitizeAppearance } from '../character/appearance'
import { type EquippedItems, sanitizeEquipped, sanitizeOwned } from '../character/catalog'
import { TableId } from '../scenes/casinoFloorLayout'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'

/*
 * Everything about other players that is arithmetic rather than networking.
 *
 * Pure, and tested, on the same rule as `src/games/`: this decides where a
 * remote figure is drawn and what a peer is allowed to make it look like, and
 * neither is checkable from a screenshot. A figure that teleports on every
 * packet and a figure that interpolates correctly are the same still image.
 *
 * The socket lives in `src/net/room.ts`. Nothing here knows it exists.
 */

/** How far behind live each remote figure is drawn, in milliseconds. */
export const INTERPOLATION_DELAY_MS = 120

/** Longest a stale snapshot keeps being drawn before the figure is dropped. */
export const STALE_AFTER_MS = 10_000

/** Movement below this is not worth a packet, in world units. */
const POSITION_EPSILON = 0.02

/** Turning below this is not worth a packet, in radians (about 1.7°). */
const YAW_EPSILON = 0.03

/** Longest a name may be, in characters. Long enough to be a name. */
export const MAX_NAME_LENGTH = 16

/** Shown for a player who sent nothing usable. */
export const FALLBACK_NAME = 'Player'

/** Where a player is, and how fast, at one instant. */
export interface Pose {
  readonly x: number
  readonly z: number
  /** Facing, in radians. */
  readonly yaw: number
  /** Walking speed in units per second, so the walk cycle can react. */
  readonly speed: number
}

/** A pose stamped with the moment it was received. */
export interface Snapshot extends Pose {
  /** `performance.now()` on this machine when it arrived, not the sender's clock. */
  readonly at: number
}

/**
 * Coerces a wire value into a known table, or null.
 *
 * Total, like every other sanitizer here. An unrecognised table has to read as
 * "not at a table" rather than becoming a third state that the queue would then
 * have to have an opinion about.
 */
export function sanitizeTable(value: unknown): TableId | null {
  return value === TableId.Craps || value === TableId.Blackjack ? value : null
}

/** Who a remote player is: the parts that change rarely. */
export interface RemoteIdentity {
  readonly id: string
  readonly name: string
  readonly appearance: Appearance
  readonly equipped: EquippedItems
  /** True while they are sat at a table, so they are drawn seated. */
  readonly seated: boolean
  /**
   * Which table they are at, or null.
   *
   * Separate from `seated` because the two answer different questions and one
   * field cannot answer both. `seated` decides how the figure is *drawn* and is
   * true in the clinic's recliners too, where there is no table at all. This
   * says which game they are standing at, which is what a shooter queue needs —
   * a casino holds two tables and "seated" cannot tell them apart.
   */
  readonly table: TableId | null
}

/**
 * Wraps an angle into (-π, π].
 *
 * The reason yaw cannot be lerped directly: a player turning from 170° to
 * -170° has moved 20°, and a naive interpolation spins them 340° the other way.
 */
export function shortestAngle(delta: number): number {
  const wrapped = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
  return wrapped
}

/** Linear interpolation between two poses, taking the short way round in yaw. */
function blend(from: Pose, to: Pose, t: number): Pose {
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    yaw: from.yaw + shortestAngle(to.yaw - from.yaw) * t,
    speed: from.speed + (to.speed - from.speed) * t,
  }
}

/**
 * Where to draw a remote figure at `renderTime`.
 *
 * Snapshots arrive around 12 times a second and the scene renders 60, so
 * drawing the newest one would move each figure in visible steps. Drawing
 * slightly *behind* live, between the two snapshots that straddle that instant,
 * turns the same packets into continuous motion.
 *
 * @param buffer Snapshots in the order they arrived, oldest first.
 * @param renderTime Usually `performance.now() - INTERPOLATION_DELAY_MS`.
 * @returns The pose to draw, or `null` if there is nothing to draw yet.
 */
export function interpolateAt(buffer: readonly Snapshot[], renderTime: number): Pose | null {
  if (buffer.length === 0) return null

  const first = buffer[0]
  const last = buffer[buffer.length - 1]
  if (!first || !last) return null

  // Before the buffer starts: the figure has only just appeared.
  if (renderTime <= first.at) return first

  /*
   * Past the end. Deliberately holds the last known pose rather than
   * extrapolating: a player who stopped sending has almost always stopped
   * moving, and guessing forward makes them drift through a wall.
   */
  if (renderTime >= last.at) return last

  for (let i = 0; i < buffer.length - 1; i++) {
    const from = buffer[i]
    const to = buffer[i + 1]
    if (!from || !to) continue

    if (renderTime >= from.at && renderTime <= to.at) {
      const span = to.at - from.at
      // Two snapshots in the same millisecond would divide by zero.
      const t = span <= 0 ? 1 : (renderTime - from.at) / span
      return blend(from, to, t)
    }
  }

  return last
}

/**
 * Drops snapshots that are old enough that nothing will interpolate through
 * them again, so the buffer does not grow for the length of the session.
 *
 * Keeps one snapshot older than the render time — that is the one every blend
 * starts from, and discarding it makes the figure jump.
 */
export function pruneBuffer(buffer: readonly Snapshot[], renderTime: number): Snapshot[] {
  let keepFrom = 0
  for (let i = 0; i < buffer.length; i++) {
    const snapshot = buffer[i]
    if (snapshot && snapshot.at <= renderTime) keepFrom = i
    else break
  }
  return buffer.slice(keepFrom)
}

/**
 * Whether a pose is different enough from the last one sent to be worth a packet.
 *
 * This is the cost model, not a nicety. A player stood at a blackjack table for
 * ten minutes should send nothing at all, which lets the room hibernate and the
 * bill stay at zero. Speed is compared against zero rather than by epsilon
 * because starting and stopping must always be transmitted — otherwise a figure
 * moonwalks, animating a walk cycle while standing still.
 *
 * @param last The pose last sent, or `null` if nothing has been sent yet.
 * @param current The pose now.
 */
export function shouldSend(last: Pose | null, current: Pose): boolean {
  if (last === null) return true
  if ((last.speed > 0) !== (current.speed > 0)) return true

  return (
    Math.abs(current.x - last.x) > POSITION_EPSILON ||
    Math.abs(current.z - last.z) > POSITION_EPSILON ||
    Math.abs(shortestAngle(current.yaw - last.yaw)) > YAW_EPSILON
  )
}

/** Coerces to a finite number, or returns the fallback. */
function finite(raw: unknown, fallback: number): number {
  const value = typeof raw === 'string' ? Number(raw) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Clamps a number into a range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Coerces a name into something safe to draw.
 *
 * Control characters are stripped rather than escaped: the name is drawn to a
 * canvas, so a newline would silently push the text out of the label rather
 * than doing anything visible. Length is capped because the nameplate is a
 * fixed-width texture and a 10,000-character name is a denial of service
 * against the renderer as much as anything else.
 *
 * Shape only. This says nothing about whether a name is *appropriate* — see the
 * naming note in the multiplayer section of CLAUDE.md.
 */
export function sanitizePlayerName(raw: unknown): string {
  if (typeof raw !== 'string') return FALLBACK_NAME

  const cleaned = Array.from(raw)
    // Strip C0/C1 control characters, which includes newlines and tabs.
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code > 0x1f && !(code >= 0x7f && code <= 0x9f)
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)

  return cleaned.length > 0 ? cleaned : FALLBACK_NAME
}

/**
 * Coerces a pose from a peer into one that is safe to draw.
 *
 * Clamped to the room's own walking bounds, so a hostile or broken client
 * cannot place a figure a mile in the air or a hundred units down the street.
 * The local player is clamped by exactly these bounds every frame in
 * `WalkingPlayer`; a remote one has no reason to be trusted further.
 */
export function sanitizePose(raw: unknown, bounds: WalkBounds): Pose {
  const candidate = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  return {
    x: clamp(finite(candidate.x, 0), bounds.minX, bounds.maxX),
    z: clamp(finite(candidate.z, 0), bounds.minZ, bounds.maxZ),
    yaw: shortestAngle(finite(candidate.yaw, 0)),
    // Negative or absurd speeds drive the walk cycle; clamp to something a
    // person could plausibly be doing.
    speed: clamp(finite(candidate.speed, 0), 0, 20),
  }
}

/**
 * Coerces a whole remote player into something drawable.
 *
 * Total: never throws, always returns a figure that renders. Reuses the
 * wardrobe sanitizers verbatim, and that reuse is the point — they exist
 * because `localStorage` is user-writable, and another player's browser is
 * exactly as user-writable. A peer sending a since-removed hairstyle must
 * produce a character with hair rather than a hole, for the same reason a
 * hand-edited save must.
 *
 * @param raw Whatever arrived over the socket.
 * @param fallbackId Used when the payload carries no usable id.
 */
export function sanitizeRemoteIdentity(raw: unknown, fallbackId: string): RemoteIdentity {
  const candidate = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const owned = sanitizeOwned(candidate.owned)
  const id = typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : fallbackId

  return {
    id,
    name: sanitizePlayerName(candidate.name),
    appearance: sanitizeAppearance(candidate.appearance),
    // Filtered against `owned`, so a peer cannot wear what they never bought.
    equipped: sanitizeEquipped(candidate.equipped, owned),
    seated: candidate.seated === true,
    table: sanitizeTable(candidate.table),
  }
}
