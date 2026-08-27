import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { poseBuffer, usePresenceStore } from '../../store/usePresenceStore'
import { INTERPOLATION_DELAY_MS, interpolateAt, type RemoteIdentity } from '../../world/presence'
import { type SeatMap, seatOf } from '../../world/seating'
import {
  blackjackSeatFacing,
  blackjackSeatSpot,
  CRAPS_ORIGIN,
  crapsRailFacing,
  crapsRailSpot,
  TableId,
} from '../casinoFloorLayout'
import { CasinoCharacter } from './CasinoCharacter'
import { Nameplate } from './Nameplate'

/*
 * Everyone else in the room.
 *
 * The whole reason this is cheap: `WalkingPlayer` ends with
 * `<CasinoCharacter appearance equipped speedRef />`, and a remote player is
 * that same call with the keyboard and camera code removed. Nothing about the
 * figure, its wardrobe or its walk cycle needed changing to be drawn for
 * somebody else.
 */

/**
 * Where a seated peer belongs, or null if they are not sitting anywhere known.
 *
 * A seated player deliberately sends no poses — that is what keeps the room
 * hibernating and the bill at zero — so there is nothing to interpolate and the
 * figure has to be placed rather than tracked.
 *
 * The stool comes from the room's seat map. It used to come from the roster the
 * *deal* was dealt against, which does not exist until a round is dealt: two
 * people who had sat down and were still choosing a stake had no seats at all,
 * so both were drawn at their last walking pose — the patch of carpet beside
 * the table they had each walked to, one inside the other.
 */
function seatedAt(
  player: RemoteIdentity,
  seats: SeatMap,
  crapsLineup: readonly string[],
  crapsShooter: string | null,
): { at: readonly [number, number, number]; facing: number } | null {
  if (!player.seated) return null

  /*
   * Craps: standing at the rail, with whoever holds the dice at the shooter's
   * end. This was missing entirely, so anybody at the craps table was invisible
   * — they send no poses while they are standing still, and nothing else knew
   * where to draw them. Two people at one table could not see each other, which
   * is most of the point of being at one.
   */
  if (player.table === TableId.Craps) {
    const spot = crapsRailSpot(player.id, crapsShooter, crapsLineup)
    return {
      at: [CRAPS_ORIGIN[0] + spot[0], 0, CRAPS_ORIGIN[2] + spot[2]],
      // At the felt — square to it on the near rail, side-on from the two
      // spots around the table's end. Same function as the local player.
      facing: crapsRailFacing(spot),
    }
  }

  if (player.table !== TableId.Blackjack) return null

  const seat = seatOf(seats, player.id)
  if (seat === null) return null

  // Turned to the middle of the table, by the same function that turns the
  // stool and the local player. At third base, square to the dealer seats
  // somebody side-on to their own cards.
  return { at: blackjackSeatSpot(seat), facing: blackjackSeatFacing(seat) }
}

/** Stable empty array, so a selector does not return a new one every render. */
const NOBODY: readonly string[] = []

/** The same, for a table nobody is sitting at. */
const NO_SEATS: Readonly<Record<number, string>> = {}

/** One remote figure, moved every frame from its own snapshot buffer. */
function RemotePlayer({
  player,
  seats,
  crapsLineup,
  crapsShooter,
}: {
  player: RemoteIdentity
  seats: SeatMap
  crapsLineup: readonly string[]
  crapsShooter: string | null
}) {
  const groupRef = useRef<Group>(null)
  const speedRef = useRef(0)

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    /*
     * Drawn deliberately behind live. Snapshots arrive around twelve times a
     * second and this runs sixty, so rendering the newest one would move the
     * figure in visible steps; rendering between the two that straddle a moment
     * slightly in the past turns the same packets into continuous motion.
     */
    /*
     * Sitting down wins over any pose.
     *
     * The last pose a player sent is wherever they were standing when they took
     * the seat, which is beside the table rather than at it. Once they are in a
     * seat the seat is the truth.
     */
    const seat = seatedAt(player, seats, crapsLineup, crapsShooter)
    if (seat) {
      group.visible = true
      group.position.set(seat.at[0], 0, seat.at[2])
      group.rotation.y = seat.facing
      speedRef.current = 0
      return
    }

    const pose = interpolateAt(poseBuffer(player.id), performance.now() - INTERPOLATION_DELAY_MS)

    /*
     * Hidden until they have actually said where they are.
     *
     * A group with no pose applied sits at its own default, which is the world
     * origin — and the craps table is deliberately *at* the world origin, so
     * the failure mode was a stranger standing in the middle of the felt. A
     * player who has sent nothing yet is far better drawn nowhere than drawn
     * somewhere false: they appear the moment their first pose lands.
     *
     * It happens at all because a seated player deliberately transmits nothing
     * — `shouldSend` is what keeps the room hibernating and the bill at zero —
     * so somebody who arrives already sitting has no pose to draw.
     */
    group.visible = pose !== null
    if (!pose) return

    group.position.set(pose.x, 0, pose.z)
    group.rotation.y = pose.yaw
    // Fed to the walk cycle the same way the local player's is, so a remote
    // figure walks rather than skating.
    speedRef.current = pose.speed
  })

  return (
    <group ref={groupRef}>
      <CasinoCharacter
        appearance={player.appearance}
        equipped={player.equipped}
        speedRef={speedRef}
        seated={player.seated}
      />
      <Nameplate name={player.name} />
    </group>
  )
}

/**
 * Draws every other player in the current room.
 *
 * Renders nothing at all when multiplayer is unconfigured or nobody else is
 * here, which is also what makes every existing capture unchanged.
 */
export function RemotePlayers() {
  const peers = usePresenceStore((state) => state.peers)
  // Who is on which stool, as the room settled it — available from the moment
  // somebody sits down, rather than only once a round has been dealt.
  const seats = usePresenceStore((state) => state.seats[TableId.Blackjack] ?? NO_SEATS)
  // Who is at the craps rail, and who has the dice, so the figures line up.
  const crapsLineup = usePresenceStore((state) => state.lineups[TableId.Craps] ?? NOBODY)
  const crapsShooter = usePresenceStore((state) => state.shooters[TableId.Craps] ?? null)

  // Keyed by id so a join or leave re-renders, but a *pose* never does — those
  // are read straight out of the buffer inside `useFrame`.
  const players = useMemo(() => Object.values(peers), [peers])

  return (
    <>
      {players.map((player) => (
        <RemotePlayer
          key={player.id}
          player={player}
          seats={seats}
          crapsLineup={crapsLineup}
          crapsShooter={crapsShooter}
        />
      ))}
    </>
  )
}
