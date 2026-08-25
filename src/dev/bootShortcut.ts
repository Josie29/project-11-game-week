import { createGameFromShoe, createShoe, placeBet } from '../games/blackjack/engine'
import { PlayerAction, Rank, Suit } from '../games/blackjack/types'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { CrapsBet } from '../scenes/crapsFeltLayout'
import { CasinoId } from '../world/casinos'

/** Wager staked automatically when deep-linking to a dealt table. */
const DEMO_BET = 50

/** Matches a 24-hour `HH:MM`, rejecting impossible hours and minutes. */
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Honours `?time=HH:MM` to open at an hour, and `?freeze` to hold it there.
 *
 * The two are separate because they serve opposite needs. Watching a transition
 * means jumping to just before sunrise and letting it run, so `?time=` alone
 * keeps the clock moving. A screenshot means the opposite: time running through
 * the settle delay lands each capture on whatever hour it happened to reach, so
 * two runs disagree and the regression check is worthless — hence `?freeze`.
 *
 * Both apply independently of `?boot=`, so all three compose.
 */
function applyTimeShortcut(): void {
  const params = new URLSearchParams(window.location.search)
  const time = params.get('time')

  if (time) {
    const match = CLOCK_PATTERN.exec(time)
    const hours = match?.[1]
    const minutes = match?.[2]
    if (hours !== undefined && minutes !== undefined) {
      useTimeStore.getState().setMinuteOfDay(Number(hours) * 60 + Number(minutes))
    }
  }

  if (params.has('freeze')) {
    useTimeStore.getState().setPaused(true)
  }
}

/**
 * Honours a `?boot=` query parameter so a scene can be opened directly.
 *
 * Walking the strip every time you want to look at the table is a slow loop
 * when iterating on the felt or the card art, and it makes rehearsing the demo
 * from a specific point awkward. Development builds only.
 *
 * - `?boot=casino` opens the Golden Ace at the betting prompt.
 * - `?boot=table` opens the Golden Ace with a hand already dealt.
 * - `?boot=settled` plays that hand out, so the hole card is turned over.
 * - `?boot=split` deals a pair, which a random shoe will not reliably do.
 * - `?boot=draw` forces the dealer to draw twice, which is the case the staged
 *   reveal exists for and which a random shoe rarely produces on demand.
 * - `?boot=craps` opens the Lucky Viper with a pass-line bet already down.
 * - `?time=HH:MM` opens at that hour, with the clock still running.
 * - `?freeze` holds the clock wherever it is, so a capture is reproducible.
 *
 * All three compose, e.g. `?boot=craps&time=06:00&freeze`.
 */
export function applyBootShortcut(): void {
  applyTimeShortcut()

  const boot = new URLSearchParams(window.location.search).get('boot')
  if (!boot) return

  const known = ['casino', 'table', 'settled', 'split', 'draw', 'craps']
  if (!known.includes(boot)) return

  if (boot === 'craps') {
    useGameStore.getState().enterCasino(CasinoId.LuckyViper)
    useCrapsStore.getState().wager(CrapsBet.PassLine, DEMO_BET)
    return
  }

  useGameStore.getState().enterCasino(CasinoId.GoldenAce)

  if (boot === 'split') {
    // Stack a pair of eights against a dealer sixteen, then let the rest of the
    // shoe fall wherever. Deal order is player, dealer, player, dealer.
    const stacked = [
      { rank: Rank.Eight, suit: Suit.Spades },
      { rank: Rank.Ten, suit: Suit.Clubs },
      { rank: Rank.Eight, suit: Suit.Hearts },
      { rank: Rank.Six, suit: Suit.Diamonds },
      ...createShoe(7),
    ]

    useGameStore.getState().adjustBankroll(-DEMO_BET)
    useBlackjackStore.setState({ game: placeBet(createGameFromShoe(stacked), DEMO_BET) })
    return
  }

  if (boot === 'draw') {
    // Player 20 stands pat; the dealer opens on 13 and has to draw twice to
    // reach seventeen, so the reveal has cards to stage.
    const stacked = [
      { rank: Rank.Ten, suit: Suit.Spades },
      { rank: Rank.Six, suit: Suit.Hearts },
      { rank: Rank.Ten, suit: Suit.Diamonds },
      { rank: Rank.Seven, suit: Suit.Clubs },
      { rank: Rank.Two, suit: Suit.Spades },
      { rank: Rank.Three, suit: Suit.Hearts },
      ...createShoe(11),
    ]

    useGameStore.getState().adjustBankroll(-DEMO_BET)
    useBlackjackStore.setState({ game: placeBet(createGameFromShoe(stacked), DEMO_BET) })
    return
  }

  if (boot === 'table' || boot === 'settled') {
    useBlackjackStore.getState().placeWager(DEMO_BET)
  }

  if (boot === 'settled') {
    // Standing hands over to the dealer and resolves the round, which is the
    // only way to see the hole card flip without playing through by hand.
    useBlackjackStore.getState().takeAction(PlayerAction.Stand)
  }
}
