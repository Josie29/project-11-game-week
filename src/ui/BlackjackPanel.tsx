import { useEffect, useState } from 'react'
import {
  activeHand,
  canDouble,
  canInsure,
  canSplit,
  handValue,
  handsOf,
  maxInsurance,
  seatAt,
  totalPaid,
  totalStaked,
} from '../games/blackjack/engine'
import { type Hand, PlayerAction, RoundOutcome, RoundPhase } from '../games/blackjack/types'
import { useSharedBlackjack } from '../net/useSharedBlackjack'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { secondsUntilDeal } from '../world/dealClock'
import { secondsUntilStand, TURN_WINDOW_MS } from '../world/turnClock'
import { MARKER_AMOUNT } from '../world/money'
import { getVenue, type VenueId } from '../world/venues'
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

/**
 * The round's result in money, as a change to the bankroll.
 *
 * Deliberately *net*, not the payout. Payouts include the stake, so a $20 push
 * pays $20 back and printing that as "+$20" reads as a $20 win when nothing was
 * won at all. Anything with a sign in front of it here has to be a number the
 * player is actually up or down.
 *
 * @param net Chips returned less chips staked.
 */
function netLabel(net: number): string {
  if (net > 0) return `+$${net}`
  if (net < 0) return `-$${Math.abs(net)}`
  return 'even'
}

/**
 * How the round went across every hand, once a split means "you win" no longer
 * covers it.
 */
function handsSummary(hands: readonly Hand[]): string {
  const lost = hands.filter((hand) => hand.payout <= 0).length
  if (lost === hands.length) return `All ${hands.length} hands lost`

  const won = hands.filter((hand) => hand.payout > hand.bet).length
  return `${won} of ${hands.length} hands won`
}

interface BlackjackPanelProps {
  venueId: VenueId
}

/**
 * Controls and readouts for the table.
 *
 * The cards themselves are rendered in 3D, so this is deliberately a slim bar:
 * hand totals, the result, and the actions. Keyboard shortcuts are the primary
 * input; the buttons exist so a first-time player can find them.
 */
