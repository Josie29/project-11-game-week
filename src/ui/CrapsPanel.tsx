import { useEffect } from 'react'
import {
  canTakeDownCrapsBet,
  chipStake,
  MAX_ODDS_MULTIPLE,
  oddsRatio,
  placeRatio,
  PLACE_UNITS,
  totalCrapsPayout,
} from '../games/craps/engine'
import { CHIP_DENOMINATIONS, heldChipValue } from '../scenes/chipLayout'
import { type CrapsState, CrapsPhase, RollOutcome } from '../games/craps/types'
import { useSharedCraps } from '../net/useSharedCraps'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { MARKER_AMOUNT } from '../world/money'
import {
  CrapsBet,
  PLACE_BETS,
  placeBetNumber,
  POINT_NUMBERS,
} from '../scenes/crapsFeltLayout'
import { getVenue, type VenueId } from '../world/venues'

/**
 * The rack, smallest first, so the number keys read left to right.
 *
 * `CHIP_DENOMINATIONS` is declared largest first because that is the order a
 * payout is broken into chips. A rack is read the other way.
 */
const RACK = [...CHIP_DENOMINATIONS].reverse()

/**
 * The bar's two groups, split the way the felt splits them: the line bets run
 * along the shooter's edge, the six numbers across the boxman's.
 *
 * One flat run of ten wraps to nine and a widow at most window widths, and the
 * orphan reads as a mistake rather than a row.
 */
const LINE_BETS: readonly CrapsBet[] = [
  CrapsBet.PassLine,
  CrapsBet.DontPass,
  CrapsBet.Odds,
  CrapsBet.Field,
]

const NUMBER_BETS: readonly CrapsBet[] = POINT_NUMBERS.map((point) => PLACE_BETS[point])

/** What each bet is called on its own cell. Shorter than the felt's print. */
const CELL_LABELS: Readonly<Record<CrapsBet, string>> = {
  [CrapsBet.PassLine]: 'Pass line',
  [CrapsBet.DontPass]: "Don't pass",
  [CrapsBet.Odds]: 'Free odds',
  [CrapsBet.Field]: 'Field',
  [CrapsBet.Place4]: '4',
  [CrapsBet.Place5]: '5',
  [CrapsBet.Place6]: '6',
  [CrapsBet.Place8]: '8',
  [CrapsBet.Place9]: '9',
  [CrapsBet.Place10]: '10',
}

const OUTCOME_LABEL: Readonly<Record<RollOutcome, string>> = {
  [RollOutcome.Natural]: 'Natural — pass line wins',
  [RollOutcome.Craps]: 'Craps — pass line loses',
  [RollOutcome.PointEstablished]: 'Point is set',
  [RollOutcome.PointMade]: 'Point made — pass line wins',
  [RollOutcome.SevenOut]: 'Seven out',
  [RollOutcome.NoDecision]: 'No decision — roll again',
}

const WINNING_OUTCOMES = new Set([RollOutcome.Natural, RollOutcome.PointMade])
const LOSING_OUTCOMES = new Set([RollOutcome.Craps, RollOutcome.SevenOut])

/** What a bet pays, for the cell's tooltip. */
function betTerms(game: CrapsState, bet: CrapsBet): string {
  const number = placeBetNumber(bet)
  if (number !== null) {
    const { numerator, denominator } = placeRatio(number)
    return `Place the ${number} — pays ${numerator} to ${denominator}, in $${PLACE_UNITS[number]}, and stays up until a seven`
  }

  switch (bet) {
    case CrapsBet.Odds: {
      if (!game.point) return 'Free odds — backs a pass line once there is a point'
      const { numerator, denominator } = oddsRatio(game.point)
      return `Free odds on the ${game.point} — pays ${numerator} to ${denominator}, the only bet here with no house edge`
    }
    case CrapsBet.Field:
      return 'Field — one roll. Even money on 3, 4, 9, 10 and 11; the 2 pays 2 to 1 and the 12 pays 3 to 1'
    case CrapsBet.DontPass:
      return "Don't pass — even money, betting against the shooter. A twelve on the come out is barred"
    default:
      return 'Pass line — even money, and it rides to a decision once it is out'
  }
}

/**
 * Why a bet cannot be backed with the chip in hand.
 *
 * A dead control with no reason given reads as broken. Every one of these is a
 * real rule rather than a limit of the interface, so saying it out loud teaches
 * the table instead of apologising for it.
 */
