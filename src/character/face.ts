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
const BROW_ABOVE_EYE = 0.115
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
    browArch: 0.13,
    noseSize: 0.84,
    mouthWidth: 1,
    mouthFullness: 1.3,
  },
  [Silhouette.Masculine]: {
    eyeSize: 0.9,
    eyeSpacing: 1.05,
    browWeight: 1.35,
    browLift: 0.84,
    browArch: 0.05,
    noseSize: 1.18,
    mouthWidth: 1.08,
    mouthFullness: 0.8,
  },
  [Silhouette.Androgynous]: {
    eyeSize: 1,
    eyeSpacing: 1,
    browWeight: 1,
    browLift: 1,
    browArch: 0.09,
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
 * How far proud of the skin a panel stands.
 *
 * Two millimetres: enough that a feature is not swallowed by the skin it lies
 * on, and two orders of magnitude clear of what the depth buffer can resolve at
 * this camera.
 */
const PANEL_PROUD = 0.002

/**
 * The outward normal of the skull at a point on it, as an Euler pitch and yaw.
 *
 * This is the whole of the B1 fix, and it is worth saying why the obvious
 * approaches are wrong. A face panel is a flat box laid on a curved head. Left
 * facing square down +Z it sits tangent to the skull only on the centre line,
 * and out at the eye the surface has already turned away — so the panel's outer
 * corners stood the better part of two centimetres proud of the head, and from
 * any angle past three-quarters the far eye rendered as a white rectangle
 * *outside* the head's own silhouette. From the front the head hid it, which is
 * why every capture this project ever took of a face missed it.
 *
 * Pushing the panel back until its corners are inside the skull is the first
 * thing anyone tries and it is worse: the panel is then buried by however far
 * the surface fell away across it, and what shows is a sliver of eye at each
 * end with the middle of it inside the head. That was tried here and the
 * capture came back with no eyes at all.
 *
 * Turning it to face along the surface normal is the answer, and it is cheap.
 * A tangent rectangle's corners stand proud by the sagitta — about half a width
 * squared over the radius — which for an eye on this head is three millimetres
 * rather than seventeen.
 *
 * @param body Whose head.
 * @param x Distance from the centre line.
 * @param y Height above the centre of the head.
 * @returns The Euler pitch and yaw that face a part along it, and the normal.
 */
function surfaceNormal(
  body: BodyProportions,
  x: number,
  y: number,
): { readonly pitch: number; readonly yaw: number; readonly normal: Vec3 } {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body
  const [a, b, c] = [hw / 2, hh / 2, hd / 2]

  const z = faceSurfaceZ(body, x, y)
  // The gradient of an ellipsoid, which is its outward normal.
  const raw: Vec3 = [x / (a * a), y / (b * b), Math.max(z, 1e-6) / (c * c)]
  const length = Math.hypot(raw[0], raw[1], raw[2])
  const normal: Vec3 = [raw[0] / length, raw[1] / length, raw[2] / length]

  /*
   * Euler XYZ turns a point by Z, then Y, then X, so a part's own +Z ends up at
   * `(sin q, −cos q · sin p, cos q · cos p)`. Solving that for the normal gives
   * the pair below — the same arithmetic in reverse. The roll a caller passes
   * is applied first and so stays a turn within the panel's own plane, which is
   * what an arched brow wants.
   */
  return {
    pitch: Math.atan2(-normal[1], normal[2]),
    yaw: Math.asin(Math.max(-1, Math.min(1, normal[0]))),
    normal,
  }
}

/**
 * A flat panel set into the face, lying along the surface.
 *
 * Every feature except the nose is one of these. The rounded, glossy version —
 * an eyeball with a catchlight, a lip with lifted corners — read as a doll
 * rather than as a character, and the graphic one it replaced was better at a
 * glance and better on a 96-pixel head on the strip. Hard edges are the point.
 *
 * `size` is the panel's full width and height; the depth and the turn are
 * handled here, so a caller cannot accidentally put two panels on one plane or
 * leave one standing square off a cheek.
 *
 * @param depthOrder 0 for the layer nearest the skin, 1 for the one in front of
 *   it, and so on. Each step stands 4mm further proud and reaches 5mm less far
 *   back, so no two panels ever share a face — which is the arrangement that
 *   strobes, and which five separate pairs on the old face were in.
 * @param roll Turn within the plane of the face, for a brow's arch.
 */
function panel(
  body: BodyProportions,
  name: string,
  x: number,
  y: number,
  size: readonly [number, number],
  role: ColorRole,
  depthOrder: number,
  roll = 0,
): Part {
  const proud = PANEL_PROUD + depthOrder * 0.004
  const depth = 0.022 - depthOrder * 0.005
  const { pitch, yaw, normal } = surfaceNormal(body, x, y)

  // Out along the normal far enough that the panel's front face stands `proud`
  // of the skin and the rest of it is buried in the skull.
  const out = proud - depth / 2

  return {
    name,
    shape: PartShape.Box,
    at: [
      x + normal[0] * out,
      y + normal[1] * out,
      faceSurfaceZ(body, x, y) + normal[2] * out,
    ],
    size: [size[0], size[1], depth],
    rotation: [pitch, yaw, roll],
    role,
    finish: Finish.Matte,
  }
}

/**
 * How far the furthest corner of a panel sits below its own tangent plane.
 *
 * Exported for the assertion that holds the whole arrangement. A panel lying
 * along the surface still stands proud at its corners, by the sagitta, and a
 * test needs to know how much is expected rather than guessing at a tolerance
 * — a tolerance loose enough to admit the sagitta would also admit the
 * seventeen-millimetre version this replaced.
 *
 * @param body Whose head.
 * @param x Centre of the panel, from the centre line.
 * @param y Centre of the panel, above the centre of the head.
 * @param size The panel's full width and height.
 * @returns How far the skull has receded at the furthest corner, in world units.
 */
export function panelSagitta(
  body: BodyProportions,
  x: number,
  y: number,
  size: readonly [number, number],
): number {
  const { normal } = surfaceNormal(body, x, y)
  const centre: Vec3 = [x, y, faceSurfaceZ(body, x, y)]

  let deepest = 0
  for (const dx of [-size[0] / 2, size[0] / 2]) {
    for (const dy of [-size[1] / 2, size[1] / 2]) {
      const corner: Vec3 = [x + dx, y + dy, faceSurfaceZ(body, x + dx, y + dy)]
      // How far below the tangent plane at the centre this corner has fallen:
      // the offset from the centre, projected onto the inward normal.
      const drop =
        (centre[0] - corner[0]) * normal[0] +
        (centre[1] - corner[1]) * normal[1] +
        (centre[2] - corner[2]) * normal[2]
      deepest = Math.max(deepest, drop)
    }
  }

  return deepest
}

/**
 * The ears, in the head's frame. Level with the eyes, as ears are.
 *
 * Set back behind the cheek and given a rim. As one plain ellipsoid level with
 * the eye they read as a pale oval stuck on the side of the face — an earbud,
 * or a blemish — and being that far forward they also sat in front of the
 * hairline on every style, so on anything with volume the ear floated on the
 * surface of the hair rather than under it. An ear is behind the jaw hinge, and
 * what makes it recognisable at any distance is that it is a rim round a hollow.
 */
export function earParts(body: BodyProportions): Part[] {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  const earX = hw * 0.455
  const earY = hh * (EYE_Y + 0.01)
  const earZ = -hd * 0.16

  return [1, -1].flatMap((side) => [
    feature(
      side === 1 ? 'ear-right' : 'ear-left',
      [side * earX, earY, earZ],
      [hw * 0.052, hh * 0.1, hd * 0.075],
      ColorRole.Skin,
      { segments: 18 },
    ),
    /*
     * The hollow: a smaller mass set inside the rim.
     *
     * Shallower and further in than the first attempt, which sat proud enough
     * to catch its own shadow and read from the side as a dark slot punched
     * through the head. An ear's interior is a soft dish, not a hole.
     */
    feature(
      side === 1 ? 'ear-bowl-right' : 'ear-bowl-left',
      [side * earX * 0.99, earY, earZ - hd * 0.004],
      [hw * 0.026, hh * 0.05, hd * 0.03],
      ColorRole.Skin,
      { segments: 14 },
    ),
  ])
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

  const eyeX = hw * 0.205 * traits.eyeSpacing
  const eyeY = hh * EYE_Y
  const eyeWidth = hw * 0.2 * traits.eyeSize
  // Shorter than it was, and the lash line above takes another slice off it.
  // A tall rectangle of pure white is a googly eye at any size.
  const eyeHeight = hh * 0.096 * traits.eyeSize

  const browY = eyeY + hh * BROW_ABOVE_EYE * traits.browLift
  const noseY = eyeY - hh * NOSE_BELOW_EYE
  const mouthY = eyeY - hh * MOUTH_BELOW_EYE

  /*
   * The nose stands proud enough to break the head's own outline at 90 degrees.
   *
   * In profile the face was a plain egg: the bump was set half its own depth
   * into the skull, which is right for keeping it from reading as a clown's
   * nose from the front and leaves nothing at all to see from the side. A
   * profile is half the angles a turntable passes through.
   */
  const noseRZ = 0.042 * traits.noseSize

  return [
    ...[1, -1].flatMap((side) => [
      ...(eyesCovered ? [] : [panel(
        body,
        side === 1 ? 'eye-right' : 'eye-left',
        side * eyeX,
        eyeY,
        [eyeWidth, eyeHeight],
        ColorRole.Sclera,
        0,
      )]),
      /*
       * The pupil, centred.
       *
       * It used to be set off toward one side so the figure had somewhere to be
       * looking, and every version of that offset read as a sideways glance
       * rather than as a look — at a twelfth of the eye's width it was already
       * a hard one, and the eye is only sixty pixels across at the distance
       * this is judged from. A figure looking straight out is what a character
       * creator wants anyway: the player is looking back at it.
       */
      ...(eyesCovered ? [] : [panel(
        body,
        side === 1 ? 'pupil-right' : 'pupil-left',
        side * eyeX,
        eyeY,
        [eyeWidth * 0.44, eyeHeight * 0.86],
        ColorRole.Pupil,
        1,
      )]),
      /*
       * The lash line, which is what stops an eye reading as googly.
       *
       * A plain white rectangle with a dark bar in it is an eyeball; the thing
       * that makes a drawn eye read as a *look* is the dark line along its top
       * lid. It costs one panel, it crops the sclera at the top where a lid
       * would, and on this cast it is the single cheapest bit of glamour there
       * is — a lash line is most of what a made-up eye is.
       */
      ...(eyesCovered ? [] : [panel(
        body,
        side === 1 ? 'lash-right' : 'lash-left',
        side * eyeX,
        eyeY + eyeHeight * 0.46,
        [eyeWidth * 1.06, hh * 0.016 * traits.eyeSize],
        ColorRole.Hair,
        2,
      )]),
      /*
       * The brow in two pieces, with a peak between them.
       *
       * One straight bar cannot arch, and the two things a straight bar *can*
       * do are both expressions: tilted up toward the temple it is a scowl,
       * tilted down toward it a worried face. Both shipped here in turn, and
       * both were read off a capture and flipped, which only swapped one for
       * the other.
       *
       * A brow rises from the inner end to a peak about two thirds out and
       * falls away to the tail. Two segments is the fewest that has a peak at
       * all, and a peak is the whole difference between a face that looks like
       * someone and a face that looks cross.
       */
      panel(
        body,
        side === 1 ? 'brow-right' : 'brow-left',
        side * eyeX * 0.86,
        browY,
        [eyeWidth * 0.86, hh * 0.024 * traits.browWeight],
        ColorRole.Hair,
        0,
        /*
         * Positive on the `+x` side, which is the sign that arches a brow.
         *
         * Worth writing down rather than leaving as a bare `side *`, because
         * this project has now got a rotation's sign wrong three times —
         * `IDLE_ARM_SPLAY` put both hands inside the hips, and this one was
         * flipped once in the wrong direction on the strength of a forty-pixel
         * capture. A brow that slopes *down* toward the temple is a worried
         * face, not a neutral one, and at this size the only way to tell which
         * way it slopes is to zoom in far enough to see it.
         *
         * The roll is applied first, in the panel's own plane, because Euler
         * XYZ turns a point by Z before Y — see `surfaceNormal`.
         */
        side * traits.browArch,
      ),
      panel(
        body,
        side === 1 ? 'brow-tail-right' : 'brow-tail-left',
        side * eyeX * 1.44,
        browY + hh * 0.012 * traits.browArch,
        [eyeWidth * 0.46, hh * 0.021 * traits.browWeight],
        ColorRole.Hair,
        1,
        -side * traits.browArch * 1.3,
      ),
    ]),
    feature(
      'nose',
      // Only lightly proud. A bump set half its own depth into the face is a
      // nose; one sitting almost entirely on top of it is a clown's.
      [0, noseY, faceSurfaceZ(body, 0, noseY) - noseRZ * 0.34],
      [hw * 0.09 * traits.noseSize, hh * 0.05 * traits.noseSize, noseRZ],
      ColorRole.Skin,
      { segments: 14 },
    ),
    panel(
      body,
      'mouth',
      0,
      mouthY,
      [hw * 0.155 * traits.mouthWidth, hh * 0.038 * traits.mouthFullness],
      ColorRole.Lip,
      0,
    ),
  ]
}