export function BlackjackPanel({ venueId }: BlackjackPanelProps) {
  const game = useBlackjackStore((state) => state.game)
  /*
   * Shared tables hand the wager and the action to the room instead of applying
   * them here. Alone, `shared` is false and this reduces to exactly what it was.
   */
  const table = useSharedBlackjack()
  const mySeatIndex = useBlackjackStore((state) => state.mySeatIndex)
  const placeWager = table.wager
  const takeAction = table.act
  const nextRound = useBlackjackStore((state) => state.nextRound)
  const resetRound = useBlackjackStore((state) => state.reset)

  const bankroll = useGameStore((state) => state.bankroll)
  const standUp = useGameStore((state) => state.standUp)
  const takeMarker = useGameStore((state) => state.takeMarker)
  const debt = useGameStore((state) => state.debt)

  const dealerCardsShown = useBlackjackStore((state) => state.dealerCardsShown)
  const holeCardUp = useBlackjackStore((state) => state.holeCardUp)
  const revealComplete = useBlackjackStore((state) => state.revealComplete)

  const casino = getVenue(venueId)

  /*
   * The dealer's total is read off the cards currently on the table, not off
   * the engine's finished hand. The engine resolves the dealer atomically, so
   * reading it directly would print the final total — and announce a bust —
   * while the cards that produced it were still being turned over.
   */
  const dealerVisible = game.dealerHand.slice(0, holeCardUp ? dealerCardsShown : 1)
  const dealerScore = handValue(dealerVisible)
  const dealerShowing = dealerVisible.length > 0 ? dealerScore.total : null

  const isBetting = game.phase === RoundPhase.Betting
  /*
   * Whose turn it is, not just whether anybody's is.
   *
   * Casino blackjack goes one player at a time from first base round to third
   * base, so at a shared table the buttons have to be dead for four of the five
   * people looking at them. Alone, `isMyTurn` is always true and this is the
   * same condition it always was.
   */
  const isPlayerTurn = game.phase === RoundPhase.PlayerTurn && table.isMyTurn


  const isSettled = game.phase === RoundPhase.Settled
  /** The round is over *and* the dealer has finished showing their hand. */
  const isResolved = isSettled && revealComplete

  /*
   * This panel is one player's view of the table, so everything below reads a
   * single seat. That seat is the first one while play is solo; a second player
   * would bring their own index rather than a second panel.
   */
  /*
   * This player's own hands — and nobody else's.
   *
   * `handsOf` defaults to seat 0, which is right alone and wrong the moment
   * somebody sits down beside you: a spectator was shown the first player's
   * cards under the label "You", complete with their total. A player watching a
   * round they did not bet into has no hands, and the readout should say so.
   */
  const hands = table.spectating ? [] : handsOf(game, Math.max(0, mySeatIndex))
  /*
   * Everything below reads *this player's* seat rather than the first one.
   *
   * Every one of these defaulted to seat 0, which is this player alone and
   * somebody else entirely once a second person sits down — their stake, their
   * winnings, and whether *they* may split shown as yours.
   */
  const mySeat = Math.max(0, mySeatIndex)
  const activeHandIndex = seatAt(game, mySeat)?.activeHandIndex ?? 0

  const staked = table.spectating ? 0 : totalStaked(game, mySeat)
  /** What the round did to the bankroll, stake excluded. See `netLabel`. */
  const net = (table.spectating ? 0 : totalPaid(game, mySeat)) - staked
  /** Whether this seat's insurance bet came home, worth naming at settlement. */
  const insurancePaid = (table.spectating ? 0 : (seatAt(game, mySeat)?.insurancePayout ?? 0)) > 0

  const current = activeHand(game)
  const canDoubleNow = isPlayerTurn && canDouble(game, mySeat) && bankroll >= (current?.bet ?? 0)
  const canSplitNow = isPlayerTurn && canSplit(game, mySeat) && bankroll >= (current?.bet ?? 0)
  const isBroke = bankroll <= 0 && isBetting

  /*
   * The insurance window: the dealer shows an ace and every seat answers
   * before anything else happens. Solo, the one answer closes it at once, so
   * the waiting line below can only ever appear at a shared table.
   */
  const isInsuring = game.phase === RoundPhase.Insurance
  const insuranceOpen = isInsuring && !table.spectating && canInsure(game, mySeat)
  // Offered at the table maximum the bankroll covers — half the stake, floored
  // to whole dollars by the engine, and never more than the player holds.
  const insurancePremium = Math.min(maxInsurance(game, mySeat), bankroll)
  const canInsureNow = insuranceOpen && insurancePremium >= 1

  /** This player's stake is with the room, and the deal is on other people. */
  const waitingForTable = table.shared && isBetting && table.pendingBet > 0
  /** A shared table with no room. `wager` refuses; this is what says so. */
  const offline = table.shared && !table.connected

  /*
   * A gather is running: somebody has staked and the room's deal clock is
   * armed. The deadline belongs to the whole table, not just whoever staked —
   * the player it presses hardest is the one who has *not* bet yet, because
   * it is how long they have before the round deals past them.
   */
  const gatherRunning = table.shared && isBetting && table.betClockStartedAt !== null

  /*
   * Seconds until the room deals to whoever has staked, or null with no clock
   * to read — a player who sat down mid-gather missed the bet broadcasts, and
   * no number is better than a wrong one.
   *
   * A quarter-second interval so a boundary is never crossed by more than a
   * blink; `setState` with the same whole second is a no-op re-render, so this
   * only paints when the number actually changes. The count visibly restarts
   * when another player stakes, because the room restarts its window the same
   * way.
   */
  const [dealCountdown, setDealCountdown] = useState<number | null>(null)
  const betClockStartedAt = table.betClockStartedAt
  useEffect(() => {
    if (!gatherRunning || betClockStartedAt === null) {
      setDealCountdown(null)
      return
    }

    const update = () =>
      setDealCountdown(secondsUntilDeal(betClockStartedAt, performance.now()))
    update()
    const ticker = setInterval(update, 250)
    return () => clearInterval(ticker)
  }, [gatherRunning, betClockStartedAt])

  /** `— deals in Ns` while the gather runs, empty otherwise. */
  const countdownSuffix = dealCountdown === null ? '' : ` — deals in ${dealCountdown}s`

  /*
   * The turn clock, on the same pattern as the deal clock above: fifteen
   * seconds per decision, restarted by the room on every action it relays,
   * shown to the player acting and to everyone waiting on them alike.
   */
  const turnRunning =
    table.shared && game.phase === RoundPhase.PlayerTurn && table.turnClockStartedAt !== null

  const [turnCountdown, setTurnCountdown] = useState<number | null>(null)
  const turnClockStartedAt = table.turnClockStartedAt
  useEffect(() => {
    if (!turnRunning || turnClockStartedAt === null) {
      setTurnCountdown(null)
      return
    }

    const update = () =>
      setTurnCountdown(secondsUntilStand(turnClockStartedAt, performance.now()))
    update()
    const ticker = setInterval(update, 250)
    return () => clearInterval(ticker)
  }, [turnRunning, turnClockStartedAt])

  /*
   * `— 12s` beside whoever the table is waiting on; empty with no clock, and
   * empty while the deal is still playing out. The clock face is stamped for
   * the end of the deal animation, so until then the arithmetic reads *above*
   * the window — a count that visibly ticks while cards are still flying is
   * exactly what this hides.
   */
  const turnSuffix =
    turnCountdown === null || turnCountdown > TURN_WINDOW_MS / 1000
      ? ''
      : ` — ${turnCountdown}s`

  function handleLeave(): void {
    // Standing up abandons the hand, so clear the table for next time.
    resetRound()
    standUp()
  }

  useTableHotkeys({
    onHit: () => isPlayerTurn && takeAction(PlayerAction.Hit),
    onStand: () => isPlayerTurn && takeAction(PlayerAction.Stand),
    onDouble: () => canDoubleNow && takeAction(PlayerAction.Double),
    onSplit: () => canSplitNow && takeAction(PlayerAction.Split),
    onInsure: () => canInsureNow && table.insure(insurancePremium),
    onDeclineInsurance: () => insuranceOpen && table.insure(0),
    onNextRound: () => isResolved && nextRound(),
    onLeave: handleLeave,
    // 1/2/3 pick a stake, so a hand can be played without touching the mouse.
    onBet: (slot) => {
      const amount = CHIP_DENOMINATIONS[slot]
      if (waitingForTable || offline) return
      if (isBetting && amount !== undefined && amount <= bankroll) placeWager(amount)
    },
  })

  return (
    <div className="table-ui">
      <div className="table-ui__scores">
        <span className="score">
          <span className="score__label">Dealer</span>
          <span className="score__value">
            {dealerShowing ?? '—'}
            {!holeCardUp && dealerShowing !== null && (
              <span className="score__soft">showing</span>
            )}
          </span>
        </span>

        {hands.length === 0 && (
          <span className="score">
            <span className="score__label">You</span>
            <span className="score__value">—</span>
          </span>
        )}

        {hands.map((hand, index) => {
          const score = handValue(hand.cards)
          const isActive = index === activeHandIndex && isPlayerTurn
          const label = hands.length > 1 ? `Hand ${index + 1}` : 'You'

          return (
            <span
              key={index}
              className={`score ${isActive && hands.length > 1 ? 'score--active' : ''}`}
            >
              <span className="score__label">{label}</span>
              <span className="score__value">
                {score.total}
                {score.isSoft && <span className="score__soft">soft</span>}
                {isResolved && <span className="score__soft">{shortOutcome(hand)}</span>}
              </span>
            </span>
          )
        })}
      </div>

      {isResolved && hands.length === 1 && hands[0]?.outcome && (
        <p
          className={`table-ui__outcome ${
            WINNING_OUTCOMES.has(hands[0].outcome) ? 'table-ui__outcome--win' : ''
          }`}
        >
          {OUTCOME_LABEL[hands[0].outcome]}
          {/*
            An insured loss reads as a win gone missing without this — the hand
            lost, the bankroll did not move, and only the insurance explains it.
          */}
          {insurancePaid && ' — insurance pays 2:1'}
          {/* A push is already named by the label; "even" beside it just nags. */}
          {net !== 0 && <span className="table-ui__payout">{netLabel(net)}</span>}
        </p>
      )}

      {isResolved && hands.length > 1 && (
        <p className={`table-ui__outcome ${net > 0 ? 'table-ui__outcome--win' : ''}`}>
          {handsSummary(hands)}
          <span className="table-ui__payout">{netLabel(net)}</span>
        </p>
      )}

      <div className="table-ui__actions">
        {/*
        Watching a round somebody else is playing.

        The table deals whoever backed a hand once the betting window closes, so
        a player who was slow — or who chose to sit one out — sees the round play
        with no hand in it. Saying so matters: cards appearing in front of other
        people and none in front of you reads as the game having failed.
      */}
      {table.spectating && (
        <p className="blackjack__sitting-out">
          Sitting this one out — you can bet on the next hand
        </p>
      )}

      {/*
        Whose decision the table is waiting on, with the room's fifteen-second
        clock falling beside the name — the same count the acting player
        watches by their buttons, so everybody at the table reads one number.
      */}
      {table.shared &&
        game.phase === RoundPhase.PlayerTurn &&
        !isPlayerTurn &&
        table.waitingOn !== null && (
          <p className="blackjack__waiting">
            Waiting on {table.waitingOn}
            {turnSuffix}
          </p>
        )}

      {insuranceOpen && (
          <>
            {/*
              The felt already advertises the terms — INSURANCE PAYS 2 TO 1 —
              so the prompt only has to say what is being asked. The offer is
              one figure rather than a stack of denominations because the only
              interesting insurance bet is the biggest one the rules allow.
            */}
            <span className="table-ui__prompt">
              Dealer shows an ace — insurance?
            </span>
            <button
              type="button"
              className="button"
              disabled={!canInsureNow}
              onClick={() => table.insure(insurancePremium)}
            >
              Insure ${insurancePremium} <kbd>I</kbd>
            </button>
            <button
              type="button"
              className="button"
              onClick={() => table.insure(0)}
            >
              No insurance <kbd>N</kbd>
            </button>
          </>
        )}

        {/*
          Decided, at a shared table, while somebody else is still thinking.
          The same honesty rule as the deal window: without this line the
          buttons vanish and nothing happens, which reads as a hang.
        */}
        {isInsuring && !insuranceOpen && !table.spectating && (
          <span className="table-ui__prompt">
            Insurance is down — waiting for the table
          </span>
        )}

        {isBetting && !isBroke && (
          <>
            {/*
              What the click did.

              At a shared table a wager is handed to the room and nothing local
              changes until every seat is in — which can be half a minute, and
              during which the bankroll does not move, no chips appear and the
              buttons sit there looking exactly as they did. It read as the
              buttons being broken, and the fix is to say what is happening:
              your stake, and who the table is waiting for.
            */}
            <span className="table-ui__prompt">
              {waitingForTable
                ? `$${table.pendingBet} in — waiting for the table (${table.staked} of ${table.seatedCount})${countdownSuffix}`
                : offline
                  ? 'Reconnecting to the table…'
                  : // The same clock, from the other side: whoever has not
                    // staked is the one the deadline is really for.
                    `Place your bet${countdownSuffix}`}
            </span>
            {CHIP_DENOMINATIONS.map((amount, index) => (
              <button
                key={amount}
                type="button"
                className={`button button--chip button--chip-${amount}`}
                /*
                 * Dead while the room has the wager, because a second click
                 * would replace the first rather than adding to it — the room
                 * holds one stake per player and the last one sent wins.
                 * Dead while the socket is down for the reason `wager` already
                 * refuses: betting locally is what forked two players into
                 * separate games.
                 */
                disabled={amount > bankroll || waitingForTable || offline}
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
            {debt > 0 ? (
              /*
               * One marker at a time. The game has to name the way out here —
               * a broke player in debt with no instructions is a dead end, and
               * the clinic exists precisely so there is never one.
               */
              <span className="table-ui__prompt">
                Red River Plasma, down the strip, buys blood.
              </span>
            ) : (
              <button type="button" className="button button--primary" onClick={takeMarker}>
                Take a marker — ${MARKER_AMOUNT}
              </button>
            )}
          </>
        )}

        {isPlayerTurn && (
          <>
            {/*
              * Once there is more than one hand the active hand's bet is no
              * longer what is at risk, so both figures are named. Reading
              * "$10 in play" with $30 on the felt is how a player talks
              * themselves into a split they cannot afford.
              */}
            <span className="table-ui__prompt">
              {hands.length > 1
                ? `$${current?.bet ?? 0} on hand ${activeHandIndex + 1} of ${
                    hands.length
                  } · $${staked} in play`
                : `$${current?.bet ?? 0} in play`}
              {turnSuffix}
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

        {isResolved && (
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
          Leave table <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
