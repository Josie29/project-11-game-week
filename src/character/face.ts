/*
 * The face, and the jaw it is set into.
 *
 * Split out of `bodyParts.ts` for the reason every other module here was split
 * out: it is the piece that varies independently of everything around it. The
 * silhouette control is the first thing the designer opens on, and it changed
 * the shoulders, the hip and the leg length and nothing whatsoever above the
 * neck — three bodies wearing one face.
 *
 * Everything is authored in the *head's* own frame, origin at the centre of the
 * skull, exactly as `hairParts.ts` is. Hair and face are the two things that
 * have to agree about where the brow is, and they could not while one measured
 * from the skull and the other from the hip.
 */

import {
  ColorRole,
  Finish,
  PartShape,
  type Part,
  type Vec3,
} from './parts'
import { Silhouette, type BodyProportions } from './proportions'

/* ------------------------------------------------------------- the layout */

/*
 * Where the features sit, as fractions of head height above the head's centre.
 *
 * These moved down and closed up, and that is the whole of what makes the face
 * read as a face rather than a mask. The eyes sat a quarter of the way up from
 * the centre toward the crown with the mouth almost on the chin, which leaves
 * a long empty lower face — the exact impression the capture gave. A cranium
 * that is large relative to a compact set of features is the oldest trick there
 * is for a friendly figure, and it costs nothing but four numbers.
 *
 * `EYE_Y` is exported because `Slot.Eyes` has to agree with it. It did not:
 * the anchor was a hand-typed 25mm above the head's centre, which was roughly
 * the old eye line and is now well above the new one — a pair of sunglasses
 * worn on the forehead.
 */
export const EYE_Y = -0.06
/*
 * Lowered, and the hairline is why.
 *
 * The shell that draws the hair breaks the surface of the skull lower at the
 * temples than at the centre line — which is the shape a hairline has — so a
 * brow set high on the forehead disappears under it at both ends. Half the
 * styles came out with no visible brows at all.
 */
const BROW_ABOVE_EYE = 0.13
const NOSE_BELOW_EYE = 0.13
const MOUTH_BELOW_EYE = 0.22

/*
 * There is no jaw part any more, and that is deliberate.
 *
 * A second ellipsoid pushed out below the skull is how you build a chin onto a
 * long head, and it was doing that job while the figure was seven and a half
 * heads tall. On the stylised head it reads as a muzzle: its silhouette edge
 * crosses both cheeks and rings the mouth, so the figure has a snout. A
 * stylised head is one rounded mass. What separates the three silhouettes
 * above the neck is the skull's own width and depth in `proportions.ts`, plus
 * the feature traits below.
 */

/* ------------------------------------------------------------- the traits */

/**
 * What separates one silhouette's face from another's.
 *
 * All multipliers on the shared layout above rather than a second set of
 * coordinates, so a change to where the mouth sits moves it on all three. The
 * sheet in `art/refs/` is the source: the feminine figures have larger eyes,
 * finer arched brows and a narrower jaw; the masculine ones a heavier straight
 * brow set closer to the eye, a larger nose and a squarer jaw.
 */
export interface FaceTraits {
  readonly eyeSize: number
  readonly eyeSpacing: number
  readonly browWeight: number
  readonly browLift: number
  /** Radians of tilt on each brow. Positive raises the outer end. */
  readonly browArch: number
  readonly noseSize: number
  readonly mouthWidth: number
  readonly mouthFullness: number
}

export const FACES: Record<Silhouette, FaceTraits> = {
  [Silhouette.Feminine]: {
    eyeSize: 1.1,
    eyeSpacing: 0.98,
    browWeight: 0.7,
    browLift: 1.12,
    browArch: 0.18,
    noseSize: 0.84,
    mouthWidth: 1,
    mouthFullness: 1.3,
  },
  [Silhouette.Masculine]: {
    eyeSize: 0.9,
    eyeSpacing: 1.05,
    browWeight: 1.35,
    browLift: 0.84,
    browArch: 0.04,
    noseSize: 1.18,
    mouthWidth: 1.08,
    mouthFullness: 0.8,
  },
  [Silhouette.Androgynous]: {
    eyeSize: 1,
    eyeSpacing: 1,
    browWeight: 1,
    browLift: 1,
    browArch: 0.1,
    noseSize: 1,
    mouthWidth: 1,
    mouthFullness: 1,
  },
}

export function traitsFor(body: BodyProportions): FaceTraits {
  return FACES[body.silhouette]
}

/* ------------------------------------------------------------ the surface */

/** The z of an ellipsoid's front surface at a point, or 0 outside it. */
function ellipsoidZ(halfDepth: number, u: number, v: number): number {
  const inside = 1 - u * u - v * v
  return inside <= 0 ? 0 : halfDepth * Math.sqrt(inside)
}

/**
 * Where the surface of the face sits at a point on it.
 *
 * The head is one ellipsoid, so this is one line of arithmetic — and it is what
 * keeps a feature on the skin as it moves out toward the cheek or down toward
 * the chin. A flat `headDepth / 2` was fine on the box head this rig started
 * from and leaves an eye floating off a rounded one.
 *
 * @param body Whose head.
 * @param x Distance from the centre line.
 * @param y Height above the centre of the head.
 * @returns The z at which the face's surface sits there, or 0 off the head.
 */
export function faceSurfaceZ(body: BodyProportions, x: number, y = 0): number {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  return ellipsoidZ(hd / 2, x / (hw / 2), y / (hh / 2))
}

/* -------------------------------------------------------------- the parts */

