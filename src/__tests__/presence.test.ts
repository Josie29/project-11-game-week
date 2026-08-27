import { describe, expect, it } from 'vitest'
import { TableId } from '../scenes/casinoFloorLayout'
import {
  FALLBACK_NAME,
  interpolateAt,
  MAX_NAME_LENGTH,
  type Pose,
  pruneBuffer,
  sanitizePlayerName,
  sanitizePose,
  sanitizeRemoteIdentity,
  sanitizeTable,
  shortestAngle,
  shouldSend,
  type Snapshot,
} from '../world/presence'
import { HairStyle } from '../character/appearance'
import { Slot } from '../character/catalog'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'

/*
 * Where another player is drawn, and what a peer may make them look like.
 *
 * None of this is checkable from a screenshot: a figure that teleports on every
 * packet and one that interpolates smoothly are the same still image, and a
 * hostile payload that puts someone under the floor only shows up if you happen
 * to be looking at the right patch of street.
 */

const BOUNDS: WalkBounds = { minX: -8, maxX: 8, minZ: -40, maxZ: 10 }

function snapshot(at: number, pose: Partial<Pose> = {}): Snapshot {
  return { at, x: 0, z: 0, yaw: 0, speed: 0, ...pose }
}

describe('interpolateAt', () => {
  // The whole reason the module exists: 12 packets a second have to become 60
  // frames a second. Without this every remote figure moves in visible steps.
  it('blends to the midpoint between two snapshots', () => {
    const buffer = [snapshot(1_000, { x: 0, z: 0 }), snapshot(2_000, { x: 10, z: -4 })]

    const pose = interpolateAt(buffer, 1_500)

    expect(pose?.x).toBeCloseTo(5)
    expect(pose?.z).toBeCloseTo(-2)
  })

  it('returns the exact pose at a snapshot boundary', () => {
    const buffer = [snapshot(1_000, { x: 3 }), snapshot(2_000, { x: 9 })]

    expect(interpolateAt(buffer, 1_000)?.x).toBeCloseTo(3)
    expect(interpolateAt(buffer, 2_000)?.x).toBeCloseTo(9)
  })

  /*
   * A player who stops sending has almost always stopped walking. Holding the
   * last pose is right; extrapolating forward would send them sliding through
   * a building at whatever speed they were last seen doing.
   */
  it('holds the last pose instead of extrapolating past the buffer', () => {
    const buffer = [snapshot(1_000, { x: 0 }), snapshot(2_000, { x: 10 })]

    expect(interpolateAt(buffer, 9_000)?.x).toBeCloseTo(10)
  })

  it('has nothing to draw for a player who has sent nothing', () => {
    expect(interpolateAt([], 1_000)).toBeNull()
  })

  /*
   * The bug this exists to prevent, and the one that is impossible to see in a
   * test that only checks position: someone turning from 170° to -170° has
   * moved 20°, and a naive lerp spins them 340° the other way. On a walk cycle
   * that reads as the character whipping round on the spot.
   */
  it('turns the short way round through the ±180° wrap', () => {
    const nearPi = Math.PI - 0.1
    const buffer = [snapshot(0, { yaw: nearPi }), snapshot(1_000, { yaw: -nearPi })]

    const pose = interpolateAt(buffer, 500)

    // Halfway across the 0.2 rad gap is just past π, which wraps to just past -π.
    expect(Math.abs(pose?.yaw ?? 0)).toBeGreaterThan(Math.PI - 0.01)
    // Emphatically not somewhere near zero, which is where a naive lerp lands.
    expect(Math.abs(pose?.yaw ?? 0)).not.toBeLessThan(1)
  })

  // Two packets landing in the same millisecond would divide by zero and put
  // NaN into a transform, which silently removes the figure from the scene.
  it('survives two snapshots with the same timestamp', () => {
    const buffer = [snapshot(1_000, { x: 2 }), snapshot(1_000, { x: 6 })]

    const pose = interpolateAt(buffer, 1_000)

    expect(Number.isFinite(pose?.x)).toBe(true)
  })
})

describe('pruneBuffer', () => {
  // Without pruning the buffer grows for the whole session — 12 objects a
  // second per player, forever.
  it('drops snapshots nothing will interpolate through again', () => {
    const buffer = [snapshot(0), snapshot(1_000), snapshot(2_000), snapshot(3_000)]

    expect(pruneBuffer(buffer, 2_500)).toHaveLength(2)
  })

  /*
   * Keeps the snapshot *before* the render time. That one is the left-hand side
   * of every blend, so dropping it makes the figure jump to the newer pose.
   */
  it('keeps the snapshot the current blend starts from', () => {
    const buffer = [snapshot(0, { x: 1 }), snapshot(1_000, { x: 2 })]

    const pruned = pruneBuffer(buffer, 500)

    expect(pruned[0]?.x).toBe(1)
  })
})

