import { handValue } from '../games/blackjack/engine'
import { PlayerAction, RoundOutcome, RoundPhase } from '../games/blackjack/types'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { getCasino, type CasinoId } from '../world/casinos'

const CHIP_DENOMINATIONS = [10, 25, 100] as const

const OUTCOME_LABEL: Record<RoundOutcome, string> = {
  [RoundOutcome.PlayerBlackjack]: 'Blackjack — pays 3:2',
  [RoundOutcome.PlayerWin]: 'You win',
  [RoundOutcome.DealerWin]: 'Dealer wins',
  [RoundOutcome.Push]: 'Push',
  [RoundOutcome.PlayerBust]: 'Bust',
  [RoundOutcome.DealerBust]: 'Dealer busts — you win',
}

const WINNING_OUTCOMES = new Set<RoundOutcome>([
  RoundOutcome.PlayerBlackjack,
  RoundOutcome.PlayerWin,
  RoundOutcome.DealerBust,
])

interface BlackjackPanelProps {
  casinoId: CasinoId
}

/**
 * Controls and readouts for the table.
 *
 * The cards themselves are rendered in 3D, so this is deliberately a slim bar:
 * hand totals, the result, and the actions. Anything more competes with the
 * table for attention.
 */
export function BlackjackPanel({ casinoId }: BlackjackPanelProps) {
  const game = useBlackjackStore((state) => state.game)
  const placeWager = useBlackjackStore((state) => state.placeWager)
  const takeAction = useBlackjackStore((state) => state.takeAction)
  const nextRound = useBlackjackStore((state) => state.nextRound)
  const resetRound = useBlackjackStore((state) => state.reset)

  const bankroll = useGameStore((state) => state.bankroll)
  const leaveCasino = useGameStore((state) => state.leaveCasino)
  const resetBankroll = useGameStore((state) => state.resetBankroll)

  const casino = getCasino(casinoId)
  const playerScore = handValue(game.playerHand)
  const dealerScore = handValue(game.dealerHand)

  const isBetting = game.phase === RoundPhase.Betting
  const isPlayerTurn = game.phase === RoundPhase.PlayerTurn
  const isSettled = game.phase === RoundPhase.Settled

  const canDoubleNow = isPlayerTurn && game.playerHand.length === 2 && bankroll >= game.bet
  const isBroke = bankroll <= 0 && isBetting

  function handleLeave(): void {
    // Walking out abandons the hand, so clear the table for next time.
    resetRound()
    leaveCasino()
  }

  return (
    <div className="table-ui">
      <div className="table-ui__scores">
        <span className="score">
          <span className="score__label">Dealer</span>
          <span className="score__value">
            {game.dealerHand.length > 0 && isSettled ? dealerScore.total : '—'}
          </span>
        </span>
        <span className="score">
          <span className="score__label">You</span>
          <span className="score__value">
            {game.playerHand.length > 0 ? playerScore.total : '—'}
            {playerScore.isSoft && game.playerHand.length > 0 && (
              <span className="score__soft">soft</span>
            )}
          </span>
        </span>
      </div>

      {game.outcome && (
        <p
          className={`table-ui__outcome ${
            WINNING_OUTCOMES.has(game.outcome) ? 'table-ui__outcome--win' : ''
          }`}
        >
          {OUTCOME_LABEL[game.outcome]}
          {game.payout > 0 && <span className="table-ui__payout">+${game.payout}</span>}
        </p>
      )}

      <div className="table-ui__actions">
        {isBetting && !isBroke && (
          <>
            <span className="table-ui__prompt">Place your bet</span>
            {CHIP_DENOMINATIONS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`button button--chip button--chip-${amount}`}
                disabled={amount > bankroll}
                onClick={() => placeWager(amount)}
              >
                ${amount}
              </button>
            ))}
          </>
        )}

        {isBroke && (
          <>
            <span className="table-ui__prompt">You&rsquo;re out of chips.</span>
            <button type="button" className="button button--primary" onClick={resetBankroll}>
              Take a marker
            </button>
          </>
        )}

        {isPlayerTurn && (
          <>
            <span className="table-ui__prompt">${game.bet} in play</span>
            <button type="button" className="button" onClick={() => takeAction(PlayerAction.Hit)}>
              Hit
            </button>
            <button type="button" className="button" onClick={() => takeAction(PlayerAction.Stand)}>
              Stand
            </button>
            <button
              type="button"
              className="button"
              disabled={!canDoubleNow}
              onClick={() => takeAction(PlayerAction.Double)}
            >
              Double
            </button>
          </>
        )}

        {isSettled && (
          <button type="button" className="button button--primary" onClick={nextRound}>
            Next hand
          </button>
        )}

        <button
          type="button"
          className="button button--ghost table-ui__leave"
          style={{ color: casino.neonColor }}
          onClick={handleLeave}
        >
          Leave {casino.name}
        </button>
      </div>
    </div>
  )
}
