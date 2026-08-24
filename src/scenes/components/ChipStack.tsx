const CHIP_RADIUS = 0.17
const CHIP_THICKNESS = 0.032

/** Chip colours by denomination, following common casino convention. */
const CHIP_COLORS: readonly { value: number; color: string; edge: string }[] = [
  { value: 100, color: '#1b1d2e', edge: '#c9ccdd' },
  { value: 25, color: '#12693f', edge: '#eaf3ec' },
  { value: 10, color: '#1e4f9c', edge: '#dce6f7' },
  { value: 5, color: '#a3182f', edge: '#f6dade' },
]

/**
 * Breaks a wager into chips, largest denomination first.
 *
 * Falls back to $5 chips for any remainder so odd amounts still render as a
 * plausible stack rather than vanishing.
 */
function chipBreakdown(amount: number): { color: string; edge: string }[] {
  const chips: { color: string; edge: string }[] = []
  let remaining = amount

  for (const { value, color, edge } of CHIP_COLORS) {
    // Integer division gives how many of this denomination fit.
    const count = Math.floor(remaining / value)
    for (let i = 0; i < count; i++) chips.push({ color, edge })
    remaining -= count * value
  }

  return chips
}

interface ChipStackProps {
  amount: number
  position: readonly [number, number, number]
}

/** A stack of chips standing on the felt, sized to the wager. */
export function ChipStack({ amount, position }: ChipStackProps) {
  if (amount <= 0) return null

  const chips = chipBreakdown(amount)
  const [x, y, z] = position

  return (
    <group position={[x, y, z]}>
      {chips.map((chip, index) => (
        <group
          key={index}
          position={[0, index * CHIP_THICKNESS, 0]}
          // Slight alternating spin so the stack does not look extruded.
          rotation={[0, index * 0.4, 0]}
        >
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[CHIP_RADIUS, CHIP_RADIUS, CHIP_THICKNESS, 24]} />
            <meshStandardMaterial color={chip.color} roughness={0.55} />
          </mesh>
          {/* Thin lighter band around the rim, the way real chips are inlaid. */}
          <mesh scale={[1.02, 0.45, 1.02]}>
            <cylinderGeometry args={[CHIP_RADIUS, CHIP_RADIUS, CHIP_THICKNESS, 24, 1, true]} />
            <meshStandardMaterial color={chip.edge} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
