import { dimHex } from '../../world/timeOfDay'
import { getLeaderboardTexture } from '../leaderboardTexture'
import {
  BILLBOARD_PANEL_CENTER_Y,
  BILLBOARD_PANEL_HEIGHT,
  BILLBOARD_PANEL_WIDTH,
  BILLBOARD_X,
  billboardZ,
  SIDEWALK_HEIGHT,
} from '../stripLayout'

/**
 * The HIGH ROLLERS board over a junction's far pavement.
 *
 * One per `StreetEnd`, past the kerb on purpose: it is scenery that talks
 * about the players, and anything the player could walk up to would owe them a
 * prompt. Both ends share the one texture from `leaderboardTexture` — the
 * standings are the standings — and the board adds no lights: it is an
 * emissive plane under the same bloom as every marquee, because the strip's
 * light budget is two and spent.
 */

interface LeaderboardBillboardProps {
  /** 1 for the north end, -1 for the south. */
  side: 1 | -1
  neonLevel: number
  daylight: number
}

const WASH = '#dfe3e2'

/** Cabinet body behind the lit face, so the board has a side to be seen from. */
const CABINET_DEPTH = 0.32
const PYLON_WIDTH = 1.1
const PYLON_DEPTH = 0.7

export function LeaderboardBillboard({ side, neonLevel, daylight }: LeaderboardBillboardProps) {
  const signTint = dimHex('#ffffff', neonLevel)

  const panelBottom = BILLBOARD_PANEL_CENTER_Y - BILLBOARD_PANEL_HEIGHT / 2
  const pylonHeight = panelBottom - SIDEWALK_HEIGHT
  // The lit face looks back down the street: toward -z from the north end,
  // toward +z from the south.
  const face = -side * (CABINET_DEPTH / 2 + 0.01)

  return (
    <group position={[BILLBOARD_X, 0, billboardZ(side)]}>
      {/* Gold pylon, foot on the pavement. */}
      <mesh position={[0, SIDEWALK_HEIGHT + pylonHeight / 2, 0]} castShadow>
        <boxGeometry args={[PYLON_WIDTH, pylonHeight, PYLON_DEPTH]} />
        <meshStandardMaterial color="#b8912f" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Cabinet the panel sits in. */}
      <mesh position={[0, BILLBOARD_PANEL_CENTER_Y, 0]} castShadow>
        <boxGeometry args={[BILLBOARD_PANEL_WIDTH, BILLBOARD_PANEL_HEIGHT, CABINET_DEPTH]} />
        <meshStandardMaterial color="#0b0a14" roughness={0.8} />
      </mesh>

      {/* The lit face. Dimmed by tint, never by redrawing the texture. */}
      <mesh
        position={[0, BILLBOARD_PANEL_CENTER_Y, face]}
        rotation={[0, side > 0 ? Math.PI : 0, 0]}
      >
        <planeGeometry args={[BILLBOARD_PANEL_WIDTH, BILLBOARD_PANEL_HEIGHT]} />
        <meshBasicMaterial map={getLeaderboardTexture()} color={signTint} toneMapped={false} />
      </mesh>

      {/* The marquees' daylight wash: without it this is the darkest panel on
          a noon street, floating unlit against a bright sky. */}
      {daylight > 0.02 && (
        <mesh
          position={[0, BILLBOARD_PANEL_CENTER_Y, face - side * 0.02]}
          rotation={[0, side > 0 ? Math.PI : 0, 0]}
        >
          <planeGeometry args={[BILLBOARD_PANEL_WIDTH, BILLBOARD_PANEL_HEIGHT]} />
          <meshBasicMaterial
            color={WASH}
            transparent
            opacity={daylight * 0.3}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
