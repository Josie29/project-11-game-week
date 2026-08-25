import { createGameFromShoe, createShoe, placeBet } from '../games/blackjack/engine'
import { PlayerAction, Rank, Suit } from '../games/blackjack/types'
import { Garment, HairStyle } from '../character/appearance'
import { Silhouette } from '../character/proportions'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { TableId } from '../scenes/casinoFloorLayout'
import { donationTimeline, NurseTask } from '../scenes/clinicRoutine'
import { MARKER_AMOUNT } from '../world/money'
import { PLACE_UNITS, rollCraps } from '../games/craps/engine'
import { CrapsBet, PLACE_BETS, POINT_NUMBERS, PointNumber } from '../scenes/crapsFeltLayout'
import { VenueId } from '../world/venues'

/** Wager staked automatically when deep-linking to a dealt table. */
const DEMO_BET = 50

/** Bankroll handed to `?boot=shop`, enough to afford anything on the rails. */
const SHOPPING_SPREE = 5000

/** Which recliner `?boot=drawing` uses. Mid-row, so both neighbours are in shot. */
const DRAWING_CHAIR = 1

/** Where `?boot=shopfront` stands the player. Clear of the door trigger. */
const SHOPFRONT_VIEWPOINT: readonly [number, number, number] = [4.2, 0, -6]

/** Where `?boot=clinicfront` stands the player. The mirror of the shop's. */
const CLINICFRONT_VIEWPOINT: readonly [number, number, number] = [4.2, 0, -22]

/**
 * A fully accessorised character, for `?dressed`.
 *
 * Deliberately covers every slot at once. Each item is anchored separately, and
 * the combinations that clip — a wide-brim hat against tall hair, a cane
 * against the walk cycle, a gown against a stool — only show up when they are
 * all worn together.
 */
const FULL_OUTFIT: readonly string[] = [
  'sequin-jacket',
  'felt-fedora',
  'blackout-shades',
  'solitaire-pendant',
  'bracelet-watch',
  'signet-ring',
  'oxblood-oxfords',
  'lacquer-cane',
]

/**
 * Honours `?dressed` by putting the whole wardrobe on the player.
 *
 * A modifier rather than a `?boot=` of its own, and for the same reason
 * `?time=` is: what needs checking is the outfit *in each scene*. The gown's
 * hem only misbehaves on a stool, and the cane only meets the walk cycle
 * outdoors, so `?boot=settled&dressed` and `?boot=strip&dressed` are the two
 * captures that matter and neither is reachable from a single fixed link.
 */
function applyWardrobeShortcut(): void {
  if (!new URLSearchParams(window.location.search).has('dressed')) return

  const wardrobe = useAppearanceStore.getState()

  wardrobe.completeDesign()
  wardrobe.setAppearance({
    ...wardrobe.appearance,
    silhouette: Silhouette.Feminine,
    hairStyle: HairStyle.Long,
    hairColor: 'magenta',
    skinTone: 'bronze',
    garment: Garment.CocktailDress,
    garmentColor: 'crimson',
  })

  // Granted rather than bought: the point is to look at the geometry, not to
  // exercise the bankroll, and `equip` refuses anything unowned.
  useAppearanceStore.setState({ owned: [...FULL_OUTFIT] })
  for (const id of FULL_OUTFIT) {
    wardrobe.equip(id)
  }
}

