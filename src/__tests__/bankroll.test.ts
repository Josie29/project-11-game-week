import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STARTING_BANKROLL, useGameStore } from '../store/useGameStore'
import { donationTimeline, NurseTask } from '../scenes/clinicRoutine'
import { DONATION_FEE, MARKER_AMOUNT } from '../world/money'

/*
 * The store's money rules, as opposed to the arithmetic in `money.ts`.
 *
 * These are integration-level on purpose: they drive the real store the way the
 * panels do, because the bugs worth catching here are about which path a credit
 * takes, not about the sums.
 */

function reset(): void {
  useGameStore.setState({
    bankroll: STARTING_BANKROLL,
    debt: 0,
    atChair: null,
    donation: null,
  })
}

describe('markers', () => {
  beforeEach(reset)

  it('hands over the money and books the debt', () => {
    useGameStore.getState().takeMarker()

    expect(useGameStore.getState().bankroll).toBe(STARTING_BANKROLL + MARKER_AMOUNT)
    expect(useGameStore.getState().debt).toBe(MARKER_AMOUNT)
  })

  // One at a time. Without this the player can stack markers until no run of
  // wins can clear them, which turns the floor under them into a hole.
  it('refuses a second marker while one is outstanding', () => {
    useGameStore.getState().takeMarker()
    useGameStore.getState().takeMarker()
    useGameStore.getState().takeMarker()

    expect(useGameStore.getState().debt).toBe(MARKER_AMOUNT)
    expect(useGameStore.getState().bankroll).toBe(STARTING_BANKROLL + MARKER_AMOUNT)
  })

  // The marker has to be escapable, and it has to stop taking a cut the moment
  // it is square — otherwise the house keeps skimming a debt of zero forever.
  it('is cleared by winning, and then stops taking a cut', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()

    for (let win = 0; win < 40 && useGameStore.getState().debt > 0; win++) {
      useGameStore.getState().creditWinnings(100, 0)
    }

    expect(useGameStore.getState().debt).toBe(0)

    const before = useGameStore.getState().bankroll
    useGameStore.getState().creditWinnings(100, 0)
    expect(useGameStore.getState().bankroll).toBe(before + 100)
  })

  /*
   * The marker takes half of what is *won*, never a cut of the stake coming
   * home. Payouts include the stake, so splitting the gross made the round-trip
   * of a bet look like a win: a $20 push handed the house $10 of the player's
   * own money, and an even-money win paid the player nothing at all. Being
   * charged to break even is the fastest way to make the marker unescapable,
   * which is exactly what it must not be.
   */
  it('leaves a pushed stake alone while a marker is outstanding', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()
    const { bankroll, debt } = useGameStore.getState()

    // A $20 push pays $20 back, all of it stake.
    useGameStore.getState().creditWinnings(20, 20)

    expect(useGameStore.getState().bankroll).toBe(bankroll + 20)
    expect(useGameStore.getState().debt).toBe(debt)
  })

  it('splits only the winnings, not the returned stake', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()
    const { bankroll, debt } = useGameStore.getState()

    // $100 wagered, won at even money: $200 back, of which $100 is winnings.
    const credited = useGameStore.getState().creditWinnings(200, 100)

    expect(credited).toBe(150) // Stake back in full, half the profit.
    expect(useGameStore.getState().bankroll).toBe(bankroll + 150)
    expect(useGameStore.getState().debt).toBe(debt - 50)
  })

  // A losing round still pays out on the hands that survived, and the stake
  // figure the caller passes covers every hand including the dead ones. The
  // credit has to be clamped to what was actually returned or the marker's cut
  // goes negative and starts inventing money.
  it('never credits more than was paid out when hands were lost', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()
    const { bankroll, debt } = useGameStore.getState()

    // Two hands of $10: one pushed, one lost. $10 back against $20 staked.
    const credited = useGameStore.getState().creditWinnings(10, 20)

    expect(credited).toBe(10)
    expect(useGameStore.getState().bankroll).toBe(bankroll + 10)
    expect(useGameStore.getState().debt).toBe(debt)
  })
})

describe('donations', () => {
  beforeEach(reset)

  it('pays the fee', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().donate()

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
  })

  /*
   * No cooldown, by design: the ten seconds in the chair is the whole cost.
   *
   * This replaced a once-a-day gate. The gate is what stopped the clinic
   * out-earning the tables, so the tables are now the slower way to make money
   * — which is a deliberate choice rather than an oversight, and this test is
   * here so that changing it back is a decision somebody has to make on purpose.
   */
  it('pays every single time, with no cooldown', () => {
    useGameStore.setState({ bankroll: 0 })

    for (let pint = 1; pint <= 5; pint++) {
      useGameStore.getState().donate()
      expect(useGameStore.getState().bankroll).toBe(DONATION_FEE * pint)
    }
  })

  // A donation must reach the player whatever they owe. Routing it through the
  // debt split would mean a broke player in debt donates and receives half of
  // it — or with a large enough marker, nothing at all — leaving them stuck
  // with no way out at the one place that exists to give them one.
  it('pays out in full even while a marker is outstanding', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()
    useGameStore.setState({ bankroll: 0 })

    useGameStore.getState().donate()

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
    expect(useGameStore.getState().debt).toBe(MARKER_AMOUNT)
  })
})

describe('the draw', () => {
  beforeEach(() => {
    reset()
    vi.useFakeTimers()
    useGameStore.setState({ atChair: 0, donation: null, nurseTask: NurseTask.Patrolling })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pays nothing until the nurse has finished', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()

    const { needleAt, completeAt } = donationTimeline()

    vi.advanceTimersByTime(needleAt)
    expect(useGameStore.getState().bankroll).toBe(0)

    vi.advanceTimersByTime(completeAt - needleAt)
    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
  })

  /*
   * The case the guard exists for, and the one no screenshot can show.
   *
   * Standing up mid-needle has to pay nothing. Without the guard the money
   * arrives seconds later, from a nurse who is no longer beside anybody — and
   * ten seconds is a long time to leave that hanging.
   */
  it('pays nothing if the player gets up mid-draw', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()

    vi.advanceTimersByTime(donationTimeline().needleAt)
    useGameStore.getState().leaveChair()

    vi.advanceTimersByTime(20_000)

    expect(useGameStore.getState().bankroll).toBe(0)
    expect(useGameStore.getState().donation).toBeNull()
  })

  // ...and having walked away, sitting down again offers it afresh.
  it('can be started again after being abandoned', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()
    useGameStore.getState().leaveChair()

    useGameStore.setState({ atChair: 2 })
    useGameStore.getState().beginDonation()
    vi.advanceTimersByTime(donationTimeline().completeAt)

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
  })

  // Mashing the button must not stack sequences and pay several times over.
  it('ignores a second start while one is running', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()
    useGameStore.getState().beginDonation()
    useGameStore.getState().beginDonation()

    vi.advanceTimersByTime(donationTimeline().completeAt + 5000)

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
  })

  it('does nothing at all unless the player is in a chair', () => {
    useGameStore.setState({ bankroll: 0, atChair: null })
    useGameStore.getState().beginDonation()

    expect(useGameStore.getState().donation).toBeNull()
    vi.advanceTimersByTime(20_000)
    expect(useGameStore.getState().bankroll).toBe(0)
  })
})
