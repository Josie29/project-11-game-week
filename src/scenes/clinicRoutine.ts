/*
 * What the clinic's staff do, and how long a draw takes.
 *
 * Pure and asserted, the sixth of these on the project. Two separate things
 * live here for the same reason:
 *
 * - The nurse's waypoints, because they are hand-placed 3D coordinates and a
 *   waypoint inside a recliner walks her through the furniture.
 * - The draw's timing, because ordering is exactly what a screenshot cannot
 *   check. `revealTimeline.ts` exists for that reason and this is its twin.
 */

import { CHAIR_COUNT, CHAIR_X, CHAIR_Z, DESK } from './clinicLayout'

/** What the nurse is doing. */
export enum NurseTask {
  /** Walking her round, because nobody is donating. */
  Patrolling = 'patrolling',
  /** On her way to a chair the player has just sat down in. */
  Approaching = 'approaching',
  /** Swabbing, then the needle. */
  Working = 'working',
  /** Heading back to her round. */
  Returning = 'returning',
}

/**
 * How far out from the chairs the nurse stands to work.
 *
 * Just clear of the recliner's footprint and no further. She has one arm's
 * reach, and at a comfortable-looking distance her hand stopped well short of
 * the donor's — she read as standing near someone rather than working on them.
 *
 * Offset along the row as well, toward the tray: standing squarely beside the
 * chair put her on the same square as the donor, who approaches from out front.
 */
const STATION_OFFSET_X = 0.95

/** Toward the chair's tray arm, which is the end she actually works at. */
const STATION_OFFSET_Z = -0.5

/**
 * The round she walks when nobody needs her.
 *
 * Down the open floor past the chairs, across by the desk, round the vending
 * machine and back. Kept out in the room rather than hugging the walls, so she
 * is visible from the door rather than lurking in a corner.
 */
export const NURSE_PATROL: readonly (readonly [number, number])[] = [
  [-1.6, -2.6],
  [-1.4, 1.6],
  [1.2, 3.4],
  [3.2, 1.4],
  [2.6, -1.6],
  [0.2, -2.8],
]

/** Seconds to walk one leg of the round. Unhurried; she works here. */
export const PATROL_LEG_MS = 3200

/** A beat at each waypoint, so the round does not read as a conveyor belt. */
export const PATROL_PAUSE_MS = 900

/**
 * Where the nurse stands to work on a given chair.
 *
 * Out on the floor side, where the chair's tray arm is — and deliberately not
 * where the *player* stands to be offered that chair, or she would walk into
 * them on arrival.
 */
export function nurseStationFor(chairIndex: number): readonly [number, number] {
  return [CHAIR_X + STATION_OFFSET_X, (CHAIR_Z[chairIndex] ?? 0) + STATION_OFFSET_Z]
}

export interface DonationTimeline {
  /** When she reaches the chair. */
  readonly arriveAt: number
  /** When the swab happens. */
  readonly swabAt: number
  /** When the needle goes in and the draw starts. */
  readonly needleAt: number
  /** When it is done, the money lands and the day is stamped. */
  readonly completeAt: number
}

/**
 * How long she takes to walk over, hook you up and draw.
 *
 * Travel is a fixed duration rather than a fixed speed. The four chairs are
 * different distances from wherever she happens to be on her round, and the
 * payout hangs off `completeAt` — at a fixed speed the animation and the
 * timeline would disagree by chair, which shows up as the nurse still walking
 * when the money lands.
 */
export const NURSE_TRAVEL_MS = 2000
const SWAB_MS = 700
const NEEDLE_MS = 600
/*
 * The draw itself, which is where all the waiting lives.
 *
 * The whole procedure runs to ten seconds. Padding the walk over or the swab
 * would just look like the staff dawdling; the bag filling is the part that is
 * *supposed* to take a while, so the time goes here.
 */
const DRAW_MS = 6700

export function donationTimeline(): DonationTimeline {
  const arriveAt = NURSE_TRAVEL_MS
  const swabAt = arriveAt + SWAB_MS
  const needleAt = swabAt + NEEDLE_MS

  return { arriveAt, swabAt, needleAt, completeAt: needleAt + DRAW_MS }
}

/** How far through the draw itself, 0 to 1, at `elapsed` ms into the sequence. */
export function drawProgress(elapsed: number): number {
  const { needleAt, completeAt } = donationTimeline()
  if (elapsed <= needleAt) return 0
  if (elapsed >= completeAt) return 1

  return (elapsed - needleAt) / (completeAt - needleAt)
}

/** Points the nurse must be able to stand on, for the layout tests. */
export function nurseStations(): readonly (readonly [number, number])[] {
  return Array.from({ length: CHAIR_COUNT }, (_, index) => nurseStationFor(index))
}

/** Somewhere out of the way for her to wait, used as the patrol's start. */
export const NURSE_HOME: readonly [number, number] = [DESK[0] - 2.2, DESK[2] - 1.4]
