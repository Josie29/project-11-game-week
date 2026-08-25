import { MeshReflectorMaterial } from '@react-three/drei'
import { useLayoutEffect } from 'react'
import { BackSide } from 'three'
import { useTimeStore } from '../store/useTimeStore'
import {
  CASINOS,
  FACADE_X,
  ROAD_HALF_WIDTH,
  SIDEWALK_HEIGHT,
} from '../world/casinos'
import {
  daylightAt,
  lightingAt,
  neonLevelAt,
  quantize,
  SKY_BUCKET_MINUTES,
  skyBucket,
  skyPaletteAt,
} from '../world/timeOfDay'
import { setFacadeDaylight } from './facadeTexture'
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

/**
 * Sky dome.
 *
 * Its own component so a step of the day redraws four hundred pixels of
 * gradient rather than re-rendering sixteen towers behind it.
 */
function SkyDome() {
  const bucket = useTimeStore((state) => skyBucket(state.minuteOfDay))
  // Sample the middle of the step, so the gradient sits centred on it.
  const palette = skyPaletteAt(bucket * SKY_BUCKET_MINUTES + SKY_BUCKET_MINUTES / 2)

  return (
    <mesh>
      <sphereGeometry args={[220, 32, 16]} />
      <meshBasicMaterial
        map={getSkyTexture(bucket, palette)}
        side={BackSide}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/**
 * Fog and the outdoor light rig, following the hour.
 *
 * Unlike the sky these are plain numbers, so they vary continuously and cover
 * the step the gradient moves in.
 */
function StripLighting() {
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)
  const light = lightingAt(minuteOfDay)

  return (
    <>
      {/* Fog tinted to the horizon so the far end of the street dissolves into it. */}
      <fog attach="fog" args={[light.fogColor, light.fogNear, light.fogFar]} />

      <ambientLight intensity={light.ambientIntensity} color={light.ambientColor} />
      {/* Key light: cool moonlight at night, swinging low and warm at dawn and dusk. */}
      <directionalLight
        position={[light.keyPosition[0], light.keyPosition[1], light.keyPosition[2]]}
        intensity={light.keyIntensity}
        color={light.keyColor}
      />
    </>
  )
}

/**
 * Wet asphalt.
 *
 * The mirrored roadway carrying stretched neon is the single strongest cue in
 * the reference art, and a real reflection pass sells it in a way a dark plane
 * never could. Kept at a low resolution with heavy blur so it stays inside the
 * frame budget.
 *
 * Its colour follows the hour off the sky's step rather than the raw minute:
 * the road drying out over ten seconds is invisible, and pinning it to the
 * coarser value keeps the surrounding street from re-rendering every second.
 */
function Roadway() {
  const bucket = useTimeStore((state) => skyBucket(state.minuteOfDay))
  const light = lightingAt(bucket * SKY_BUCKET_MINUTES)

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]}>
      <planeGeometry args={[ROAD_HALF_WIDTH * 2, 140]} />
      <MeshReflectorMaterial
        resolution={512}
        mixBlur={1}
        mixStrength={light.roadMixStrength}
        blur={[300, 90]}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.25}
        /*
          The shader multiplies the base colour by the captured reflection, so
          a near-black roadway cancels the effect out entirely. This has to
          stay light enough for the neon above to survive the multiply — and
          light enough by day that the street is not a hole under a bright sky.
        */
        color={light.roadColor}
        roughness={light.roadRoughness}
        metalness={light.roadMetalness}
        mirror={light.roadMirror}
      />
    </mesh>
  )
}

/**
 * Repaints the shared facade texture for the hour.
 *
 * The walls were authored dark enough for a night scene that no plausible
 * daylight rig lifts them — under a noon sky the street stayed a row of night
 * towers with their lights on. Lighting cannot correct a texture painted for
 * one time of day, so the texture itself has to move.
 *
 * Renders nothing; it exists to own the side effect.
 */
function FacadeDaylight() {
  const bucket = useTimeStore((state) => skyBucket(state.minuteOfDay))

  useLayoutEffect(() => {
    setFacadeDaylight(bucket, daylightAt(bucket * SKY_BUCKET_MINUTES))
  }, [bucket])

  return null
}

export function Strip() {
  // Quantized so the street only re-renders while neon is actually fading,
  // rather than once a second for the whole day.
  const neonLevel = useTimeStore((state) => quantize(neonLevelAt(state.minuteOfDay), 0.05))
  const daylight = useTimeStore((state) => quantize(daylightAt(state.minuteOfDay), 0.05))
  const sidewalkColor = useTimeStore(
    (state) => lightingAt(skyBucket(state.minuteOfDay) * SKY_BUCKET_MINUTES).sidewalkColor,
  )

  return (
    <>
      <SkyDome />
      <StripLighting />
      <Roadway />
      <FacadeDaylight />

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
          <meshStandardMaterial color={sidewalkColor} roughness={0.85} />
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
            neonLevel={neonLevel}
          />
          <Building
            position={[BUILDING_CENTER_X, 0, row.z]}
            width={BUILDING_WIDTH}
            height={row.rightHeight}
            depth={BUILDING_DEPTH}
            neonColor={signColor(row.z, 1, neonFor(index + 2))}
            facing={-1}
            signName={signFor(row.z, 1)}
            neonLevel={neonLevel}
          />
        </group>
      ))}

      {PALM_ROW_Z.map((z, index) => (
        <group key={z}>
          <PalmTree
            position={[-7.6, SIDEWALK_HEIGHT, z]}
            height={6.4}
            spin={index * 0.8}
            daylight={daylight}
          />
          <PalmTree
            position={[7.6, SIDEWALK_HEIGHT, z - 4]}
            height={7.1}
            spin={index * 1.3}
            daylight={daylight}
          />
        </group>
      ))}

      {LAMP_ROW_Z.map((z) => (
        <group key={z}>
          <StreetLamp position={[-6.6, SIDEWALK_HEIGHT, z]} neonLevel={neonLevel} daylight={daylight} />
          <StreetLamp
            position={[6.6, SIDEWALK_HEIGHT, z - 6]}
            neonLevel={neonLevel}
            daylight={daylight}
          />
        </group>
      ))}

      {CASINOS.map((casino) => (
        <CasinoDoor key={casino.id} casino={casino} neonLevel={neonLevel} />
      ))}

      <Player />
    </>
  )
}
