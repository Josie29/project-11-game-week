import { describe, expect, it } from 'vitest'
import {
  BLACKJACK_ORIGIN,
  BLACKJACK_SEAT_COUNT,
  blackjackSeatFacing,
  blackjackSeatSpot,
  blackjackSeatFromId,
  BLACKJACK_SEAT_IDS,
  blackjackStandSpot,
  DEFAULT_BLACKJACK_SEAT,
  isBlackjackSeat,
  TableId,
} from '../scenes/casinoFloorLayout'
import { SEAT_SPOTS } from '../scenes/tableLayout'
import {
  claimRefused,
  freeSeats,
  seatOf,
  seatOrDefault,
  showsOwnChips,
  takenSeats,
} from '../world/seating'

/*
 * Seating, which is entirely invisible.
 *
 * Two players drawn one inside the other and two players drawn on their own
 * stools are the same still image until you count the chairs — which is exactly
 * how blackjack shipped for months with every player rendered on the middle
 * stool whatever seat they held.
 */

const ME = 'me'
const THEM = 'them'

describe('who is sitting where', () => {
  /*
   * The bug, stated directly.
   *
   * Every player used to be drawn at `SEATS[Blackjack]` — the middle stool —
   * whatever seat they actually held, so two people at one table were rendered
   * in the same cubic metre. Distinct seats must mean distinct places to stand,
   * or none of the rest of this matters.
   */
  it('never puts two seats in the same place', () => {
    const spots = Array.from({ length: BLACKJACK_SEAT_COUNT }, (_, seat) => blackjackSeatSpot(seat))

    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        const apart = Math.hypot(spots[a]![0] - spots[b]![0], spots[a]![2] - spots[b]![2])
        expect(apart, `seats ${a} and ${b} are on top of each other`).toBeGreaterThan(1)
      }
    }
  })

  // A stool and the floor you stand on to be offered it belong to each other.
  // Reading them from two lists is how a prompt ends up in front of the wrong
  // chair, and nothing on screen says so.
  it('lines every stand spot up with its own stool', () => {
    for (let seat = 0; seat < BLACKJACK_SEAT_COUNT; seat++) {
      const stool = blackjackSeatSpot(seat)
      const stand = blackjackStandSpot(seat)

      expect(stand[0]).toBe(stool[0])
      // Behind it, on the room side, or the prompt is inside the table.
      expect(stand[2]).toBeGreaterThan(stool[2])
    }
  })

  /*
   * The stool, its betting spot and its turn all have to be the same seat.
   *
   * `PLAYER_SEATS` is the furniture, `SEAT_SPOTS` is where that seat's cards go
   * and the engine plays seats in ascending index order. If the two lists ran
   * in opposite directions a player would sit behind somebody else's hand while
   * the table dealt itself backwards, and every frame of it would look fine.
   */
  it('keeps stools, betting spots and turn order in one order', () => {
    const stoolX = Array.from({ length: BLACKJACK_SEAT_COUNT }, (_, seat) => blackjackSeatSpot(seat)[0])
    const feltX = SEAT_SPOTS.map((spot) => spot.x)

    expect(stoolX).toEqual([...stoolX].sort((a, b) => a - b))
    expect(feltX).toEqual([...feltX].sort((a, b) => a - b))
    expect(feltX).toHaveLength(stoolX.length)
  })

  // Square to the dealer is right for the middle seat only. At third base it
  // seats the player side-on to their own cards, looking down the empty end of
  // the felt — and the stool underneath them faces the other way.
  it('turns every seat toward the table', () => {
    // The value the middle seat has always had, and every capture with it.
    expect(blackjackSeatFacing(DEFAULT_BLACKJACK_SEAT)).toBeCloseTo(Math.PI)

    const [centerX, , centerZ] = BLACKJACK_ORIGIN

    for (let seat = 0; seat < BLACKJACK_SEAT_COUNT; seat++) {
      const facing = blackjackSeatFacing(seat)
      const [x, , z] = blackjackSeatSpot(seat)

      /*
       * Asserted as a direction rather than as an angle, because angles wrap:
       * first base and third base are turned opposite ways and their raw values
       * straddle ±π, so comparing the numbers says they are turned the same way.
       * A dot product does not care where the branch cut is.
       */
      const forward = [Math.sin(facing), Math.cos(facing)]
      const toTable = [centerX - x, centerZ - z]
      const alignment =
        (forward[0]! * toTable[0]! + forward[1]! * toTable[1]!) / Math.hypot(...toTable)

      expect(alignment, `seat ${seat} faces away from the table`).toBeGreaterThan(0.99)
    }
  })

  // Every `?boot=` link seats the player without naming a seat, so the fallback
  // is what keeps every capture of a hand framing what it always framed.
  it('seats a lone player where one player has always sat', () => {
    expect(seatOrDefault(null)).toBe(DEFAULT_BLACKJACK_SEAT)
    expect(seatOrDefault(4)).toBe(4)
    // Off the wire, so nonsense has to land somewhere drawable.
    expect(seatOrDefault(99)).toBe(DEFAULT_BLACKJACK_SEAT)
    expect(seatOrDefault(-1)).toBe(DEFAULT_BLACKJACK_SEAT)
  })

  it('recognises only the seats the table has', () => {
    expect(isBlackjackSeat(0)).toBe(true)
    expect(isBlackjackSeat(BLACKJACK_SEAT_COUNT - 1)).toBe(true)
    expect(isBlackjackSeat(BLACKJACK_SEAT_COUNT)).toBe(false)
    expect(isBlackjackSeat(1.5)).toBe(false)
    expect(isBlackjackSeat('2')).toBe(false)
    expect(isBlackjackSeat(null)).toBe(false)
  })

  // The prompt ids and the seats they name are one list. A prompt that maps to
  // no seat sits the player at the default one, silently.
  it('maps every prompt id back to its own seat', () => {
    BLACKJACK_SEAT_IDS.forEach((id, seat) => expect(blackjackSeatFromId(id)).toBe(seat))
    expect(blackjackSeatFromId('craps')).toBe(-1)
    expect(blackjackSeatFromId('exit')).toBe(-1)
  })
})

