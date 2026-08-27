import { MeshReflectorMaterial } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import { BackSide, RepeatWrapping } from 'three'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { useTimeStore } from '../store/useTimeStore'
import { leaderboardRows } from '../world/leaderboard'
import { VENUES, VenueKind } from '../world/venues'
import {
  BLOCK_DEPTH,
  BUILDING_CENTER_X,
  BUILDING_DEPTH,
  BUILDING_ROWS,
  BUILDING_WIDTH,
  clearsApproach,
  clearsDoorways,
  LAMP_HEIGHT,
  PALM_HEIGHT_LEFT,
  PALM_HEIGHT_RIGHT,
  FACADE_X,
  hasColonnade,
  LAMP_ROW_Z,
  PALM_ROW_Z,
  ROAD_HALF_WIDTH,
  roadTextureOffset,
  SIDEWALK_HEIGHT,
  STRIP_CENTER_Z,
  STRIP_LENGTH,
} from './stripLayout'
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
import { setLeaderboardRows } from './leaderboardTexture'
import { getRoadTexture, setRoadDaylight } from './roadTexture'
import { Building } from './components/Building'
import { Celestial } from './components/Celestial'
import { ClinicFront } from './components/ClinicFront'
import { ShopFront } from './components/ShopFront'
import { CasinoFront } from './components/CasinoFront'
import { Player } from './components/Player'
import { PalmTree, StreetLamp } from './components/StreetProps'
import { StreetEnd } from './components/StreetEnd'
import { getSkyTexture } from './skyTexture'

const NEON_PALETTE = ['#ff2d95', '#22e0ff', '#ffc63f', '#a45cff', '#3ee08a'] as const

/**
 * Named houses on the skyline that you cannot walk into.
 *
 * The Lucky Viper is here rather than in `VENUES` because the casino it used to
 * lead to has been folded into the Golden Ace, which now holds both tables. Its
 * tower and its cyan stay on the street — the strip would read as two buildings
 * and a gap without it — but its door is gone.
 *
 * `z` must be a `BUILDING_ROWS` entry or the sign has no tower to hang on. The
 * Lucky Viper's old door sat at z = -34, which is between two rows, so it never
 * had a marquee at all; as scenery it finally gets one.
 */
const SCENERY_SIGNS: readonly { z: number; side: 1 | -1; name: string; color: string }[] = [
  { z: -30, side: -1, name: 'Neon Palace', color: '#ff2d95' },
  { z: -30, side: 1, name: 'Lucky Viper', color: '#22e0ff' },
]

function scenerySignAt(z: number, side: 1 | -1) {
  return SCENERY_SIGNS.find((sign) => sign.z === z && sign.side === side)
}

/** Deterministic palette pick so colours are stable across reloads. */
function neonFor(index: number): string {
  return NEON_PALETTE[index % NEON_PALETTE.length] ?? NEON_PALETTE[0]
}

/** Returns the venue whose entrance sits on this row and side, if any. */
function venueAt(z: number, side: 1 | -1) {
  return VENUES.find(
    (entry) => entry.doorPosition[2] === z && Math.sign(entry.doorPosition[0]) === side,
  )
}

/**
 * The name to put on the tower's marquee above this row, if any.
 *
 * Only casinos get one. The bulb marquee is the strip's casino vocabulary, and
 * the shop wearing it was most of why it read as a third casino from the
 * street; the storefronts carry their own fascia signs instead.
 */
function signFor(z: number, side: 1 | -1): string | undefined {
  const venue = venueAt(z, side)
  if (venue) return venue.kind === VenueKind.Casino ? venue.name : undefined
  return scenerySignAt(z, side)?.name
}

/**
 * The tower's neon colour above this row.
 *
 * Unlike `signFor`, this does include the shop: the tower it sits under still
 * glows the shop's pink, which is what ties the low frontage to the building
 * behind it instead of leaving it looking bolted on.
 */
