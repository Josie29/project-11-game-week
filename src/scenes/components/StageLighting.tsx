/*
 * The dressing-room rig, shared by the designer and the contact sheets.
 *
 * Framed to match `art/refs/character_sheet.png`: a flat dark backdrop, even key
 * light from the front, and hot pink and cyan rim lights behind the figure. That
 * combination is what makes a low-poly silhouette readable, and it is the same
 * trick the strip plays with its signage.
 *
 * Shared rather than copied because a contact sheet is only useful if it shows
 * what the designer shows. Two rigs that drifted apart would mean auditing a
 * hairstyle under lighting no player ever sees.
 */

interface StageLightingProps {
  /**
   * How wide the lit area is, in world units.
   *
   * The designer lights one figure; a contact sheet lights up to five across.
   * The rim lights move out with it, or the figures at the ends of a sheet are
   * the only ones without a rim and read as a different build.
   */
  spread?: number | undefined
  /** Whether the key light casts. Off for sheets, where it is many figures. */
  shadows?: boolean | undefined
}

export function StageLighting({ spread = 1.9, shadows = true }: StageLightingProps) {
  return (
    <>
      {/*
        Brighter than the strip's rig on purpose. The palette runs to charcoal
        and midnight, and under street lighting those garments read as one black
        slab — which makes half the colour swatches look identical in the one
        place the player is choosing between them.
      */}
      <ambientLight intensity={0.7} color="#8a93c8" />

      {/* Key light, front and slightly high, so the face is not in shadow. */}
      <directionalLight
        position={[1.4, 3.2, 3]}
        intensity={2.2}
        castShadow={shadows}
        /*
         * Bias and normal bias, which the rig never had.
         *
         * Shadow acne is one of the three things that made the figure crawl as
         * it turned: an unbiased shadow map has every curved surface
         * self-shadowing in a speckle that moves with the light. It was
         * invisible in a still and obvious the moment the turntable ran. The
         * rounded rebuild makes it worse, not better — there are far more
         * grazing angles on an ellipsoid than on a box.
         */
        shadow-bias={-0.0009}
        /*
         * Raised with the figure.
         *
         * 0.02 was tuned against a 24cm head. On the stylised one it is not
         * enough and the shadow map's own depth error draws a hard arc across
         * the cheeks at nose level — read as a jaw seam, chased as geometry,
         * and it was the light all along.
         */
        shadow-normalBias={0.055}
        shadow-mapSize={[2048, 2048]}
      />

      {/*
        A dim fill from behind, which the rig never needed until now.
        The key light is front-only, which was fine for a turntable pinned at
        rotation zero. The stage can be walked round now, and the first back
        view taken of a character on it was very nearly a silhouette — the far
        side of every figure has to be lit well enough to judge, or the whole
        point of being able to turn it is lost.
      */}
      <directionalLight position={[-0.8, 3.2, -3.4]} intensity={0.5} color="#b9c2f0" />

      {/* The two rim lights that separate the figure from the backdrop. */}
      <pointLight
        position={[-spread, 1.6, -1.5]}
        intensity={9}
        distance={spread * 4}
        color="#ff2d95"
      />
      <pointLight
        position={[spread, 1.6, -1.5]}
        intensity={9}
        distance={spread * 4}
        color="#22e0ff"
      />
    </>
  )
}
