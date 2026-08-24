import { CASINOS } from '../world/casinos'
import { Building } from './components/Building'
import { CasinoDoor } from './components/CasinoDoor'
import { Player } from './components/Player'

const NEON_PALETTE = ['#ff2d95', '#22e0ff', '#ffc63f', '#a45cff', '#3ee08a'] as const

/** How far the facades sit from the street centreline. */
const FACADE_X = 9.5

/**
 * Fixed building layout.
 *
 * Hard-coded rather than randomised so the strip looks identical on every run —
 * a demo that reshuffles its skyline between takes is impossible to rehearse.
 */
const BUILDING_ROWS: readonly { z: number; leftHeight: number; rightHeight: number }[] = [
  { z: 10, leftHeight: 9, rightHeight: 14 },
  { z: 2, leftHeight: 16, rightHeight: 8 },
  { z: -6, leftHeight: 11, rightHeight: 18 },
  { z: -14, leftHeight: 20, rightHeight: 10 },
  { z: -22, leftHeight: 8, rightHeight: 15 },
  { z: -30, leftHeight: 17, rightHeight: 12 },
  { z: -38, leftHeight: 10, rightHeight: 21 },
  { z: -46, leftHeight: 14, rightHeight: 9 },
]

/** Deterministic palette pick so colours are stable across reloads. */
function neonFor(index: number): string {
  return NEON_PALETTE[index % NEON_PALETTE.length] ?? NEON_PALETTE[0]
}

export function Strip() {
  return (
    <>
      <color attach="background" args={['#05060f']} />
      {/* Fog hides the end of the street so the strip reads as longer than it is. */}
      <fog attach="fog" args={['#05060f', 14, 68]} />

      {/*
        Lift the ambient well above a realistic night level. At 0.22 the towers
        rendered as pure black silhouettes and the street lost all its massing;
        readable form matters more here than physical accuracy.
      */}
      <ambientLight intensity={0.55} />
      {/* Cool moonlight key, plus a dim warm fill from the far end of the strip. */}
      <directionalLight position={[8, 18, 6]} intensity={0.7} color="#8fa2ff" />
      <directionalLight position={[-6, 10, -20]} intensity={0.25} color="#ffb27a" />

      {/* Asphalt. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
        <planeGeometry args={[26, 130]} />
        <meshStandardMaterial color="#15182a" roughness={0.55} metalness={0.35} />
      </mesh>

      {/* Centre line, kept faint so it guides without dominating. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -20]}>
        <planeGeometry args={[0.18, 120]} />
        <meshBasicMaterial color="#2b3358" toneMapped={false} />
      </mesh>

      {BUILDING_ROWS.map((row, index) => (
        <group key={row.z}>
          <Building
            position={[-FACADE_X, 0, row.z]}
            width={6}
            height={row.leftHeight}
            depth={7}
            neonColor={neonFor(index)}
            facing={1}
          />
          <Building
            position={[FACADE_X, 0, row.z]}
            width={6}
            height={row.rightHeight}
            depth={7}
            neonColor={neonFor(index + 2)}
            facing={-1}
          />
        </group>
      ))}

      {CASINOS.map((casino) => (
        <CasinoDoor key={casino.id} casino={casino} />
      ))}

      <Player />
    </>
  )
}
