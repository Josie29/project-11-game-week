import { useState } from 'react'
import { act, canDouble, createGame, handValue, startNextRound } from '../games/blackjack/engine'
import { placeBet } from '../games/blackjack/engine'
import {
  type Card,
  type GameState,
  PlayerAction,
  RoundOutcome,
  RoundPhase,
  Suit,
} from '../games/blackjack/types'
import { useGameStore } from '../store/useGameStore'
import { getCasino, type CasinoId } from '../world/casinos'

const CHIP_DENOMINATIONS = [10, 25, 100] as const

const SUIT_SYMBOL: Record<Suit, string> = {
  [Suit.Clubs]: '♣', // ♣
  [Suit.Diamonds]: '♦', // ♦
  [Suit.Hearts]: '♥', // ♥
  [Suit.Spades]: '♠', // ♠
}

const OUTCOME_LABEL: Record<RoundOutcome, string> = {
  [RoundOutcome.PlayerBlackjack]: 'Blackjack! Pays 3:2',
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

/** Seeds a shoe from the clock so successive sessions do not replay one shuffle. */
function freshSeed(): number {
  return Math.floor(Date.now() % 2147483647)
}

function CardFace({ card }: { card: Card }) {
  const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds

  return (
    <span className={`card ${isRed ? 'card--red' : ''}`}>
      {card.rank}
      {SUIT_SYMBOL[card.suit]}
    </span>
  )
}

interface BlackjackPanelProps {
  casinoId: CasinoId
}

/**
 * Temporary DOM controls over the blackjack engine.
 *
 * Intentionally plain: this exists to close the walk-play-earn loop on day one.
 * Tuesday replaces it with a 3D table, but the engine calls below stay the same.
 */
export function BlackjackPanel({ casinoId }: BlackjackPanelProps) {
  const [game, setGame] = useState<GameState>(() => createGame(freshSeed()))
  const bankroll = useGameStore((state) => state.bankroll)
  const adjustBankroll = useGameStore((state) => state.adjustBankroll)
  const leaveCasino = useGameStore((state) => state.leaveCasino)
  const resetBankroll = useGameStore((state) => state.resetBankroll)

  const casino = getCasino(casinoId)
  const playerScore = handValue(game.playerHand)
  const dealerScore = handValue(game.dealerHand)
  const isSettled = game.phase === RoundPhase.Settled

  // Bankroll is credited inside the handlers rather than an effect, so React's
  // StrictMode double-invocation can never pay a hand out twice.
  function settleIfFinished(next: GameState): void {
    if (next.phase === RoundPhase.Settled && next.payout > 0) {
      adjustBankroll(next.payout)
    }
  }

  function handleBet(amount: number): void {
    if (amount > bankroll || game.phase !== RoundPhase.Betting) return

    adjustBankroll(-amount)
    const next = placeBet(game, amount)
    settleIfFinished(next)
    setGame(next)
  }

  function handleAction(action: PlayerAction): void {
    if (game.phase !== RoundPhase.PlayerTurn) return

    const next = act(game, action)
    // Doubling raises the wager mid-round; charge the player the difference.
    if (action === PlayerAction.Double) {
      adjustBankroll(-(next.bet - game.bet))
    }
    settleIfFinished(next)
    setGame(next)
  }

  function handleNextRound(): void {
    setGame(startNextRound(game, freshSeed()))
  }

  const canAffordDouble = canDouble(game) && bankroll >= game.bet
  const isBroke = bankroll <= 0 && game.phase === RoundPhase.Betting

  return (
    <div className="panel">
      <header className="panel__header">
        <h1 style={{ color: casino.neonColor }}>{casino.name}</h1>
        <button type="button" className="button button--ghost" onClick={leaveCasino}>
          Leave
        </button>
      </header>

      <section className="panel__hands">
        <div className="hand">
          <span className="hand__label">
            {/* The dealer's total stays hidden until the hole card turns over. */}
            Dealer{game.dealerHand.length > 0 && isSettled ? ` — ${dealerScore.total}` : ''}
          </span>
          <div className="hand__cards">
            {game.dealerHand.map((card, index) => (
              // The hole card stays face down until the round resolves.
              <span key={`${card.rank}${card.suit}${index}`}>
                {index === 1 && !isSettled ? (
                  <span className="card card--back">??</span>
                ) : (
                  <CardFace card={card} />
                )}
              </span>
            ))}
            {game.dealerHand.length === 0 && <span className="hand__empty">—</span>}
          </div>
        </div>

        <div className="hand">
          <span className="hand__label">
            You{game.playerHand.length > 0 ? ` — ${playerScore.total}${playerScore.isSoft ? ' soft' : ''}` : ''}
          </span>
          <div className="hand__cards">
            {game.playerHand.map((card, index) => (
              <CardFace key={`${card.rank}${card.suit}${index}`} card={card} />
            ))}
            {game.playerHand.length === 0 && <span className="hand__empty">—</span>}
          </div>
        </div>
      </section>

      {game.outcome && (
        <p
          className={`panel__outcome ${
            WINNING_OUTCOMES.has(game.outcome) ? 'panel__outcome--win' : ''
          }`}
        >
          {OUTCOME_LABEL[game.outcome]}
          {game.payout > 0 && ` · +$${game.payout}`}
        </p>
      )}

      <footer className="panel__actions">
        {game.phase === RoundPhase.Betting && !isBroke && (
          <>
            <span className="panel__prompt">Place your bet</span>
            {CHIP_DENOMINATIONS.map((amount) => (
              <button
                key={amount}
                type="button"
                className="button"
                disabled={amount > bankroll}
                onClick={() => handleBet(amount)}
              >
                ${amount}
              </button>
            ))}
          </>
        )}

        {isBroke && (
          <>
            <span className="panel__prompt">You&rsquo;re out of chips.</span>
            <button type="button" className="button" onClick={resetBankroll}>
              Take a marker
            </button>
          </>
        )}

        {game.phase === RoundPhase.PlayerTurn && (
          <>
            <span className="panel__prompt">Bet ${game.bet}</span>
            <button type="button" className="button" onClick={() => handleAction(PlayerAction.Hit)}>
              Hit
            </button>
            <button type="button" className="button" onClick={() => handleAction(PlayerAction.Stand)}>
              Stand
            </button>
            <button
              type="button"
              className="button"
              disabled={!canAffordDouble}
              onClick={() => handleAction(PlayerAction.Double)}
            >
              Double
            </button>
          </>
        )}

        {isSettled && (
          <button type="button" className="button button--primary" onClick={handleNextRound}>
            Next hand
          </button>
        )}
      </footer>
    </div>
  )
}