/** Honours `?look=DEGREES` by seeding the strip camera's orbit yaw. */
function applyLookShortcut(): void {
  const look = new URLSearchParams(window.location.search).get('look')
  if (look === null) return

  const degrees = Number(look)
  if (!Number.isFinite(degrees)) return

  useGameStore.setState({ initialCameraYaw: (degrees * Math.PI) / 180 })
}

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
 * - `?boot=resplit` deals a pair *and* stacks a third of the same rank behind
 *   it, so the two-split path to three hands can be walked on demand.
 * - `?boot=push` deals two twenties, so the panel's wording for a stake coming
 *   back untouched can be read rather than waited for.
 * - `?boot=draw` forces the dealer to draw twice, which is the case the staged
 *   reveal exists for and which a random shoe rarely produces on demand.
 * - `?boot=craps` stands at the craps table with a pass-line bet already down.
 * - `?boot=placed` stands there with a point set and every number covered,
 *   which is the only way to see the puck and a stack of chips sharing one box
 *   — the case the box is split left and right for.
 * - `?boot=floor` stands on the casino floor, between the two tables.
 * - `?boot=clinic` stands on Red River Plasma's floor.
 * - `?boot=drawing` sits in a chair with the needle already in.
 * - `?boot=broke` sits at blackjack with nothing, so the marker is on offer.
 * - `?boot=debt` sits there with nothing *and* a marker outstanding, which is
 *   the state that sends the player to the clinic.
 * - `?boot=designer` opens the dressing-room stage.
 * - `?boot=shop` opens The Gilded Hanger with the catalogue affordable.
 * - `?dressed` puts the whole wardrobe on the player. A modifier, not a scene:
 *   compose it with any `?boot=` to check the outfit where it has to survive —
 *   `?boot=shop&dressed` for the anchors up close, `?boot=settled&dressed` for
 *   the gown on a stool, `?boot=strip&dressed` for the cane and the walk cycle.
 * - `?boot=strip` marks the character as designed and stands on the street.
 * - `?boot=shopfront` stands on the street a few paces from The Gilded Hanger,
 *   which is the only way to look at the storefront without walking there.
 * - `?boot=clinicfront` does the same for Red River Plasma, further down the
 *   same side of the street.
 * - `?look=DEGREES` swings the strip camera round the player before it settles,
 *   so a facade can be captured face-on instead of at the glancing angle the
 *   play camera gives. Positive swings toward the left of the street.
 * - `?time=HH:MM` opens at that hour, with the clock still running.
 * - `?freeze` holds the clock wherever it is, so a capture is reproducible.
 *
 * All of them compose, e.g. `?boot=settled&dressed&time=06:00&freeze`.
 */
