import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { poseBuffer, usePresenceStore } from '../../store/usePresenceStore'
import { INTERPOLATION_DELAY_MS, interpolateAt, type RemoteIdentity } from '../../world/presence'
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

/** One remote figure, moved every frame from its own snapshot buffer. */
function RemotePlayer({ player }: { player: RemoteIdentity }) {
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

  // Keyed by id so a join or leave re-renders, but a *pose* never does — those
  // are read straight out of the buffer inside `useFrame`.
  const players = useMemo(() => Object.values(peers), [peers])

  return (
    <>
      {players.map((player) => (
        <RemotePlayer key={player.id} player={player} />
      ))}
    </>
  )
}
