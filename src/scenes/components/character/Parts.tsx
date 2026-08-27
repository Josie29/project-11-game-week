import { DoubleSide } from 'three'
import type { PartPalette } from '../../../character/partPalette'
import {
  ColorRole,
  Finish,
  PartShape,
  partHalfExtents,
  type Part,
} from '../../../character/parts'

/*
 * Draws a part list, and decides nothing.
 *
 * Every shape, position and size comes from `src/character/`, which is pure and
 * tested. This component's whole job is to turn a `Part` into a mesh — the same
 * relationship `CasinoCharacter` already had with `anchors.ts`, now extended to
 * the geometry itself rather than just to where it hangs.
 *
 * Worth stating why that matters here rather than only in the pure module: a
 * ponytail floating behind a head and a ponytail attached to it are the same
 * number of meshes, and no amount of reading this file would tell them apart.
 * The check lives where the numbers are.
 */

function colorFor(role: ColorRole, palette: PartPalette): string {
  switch (role) {
    case ColorRole.Primary:
      return palette.primary
    case ColorRole.Secondary:
      return palette.secondary
    case ColorRole.Accent:
      return palette.accent
    case ColorRole.Trim:
      return palette.trim
    case ColorRole.Shirt:
      return palette.shirt
    case ColorRole.Shoes:
      return palette.shoes
    case ColorRole.Skin:
      return palette.skin
    case ColorRole.Hair:
      return palette.hair
    case ColorRole.Sclera:
      return palette.sclera
    case ColorRole.Pupil:
      return palette.pupil
    case ColorRole.Lip:
      return palette.lip
  }
}

/**
 * The smallest a part can be and still be worth casting a shadow.
 *
 * Shadow acne is one of the three things that made the figure crawl as it
 * turned, and the rig had `castShadow` on almost every mesh — including eyes,
 * pupils and ring stones, none of which cast a shadow anyone could see and all
 * of which contributed their own self-shadowing speckle. Only pieces big
 * enough to throw a shadow that reads now ask for one.
 */
const SHADOW_THRESHOLD = 0.055

function castsShadow(part: Part): boolean {
  const [hx, hy, hz] = partHalfExtents(part)
  return Math.max(hx, hy, hz) * 2 >= SHADOW_THRESHOLD
}

function Material({ part, color }: { part: Part; color: string }) {
  switch (part.finish ?? Finish.Cloth) {
    case Finish.Metal:
      return <meshStandardMaterial color={color} roughness={0.24} metalness={0.88} />

    case Finish.Gem:
      return (
        <meshStandardMaterial
          color={color}
          roughness={0.05}
          metalness={0.2}
          emissive={color}
          emissiveIntensity={0.35}
        />
      )

    case Finish.Leather:
      return <meshStandardMaterial color={color} roughness={0.24} metalness={0.18} />

    case Finish.Glass:
      // Lenses are the one part of a figure that should look wet under neon.
      return (
        <meshStandardMaterial
          color={color}
          roughness={0.12}
          metalness={0.35}
          envMapIntensity={1.4}
        />
      )

    case Finish.Matte:
      return <meshStandardMaterial color={color} roughness={0.82} />

    case Finish.Cloth:
      return <meshStandardMaterial color={color} roughness={0.88} />
  }
}

function Geometry({ part }: { part: Part }) {
  const [a, b, c] = part.size
  const segments = part.segments ?? 16

  switch (part.shape) {
    case PartShape.Box:
      return <boxGeometry args={[a, b, c]} />

    case PartShape.Capsule:
      return <capsuleGeometry args={[a, b, 6, segments]} />

    /*
     * A unit sphere, scaled.
     *
     * Scaling rather than three separate radii because `sphereGeometry` has
     * only one, and an ellipsoid is what most of this character is made of —
     * a skull, a shoulder, a bun, a toe cap. The scale is applied on the mesh
     * below, where a part's own `scale` is applied too.
     *
     * The height rings used to be six tenths of the width segments, which is
     * the usual saving and is wrong for exactly one surface on this figure. The
     * hairline is where the hair shell breaks the surface of the skull, the two
     * meet at a very shallow angle, and it runs *horizontally* across the
     * forehead — so it is the height rings it is cut against, and at six tenths
     * of forty-eight that is a ring every six degrees. It came out as a visible
     * sawtooth on every style. Spheres are the cheapest geometry here; this is
     * not where to save triangles.
     */
    case PartShape.Sphere:
      return <sphereGeometry args={[1, segments, Math.max(6, Math.round(segments * 0.9))]} />

    case PartShape.Cylinder:
      return <cylinderGeometry args={[a, c, b, segments, 1, part.open ?? false]} />

    case PartShape.Cone:
      return <coneGeometry args={[a, b, segments]} />

    case PartShape.Torus:
      return <torusGeometry args={[a, b, Math.max(6, Math.round(segments / 2)), segments]} />
  }
}

/** The mesh scale for a part: its own, times the unit-sphere radii where needed. */
function scaleFor(part: Part): [number, number, number] {
  const [sx, sy, sz] = part.scale ?? [1, 1, 1]

  if (part.shape === PartShape.Sphere) {
    const [rx, ry, rz] = part.size
    return [rx * sx, ry * sy, rz * sz]
  }

  return [sx, sy, sz]
}

interface PartsProps {
  parts: readonly Part[]
  palette: PartPalette
  /**
   * Prefixed onto every mesh name.
   *
   * `npm run locate` matches on these, and "the cane is not rendering" turning
   * out to mean "the cane is too dark to see" is the reason that script exists.
   * A part list that can be found by name is one that can be diagnosed without
   * guessing.
   */
  namePrefix?: string | undefined
}

export function Parts({ parts, palette, namePrefix }: PartsProps) {
  return (
    <>
      {parts.map((part) => (
        <mesh
          key={part.name}
          name={namePrefix ? `${namePrefix}:${part.name}` : part.name}
          position={[...part.at]}
          rotation={part.rotation ? [...part.rotation] : [0, 0, 0]}
          scale={scaleFor(part)}
          castShadow={castsShadow(part)}
          receiveShadow={castsShadow(part)}
        >
          <Geometry part={part} />
          {/*
            An open cylinder is a shell with no caps, so the inside of a skirt
            faces the camera whenever the hem is seen from below. Without both
            sides it is a hole.
          */}
          {part.open ? (
            <meshStandardMaterial
              color={colorFor(part.role, palette)}
              roughness={0.88}
              side={DoubleSide}
            />
          ) : (
            <Material part={part} color={colorFor(part.role, palette)} />
          )}
        </mesh>
      ))}
    </>
  )
}
