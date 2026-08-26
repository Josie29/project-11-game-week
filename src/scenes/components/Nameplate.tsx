import { useMemo } from 'react'
import { getNameplateTexture } from '../nameplateTexture'

/*
 * A name floating over a player's head.
 *
 * A `<sprite>` rather than a plane: sprites always face the camera, so the
 * label stays readable as the player orbits, without a per-frame billboard
 * calculation of its own.
 */

/** How far above the crown the label floats, in world units. */
const HEIGHT_ABOVE_CROWN = 0.32

/**
 * Tallest a character gets, across every silhouette.
 *
 * Deliberately a constant rather than the metrics for this figure's own body:
 * the label is a UI element, and a shorter player's name sitting lower than a
 * taller one's reads as misalignment rather than as accurate anatomy.
 */
const CROWN_Y = 1.78

/**
 * Width of the label in world units.
 *
 * Tuned by looking rather than by arithmetic. The trailing camera sits about
 * seven units behind the player, so somebody standing a conversational five
 * units away is twelve from the lens — and at 0.62 the plate came out around
 * sixty pixels wide, which is legible as *a label* but not as *a name*.
 */
const WIDTH = 1.1
const ASPECT = 128 / 512

interface NameplateProps {
  /** An already-sanitized display name. */
  name: string
}

export function Nameplate({ name }: NameplateProps) {
  const texture = useMemo(() => getNameplateTexture(name), [name])

  return (
    <sprite position={[0, CROWN_Y + HEIGHT_ABOVE_CROWN, 0]} scale={[WIDTH, WIDTH * ASPECT, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        // Drawn over whatever it overlaps. A name half-buried in a slot machine
        // is worse than one that floats slightly in front of it.
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  )
}
