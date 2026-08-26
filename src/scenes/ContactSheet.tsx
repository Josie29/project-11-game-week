import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import {
  sheetColumns,
  sheetExtent,
  sheetFigures,
  sheetPosition,
  type SheetKind,
} from '../dev/contactSheet'
import { useGameStore } from '../store/useGameStore'
import { CasinoCharacter } from './components/CasinoCharacter'
import { StageLighting } from './components/StageLighting'
import { getLabelTexture } from './labelTexture'

/*
 * A whole sweep in one frame.
 *
 * Development only. This is the answer to an audit that was previously
 * unphotographable: eight hairstyles, twelve items, four garments, three
 * builds — each of them one capture rather than eight or twelve, and each of
 * them turnable, so the back of a figure can be looked at for the first time.
 *
 * `?turn=` rotates the *figures* here rather than the camera, which is the
 * difference between a sheet and the designer. A camera swung round a grid
 * frames the row edge-on; turning each figure in place keeps every one of them
 * the same size in shot and comparable with its neighbour, which is what a
 * contact sheet is for.
 */

interface ContactSheetProps {
  kind: SheetKind
  /** Overrides held constant across the sheet, from the appearance deep links. */
  base: Parameters<typeof sheetFigures>[1]
}

/** Vertical field of view, in radians. Matches the designer stage's. */
const FOV = 42
/** The capture viewport `npm run shot` uses. */
const ASPECT = 16 / 9

/** Roughly mid-chest on a 1.8-tall figure: what the camera is aimed at. */
const EYELINE = 1.05

/**
 * How far back the camera has to sit to fit the whole block of figures.
 *
 * Derived rather than guessed. The first version was a hand-tuned constant and
 * it put eight figures across a fifth of the frame — small enough that judging a
 * hairstyle, which is the only reason the sheet exists, was impossible. This
 * solves for the distance at which the block exactly fills the frame's width,
 * then adds the depth of the rows in front of it.
 *
 * @param count How many figures the sheet holds.
 * @returns Distance from the block's centre to the camera.
 */
function cameraDistance(count: number): number {
  const { halfWidth, halfDepth } = sheetExtent(count)
  const halfFov = (FOV / 2) * (Math.PI / 180)

  // What one unit of distance buys in half-width at this field of view.
  const widthPerUnit = Math.tan(halfFov) * ASPECT
  const forWidth = halfWidth / widthPerUnit

  // And enough to clear the row standing nearest the camera.
  return forWidth + halfDepth + 0.6
}

export function ContactSheet({ kind, base }: ContactSheetProps) {
  const turn = useGameStore((state) => state.designerYaw)

  const figures = useMemo(() => sheetFigures(kind, base), [kind, base])
  const columns = sheetColumns(figures.length)
  const rows = Math.ceil(figures.length / columns)
  const distance = cameraDistance(figures.length)

  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const target = useMemo(() => new Vector3(0, EYELINE, 0), [])

  // Aimed rather than given a hand-computed rotation, for the reason the shop's
  // mirror camera is: a camera and the thing it has to frame that disagree is
  // not something a later reader would think to check.
  useFrame(() => {
    cameraRef.current?.lookAt(target)
  })

  return (
    <>
      <color attach="background" args={['#0a0714']} />
      <fog attach="fog" args={['#0a0714', distance + 6, distance + 20]} />

      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        // Rises with the number of rows, so a back row clears the heads of the
        // one in front instead of hiding behind its shoulders.
        position={[0, EYELINE + 0.45 + (rows - 1) * 0.75, distance]}
        fov={FOV}
      />

      {/*
        Shadows off. A key light casting across twelve figures standing in rows
        puts the front row's shadows on the back row's shins, which reads as
        dirt on the geometry being audited — and the audit is the only reason
        this scene exists.
      */}
      <StageLighting spread={columns * 0.95} shadows={false} />

      {figures.map((figure, index) => {
        const [x, , z] = sheetPosition(index, figures.length)

        return (
          <group key={figure.label} position={[x, 0, z]}>
            <group rotation={[0, turn, 0]}>
              <CasinoCharacter appearance={figure.appearance} equipped={figure.equipped} />
            </group>

            {/*
              The caption, standing at the figure's feet and facing the camera.
              Without it a sheet of eight hairstyles is eight heads and no way
              to say which one is wrong.
            */}
            <mesh position={[0, 0.16, 0.55]} rotation={[-0.5, 0, 0]}>
              <planeGeometry args={[1.15, 0.216]} />
              {/*
                Drawn over everything rather than depth-tested.
                A back-row caption sits behind the front row, so half of them
                were hidden by the figures standing in front — and a sheet where
                you cannot tell which figure is which is no better than one
                where you cannot see them.
              */}
              <meshBasicMaterial
                map={getLabelTexture(figure.label)}
                transparent
                depthTest={false}
                toneMapped={false}
                side={DoubleSide}
              />
            </mesh>
          </group>
        )
      })}

      {/*
        Floor, and deliberately duller than the designer's.
        The stage's is polished enough to catch the rim lights, which is
        flattering for one figure and ruinous for twelve: with the back fill
        added it came back as a pale band across the bottom half of the frame,
        brighter than the garments it was supposed to sit under.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#120d1f" roughness={0.9} metalness={0.05} />
      </mesh>

      {/*
        The backdrop, behind the furthest row.
        Placed off the same extent the camera is framed from, so a sheet with
        three rows does not have its back row standing in front of open fog.
      */}
      <mesh position={[0, 4, -sheetExtent(figures.length).halfDepth - 5]}>
        <planeGeometry args={[80, 18]} />
        {/*
          Unlit, so the rig cannot wash it out. As a standard material the back
          fill turned it into a bright grey band across the middle of the frame,
          which is the one thing a backdrop must never do — it competes with the
          figures it exists to sit behind.
        */}
        <meshBasicMaterial color="#171236" />
      </mesh>
    </>
  )
}
