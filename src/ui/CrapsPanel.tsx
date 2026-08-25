import { useEffect } from 'react'
import { canPlaceCrapsBet, oddsRatio, totalCrapsPayout } from '../games/craps/engine'
import { CrapsPhase, RollOutcome } from '../games/craps/types'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { CRAPS_BET_LABELS, CrapsBet } from '../scenes/crapsFeltLayout'
import { getVenue, type VenueId } from '../world/venues'

/** Same stakes the blackjack table offers; all pay whole dollars at true odds. */
const STAKES = [10, 50, 100] as const

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
  const leaveVenue = useGameStore((state) => state.leaveVenue)

  const casino = getVenue(venueId)
  const staked = Object.values(game.bets).reduce((sum, amount) => sum + amount, 0)
  const payout = totalCrapsPayout(game)

  /** The dice cannot be thrown with nothing at risk. */
  const canRoll = !isRolling && staked > 0

  function handleLeave(): void {
    resetTable()
    leaveVenue()
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
          Leave {casino.name} <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
