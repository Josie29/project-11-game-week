import { activeHand, canDouble, canSplit, handValue } from '../games/blackjack/engine'
import { type Hand, PlayerAction, RoundOutcome, RoundPhase } from '../games/blackjack/types'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { getCasino, type CasinoId } from '../world/casinos'
import { useTableHotkeys } from './useTableHotkeys'

/*
 * Offered stakes. Every one of these pays a whole number of dollars at 3:2,
 * which $25 does not — a natural on $25 pays $62.50, and there is no half-dollar
 * chip to put on the felt for it.
 */
const CHIP_DENOMINATIONS = [10, 50, 100] as const

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

/** Short result tag shown per hand once the player has split. */
function shortOutcome(hand: Hand): string {
  if (hand.outcome === null) return ''
  if (WINNING_OUTCOMES.has(hand.outcome)) return 'won'
  if (hand.outcome === RoundOutcome.Push) return 'push'
  return 'lost'
}

interface BlackjackPanelProps {
  casinoId: CasinoId
}

/**
 * Controls and readouts for the table.
 *
 * The cards themselves are rendered in 3D, so this is deliberately a slim bar:
 * hand totals, the result, and the actions. Keyboard shortcuts are the primary
 * input; the buttons exist so a first-time player can find them.
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
  const dealerScore = handValue(game.dealerHand)

  /*
   * The dealer's first card is face up, so its value is public. Showing a dash
   * until settlement hid information the player can see on the felt and would
   * use to decide — the readout now reports what is actually showing.
   */
  const dealerUpcard = game.dealerHand[0]
  const dealerShowing = dealerUpcard ? handValue([dealerUpcard]).total : null

  const isBetting = game.phase === RoundPhase.Betting
  const isPlayerTurn = game.phase === RoundPhase.PlayerTurn
  const isSettled = game.phase === RoundPhase.Settled

  const current = activeHand(game)
  const canDoubleNow = isPlayerTurn && canDouble(game) && bankroll >= (current?.bet ?? 0)
  const canSplitNow = isPlayerTurn && canSplit(game) && bankroll >= (current?.bet ?? 0)
  const isBroke = bankroll <= 0 && isBetting

  function handleLeave(): void {
    // Walking out abandons the hand, so clear the table for next time.
    resetRound()
    leaveCasino()
  }

  useTableHotkeys({
    onHit: () => isPlayerTurn && takeAction(PlayerAction.Hit),
    onStand: () => isPlayerTurn && takeAction(PlayerAction.Stand),
    onDouble: () => canDoubleNow && takeAction(PlayerAction.Double),
    onSplit: () => canSplitNow && takeAction(PlayerAction.Split),
    onNextRound: () => isSettled && nextRound(),
    onLeave: handleLeave,
    // 1/2/3 pick a stake, so a hand can be played without touching the mouse.
    onBet: (slot) => {
      const amount = CHIP_DENOMINATIONS[slot]
      if (isBetting && amount !== undefined && amount <= bankroll) placeWager(amount)
    },
  })

  return (
    <div className="table-ui">
      <div className="table-ui__scores">
        <span className="score">
          <span className="score__label">Dealer</span>
          <span className="score__value">
            {isSettled && game.dealerHand.length > 0
              ? dealerScore.total
              : (dealerShowing ?? '—')}
            {!isSettled && dealerShowing !== null && (
              <span className="score__soft">showing</span>
            )}
          </span>
        </span>

        {game.hands.length === 0 && (
          <span className="score">
            <span className="score__label">You</span>
            <span className="score__value">—</span>
          </span>
        )}

        {game.hands.map((hand, index) => {
          const score = handValue(hand.cards)
          const isActive = index === game.activeHandIndex && isPlayerTurn
          const label = game.hands.length > 1 ? `Hand ${index + 1}` : 'You'

          return (
            <span
              key={index}
              className={`score ${isActive && game.hands.length > 1 ? 'score--active' : ''}`}
            >
              <span className="score__label">{label}</span>
              <span className="score__value">
                {score.total}
                {score.isSoft && <span className="score__soft">soft</span>}
                {isSettled && <span className="score__soft">{shortOutcome(hand)}</span>}
              </span>
            </span>
          )
        })}
      </div>

      {isSettled && game.hands.length === 1 && game.hands[0]?.outcome && (
        <p
          className={`table-ui__outcome ${
            WINNING_OUTCOMES.has(game.hands[0].outcome) ? 'table-ui__outcome--win' : ''
          }`}
        >
          {OUTCOME_LABEL[game.hands[0].outcome]}
          {game.totalPayout > 0 && <span className="table-ui__payout">+${game.totalPayout}</span>}
        </p>
      )}

      {isSettled && game.hands.length > 1 && (
        <p className={`table-ui__outcome ${game.totalPayout > 0 ? 'table-ui__outcome--win' : ''}`}>
          {game.totalPayout > 0 ? 'Hands settled' : 'Both hands lost'}
          {game.totalPayout > 0 && <span className="table-ui__payout">+${game.totalPayout}</span>}
        </p>
      )}

      <div className="table-ui__actions">
        {isBetting && !isBroke && (
          <>
            <span className="table-ui__prompt">Place your bet</span>
            {CHIP_DENOMINATIONS.map((amount, index) => (
              <button
                key={amount}
                type="button"
                className={`button button--chip button--chip-${amount}`}
                disabled={amount > bankroll}
                onClick={() => placeWager(amount)}
              >
                ${amount} <kbd>{index + 1}</kbd>
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
            <span className="table-ui__prompt">
              ${current?.bet ?? 0} in play
              {game.hands.length > 1 && ` · hand ${game.activeHandIndex + 1}`}
            </span>
            <button
              type="button"
              className="button"
              onClick={() => takeAction(PlayerAction.Hit)}
            >
              Hit <kbd>H</kbd>
            </button>
            <button
              type="button"
              className="button"
              onClick={() => takeAction(PlayerAction.Stand)}
            >
              Stand <kbd>S</kbd>
            </button>
            <button
              type="button"
              className="button"
              disabled={!canDoubleNow}
              onClick={() => takeAction(PlayerAction.Double)}
            >
              Double <kbd>D</kbd>
            </button>
            <button
              type="button"
              className="button"
              disabled={!canSplitNow}
              onClick={() => takeAction(PlayerAction.Split)}
            >
              Split <kbd>P</kbd>
            </button>
          </>
        )}

        {isSettled && (
          <button type="button" className="button button--primary" onClick={nextRound}>
            Next hand <kbd>Space</kbd>
          </button>
        )}

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
