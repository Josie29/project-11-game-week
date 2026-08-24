export enum Gesture {
  /** Two taps of the fingers on the felt — the signal for a card. */
  TapTable = 'tapTable',
  /** Flat hand waved horizontally over the cards — no more cards. */
  WaveFlat = 'waveFlat',
  /** One finger laid beside the bet — doubling down. */
  PointOne = 'pointOne',
  /** Two fingers spread apart — splitting the pair. */
  SpreadTwo = 'spreadTwo',
  /** Reach to the stash and push chips out to the betting spot. */
  PushChips = 'pushChips',
  /** Reach out to the felt and sweep winnings back toward the body. */
  RakeChips = 'rakeChips',
  /** Dealer reaches from the rack to place a payout beside the wager. */
  DealerPay = 'dealerPay',
  /** Dealer reaches out and draws a losing wager back to the rack. */
  DealerSweep = 'dealerSweep',
}

/** Right-arm joint rotations, in radians. */
export interface ArmPose {
  readonly shoulderPitch: number
  readonly shoulderRoll: number
  readonly elbowPitch: number
}

export interface GestureDefinition {
  readonly durationMs: number
  /** Pose at normalised time `t` in [0, 1]. */
  readonly pose: (t: number) => ArmPose
}

/** Arm at rest, hanging at the player's side. */
export const REST_POSE: ArmPose = { shoulderPitch: 0, shoulderRoll: -0.12, elbowPitch: 0 }

/** Smooth 0→1 ramp with zero velocity at both ends. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Fraction of the gesture spent reaching in and pulling back.
 *
 * Every signal shares the same envelope: reach to the table, do the thing,
 * withdraw. Keeping that common means each gesture only has to describe its
 * own middle section.
 */
function reachEnvelope(t: number): number {
  return smoothstep(0, 0.22, t) * (1 - smoothstep(0.78, 1, t))
}

/** Arm extended forward and down, hand over the felt. */
const REACH_SHOULDER = -1.32
const REACH_ELBOW = -0.55

export const GESTURES: Record<Gesture, GestureDefinition> = {
  /*
   * Hit: reach to the felt and tap twice with the fingertips. The taps are a
   * forearm oscillation rather than a wrist one — at this scale a wrist flick
   * is invisible, but the forearm reads clearly.
   */
  [Gesture.TapTable]: {
    durationMs: 900,
    pose: (t) => {
      const reach = reachEnvelope(t)
      // Two full oscillations across the middle of the gesture.
      const tapWindow = smoothstep(0.22, 0.3, t) * (1 - smoothstep(0.7, 0.78, t))
      const tap = Math.sin(t * Math.PI * 4) * 0.28 * tapWindow

      return {
        shoulderPitch: REACH_SHOULDER * reach,
        shoulderRoll: REST_POSE.shoulderRoll,
        elbowPitch: (REACH_ELBOW + tap) * reach,
      }
    },
  },

  /*
   * Stand: hand comes up flat and sweeps sideways over the cards. The sweep is
   * a shoulder roll, which swings the whole forearm across — the motion a
   * dealer actually watches for.
   */
  [Gesture.WaveFlat]: {
    durationMs: 1000,
    pose: (t) => {
      const reach = reachEnvelope(t)
      const sweepWindow = smoothstep(0.2, 0.3, t) * (1 - smoothstep(0.7, 0.8, t))
      const sweep = Math.sin(t * Math.PI * 2) * 0.62 * sweepWindow

      return {
        // Flatter than a tap: the hand travels over the cards, not onto them.
        shoulderPitch: -1.5 * reach,
        shoulderRoll: REST_POSE.shoulderRoll + sweep,
        elbowPitch: -0.12 * reach,
      }
    },
  },

  /*
   * Double: one deliberate jab beside the wager and hold. Held rather than
   * repeated, so it cannot be mistaken for the double tap that means hit.
   */
  [Gesture.PointOne]: {
    durationMs: 800,
    pose: (t) => {
      const reach = reachEnvelope(t)
      return {
        shoulderPitch: (REACH_SHOULDER - 0.1) * reach,
        shoulderRoll: REST_POSE.shoulderRoll,
        elbowPitch: REACH_ELBOW * reach,
      }
    },
  },

  /*
   * Split: two fingers pushed apart. Rendered as two outward flicks of the
   * shoulder, which distinguishes it from the single held point of a double.
   */
  [Gesture.SpreadTwo]: {
    durationMs: 1000,
    pose: (t) => {
      const reach = reachEnvelope(t)
      const spreadWindow = smoothstep(0.22, 0.32, t) * (1 - smoothstep(0.68, 0.78, t))
      const spread = Math.abs(Math.sin(t * Math.PI * 2)) * 0.42 * spreadWindow

      return {
        shoulderPitch: REACH_SHOULDER * reach,
        shoulderRoll: REST_POSE.shoulderRoll - spread,
        elbowPitch: REACH_ELBOW * reach,
      }
    },
  },

  /*
   * Betting: reach sideways to the stash, then push forward to the spot. The
   * roll carries the arm out over the chips first and returns to centre as the
   * push happens, which is what separates it from a plain forward reach.
   */
  [Gesture.PushChips]: {
    durationMs: 800,
    pose: (t) => {
      const reach = reachEnvelope(t)
      // Out to the stash early, back to centre as the chips go forward.
      const toStash = 1 - smoothstep(0.25, 0.62, t)
      const push = smoothstep(0.3, 0.7, t)

      return {
        shoulderPitch: (REACH_SHOULDER - 0.16 * push) * reach,
        shoulderRoll: REST_POSE.shoulderRoll - 0.5 * toStash * reach,
        elbowPitch: (REACH_ELBOW + 0.3 * push) * reach,
      }
    },
  },

  /*
   * Collecting: reach out past the wager, then draw everything back in. The
   * elbow folds hard on the way back, which is what sells it as dragging chips
   * rather than just lowering the arm.
   */
  [Gesture.RakeChips]: {
    durationMs: 900,
    pose: (t) => {
      const reach = reachEnvelope(t)
      const pull = smoothstep(0.35, 0.8, t)

      return {
        shoulderPitch: (REACH_SHOULDER + 0.55 * pull) * reach,
        shoulderRoll: REST_POSE.shoulderRoll - 0.34 * pull * reach,
        elbowPitch: (REACH_ELBOW - 0.85 * pull) * reach,
      }
    },
  },

  /*
   * Dealer paying: reach from the rack out toward the player's spot and hold
   * briefly, as though setting chips down.
   */
  [Gesture.DealerPay]: {
    durationMs: 850,
    pose: (t) => {
      const reach = reachEnvelope(t)
      const extend = smoothstep(0.2, 0.55, t)

      return {
        shoulderPitch: (-1.24 - 0.22 * extend) * reach,
        shoulderRoll: REST_POSE.shoulderRoll + 0.22 * extend * reach,
        elbowPitch: (-0.62 + 0.42 * extend) * reach,
      }
    },
  },

  /*
   * Dealer sweeping: reach out to the losing wager and drag it back toward the
   * rack — the mirror of the player's rake.
   */
  [Gesture.DealerSweep]: {
    durationMs: 850,
    pose: (t) => {
      const reach = reachEnvelope(t)
      const drag = smoothstep(0.35, 0.82, t)

      return {
        shoulderPitch: (-1.42 + 0.5 * drag) * reach,
        shoulderRoll: REST_POSE.shoulderRoll + 0.3 * (1 - drag) * reach,
        elbowPitch: (-0.3 - 0.7 * drag) * reach,
      }
    },
  },
}
