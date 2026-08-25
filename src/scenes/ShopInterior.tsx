import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { BackSide, Group, PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { CATALOG } from '../character/catalog'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useTimeStore } from '../store/useTimeStore'
import { getVenue, type VenueId } from '../world/venues'
import { CasinoCharacter } from './components/CasinoCharacter'
import {
  COUNTER,
  COUNTER_DEPTH,
  COUNTER_HEIGHT,
  COUNTER_WIDTH,
  HALF_DEPTH,
  HALF_WIDTH,
  MIRROR,
  MIRROR_HEIGHT,
  MIRROR_WIDTH,
  PLINTH,
  PLINTH_HEIGHT,
  PLINTH_RADIUS,
  RACK_HEIGHT,
  RACK_LENGTH,
  RACKS,
  WALL_HEIGHT,
} from './shopLayout'
import { useOrbitInput } from './useOrbitInput'

/*
 * The Gilded Hanger.
 *
 * A small boutique rather than another casino floor: the player is here to look
 * at their own character, so the room is built around the plinth and the mirror
 * and everything else is dressing. All fittings are placed from
 * `shopLayout.ts`, which is pure and tested.
 */

/** Seconds for one full turn of the plinth. Matches the designer stage. */
const TURN_PERIOD = 16

/*
 * Offset +x from the plinth so the character frames left of centre. The
 * catalogue panel covers the right quarter of the screen, and a figure orbited
 * around its own axis sits squarely behind it. Same trick as
 * `BLACKJACK_TARGET`, which is offset from the felt's centre for the same
 * reason.
 */
const TARGET = new Vector3(PLINTH[0] + 0.5, 1.05, PLINTH[1])

const DEFAULT_YAW = 0.16
const DEFAULT_PITCH = 0.24
const DEFAULT_DISTANCE = 5.2

const MIN_PITCH = 0.02
const MAX_PITCH = 0.95
const MIN_DISTANCE = 2.6
const MAX_DISTANCE = 6.4
/** Bounded so the camera cannot swing out through the shop's side walls. */
const YAW_RANGE = 1.1

const ORBIT_DAMPING = 12

/** Scratch vector, reused so the orbit loop allocates nothing. */
const DESIRED = new Vector3()

