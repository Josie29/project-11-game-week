import { getExitSignTexture } from '../signTexture'

/*
 * The way out of an interior, shared by the casino floor and the clinic.
 *
 * Both rooms built their own and both got it wrong in exactly the same way: an
 * unrotated `planeGeometry` faces +Z, the exits are in the +Z wall, and the
 * player is always at a lower z looking toward it — so every panel presented
 * its back face and was culled. The door has been invisible from inside since
 * it was built, in both rooms, which is the argument for there being one of
 * these rather than two.
 *
 * It also has to be findable from across the room, which the old dark rectangle
 * and thin coloured line never were in a lit interior.
 */

interface ExitDoorProps {
  /** Where the doorway sits, in world space. */
  position: readonly [number, number, number]
  /** The room's own colour, for the surround. */
  accent: string
  width?: number
  height?: number
  /**
   * Whether to paint the stand-in pool of light on the floor.
   *
   * On by default, and off in any room whose own floor already catches the
   * doorway's `pointLight`. See the comment on the mesh itself.
   */
  floorPool?: boolean | undefined
}

/** Warm, against both interiors' cold or purple light: this is the street. */
const STREET_SPILL = '#ffcf8a'

export function ExitDoor({
  position,
  accent,
  width = 2.2,
  height = 3,
  floorPool = true,
}: ExitDoorProps) {
  const sign = getExitSignTexture()

  /*
   * Turned to face into the room.
   *
   * The whole point, and the thing that was missing. Every panel below is
   * rotated; a bare `planeGeometry` here is invisible to the only person who
   * ever needs to see it.
   */
  const facingRoom: [number, number, number] = [0, Math.PI, 0]

  const jamb = 0.16
  const signWidth = 1.05
  const signHeight = 0.52

  return (
    <group name="exit" position={[position[0], 0, position[2]]}>
      {/*
        The opening. Nearly black rather than emissive — a doorway is a hole,
        and what sells it is the light falling out of it onto the floor, not the
        hole glowing.
      */}
      <mesh position={[0, height / 2, -0.02]} rotation={facingRoom}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#120e18" toneMapped={false} />
      </mesh>

      {/*
        Street glow inside the opening, as panes stacked from the floor up.
        
        All three share a bottom edge and differ only in how far up they reach,
        so the opacity accumulates toward the ground and reads as a gradient.
        Three bands of *equal* height laid end to end — the obvious way to do it
        — reads as three painted stripes, because each edge is a hard one.
      */}
      {[0.92, 0.55, 0.26].map((top, index) => (
        <mesh
          key={top}
          position={[0, (height * top) / 2, -0.04 - index * 0.004]}
          rotation={facingRoom}
        >
          <planeGeometry args={[width - 0.12, height * top]} />
          <meshBasicMaterial color={STREET_SPILL} toneMapped={false} transparent opacity={0.1} />
        </mesh>
      ))}

      {/* Frame: two jambs and a head, in the room's colour so it reads as a door. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (width / 2 + jamb / 2), height / 2, -0.06]}
          rotation={facingRoom}
        >
          <planeGeometry args={[jamb, height + jamb]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, height + jamb / 2, -0.06]} rotation={facingRoom}>
        <planeGeometry args={[width + jamb * 2, jamb]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      {/* The green box. Findable from the far wall, which is its only job. */}
      <mesh position={[0, height + 0.52, -0.08]} rotation={facingRoom}>
        <planeGeometry args={[signWidth, signHeight]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>

      {/*
        Light thrown back into the room, so the doorway is visible as a source
        rather than only as a shape. Warm, because everything on the other side
        of it is.
      */}
      <pointLight position={[0, 1.8, -1.4]} color={STREET_SPILL} intensity={16} distance={8} />
      {/*
        ...and its pool on the floor, which is what catches the eye first.

        Optional, because it is a stand-in for light rather than light. It is a
        flat quad, and a flat quad reads as a piece of geometry lying on the
        floor unless whatever is under it is already bright enough to hide the
        edges. The casino's carpet and the clinic's tile are; the shop's dark
        polished floor is not, and there the same mesh came back as a solid
        plank in front of the door. Lowering the opacity did not fix it, tone
        mapping it did not fix it, and stacking three of them into a gradient
        turned one hard edge into three.

        The `pointLight` above is the real thing and is unconditional. A room
        whose floor catches it can turn this off and lose nothing.
      */}
      {floorPool && (
        <mesh position={[0, 0.012, -0.9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width + 0.6, 1.8]} />
          <meshBasicMaterial color={STREET_SPILL} toneMapped={false} transparent opacity={0.1} />
        </mesh>
      )}
    </group>
  )
}
