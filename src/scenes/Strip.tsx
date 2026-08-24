import { MeshReflectorMaterial } from '@react-three/drei'
import { BackSide } from 'three'
import {
  CASINOS,
  FACADE_X,
  ROAD_HALF_WIDTH,
  SIDEWALK_HEIGHT,
} from '../world/casinos'
import { Building } from './components/Building'
import { CasinoDoor } from './components/CasinoDoor'
import { Player } from './components/Player'
import { PalmTree, StreetLamp } from './components/StreetProps'
import { getSkyTexture } from './skyTexture'

const NEON_PALETTE = ['#ff2d95', '#22e0ff', '#ffc63f', '#a45cff', '#3ee08a'] as const

const BUILDING_WIDTH = 7.2
const BUILDING_DEPTH = 7
const BUILDING_CENTER_X = FACADE_X + BUILDING_WIDTH / 2

/**
 * Fixed skyline.
 *
 * Hard-coded rather than randomised so the strip looks identical on every run —
 * a demo that reshuffles its skyline between takes is impossible to rehearse.
 */
const BUILDING_ROWS: readonly { z: number; leftHeight: number; rightHeight: number }[] = [
  { z: 10, leftHeight: 9, rightHeight: 13 },
  { z: 2, leftHeight: 15, rightHeight: 8 },
  { z: -6, leftHeight: 10, rightHeight: 17 },
  { z: -14, leftHeight: 18, rightHeight: 9 },
  { z: -22, leftHeight: 8, rightHeight: 14 },
  { z: -30, leftHeight: 16, rightHeight: 11 },
  { z: -38, leftHeight: 9, rightHeight: 19 },
  { z: -46, leftHeight: 13, rightHeight: 8 },
]

/** A third, unenterable house, purely to give the street a named skyline. */
const SCENERY_SIGN = { z: -30, side: -1 as const, name: 'Neon Palace', color: '#ff2d95' }

const PALM_ROW_Z = [6, -2, -10, -18, -26, -34, -42] as const
const LAMP_ROW_Z = [4, -8, -20, -32, -44] as const

/** Deterministic palette pick so colours are stable across reloads. */
function neonFor(index: number): string {
  return NEON_PALETTE[index % NEON_PALETTE.length] ?? NEON_PALETTE[0]
}

/** Returns the casino whose entrance sits on this row and side, if any. */
function signFor(z: number, side: 1 | -1): string | undefined {
  const casino = CASINOS.find(
    (entry) => entry.doorPosition[2] === z && Math.sign(entry.doorPosition[0]) === side,
  )
  if (casino) return casino.name
  if (SCENERY_SIGN.z === z && SCENERY_SIGN.side === side) return SCENERY_SIGN.name
  return undefined
}

function signColor(z: number, side: 1 | -1, fallback: string): string {
  const casino = CASINOS.find(
    (entry) => entry.doorPosition[2] === z && Math.sign(entry.doorPosition[0]) === side,
  )
  if (casino) return casino.neonColor
  if (SCENERY_SIGN.z === z && SCENERY_SIGN.side === side) return SCENERY_SIGN.color
  return fallback
}

export function Strip() {
  return (
    <>
      {/* Sky dome. Unfogged and unlit so the gradient stays exactly as authored. */}
      <mesh>
        <sphereGeometry args={[220, 32, 16]} />
        <meshBasicMaterial map={getSkyTexture()} side={BackSide} fog={false} toneMapped={false} />
      </mesh>

      {/* Fog tinted to the horizon so the far end of the street dissolves into it. */}
      <fog attach="fog" args={['#202b50', 26, 125]} />

      <ambientLight intensity={0.58} color="#8ea0d8" />
      {/* Cool moonlight key so the towers keep readable form between signs. */}
      <directionalLight position={[10, 26, 10]} intensity={0.55} color="#93a6ff" />

      {/*
        Wet asphalt. The mirrored roadway carrying stretched neon is the single
        strongest cue in the reference art, and a real reflection pass sells it
        in a way a dark plane never could. Kept at a low resolution with heavy
        blur so it stays inside the frame budget.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]}>
        <planeGeometry args={[ROAD_HALF_WIDTH * 2, 140]} />
        <MeshReflectorMaterial
          resolution={512}
          mixBlur={1}
          mixStrength={11}
          blur={[300, 90]}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.25}
          /*
            The shader multiplies the base colour by the captured reflection, so
            a near-black roadway cancels the effect out entirely. This has to
            stay light enough for the neon above to survive the multiply.
          */
          color="#39406b"
          roughness={0.62}
          metalness={0.45}
          mirror={1}
        />
      </mesh>

      {/*
        No centre line. The reflector darkens the roadway by multiplying in the
        reflection, so any flat-shaded stripe laid on top ends up brighter than
        the road and pulls the eye straight off the neon — and the reference is
        an unmarked pedestrian strip anyway.
      */}

      {/* Raised sidewalks either side of the roadway. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (ROAD_HALF_WIDTH + (FACADE_X - ROAD_HALF_WIDTH) / 2), SIDEWALK_HEIGHT / 2, -20]}
          receiveShadow
        >
          <boxGeometry args={[FACADE_X - ROAD_HALF_WIDTH, SIDEWALK_HEIGHT, 140]} />
          <meshStandardMaterial color="#2c3049" roughness={0.85} />
        </mesh>
      ))}

      {BUILDING_ROWS.map((row, index) => (
        <group key={row.z}>
          <Building
            position={[-BUILDING_CENTER_X, 0, row.z]}
            width={BUILDING_WIDTH}
            height={row.leftHeight}
            depth={BUILDING_DEPTH}
            neonColor={signColor(row.z, -1, neonFor(index))}
            facing={1}
            signName={signFor(row.z, -1)}
          />
          <Building
            position={[BUILDING_CENTER_X, 0, row.z]}
            width={BUILDING_WIDTH}
            height={row.rightHeight}
            depth={BUILDING_DEPTH}
            neonColor={signColor(row.z, 1, neonFor(index + 2))}
            facing={-1}
            signName={signFor(row.z, 1)}
          />
        </group>
      ))}

      {PALM_ROW_Z.map((z, index) => (
        <group key={z}>
          <PalmTree position={[-7.6, SIDEWALK_HEIGHT, z]} height={6.4} spin={index * 0.8} />
          <PalmTree position={[7.6, SIDEWALK_HEIGHT, z - 4]} height={7.1} spin={index * 1.3} />
        </group>
      ))}

      {LAMP_ROW_Z.map((z) => (
        <group key={z}>
          <StreetLamp position={[-6.6, SIDEWALK_HEIGHT, z]} />
          <StreetLamp position={[6.6, SIDEWALK_HEIGHT, z - 6]} />
        </group>
      ))}

      {CASINOS.map((casino) => (
        <CasinoDoor key={casino.id} casino={casino} />
      ))}

      <Player />
    </>
  )
}
