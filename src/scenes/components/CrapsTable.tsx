import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import { totalCrapsStake } from '../../games/craps/engine'
import { useCrapsStore } from '../../store/useCrapsStore'
import { ChipStack } from './ChipStack'
import { CrapsDice } from './CrapsDice'
import {
  CrapsBet,
  getCrapsBetRect,
  POINT_BOX_RECTS,
  rectCenter,
} from '../crapsFeltLayout'
import { getCrapsFeltTexture } from '../crapsFeltTexture'

/** Table footprint. The felt texture is 3:2, so the surface matches it. */
const TABLE_WIDTH = 3.6
const TABLE_DEPTH = 2.4
const TABLE_TOP_Y = 1
const RAIL_HEIGHT = 0.34
const RAIL_THICKNESS = 0.14

/** Chips sit a hair above the felt so they never z-fight with it. */
const SURFACE_Y = TABLE_TOP_Y + 0.012

/**
 * Converts a felt texture coordinate to a world position on the table.
 *
 * `u` runs left to right and `v` from the boxman's edge to the player's, which
 * is the same convention `crapsFeltLayout` uses — so a bet's printed rectangle
 * and the chips placed on it are guaranteed to agree.
 */
function feltToWorld(u: number, v: number): [number, number, number] {
  return [(u - 0.5) * TABLE_WIDTH, SURFACE_Y, (v - 0.5) * TABLE_DEPTH]
}

/** The craps table: felt, rails, chips on the bets, and the dice in the pit. */
export function CrapsTable() {
  const game = useCrapsStore((state) => state.game)
  const rollId = useCrapsStore((state) => state.rollId)

  const felt = useMemo(() => getCrapsFeltTexture(), [])

  /** Half-extents and centres of the four rails, as fixed physics walls. */
  const rails = useMemo(() => {
    const halfWidth = TABLE_WIDTH / 2 + RAIL_THICKNESS / 2
    const halfDepth = TABLE_DEPTH / 2 + RAIL_THICKNESS / 2

    return [
      { position: [0, TABLE_TOP_Y + RAIL_HEIGHT / 2, -halfDepth], size: [TABLE_WIDTH + RAIL_THICKNESS * 2, RAIL_HEIGHT, RAIL_THICKNESS] },
      { position: [0, TABLE_TOP_Y + RAIL_HEIGHT / 2, halfDepth], size: [TABLE_WIDTH + RAIL_THICKNESS * 2, RAIL_HEIGHT, RAIL_THICKNESS] },
      { position: [-halfWidth, TABLE_TOP_Y + RAIL_HEIGHT / 2, 0], size: [RAIL_THICKNESS, RAIL_HEIGHT, TABLE_DEPTH] },
      { position: [halfWidth, TABLE_TOP_Y + RAIL_HEIGHT / 2, 0], size: [RAIL_THICKNESS, RAIL_HEIGHT, TABLE_DEPTH] },
    ] as const
  }, [])

  return (
    <group>
      {/* Felt surface. */}
      <mesh position={[0, TABLE_TOP_Y - 0.06, 0]} receiveShadow castShadow>
        <boxGeometry args={[TABLE_WIDTH, 0.12, TABLE_DEPTH]} />
        <meshStandardMaterial attach="material-0" color="#0d3a2a" roughness={0.9} />
        <meshStandardMaterial attach="material-1" color="#0d3a2a" roughness={0.9} />
        <meshStandardMaterial attach="material-2" map={felt} roughness={0.95} />
        <meshStandardMaterial attach="material-3" color="#0a2a1e" roughness={0.9} />
        <meshStandardMaterial attach="material-4" color="#0d3a2a" roughness={0.9} />
        <meshStandardMaterial attach="material-5" color="#0d3a2a" roughness={0.9} />
      </mesh>

      {/* Padded rails. A craps table is a pit — the walls are what the dice
          bounce off, so they are physics bodies rather than decoration. */}
      {rails.map((rail, index) => (
        <mesh key={index} position={[...rail.position]} castShadow receiveShadow>
          <boxGeometry args={[...rail.size]} />
          <meshStandardMaterial color="#5a2a20" roughness={0.5} metalness={0.05} />
        </mesh>
      ))}

      {/* Pedestal. */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[TABLE_WIDTH * 0.7, 0.88, TABLE_DEPTH * 0.6]} />
        <meshStandardMaterial color="#150c18" roughness={0.9} />
      </mesh>

      {/* The ON puck, parked over the established point. Off to the side and
          face down while the table is coming out. */}
      {(() => {
        const onPoint = game.point !== null
        const centre = onPoint
          ? rectCenter(POINT_BOX_RECTS[game.point!])
          : { u: 0.035, v: 0.16 }
        const [x, , z] = feltToWorld(centre.u, centre.v)

        return (
          <mesh position={[x, SURFACE_Y + 0.02, z]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.035, 20]} />
            <meshStandardMaterial
              color={onPoint ? '#f2f0ea' : '#1a1118'}
              roughness={0.6}
              emissive={onPoint ? '#5a5348' : '#000000'}
              emissiveIntensity={0.35}
            />
          </mesh>
        )
      })()}

      {/* Chips on each bet the player has money on. */}
      {Object.values(CrapsBet).map((bet) => {
        const amount = game.bets[bet]
        if (amount <= 0) return null

        const centre = rectCenter(getCrapsBetRect(bet))
        return <ChipStack key={bet} amount={amount} position={feltToWorld(centre.u, centre.v)} />
      })}

      {/*
        Physics is scoped to this scene alone. The strip's character and the
        blackjack table are transform-driven and never touch rapier, which is
        the boundary SPEC drew on day one and it has held.
      */}
      {/*
        Fixed timestep, not "vary". A varying step ties the simulation to the
        frame rate, and on a slow frame the dice travel further than they are
        thick and pass straight through the table — which is exactly what
        happened: one die was found at y = -18, having tunnelled out of the
        world entirely.
      */}
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
        {/*
          Explicit colliders rather than colliders inferred from meshes. The
          first version wrapped `visible={false}` meshes, which produced no
          colliders at all — the dice fell straight through the table and out
          of the world, and nothing on screen said so.
        */}
        <RigidBody type="fixed" colliders={false}>
          {/* Deep rather than thin: the surface is what matters, but the
              depth is cheap insurance against a fast die punching through. */}
          <CuboidCollider
            args={[TABLE_WIDTH / 2, 0.4, TABLE_DEPTH / 2]}
            position={[0, TABLE_TOP_Y - 0.4, 0]}
          />
          {rails.map((rail, index) => (
            <CuboidCollider
              key={index}
              args={[rail.size[0] / 2, rail.size[1], rail.size[2] / 2]}
              position={[...rail.position]}
            />
          ))}
        </RigidBody>

        <CrapsDice roll={game.lastRoll} rollId={rollId} />
      </Physics>

      {/* Total on the felt, for the HUD to read against. */}
      <group userData={{ staked: totalCrapsStake(game) }} />
    </group>
  )
}