export function applyBootShortcut(): void {
  applyTimeShortcut()
  applyWardrobeShortcut()
  applyLookShortcut()

  const boot = new URLSearchParams(window.location.search).get('boot')
  if (!boot) return

  const known = [
    'casino',
    'table',
    'settled',
    'split',
    'resplit',
    'push',
    'draw',
    'craps',
    'placed',
    'broke',
    'clinic',
    'debt',
    'drawing',
    'designer',
    'floor',
    'shop',
    'shopfront',
    'clinicfront',
    'strip',
  ]
  if (!known.includes(boot)) return

  if (boot === 'designer') {
    useGameStore.getState().openDesigner()
    return
  }

  if (boot === 'shopfront') {
    /*
     * Out on the road level with the shop's door, and just outside its trigger
     * radius. Compose with `?look=-90` to swing the camera round and put the
     * storefront face-on; without it the play camera looks down the street and
     * the frontage is edge-on.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.setState({ spawnPosition: SHOPFRONT_VIEWPOINT })
    return
  }

  if (boot === 'clinicfront') {
    // Same side as the shop, so the same `?look=-90` frames it face-on.
    useAppearanceStore.getState().completeDesign()
    useGameStore.setState({ spawnPosition: CLINICFRONT_VIEWPOINT })
    return
  }

  if (boot === 'strip') {
    /*
     * Every capture runs in a fresh browser profile, so `hasDesigned` is false
     * and the app would otherwise open on the designer rather than the street.
     * This is the switch that keeps the strip regression shots showing the
     * strip.
     */
    useAppearanceStore.getState().completeDesign()
    return
  }

  if (boot === 'shop') {
    // Topped up so every row in the catalogue is buyable, including the $900
    // pendant. Compose with `?dressed` to see the owned-and-worn rows instead.
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().adjustBankroll(SHOPPING_SPREE - useGameStore.getState().bankroll)
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    return
  }

  if (boot === 'clinic') {
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.RedRiverPlasma)
    return
  }

  if (boot === 'drawing') {
    /*
     * Mid-needle, with the phase set directly rather than by running the
     * sequence.
     *
     * `?freeze` holds the game clock but not `setTimeout`, so a capture racing
     * a real draw lands on a different frame every run — and would pay out
     * partway through the screenshot.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.RedRiverPlasma)
    useGameStore.getState().sitInChair(DRAWING_CHAIR)
    useGameStore.setState({
      donation: {
        chair: DRAWING_CHAIR,
        startedAt: performance.now() - donationTimeline().needleAt,
      },
      nurseTask: NurseTask.Working,
    })
    return
  }

  if (boot === 'broke') {
    // At the table with nothing, which is the state the marker and the clinic
    // exist for and which is otherwise reachable only by actually losing.
    useAppearanceStore.getState().completeDesign()
    useGameStore.setState({ bankroll: 0, debt: 0 })
    useGameStore.getState().enterVenue(VenueId.GoldenAce)
    useGameStore.getState().sitAt(TableId.Blackjack)
    return
  }

  if (boot === 'debt') {
    // Broke *and* into the house, which is the other half of that state: no
    // marker on offer, and the panel pointing down the strip instead.
    useAppearanceStore.getState().completeDesign()
    useGameStore.setState({ bankroll: 0, debt: MARKER_AMOUNT })
    useGameStore.getState().enterVenue(VenueId.GoldenAce)
    useGameStore.getState().sitAt(TableId.Blackjack)
    return
  }

  if (boot === 'floor') {
    // Standing on the casino floor. Every other casino link sits the player
    // down immediately, so without this there is no way to capture the room.
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GoldenAce)
    return
  }

  // Everything below opens the one casino and sits the player at a table.
  // `enterVenue` always arrives on foot, so each of these has to sit down.
  useGameStore.getState().enterVenue(VenueId.GoldenAce)

  if (boot === 'craps') {
    useGameStore.getState().sitAt(TableId.Craps)
    useCrapsStore.getState().wager(CrapsBet.PassLine, DEMO_BET)
    return
  }

  if (boot === 'placed') {
    useGameStore.getState().sitAt(TableId.Craps)
    useGameStore.setState({ bankroll: SHOPPING_SPREE })

    /*
     * Roll through the engine until a point is set, rather than writing one
     * into the store. The point gates whether the place bets are allowed at
     * all, so a hand-set point would let this show a state the engine cannot
     * reach — and this shortcut exists to check a real one.
     *
     * `rollCraps` directly rather than the store's `throwDice`, which parks the
     * result behind the tumble animation and refuses a second call while the
     * dice are in the air. A boot link wants the settled table, not the throw.
     *
     * Rolled with nothing on the line, because a come-out that misses the point
     * settles the pass line on the way past: staking it first and then rolling
     * for a point spends the bet more often than not, and the table arrives
     * with the line empty.
     */
    let settled = useCrapsStore.getState().game
    for (let attempt = 0; attempt < 50 && settled.point === null; attempt++) {
      settled = rollCraps(settled)
    }
    useCrapsStore.setState({ game: settled })

    for (const point of POINT_NUMBERS) {
      useCrapsStore.getState().wager(PLACE_BETS[point], PLACE_UNITS[point as PointNumber] * 5)
    }
    return
  }

  useGameStore.getState().sitAt(TableId.Blackjack)

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

  if (boot === 'resplit') {
    /*
     * Eights against a dealer sixteen, and a third eight waiting for the first
     * split hand — the hand a player actually reported being unable to break
     * up. Three betting spots is the widest the felt goes, so this is the only
     * link that shows `handAnchorX` at full stretch.
     *
     * Split once to reach it, split again to reach three hands.
     */
    const stacked = [
      { rank: Rank.Eight, suit: Suit.Spades },
      { rank: Rank.Ten, suit: Suit.Clubs },
      { rank: Rank.Eight, suit: Suit.Hearts },
      { rank: Rank.Six, suit: Suit.Diamonds },
      { rank: Rank.Eight, suit: Suit.Clubs }, // Onto hand one: eights again.
      { rank: Rank.Three, suit: Suit.Spades }, // Onto hand two.
      { rank: Rank.Two, suit: Suit.Hearts }, // The resplit's two cards.
      { rank: Rank.Ten, suit: Suit.Hearts },
      ...createShoe(13),
    ]

    useGameStore.getState().adjustBankroll(-DEMO_BET)
    useBlackjackStore.setState({ game: placeBet(createGameFromShoe(stacked), DEMO_BET) })
    return
  }

  if (boot === 'push') {
    /*
     * Two twenties, which settles as a push the moment it is dealt.
     *
     * Worth a link of its own because the payout on a push is the stake coming
     * straight back, and the panel used to print that as "+$50" — a refund
     * dressed as a win. A random shoe deals this rarely enough that the wording
     * went unread for a long time.
     */
    const stacked = [
      { rank: Rank.King, suit: Suit.Spades },
      { rank: Rank.Queen, suit: Suit.Clubs },
      { rank: Rank.Ten, suit: Suit.Hearts },
      { rank: Rank.Jack, suit: Suit.Diamonds },
      ...createShoe(17),
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