function signColor(z: number, side: 1 | -1, fallback: string): string {
  const venue = venueAt(z, side)
  if (venue) return venue.neonColor
  return scenerySignAt(z, side)?.color ?? fallback
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

  /*
   * Only the sun casts.
   *
   * Turning `castShadow` on unconditionally was right for the daytime street
   * and wrong for the one the game actually opens on: at 21:00 the key is a
   * cool fill standing in for moonlight, and it threw a hard black wedge across
   * half the roadway — over the top of the wet reflection, which is the single
   * strongest thing in the night reference. Moonlight does not do that, and
   * nothing else out here is bright enough to. After dark the neon does the
   * modelling.
   */
  const sunUp = quantize(daylightAt(minuteOfDay), 0.05) > 0.15

  return (
    <>
      {/* Fog tinted to the horizon so the far end of the street dissolves into it. */}
      <fog attach="fog" args={[light.fogColor, light.fogNear, light.fogFar]} />

      <ambientLight intensity={light.ambientIntensity} color={light.ambientColor} />
      {/*
        Key light: cool moonlight at night, swinging low and warm at dawn and
        dusk, and — new — actually casting.

        `<Canvas shadows>` has been on since the first build and the towers, the
        palms and the lamps have all been setting `castShadow` the whole time,
        but this light never had it, so every one of those flags was dead. A
        sunlit street with nothing casting a shadow is a lit diagram, and that
        was most of why the daytime strip read flat next to the night one.

        The frustum is fitted to the street rather than left at its default 5
        units, which would have covered about a third of one building.
      */}
      <directionalLight
        castShadow={sunUp}
        position={[light.keyPosition[0], light.keyPosition[1], light.keyPosition[2]]}
        intensity={light.keyIntensity}
        color={light.keyColor}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
        shadow-camera-near={1}
        shadow-camera-far={140}
        // Long thin geometry at a glancing sun is exactly the shadow-acne case.
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
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

  /*
   * Markings live in the surface, not on top of it.
   *
   * There used to be a note here explaining why the strip had no centre line: a
   * flat-shaded stripe laid over the reflector came out brighter than the road,
   * because the shader multiplies the reflection into the base colour and a
   * stripe sitting above that multiply misses it. True, and an argument against
   * that approach rather than against markings. In the `map` the paint is
   * multiplied along with everything else, so on a wet night the reflection
   * drags the white into streaks exactly the way it drags the neon.
   *
   * The offset is what puts a crossing outside each door — see
   * `roadTextureOffset`.
   */
  const surface = useMemo(() => {
    const texture = getRoadTexture().clone()
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set((ROAD_HALF_WIDTH * 2) / BLOCK_DEPTH, STRIP_LENGTH / BLOCK_DEPTH)
    texture.offset.set(0, roadTextureOffset())
    texture.needsUpdate = true
    return texture
  }, [])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, STRIP_CENTER_Z]} receiveShadow>
      <planeGeometry args={[ROAD_HALF_WIDTH * 2, STRIP_LENGTH]} />
      <MeshReflectorMaterial
        map={surface}
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
 * Repaints the shared facade and roadway textures for the hour.
 *
 * The walls were authored dark enough for a night scene that no plausible
 * daylight rig lifts them — under a noon sky the street stayed a row of night
 * towers with their lights on. Lighting cannot correct a texture painted for
 * one time of day, so the texture itself has to move.
 *
 * Renders nothing; it exists to own the side effect.
 */
function SurfaceDaylight() {
  const bucket = useTimeStore((state) => skyBucket(state.minuteOfDay))

  useLayoutEffect(() => {
    const daylight = daylightAt(bucket * SKY_BUCKET_MINUTES)
    setFacadeDaylight(bucket, daylight)
    setRoadDaylight(bucket, daylight)
  }, [bucket])

  return null
}