describe('shouldSend', () => {
  /*
   * The cost model, as an assertion. A player stood at a table for ten minutes
   * has to send nothing at all — that is what lets the room hibernate and keeps
   * the bill at zero. If this ever returns true for a stationary player, the
   * running cost silently becomes a rented server.
   */
  it('says nothing at all for a player who has not moved', () => {
    const still: Pose = { x: 3, z: -12, yaw: 1.2, speed: 0 }

    expect(shouldSend(still, { ...still })).toBe(false)
    // Jitter below the epsilon is not movement.
    expect(shouldSend(still, { ...still, x: 3.001, yaw: 1.201 })).toBe(false)
  })

  it('always sends the first pose', () => {
    expect(shouldSend(null, { x: 0, z: 0, yaw: 0, speed: 0 })).toBe(true)
  })

  it('sends real movement and real turning', () => {
    const from: Pose = { x: 0, z: 0, yaw: 0, speed: 0 }

    expect(shouldSend(from, { ...from, x: 0.5 })).toBe(true)
    expect(shouldSend(from, { ...from, yaw: 0.5 })).toBe(true)
  })

  /*
   * Starting and stopping must always be transmitted, however still the figure
   * is otherwise. Miss the stop and the remote player moonwalks: standing in
   * one place with the walk cycle still running.
   */
  it('always sends the moment walking starts or stops', () => {
    const walking: Pose = { x: 1, z: 1, yaw: 0, speed: 3 }
    const stopped: Pose = { ...walking, speed: 0 }

    expect(shouldSend(walking, stopped)).toBe(true)
    expect(shouldSend(stopped, walking)).toBe(true)
  })
})

describe('sanitizePose', () => {
  /*
   * `WalkingPlayer` clamps the local player to these bounds every frame. A peer
   * has no claim to more trust than the local player, and without this one can
   * put a figure a mile in the air or halfway down the next street.
   */
  it('clamps a peer into the room they claim to be in', () => {
    const pose = sanitizePose({ x: 9_999, z: -9_999, yaw: 0, speed: 0 }, BOUNDS)

    expect(pose.x).toBe(BOUNDS.maxX)
    expect(pose.z).toBe(BOUNDS.minZ)
  })

  // NaN in a transform does not throw — it silently removes the figure from the
  // scene, which looks like a networking bug rather than a bad packet.
  it('never lets NaN or Infinity reach a transform', () => {
    for (const junk of [NaN, Infinity, -Infinity, 'over there', null, undefined, {}]) {
      const pose = sanitizePose({ x: junk, z: junk, yaw: junk, speed: junk }, BOUNDS)

      expect(Number.isFinite(pose.x)).toBe(true)
      expect(Number.isFinite(pose.z)).toBe(true)
      expect(Number.isFinite(pose.yaw)).toBe(true)
      expect(Number.isFinite(pose.speed)).toBe(true)
    }
  })

  // A negative speed runs the walk cycle backwards; an enormous one turns the
  // legs into a blur.
  it('clamps speed to something a person could be doing', () => {
    expect(sanitizePose({ speed: -50 }, BOUNDS).speed).toBe(0)
    expect(sanitizePose({ speed: 5_000 }, BOUNDS).speed).toBe(20)
  })
})

describe('sanitizePlayerName', () => {
  // The nameplate is a fixed-width canvas texture. A very long name is a
  // rendering problem before it is anything else.
  it('caps length and falls back for nothing usable', () => {
    expect(sanitizePlayerName('x'.repeat(500))).toHaveLength(MAX_NAME_LENGTH)
    expect(sanitizePlayerName('   ')).toBe(FALLBACK_NAME)
    expect(sanitizePlayerName(null)).toBe(FALLBACK_NAME)
    expect(sanitizePlayerName(42)).toBe(FALLBACK_NAME)
  })

  /*
   * Newlines are stripped rather than escaped. The name is drawn to a canvas,
   * so a newline does not break out of anything — it silently pushes the text
   * outside the label, which reads as the nameplate being broken.
   */
  it('strips control characters and collapses whitespace', () => {
    expect(sanitizePlayerName('Jo\nsie')).toBe('Josie')
    expect(sanitizePlayerName('Jo sie')).toBe('Josie')
    expect(sanitizePlayerName('  Josie   M  ')).toBe('Josie M')
  })

  it('keeps an ordinary name untouched', () => {
    expect(sanitizePlayerName('Josie')).toBe('Josie')
  })
})