function shutReason(
  game: CrapsState,
  bet: CrapsBet,
  chip: number,
  comeOut: boolean,
): string {
  const number = placeBetNumber(bet)
  if (number !== null) {
    if (comeOut) return 'needs a point'
    // The chip is smaller than one unit of this number, so it buys no whole
    // units at all — the six and eight are taken in sixes, the rest in fives.
    return `takes $${PLACE_UNITS[number]}`
  }

  switch (bet) {
    case CrapsBet.Odds: {
      if (comeOut) return 'needs a point'
      const line = game.bets[CrapsBet.PassLine]
      if (line === 0) return 'needs a pass line'
      return `maxed at $${line * MAX_ODDS_MULTIPLE}`
    }
    case CrapsBet.Field:
      return chip > 0 ? 'one roll' : 'no chips'
    default:
      // Pass line and don't pass are come-out bets and cannot be added to.
      return comeOut ? 'already down' : 'point is on'
  }
}

interface CrapsPanelProps {
  venueId: VenueId
}

/**
 * Controls and readouts for the craps table.
 *
 * Deliberately the same shape as the blackjack bar: the felt is the thing to
 * look at, so this stays a slim strip of stakes, bets and the roll control.
 */
export function CrapsPanel({ venueId }: CrapsPanelProps) {
  const game = useCrapsStore((state) => state.game)
  const isRolling = useCrapsStore((state) => state.isRolling)
  const wager = useCrapsStore((state) => state.wager)
  const takeDown = useCrapsStore((state) => state.takeDown)
  const pickedChip = useCrapsStore((state) => state.heldChip)
  const holdChip = useCrapsStore((state) => state.holdChip)
  const resetTable = useCrapsStore((state) => state.reset)

  const bankroll = useGameStore((state) => state.bankroll)
  const standUp = useGameStore((state) => state.standUp)
  const takeMarker = useGameStore((state) => state.takeMarker)
  const debt = useGameStore((state) => state.debt)

  const casino = getVenue(venueId)
  const staked = Object.values(game.bets).reduce((sum, amount) => sum + amount, 0)
  const payout = totalCrapsPayout(game)

  /** The dice cannot be thrown with nothing at risk. */
  /*
   * Shared tables take the dice from the room rather than throwing their own,
   * and only one player holds them at a time. Alone, `shared` is false and
   * `isShooter` is always true, so this reduces to exactly what it was.
   */
  const table = useSharedCraps()
  const canRoll = !isRolling && staked > 0 && table.isShooter

  /** No point yet, so the line bets are live and the numbers are not. */
  const comeOut = game.phase === CrapsPhase.ComeOut

  /*
   * The chip actually in hand. Derived rather than corrected in an effect, and
   * derived in one shared place, because the felt bets with the same chip.
   */
  const chip = heldChipValue(pickedChip, bankroll)

  /*
   * Craps has never had a broke state — it just left the player looking at
   * stake buttons they could not press, with no explanation and no way out.
   */
  const isBroke = bankroll <= 0 && staked === 0 && !isRolling

  function handleLeave(): void {
    resetTable()
    standUp()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === ' ') {
        event.preventDefault()
        if (canRoll) table.roll()
        return
      }

      if (event.key.toLowerCase() === 'escape' || event.key === 'Escape') {
        handleLeave()
        return
      }

      // 1 to 5 pick up a chip, left to right along the rack. The stake is a
      // mode now, so it wants a key the way the roll and the exit do.
      const slot = Number(event.key)
      if (Number.isInteger(slot) && slot >= 1 && slot <= RACK.length) {
        const picked = RACK[slot - 1]
        if (picked && picked.value <= bankroll) holdChip(picked.value)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="table-ui">
      <div className="table-ui__scores">
        <span className="score">
          <span className="score__label">Point</span>
          <span className="score__value">
            {game.point ?? '—'}
            {game.phase === CrapsPhase.ComeOut && (
              <span className="score__soft">come out</span>
            )}
          </span>
        </span>

        <span className="score">
          <span className="score__label">Dice</span>
          <span className="score__value">
            {isRolling || !game.lastRoll
              ? '—'
              : `${game.lastRoll.first}+${game.lastRoll.second}`}
            {!isRolling && game.lastRoll && (
              <span className="score__soft">{game.lastRoll.total}</span>
            )}
          </span>
        </span>

        <span className="score">
          <span className="score__label">At risk</span>
          <span className="score__value">${staked}</span>
        </span>
      </div>

      {/* Held back until the dice stop, so the result is never given away
          while they are still tumbling. */}
      {!isRolling && game.lastOutcome && (
        <p
          className={`table-ui__outcome ${
            WINNING_OUTCOMES.has(game.lastOutcome)
              ? 'table-ui__outcome--win'
              : LOSING_OUTCOMES.has(game.lastOutcome)
                ? ''
                : 'table-ui__outcome--neutral'
          }`}
        >
          {OUTCOME_LABEL[game.lastOutcome]}
          {payout > 0 && <span className="table-ui__payout">+${payout}</span>}
        </p>
      )}

      {isBroke && (
        <div className="table-ui__actions">
          <span className="table-ui__prompt">You&rsquo;re out of chips.</span>
          {debt > 0 ? (
            <span className="table-ui__prompt">
              Red River Plasma, down the strip, buys blood.
            </span>
          ) : (
            <button type="button" className="button button--primary" onClick={takeMarker}>
              Take a marker — ${MARKER_AMOUNT}
            </button>
          )}
        </div>
      )}

      {/*
        Pick a chip, then pick a bet. The stake was a property of the button
        before this — the pass line was drawn three times, once per amount, and
        no amount outside that grid could be wagered at all.
      */}
      <div className="chip-tray">
        <span className="table-ui__prompt">Chips</span>
        {RACK.map((denomination, index) => (
          <button
            key={denomination.value}
            type="button"
            className={`chip${denomination.value === chip ? ' chip--held' : ''}`}
            style={{ background: denomination.color, borderColor: denomination.edge }}
            disabled={denomination.value > bankroll}
            aria-pressed={denomination.value === chip}
            onClick={() => holdChip(denomination.value)}
            title={`$${denomination.value} chip`}
          >
            {denomination.value}
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>

      <div className="bet-groups">
        {[LINE_BETS, NUMBER_BETS].map((group, index) => (
        <div className={`bet-grid${index === 1 ? ' bet-grid--numbers' : ''}`} key={index}>
        {group.map((bet) => {
          const onBet = game.bets[bet]
          const stake = isRolling ? 0 : chipStake(game, bet, chip)
          const number = placeBetNumber(bet)
          const removable = !isRolling && canTakeDownCrapsBet(game, bet)

          return (
            <div
              key={bet}
              className={`bet-cell${onBet > 0 ? ' bet-cell--backed' : ''}${
                stake > 0 ? '' : ' bet-cell--shut'
              }`}
            >
              <button
                type="button"
                className="bet-cell__add"
                data-bet={bet}
                disabled={stake <= 0}
                onClick={() => wager(bet, stake)}
                title={betTerms(game, bet)}
              >
                <span className="bet-cell__name">{CELL_LABELS[bet]}</span>
                <span className="bet-cell__terms">
                  {stake > 0 ? `+$${stake}` : shutReason(game, bet, chip, comeOut)}
                </span>
              </button>

              <span className="bet-cell__foot">
                {onBet > 0 && <span className="bet-cell__on">on ${onBet}</span>}
                {/*
                  A sibling of the add button, never nested inside it: a button
                  within a button is invalid, and the browser picks a winner for
                  you. Only shown when there is something to call down.
                */}
                {removable && (
                  <button
                    type="button"
                    className="bet-cell__down"
                    onClick={() => takeDown(bet)}
                    title={`Take $${onBet} down off the ${CELL_LABELS[bet].toLowerCase()}`}
                    aria-label={`Take down ${CELL_LABELS[bet]}`}
                  >
                    &minus;
                  </button>
                )}
              </span>

              {number !== null && (
                <span className="bet-cell__odds">
                  {placeRatio(number).numerator}:{placeRatio(number).denominator}
                </span>
              )}
            </div>
          )
        })}
        </div>
        ))}
      </div>

      <div className="table-ui__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!canRoll}
          onClick={table.roll}
        >
          {isRolling
            ? 'Rolling…'
            : table.shared && !table.isShooter
              ? `Waiting for ${table.shooterName ?? 'the shooter'}`
              : 'Roll the dice'}{' '}
          <kbd>Space</kbd>
        </button>

        <button
          type="button"
          className="button button--ghost table-ui__leave"
          style={{ color: casino.neonColor }}
          onClick={handleLeave}
        >
          Leave table <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
