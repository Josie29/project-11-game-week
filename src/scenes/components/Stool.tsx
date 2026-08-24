export const STOOL_SEAT_HEIGHT = 0.62

interface StoolProps {
  position: readonly [number, number, number]
  /** Turns the seat to face the table. */
  rotationY?: number | undefined
}

/**
 * A casino bar stool: padded round seat, chrome column, weighted base.
 *
 * Matches the red-topped stools in art/refs/blackjack_floor.png. The seat sits
 * at `STOOL_SEAT_HEIGHT`, which is also where a seated figure's hips go — the
 * two are pinned to the same constant so a character can never float above or
 * sink into the cushion.
 */
export function Stool({ position, rotationY = 0 }: StoolProps) {
  const [x, y, z] = position

  return (
    <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
      {/* Padded seat. */}
      <mesh position={[0, STOOL_SEAT_HEIGHT, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.09, 20]} />
        <meshStandardMaterial color="#8c2233" roughness={0.6} />
      </mesh>
      {/* Darker piping around the cushion edge. */}
      <mesh position={[0, STOOL_SEAT_HEIGHT - 0.045, 0]}>
        <cylinderGeometry args={[0.255, 0.235, 0.035, 20]} />
        <meshStandardMaterial color="#3c1119" roughness={0.7} />
      </mesh>

      {/* Column. */}
      <mesh position={[0, STOOL_SEAT_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, STOOL_SEAT_HEIGHT, 12]} />
        <meshStandardMaterial color="#3b3f52" roughness={0.35} metalness={0.7} />
      </mesh>

      {/* Footring — where a seated player's feet actually rest, since the
          shins do not reach the carpet from a stool this tall. */}
      <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.19, 0.018, 8, 20]} />
        <meshStandardMaterial color="#4a4f66" roughness={0.3} metalness={0.75} />
      </mesh>

      {/* Weighted base. */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.32, 0.06, 20]} />
        <meshStandardMaterial color="#23263a" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  )
}
