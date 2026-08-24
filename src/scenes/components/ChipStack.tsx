const CHIP_RADIUS = 0.15
const CHIP_THICKNESS = 0.045

/**
 * Chip colours by denomination, following common casino convention.
 *
 * Brighter than the tray chips on purpose: the wager sits under the lamp and
 * needs to read as a distinct object against the felt rather than a dark disc.
 */
const CHIP_COLORS: readonly { value: number; color: string; edge: string }[] = [
  { value: 100, color: '#2b2e45', edge: '#e6e9f5' },
  { value: 25, color: '#1a9159', edge: '#eaf3ec' },
  { value: 10, color: '#2f6ecb', edge: '#dce6f7' },
  { value: 5, color: '#cc2440', edge: '#f6dade' },
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
          {/*
            Inlay disc on the top face rather than a band around the rim: a
            vertical rim only ever catches grazing light from the overhead
            lamp, so it read as a dark ring instead of a highlight.
          */}
          <mesh position={[0, CHIP_THICKNESS / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[CHIP_RADIUS * 0.58, CHIP_RADIUS * 0.74, 24]} />
            <meshStandardMaterial color={chip.edge} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