function feature(
  name: string,
  at: Vec3,
  size: Vec3,
  role: ColorRole,
  extra: Partial<Part> = {},
): Part {
  return {
    name,
    shape: PartShape.Sphere,
    at,
    size,
    role,
    finish: Finish.Matte,
    segments: 16,
    ...extra,
  }
}

/**
 * A flat panel set into the face.
 *
 * Every feature except the nose is one of these. The rounded, glossy version —
 * an eyeball with a catchlight, a lip with lifted corners — read as a doll
 * rather than as a character, and the graphic one it replaced was better at a
 * glance and better on a 96-pixel head on the strip. Hard edges are the point.
 *
 * `size` is the panel's full width and height; the depth is handled here, so a
 * caller cannot accidentally put two panels on one plane.
 *
 * @param depthOrder 0 for the layer nearest the skin, 1 for the one in front of
 *   it, and so on. Each step stands 4mm further proud and reaches 5mm less far
 *   back, so no two panels ever share a face — which is the arrangement that
 *   strobes, and which five separate pairs on the old face were in.
 */
function panel(
  name: string,
  x: number,
  y: number,
  surface: number,
  size: readonly [number, number],
  role: ColorRole,
  depthOrder: number,
  extra: Partial<Part> = {},
): Part {
  const proud = 0.002 + depthOrder * 0.004
  const depth = 0.022 - depthOrder * 0.005

  return {
    name,
    shape: PartShape.Box,
    at: [x, y, surface + proud - depth / 2],
    size: [size[0], size[1], depth],
    role,
    finish: Finish.Matte,
    ...extra,
  }
}

/** The ears, in the head's frame. Level with the eyes, as ears are. */
export function earParts(body: BodyProportions): Part[] {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  return [1, -1].map((side) =>
    feature(
      side === 1 ? 'ear-right' : 'ear-left',
      [side * hw * 0.47, hh * (EYE_Y + 0.02), -hd * 0.06],
      [hw * 0.06, hh * 0.11, hd * 0.09],
      ColorRole.Skin,
    ),
  )
}

/**
 * Eyes, brows, nose and mouth, in the head's frame.
 *
 * Flat panels set into the skin, not beads glued onto it. The version this
 * replaced tried for a rounded, cute face — a glossy eyeball with a
 * catchlight, a mouth with lifted corners — and it came out as a doll: fussy
 * up close and mush at any distance. A hard-edged eye with a plain dark pupil
 * is what a stylised figure at this scale wants, and it is what the figure had
 * before anyone tried to improve on it.
 *
 * The nose is the one exception and stays a rounded bump, because a flat panel
 * on the centre line has nothing to catch the light and disappears.
 *
 * @param body The head being built, which also names the silhouette.
 * @param eyesCovered Drops the eyes and pupils, for a figure in dark glasses.
 * @returns The parts, in draw order — sclera before pupil.
 */
export function faceParts(body: BodyProportions, eyesCovered = false): Part[] {
  const { headWidth: hw, headHeight: hh } = body
  const traits = traitsFor(body)

  const eyeX = hw * 0.2 * traits.eyeSpacing
  const eyeY = hh * EYE_Y
  const eyeWidth = hw * 0.21 * traits.eyeSize
  const eyeHeight = hh * 0.115 * traits.eyeSize

  const browY = eyeY + hh * BROW_ABOVE_EYE * traits.browLift
  const noseY = eyeY - hh * NOSE_BELOW_EYE
  const mouthY = eyeY - hh * MOUTH_BELOW_EYE

  const noseRZ = 0.03 * traits.noseSize

  return [
    ...[1, -1].flatMap((side) => [
      ...(eyesCovered ? [] : [panel(
        side === 1 ? 'eye-right' : 'eye-left',
        side * eyeX,
        eyeY,
        faceSurfaceZ(body, eyeX, eyeY),
        [eyeWidth, eyeHeight],
        ColorRole.Sclera,
        0,
      )]),
      /*
       * The pupil, set off centre and toward the nose.
       *
       * Both eyes look the same way, which is what gives a face with no other
       * expression somewhere to be looking. Mirroring it makes the figure
       * cross-eyed — the same mistake the catchlight made before it.
       */
      ...(eyesCovered ? [] : [panel(
        side === 1 ? 'pupil-right' : 'pupil-left',
        side * eyeX + eyeWidth * 0.08,
        eyeY,
        faceSurfaceZ(body, eyeX, eyeY),
        [eyeWidth * 0.4, eyeHeight * 0.82],
        ColorRole.Pupil,
        1,
      )]),
      panel(
        side === 1 ? 'brow-right' : 'brow-left',
        side * eyeX,
        browY,
        faceSurfaceZ(body, eyeX, browY),
        [eyeWidth * 1.15, hh * 0.032 * traits.browWeight],
        ColorRole.Hair,
        0,
        { rotation: [0, 0, side * traits.browArch] as Vec3 },
      ),
    ]),
    feature(
      'nose',
      // Only lightly proud. A bump set half its own depth into the face is a
      // nose; one sitting almost entirely on top of it is a clown's.
      [0, noseY, faceSurfaceZ(body, 0, noseY) - noseRZ * 0.55],
      [hw * 0.085 * traits.noseSize, hh * 0.048 * traits.noseSize, noseRZ],
      ColorRole.Skin,
      { segments: 14 },
    ),
    panel(
      'mouth',
      0,
      mouthY,
      faceSurfaceZ(body, 0, mouthY),
      [hw * 0.2 * traits.mouthWidth, hh * 0.032 * traits.mouthFullness],
      ColorRole.Lip,
      0,
    ),
  ]
}
