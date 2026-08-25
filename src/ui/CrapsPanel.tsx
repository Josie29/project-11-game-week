import { useEffect } from 'react'
import {
  canPlaceCrapsBet,
  oddsRatio,
  placeRatio,
  placeStakes,
  totalCrapsPayout,
} from '../games/craps/engine'
import { CrapsPhase, RollOutcome } from '../games/craps/types'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { MARKER_AMOUNT } from '../world/money'
import {
  CRAPS_BET_LABELS,
  CrapsBet,
  PLACE_BETS,
  POINT_NUMBERS,
} from '../scenes/crapsFeltLayout'
import { getVenue, type VenueId } from '../world/venues'

/** Same stakes the blackjack table offers; all pay whole dollars at true odds. */
const STAKES = [10, 50, 100] as const

/**
 * The place bets get their own controls, laid out by number rather than by
 * stake.
 *
 * The line bets share one set of round figures, and the place bets cannot: the
 * six and eight pay in sevenths and are taken in sixes, everything else pays in
 * fifths and is taken in fives, so a shared "$50" row would offer stakes that
 * pay a fraction of a chip on half the numbers. Each button carries its own
 * amount instead, which is also how the table would say it out loud.
 */
const PLACE_TIER_LABELS: readonly string[] = ['Place', '\u00d75']

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
  const throwDice = useCrapsStore((state) => state.throwDice)
  const resetTable = useCrapsStore((state) => state.reset)

  const bankroll = useGameStore((state) => state.bankroll)
  const standUp = useGameStore((state) => state.standUp)
  const takeMarker = useGameStore((state) => state.takeMarker)
  const debt = useGameStore((state) => state.debt)

  const casino = getVenue(venueId)
  const staked = Object.values(game.bets).reduce((sum, amount) => sum + amount, 0)
  const payout = totalCrapsPayout(game)

  /** The dice cannot be thrown with nothing at risk. */
  const canRoll = !isRolling && staked > 0

  /** No point yet, so the line bets are live and the numbers are not. */
  const comeOut = game.phase === CrapsPhase.ComeOut

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
        if (canRoll) throwDice()
      } else if (event.key.toLowerCase() === 'escape' || event.key === 'Escape') {
        handleLeave()
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

      <div className="table-ui__bets">
      <div className="table-ui__actions">
        {STAKES.map((amount, index) => (
          <span key={amount} className="table-ui__stake">
            <span className="table-ui__prompt">${amount}</span>
            {[CrapsBet.PassLine, CrapsBet.DontPass, CrapsBet.Odds, CrapsBet.Field].map((bet) => (
              <button
                key={bet}
                type="button"
                className="button button--bet"
                disabled={isRolling || amount > bankroll || !canPlaceCrapsBet(game, bet, amount)}
                onClick={() => wager(bet, amount)}
                title={
                  bet === CrapsBet.Odds && game.point
                    ? `Pays ${oddsRatio(game.point).numerator} to ${oddsRatio(game.point).denominator}`
                    : CRAPS_BET_LABELS[bet]
                }
              >
                {CRAPS_BET_LABELS[bet]}
              </button>
            ))}
            {index < STAKES.length - 1 && <span className="table-ui__divider" />}
          </span>
        ))}
      </div>

      {/*
        The six numbers, which need a point before they can be laid. Six rows of
        dead buttons with no reason given reads as broken, so the reason is
        printed where the stakes would be.
      */}
      <div className="table-ui__actions">
        {comeOut && (
          <span className="table-ui__prompt">
            The numbers open once the shooter has a point.
          </span>
        )}
        {!comeOut &&
          PLACE_TIER_LABELS.map((label, tier) => (
          <span key={label} className="table-ui__stake">
            <span className="table-ui__prompt">{label}</span>
            {POINT_NUMBERS.map((point) => {
              const bet = PLACE_BETS[point]
              const amount = placeStakes(point)[tier]!
              const onNumber = game.bets[bet]
              const { numerator, denominator } = placeRatio(point)

              return (
                <button
                  key={point}
                  type="button"
                  className="button button--bet"
                  disabled={
                    isRolling || amount > bankroll || !canPlaceCrapsBet(game, bet, amount)
                  }
                  onClick={() => wager(bet, amount)}
                  title={`Place the ${point} for $${amount} — pays ${numerator} to ${denominator}, and stays up until a seven`}
                >
                  {point} <kbd>${amount}</kbd>
                  {/* What is already on the number, shown once rather than on
                      every tier — two dollar figures on one button read as two
                      prices for the same press. */}
                  {tier === 0 && onNumber > 0 && (
                    <span className="table-ui__payout">on ${onNumber}</span>
                  )}
                </button>
              )
            })}
            {tier < PLACE_TIER_LABELS.length - 1 && <span className="table-ui__divider" />}
          </span>
          ))}
      </div>
      </div>

      <div className="table-ui__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!canRoll}
          onClick={throwDice}
        >
          {isRolling ? 'Rolling…' : 'Roll the dice'} <kbd>Space</kbd>
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