describe('the room’s seat map', () => {
  it('finds a player’s own seat, and says when they have none', () => {
    expect(seatOf({ 1: ME, 3: THEM }, ME)).toBe(1)
    expect(seatOf({ 1: ME, 3: THEM }, THEM)).toBe(3)
    expect(seatOf({ 1: ME }, THEM)).toBeNull()
    expect(seatOf({}, ME)).toBeNull()
  })

  /*
   * Your own seat is not "taken".
   *
   * Counting it would offer you every stool but the one you are on — and would
   * hide it from you the moment you stood up, because the map still has you in
   * it until the room says otherwise.
   */
  it('counts other people’s seats and not your own', () => {
    expect(takenSeats({ 0: ME, 4: THEM }, ME)).toEqual(new Set([4]))
    expect(freeSeats({ 0: ME, 4: THEM }, ME)).toEqual([0, 1, 2, 3])
  })

  // Playing alone there is no room and no map, so every seat is free — which is
  // what leaves a solo game exactly as it was.
  it('leaves every seat free with no room at all', () => {
    expect(freeSeats({}, null)).toHaveLength(BLACKJACK_SEAT_COUNT)
    expect(takenSeats({}, null).size).toBe(0)
  })

  /*
   * Two people can press F at one stool inside a single round trip, and both
   * clients believe they are sitting until the map comes back. The one the room
   * did not seat has to find out — otherwise they play the round drawn inside
   * somebody else, holding a panel that is never given a turn.
   */
  it('tells the loser of a contested seat that they did not get it', () => {
    expect(claimRefused({ 2: THEM }, 2, ME)).toBe(true)
    expect(claimRefused({ 2: ME }, 2, ME)).toBe(false)
  })

  /*
   * ...and an empty map is not a refusal.
   *
   * It is a table nobody has reported on yet. Reading it as one would stand
   * every player up in the gap between sitting down and the room answering,
   * which is every single time anybody sits down.
   */
  it('does not stand a player up before the room has answered', () => {
    expect(claimRefused({}, 2, ME)).toBe(false)
    expect(claimRefused({ 2: THEM }, 2, null)).toBe(false)
    expect(claimRefused({ 2: THEM }, null, ME)).toBe(false)
  })
})

