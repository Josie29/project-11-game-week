/**
 * Background dressing: other tables and neon-lit pillars receding into haze.
 *
 * The empty black room made the table look like it was floating in a void. All
 * of this is unlit, low-detail and never interacted with — it only has to
 * survive being seen out of focus behind the dealer.
 */

/** Distant tables, placed off the centre line so none sits behind the dealer. */
const BACKGROUND_TABLES: readonly { x: number; z: number; scale: number }[] = [
  { x: -4.6, z: -6.4, scale: 0.92 },
  { x: 4.8, z: -6.8, scale: 0.98 },
  { x: -7.4, z: -10.2, scale: 0.85 },
  { x: 7.2, z: -10.6, scale: 0.88 },
  { x: 0, z: -12.4, scale: 0.8 },
]

/** Pillars carrying vertical neon, the strip's colours brought indoors. */
const PILLARS: readonly { x: number; z: number; color: string }[] = [
  { x: -6.2, z: -8.2, color: '#ff2d95' },
  { x: 6.4, z: -8.6, color: '#22e0ff' },
  { x: -10.5, z: -13, color: '#22e0ff' },
  { x: 10.2, z: -13.4, color: '#ff2d95' },
]

/** A dim stand-in for a table in the middle distance. */
function DistantTable({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.14, 24]} />
        <meshStandardMaterial color="#0f4a33" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <torusGeometry args={[1.5, 0.09, 8, 32]} />
        <meshStandardMaterial color="#3d2117" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.42, 0.6, 0.88, 14]} />
        <meshStandardMaterial color="#1d1224" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A column with a neon strip running up two faces. */
function NeonPillar({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[0.85, 6, 0.85]} />
        <meshStandardMaterial color="#1d1526" roughness={0.85} />
      </mesh>
      {/* Emissive strips on the two faces that can be seen from the table. */}
      <mesh position={[0, 3, 0.44]}>
        <planeGeometry args={[0.16, 5]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0.44, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.16, 5]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 2.2, 0.9]} color={color} intensity={11} distance={9} decay={2} />
    </group>
  )
}

export function CasinoFloor() {
  return (
    <group>
      {BACKGROUND_TABLES.map((table) => (
        <DistantTable key={`${table.x}-${table.z}`} {...table} />
      ))}
      {PILLARS.map((pillar) => (
        <NeonPillar key={`${pillar.x}-${pillar.z}`} {...pillar} />
      ))}
    </group>
  )
}