describe('sanitizeRemoteIdentity', () => {
  /*
   * The reuse that makes this cheap: these coercions were written because
   * `localStorage` is user-writable, and another player's browser is exactly as
   * user-writable. A peer naming a since-removed hairstyle has to produce a
   * character with hair, not a hole where the head goes.
   */
  it('draws something for a peer sending nonsense', () => {
    for (const junk of [null, undefined, 0, 'player', [], true]) {
      const identity = sanitizeRemoteIdentity(junk, 'fallback-id')

      expect(identity.id).toBe('fallback-id')
      expect(identity.name).toBe(FALLBACK_NAME)
      expect(Object.values(HairStyle)).toContain(identity.appearance.hairStyle)
    }
  })

  // Otherwise a peer dresses in the whole catalogue for free — which matters
  // less for fairness than for the fact that the shop is the game's money sink.
  it('refuses to wear an item the peer does not claim to own', () => {
    const identity = sanitizeRemoteIdentity(
      { id: 'a', owned: [], equipped: { [Slot.Outerwear]: 'sequin-jacket' } },
      'fallback-id',
    )

    expect(identity.equipped).toEqual({})
  })

  it('keeps an item the peer does own', () => {
    const identity = sanitizeRemoteIdentity(
      { id: 'a', owned: ['sequin-jacket'], equipped: { [Slot.Outerwear]: 'sequin-jacket' } },
      'fallback-id',
    )

    expect(identity.equipped[Slot.Outerwear]).toBe('sequin-jacket')
  })
})

describe('shortestAngle', () => {
  it('wraps into (-π, π]', () => {
    expect(shortestAngle(0)).toBeCloseTo(0)
    expect(shortestAngle(Math.PI * 2)).toBeCloseTo(0)
    // 350° the long way is -10° the short way.
    expect(shortestAngle((350 * Math.PI) / 180)).toBeCloseTo((-10 * Math.PI) / 180)
  })
})

describe('sanitizeTable', () => {
  // The shooter queue is derived from who says they are at the craps table, and
  // that claim arrives over a socket from another player's machine. An
  // unrecognised value has to mean "not at a table" rather than becoming a
  // third state the queue would have to hold an opinion about.
  it('admits only the two real tables', () => {
    expect(sanitizeTable('craps')).toBe(TableId.Craps)
    expect(sanitizeTable('blackjack')).toBe(TableId.Blackjack)

    for (const junk of [undefined, null, '', 'roulette', 'Craps', 0, 1, true, {}, []]) {
      expect(sanitizeTable(junk)).toBeNull()
    }
  })

  // `seated` and `table` answer different questions, and the clinic is the case
  // that proves it: a player in a recliner is drawn sitting down but is at no
  // table at all, so a queue keyed on `seated` would put them in line for dice
  // in a different building.
  it('is independent of seated', () => {
    const inARecliner = sanitizeRemoteIdentity({ id: 'a', seated: true }, 'a')
    expect(inARecliner.seated).toBe(true)
    expect(inARecliner.table).toBeNull()

    const atTheRail = sanitizeRemoteIdentity({ id: 'b', seated: false, table: 'craps' }, 'b')
    expect(atTheRail.seated).toBe(false)
    expect(atTheRail.table).toBe(TableId.Craps)
  })
})

describe('sanitizeRemoteIdentity bankroll', () => {
  // The load-bearing compatibility case: a worker that predates the field
  // strips it from every join, and a client that rejected the absence would
  // turn a cosmetic $0 into a peer who fails to render at all.
  it('defaults a missing bankroll to zero', () => {
    expect(sanitizeRemoteIdentity({ id: 'a' }, 'a').bankroll).toBe(0)
  })

  it('passes a real bankroll through whole', () => {
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: 12450 }, 'a').bankroll).toBe(12450)
  })

  // The billboard prints this number: a peer's hand-edited localStorage must
  // not put NaN, minus a million, or $62.50 up in lights over the strip.
  it('coerces junk to a number the board can print', () => {
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: Number.NaN }, 'a').bankroll).toBe(0)
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: Infinity }, 'a').bankroll).toBe(0)
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: -500 }, 'a').bankroll).toBe(0)
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: 62.5 }, 'a').bankroll).toBe(62)
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: '750' }, 'a').bankroll).toBe(750)
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: {} }, 'a').bankroll).toBe(0)
    // A liar's trillion is capped rather than painted across the column.
    expect(sanitizeRemoteIdentity({ id: 'a', bankroll: 1e12 }, 'a').bankroll).toBe(1e9)
  })
})