describe('the player’s own chips', () => {
  /*
   * The bug, stated directly: a tray of chips sitting on an empty blackjack
   * table, in front of an empty stool, for the whole time anyone walked the
   * floor. Both tables stay mounted while the player is in the room, and the
   * felt asked `seatOrDefault(activeSeat)` — which answers "the middle stool"
   * for somebody who is not sitting anywhere at all.
   */
  it('are not on the felt when nobody is at the table', () => {
    expect(showsOwnChips(null, null, 1)).toBe(false)
  })

  // Nor when the player is at the other table in the same room, which is drawn
  // at the same time and would otherwise leave their money behind them.
  it('are not on the felt while their owner is at craps', () => {
    expect(showsOwnChips(TableId.Craps, null, 1)).toBe(false)
    expect(showsOwnChips(TableId.Craps, DEFAULT_BLACKJACK_SEAT, 1)).toBe(false)
  })

  // Sat at the middle stool alone: the tray is drawn, exactly as it always was.
  it('are on the felt for a lone player at the middle stool', () => {
    expect(showsOwnChips(TableId.Blackjack, DEFAULT_BLACKJACK_SEAT, 1)).toBe(true)
    // `?boot=` links seat the player without naming a stool.
    expect(showsOwnChips(TableId.Blackjack, null, 1)).toBe(true)
  })

  /*
   * ...and nowhere else. The well is authored in the one band of the player's
   * half that is clear of everything, and that band is in front of the middle
   * seat — so anywhere else it is a tray parked in front of a neighbour.
   */
  it('are not on the felt at any other stool, or at a shared table', () => {
    expect(showsOwnChips(TableId.Blackjack, 0, 1)).toBe(false)
    expect(showsOwnChips(TableId.Blackjack, BLACKJACK_SEAT_COUNT - 1, 1)).toBe(false)
    expect(showsOwnChips(TableId.Blackjack, DEFAULT_BLACKJACK_SEAT, 2)).toBe(false)
  })
})

describe('a seat read off a URL', () => {
  /*
   * `?seat=` is how a capture picks a stool, and `bootShortcut` reads it with
   * `URLSearchParams.get`, which answers `null` for a parameter nobody passed.
   * `Number(null)` is 0 — first base, and a seat this table really has — so
   * every link that did not name a stool seated the player at the end of the
   * table. Every regression capture taken through one was of the wrong seat
   * and looked entirely plausible. `Number('')` is 0 as well, so `?seat=` with
   * nothing after it lands in the same place — which is what this test found.
   *
   * The reading is duplicated here rather than imported because
   * `bootShortcut.ts` reaches for `window` at module scope. What is asserted is
   * the coercion, which is where it went wrong.
   */
  const seatFromParam = (raw: string | null): number => {
    const named = raw?.trim()
    if (!named) return DEFAULT_BLACKJACK_SEAT

    const seat = Number(named)
    return isBlackjackSeat(seat) ? seat : DEFAULT_BLACKJACK_SEAT
  }

  it('takes the default stool when no seat is named', () => {
    expect(seatFromParam(null)).toBe(DEFAULT_BLACKJACK_SEAT)
  })

  it('still reads first base when it is asked for', () => {
    expect(seatFromParam('0')).toBe(0)
    expect(seatFromParam(String(BLACKJACK_SEAT_COUNT - 1))).toBe(BLACKJACK_SEAT_COUNT - 1)
  })

  // A link is user-writable like any other input off the wire.
  it('falls back to the default for anything that is not a seat', () => {
    expect(seatFromParam('')).toBe(DEFAULT_BLACKJACK_SEAT)
    expect(seatFromParam('nine')).toBe(DEFAULT_BLACKJACK_SEAT)
    expect(seatFromParam(String(BLACKJACK_SEAT_COUNT))).toBe(DEFAULT_BLACKJACK_SEAT)
    expect(seatFromParam('-1')).toBe(DEFAULT_BLACKJACK_SEAT)
  })
})