/**
 * Keeps the HIGH ROLLERS boards current, the way `SurfaceDaylight` keeps the
 * road: a render-nothing owner of one texture side effect.
 *
 * Mounted once even though two boards draw it — they share the one texture,
 * so a second updater would be a second painter of the same canvas. Solo and
 * suppressed sessions have an empty roster, and the merge in `leaderboardRows`
 * then shows exactly the local player, which is the decided behaviour rather
 * than a fallback.
 */
function LeaderboardStandings() {
  const bankroll = useGameStore((state) => state.bankroll)
  const name = useAppearanceStore((state) => state.playerName)
  const peers = usePresenceStore((state) => state.peers)
  const selfId = usePresenceStore((state) => state.selfId)

  useLayoutEffect(() => {
    setLeaderboardRows(leaderboardRows({ id: selfId ?? 'self', name, bankroll }, Object.values(peers)))
  }, [bankroll, name, peers, selfId])

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
      <Celestial />
      <StripLighting />
      <Roadway />
      <SurfaceDaylight />
      <LeaderboardStandings />

      {/* Raised sidewalks either side of the roadway, kerb to kerb. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * (ROAD_HALF_WIDTH + (FACADE_X - ROAD_HALF_WIDTH) / 2),
            SIDEWALK_HEIGHT / 2,
            STRIP_CENTER_Z,
          ]}
          receiveShadow
        >
          <boxGeometry args={[FACADE_X - ROAD_HALF_WIDTH, SIDEWALK_HEIGHT, STRIP_LENGTH]} />
          <meshStandardMaterial color={sidewalkColor} roughness={0.85} />
        </mesh>
      ))}

      {/* The junction at each end, and the block that closes the view. */}
      <StreetEnd side={1} neonLevel={neonLevel} />
      <StreetEnd side={-1} neonLevel={neonLevel} />

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
            daylight={daylight}
            colonnade={hasColonnade(row.z, -1)}
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
            daylight={daylight}
            colonnade={hasColonnade(row.z, 1)}
          />
        </group>
      ))}

      {PALM_ROW_Z.map((z, index) => (
        <group key={z}>
          {clearsDoorways(-7.6, z) && clearsApproach(-7.6, z, PALM_HEIGHT_LEFT) && (
            <PalmTree
              position={[-7.6, SIDEWALK_HEIGHT, z]}
              height={PALM_HEIGHT_LEFT}
              spin={index * 0.8}
              daylight={daylight}
            />
          )}
          {clearsDoorways(7.6, z - 4) && clearsApproach(7.6, z - 4, PALM_HEIGHT_RIGHT) && (
            <PalmTree
              position={[7.6, SIDEWALK_HEIGHT, z - 4]}
              height={PALM_HEIGHT_RIGHT}
              spin={index * 1.3}
              daylight={daylight}
            />
          )}
        </group>
      ))}

      {LAMP_ROW_Z.map((z) => (
        <group key={z}>
          {clearsDoorways(-6.6, z) && clearsApproach(-6.6, z, LAMP_HEIGHT) && (
            <StreetLamp
              position={[-6.6, SIDEWALK_HEIGHT, z]}
              neonLevel={neonLevel}
              daylight={daylight}
            />
          )}
          {clearsDoorways(6.6, z - 6) && clearsApproach(6.6, z - 6, LAMP_HEIGHT) && (
            <StreetLamp
              position={[6.6, SIDEWALK_HEIGHT, z - 6]}
              neonLevel={neonLevel}
              daylight={daylight}
            />
          )}
        </group>
      ))}

      {VENUES.map((venue) => {
        // Storefronts build their own frontage; casinos get a lit doorway in
        // the tower's face.
        if (venue.kind === VenueKind.Shop) {
          return <ShopFront key={venue.id} venue={venue} neonLevel={neonLevel} />
        }
        if (venue.kind === VenueKind.Clinic) {
          return <ClinicFront key={venue.id} venue={venue} neonLevel={neonLevel} />
        }
        return <CasinoFront key={venue.id} casino={venue} neonLevel={neonLevel} />
      })}

      <Player />
    </>
  )
}