function ShopCamera() {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)

  const { orbit } = useOrbitInput(
    { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, distance: DEFAULT_DISTANCE },
    {
      minPitch: MIN_PITCH,
      maxPitch: MAX_PITCH,
      minDistance: MIN_DISTANCE,
      maxDistance: MAX_DISTANCE,
      yawRange: YAW_RANGE,
    },
  )

  useFrame((state, delta) => {
    const camera = cameraRef.current ?? state.camera
    const { yaw, pitch, distance } = orbit.current
    const horizontal = Math.cos(pitch) * distance

    camera.position.lerp(
      DESIRED.set(
        TARGET.x + Math.sin(yaw) * horizontal,
        TARGET.y + Math.sin(pitch) * distance,
        TARGET.z + Math.cos(yaw) * horizontal,
      ),
      1 - Math.exp(-ORBIT_DAMPING * delta),
    )
    camera.lookAt(TARGET)
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={46} />
}

/**
 * A rail of hanging garments.
 *
 * The clothes are coloured blocks taken from the catalogue rather than modelled
 * items: at this distance a hanging jacket is a shape and a colour, and the
 * real ones are on the character three metres away.
 */
function Rack({ index }: { index: number }) {
  const garmentCount = 6

  return (
    <group>
      {/* Uprights and the rail between them. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * RACK_LENGTH) / 2, RACK_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[0.025, 0.03, RACK_HEIGHT, 8]} />
          <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, RACK_HEIGHT, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, RACK_LENGTH, 8]} />
        <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.8} />
      </mesh>

      {Array.from({ length: garmentCount }, (_, slot) => {
        // Walk the catalogue so each rack shows different colours, and so a new
        // item automatically appears on the rails instead of needing a palette
        // maintained alongside it.
        const item = CATALOG[(index * garmentCount + slot) % CATALOG.length]
        const x = ((slot + 0.5) / garmentCount - 0.5) * (RACK_LENGTH - 0.2)

        return (
          <group key={slot} position={[x, RACK_HEIGHT - 0.06, 0]}>
            <mesh position={[0, -0.06, 0]}>
              <torusGeometry args={[0.05, 0.008, 4, 10]} />
              <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.8} />
            </mesh>
            <mesh position={[0, -0.46, 0]} castShadow>
              <boxGeometry args={[0.26, 0.72, 0.11]} />
              <meshStandardMaterial
                color={item?.colors.primary ?? '#4a2a52'}
                roughness={0.55}
                metalness={0.2}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

interface ShopInteriorProps {
  venueId: VenueId
}

export function ShopInterior({ venueId }: ShopInteriorProps) {
  const venue = getVenue(venueId)
  const appearance = useAppearanceStore((state) => state.appearance)
  const equipped = useAppearanceStore((state) => state.equipped)

  const turntable = useRef<Group>(null)

  useFrame((_state, delta) => {
    if (!turntable.current) return

    // `?freeze` holds the turntable too, so a capture of this scene is
    // reproducible. Same reasoning as the designer stage and the clock.
    if (useTimeStore.getState().paused) {
      turntable.current.rotation.y = 0
      return
    }

    turntable.current.rotation.y += (delta * Math.PI * 2) / TURN_PERIOD
  })

  return (
    <>
      <color attach="background" args={['#120a1c']} />

      <ShopCamera />

      <ambientLight intensity={0.5} color="#c0a8d8" />
      {/* Warm downlight over the plinth — the shop's one pool of key light. */}
      <spotLight
        position={[PLINTH[0], WALL_HEIGHT - 0.3, PLINTH[1] + 0.6]}
        angle={0.8}
        penumbra={0.8}
        intensity={22}
        distance={12}
        color="#ffe6c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0008}
      />
      {/*
        House pink, hung high and well clear of the mirror. Sitting it against
        the back wall put a blown-out hotspot in the middle of the mirror panel
        that read as a bug rather than as a reflection — the panel is 25cm
        behind where the light used to be.
      */}
      <pointLight
        position={[0, WALL_HEIGHT - 0.6, -1.2]}
        color={venue.neonColor}
        intensity={20}
        distance={11}
      />
      <pointLight position={[0, 2.4, HALF_DEPTH - 0.8]} color="#6f7ae0" intensity={12} distance={12} />

      {/*
        The room as a single inverted box. Cheaper than six planes and there is
        no way to see it from outside, since the camera's yaw and distance are
        both bounded.
      */}
      <mesh position={[0, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[HALF_WIDTH * 2, WALL_HEIGHT, HALF_DEPTH * 2]} />
        <meshStandardMaterial color="#241534" roughness={0.92} side={BackSide} />
      </mesh>

      {/* Carpet, a shade warmer than the walls so the floor reads separately. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[HALF_WIDTH * 2, HALF_DEPTH * 2]} />
        <meshStandardMaterial color="#3a1030" roughness={0.95} />
      </mesh>

      {/* Neon coving where the walls meet the ceiling. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (HALF_WIDTH - 0.05), WALL_HEIGHT - 0.35, 0]}>
          <boxGeometry args={[0.06, 0.09, HALF_DEPTH * 2 - 0.4]} />
          <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
        </mesh>
      ))}

      {RACKS.map((rack, index) => (
        <group
          key={`${rack.at[0]}-${rack.at[1]}`}
          position={[rack.at[0], 0, rack.at[1]]}
          rotation={[0, rack.rotationY, 0]}
        >
          <Rack index={index} />
        </group>
      ))}

      {/* Jewellery counter: a lit case with a glass top. */}
      <group position={[COUNTER[0], 0, COUNTER[1]]}>
        <mesh position={[0, COUNTER_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[COUNTER_WIDTH, COUNTER_HEIGHT, COUNTER_DEPTH]} />
          <meshStandardMaterial color="#1b1024" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, COUNTER_HEIGHT + 0.02, 0]}>
          <boxGeometry args={[COUNTER_WIDTH - 0.1, 0.03, COUNTER_DEPTH - 0.1]} />
          <meshStandardMaterial
            color="#9fd6e8"
            roughness={0.08}
            metalness={0.2}
            transparent
            opacity={0.4}
          />
        </mesh>
        {/* Pieces under the glass, so the case is not an empty box. */}
        {[-0.7, 0, 0.7].map((offset) => (
          <mesh key={offset} position={[offset, COUNTER_HEIGHT - 0.12, 0]}>
            <octahedronGeometry args={[0.07]} />
            <meshStandardMaterial
              color="#e0b64a"
              roughness={0.15}
              metalness={0.9}
              emissive="#e0b64a"
              emissiveIntensity={0.25}
            />
          </mesh>
        ))}
      </group>

      {/* Mirror alcove — the way back into the designer. */}
      <group position={[MIRROR[0], 0, MIRROR[1]]}>
        <mesh position={[0, MIRROR_HEIGHT / 2 + 0.15, 0.03]}>
          <boxGeometry args={[MIRROR_WIDTH + 0.16, MIRROR_HEIGHT + 0.16, 0.06]} />
          <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
        </mesh>
        <mesh position={[0, MIRROR_HEIGHT / 2 + 0.15, 0.07]}>
          <boxGeometry args={[MIRROR_WIDTH, MIRROR_HEIGHT, 0.04]} />
          {/*
            Matte, not chrome. There is no environment map in this scene, so a
            polished panel has nothing to reflect except the point lights — it
            came back as a black void with two specular dots, then as one blown
            out pink blob. The neon frame is what says "mirror"; the glass only
            has to be a dark tinted panel behind it.
          */}
          <meshStandardMaterial
            color="#3a3456"
            roughness={0.62}
            metalness={0.12}
            emissive="#221d3c"
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>

      {/* The player, on the plinth, wearing what they have on right now. */}
      <group position={[PLINTH[0], 0, PLINTH[1]]}>
        <mesh position={[0, PLINTH_HEIGHT / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[PLINTH_RADIUS, PLINTH_RADIUS + 0.06, PLINTH_HEIGHT, 32]} />
          <meshStandardMaterial color="#1b1730" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, PLINTH_HEIGHT + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PLINTH_RADIUS - 0.05, PLINTH_RADIUS, 48]} />
          <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
        </mesh>

        <group ref={turntable} position={[0, PLINTH_HEIGHT, 0]}>
          <CasinoCharacter appearance={appearance} equipped={equipped} />
        </group>
      </group>
    </>
  )
}
