import { createGameFromShoe, createShoe, placeBet } from '../games/blackjack/engine'
import { PlayerAction, Rank, Suit } from '../games/blackjack/types'
import { Garment, HairStyle, sanitizeAppearance } from '../character/appearance'
import {
  appearanceOverrides,
  hasAppearanceOverride,
  pitchRadians,
  turnRadians,
  wornItems,
  zoomDistance,
} from './appearanceLinks'
import { Silhouette } from '../character/proportions'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'
import { useTimeStore } from '../store/useTimeStore'
import { SLOT_ORDER } from '../character/catalog'
import { AISLE_CENTER_X, TableId, WATER_COURT } from '../scenes/casinoFloorLayout'
import {
  displayFor,
  ENTRANCE as SHOP_ENTRANCE,
  EXIT_DOOR as SHOP_EXIT,
} from '../scenes/shopLayout'
import { donationTimeline, NurseTask } from '../scenes/clinicRoutine'
import { STREET_BOUNDS } from '../scenes/stripLayout'
import { MARKER_AMOUNT } from '../world/money'
import { PLACE_UNITS, rollCraps } from '../games/craps/engine'
import { CrapsBet, PLACE_BETS, POINT_NUMBERS, PointNumber } from '../scenes/crapsFeltLayout'
import { VenueId } from '../world/venues'

/** Wager staked automatically when deep-linking to a dealt table. */
const DEMO_BET = 50

/**
 * Bankroll handed to `?boot=mirror` and `?boot=short`.
 *
 * It used to straddle the two items on approval, back when each carried its own
 * Buy button and $600 showed one enabled and one disabled in a single frame.
 * The bill is settled in one now, so what this has to be is *under* the $1,420
 * total and plainly so — $820 short, which is the number the button prints.
 */
const FITTING_BANKROLL = 600

/**
 * Camera yaw that looks up the room at the window platform, in radians.
 *
 * The play camera trails the player down the length of the shop, so the window
 * — three dressed mannequins, the best thing in the room — is behind it on
 * arrival. Every capture that wants the stock in frame swings round to this.
 */
const WINDOW_LOOK = (170 * Math.PI) / 180

/**
 * Camera yaw that looks into the jewellery case, for `?boot=case`.
 *
 * The case runs down the left wall, so the camera has to swing west. Without it
 * the trailing camera stays pointed the way the player came in and the case is
 * a bright sliver at the edge of frame — which is how the case's contents went
 * missing for as long as they did.
 */
const CASE_LOOK = (80 * Math.PI) / 180

/** Bankroll handed to `?boot=shop`, enough to afford anything on the rails. */
const SHOPPING_SPREE = 5000

/** Camera yaw that looks back at the shop's door, for `?boot=held`. */
const DOOR_LOOK = (200 * Math.PI) / 180

/** Which recliner `?boot=drawing` uses. Mid-row, so both neighbours are in shot. */
const DRAWING_CHAIR = 1

/**
 * Where `?boot=shopfront` stands the player: at the door, on the mat.
 *
 * It used to stand well clear of it, because a door that opened on contact
 * meant standing at one was the same as being inside. Now that the door offers
 * and waits, the capture from here shows the storefront *and* the prompt that
 * gets you through it, which is the pair worth being able to look at.
 */
const SHOPFRONT_VIEWPOINT: readonly [number, number, number] = [6.6, 0, -6]

/** Where `?boot=clinicfront` stands the player. The mirror of the shop's. */
const CLINICFRONT_VIEWPOINT: readonly [number, number, number] = [6.6, 0, -22]

/**
 * The same for the Golden Ace, on the other side of the street.
 *
 * The two storefronts have had one of these for as long as they have existed
 * and the casino never did, so its entrance was the one piece of the strip that
 * appeared in no capture at all — the walkthrough passes it on the way in
 * without ever looking at it. A column of the tower's colonnade stood squarely
 * in front of that doorway for months, and this is the shot that would have
 * shown it. Compose with `?look=90`, which is the shop's `-90` mirrored.
 */
const CASINOFRONT_VIEWPOINT: readonly [number, number, number] = [-6.6, 0, -14]

/**
 * The two ends of the street, where the strip meets its cross streets.
 *
 * These exist because the thing they show could not otherwise be photographed.
 * The ends of the world were the worst-looking part of the strip for months and
 * never appeared in a single regression capture, because `npm run shots` can
 * only reach what a `?boot=` reaches — finding it meant driving a browser
 * twenty-six bursts down the road by hand. Anything that is only visible from
 * somewhere gets a way to stand there.
 */
const NORTH_END_VIEWPOINT: readonly [number, number, number] = [0, 0, STREET_BOUNDS.maxZ - 1]
const SOUTH_END_VIEWPOINT: readonly [number, number, number] = [0, 0, STREET_BOUNDS.minZ + 1]

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

/**
 * Honours the appearance deep links: `?build=`, `?hair=`, `?haircolor=`,
 * `?skin=`, `?garment=`, `?garmentcolor=` and `?wear=`.
 *
 * A modifier rather than a `?boot=` of its own, and for the same reason
 * `?dressed` is one: what needs checking is a given hairstyle or item *in a
 * given scene*. `?boot=designer&hair=ponytail&turn=180` is the capture that
 * would have caught the ponytail this rebuild started from, and it is
 * reachable only by composing the two.
 *
 * Items named by `?wear=` are granted rather than bought — the point is to look
 * at the geometry, not to exercise the bankroll, and `equip` refuses anything
 * unowned.
 */
function applyAppearanceShortcut(): void {
  const params = new URLSearchParams(window.location.search)
  if (!hasAppearanceOverride(params)) return

  const wardrobe = useAppearanceStore.getState()
  wardrobe.completeDesign()
  wardrobe.setAppearance(
    sanitizeAppearance({ ...wardrobe.appearance, ...appearanceOverrides(params) }),
  )

  if (!params.has('wear')) return

  /*
   * `?wear=` says what is on the figure, not what to add to it.
   *
   * It used to grant and equip what it named and leave whatever was already
   * saved in place, which makes a per-item capture run accumulate: by the
   * seventh item in an audit sweep the figure was in a hat, sunglasses, heels
   * and a cane, and every shot after the first was of the wrong subject. A
   * capture link has to be authoritative about the whole figure or it is not
   * reproducible, which is the entire point of having one.
   *
   * `?wear=` with nothing after it is therefore a valid request: strip the
   * figure. That is the capture that says what an item is worth wearing.
   */
  const wanted = wornItems(params)
  for (const slot of SLOT_ORDER) {
    useAppearanceStore.getState().unequip(slot)
  }
  useAppearanceStore.getState().clearFitting()

  useAppearanceStore.setState({ owned: [...new Set([...wardrobe.owned, ...wanted])] })
  for (const id of wanted) {
    useAppearanceStore.getState().equip(id)
  }
}

/**
 * Honours `?turn=`, `?pitch=` and `?zoom=` by seeding the stage's orbit.
 *
 * `?turn=` was the single most overdue line in this file: `?freeze` pinned the
 * turntable at rotation zero, so every regression capture of a character ever
 * taken on this project was a front view — and the defect that started the
 * character rebuild was a ponytail that only reads as wrong from behind.
 *
 * `?pitch=` and `?zoom=` are the same lesson learnt again one audit later. Half
 * of what that audit found is only visible from above the figure, and the head
 * is forty pixels tall at the stage's default distance, so both angles had to
 * be reached by scripting a pointer drag and a wheel event against the canvas —
 * which is a finding nobody can retake from a link.
 */
function applyOrbitShortcut(): void {
  const params = new URLSearchParams(window.location.search)

  const turn = turnRadians(params)
  if (turn !== null) useGameStore.setState({ designerYaw: turn })

  const pitch = pitchRadians(params)
  if (pitch !== null) useGameStore.setState({ designerPitch: pitch })

  const zoom = zoomDistance(params)
  if (zoom !== null) useGameStore.setState({ designerDistance: zoom })
}

/** Honours `?look=DEGREES` by seeding the walking camera's orbit yaw. */
function applyLookShortcut(): void {
  const look = new URLSearchParams(window.location.search).get('look')
  if (look === null) return

  const degrees = Number(look)
  if (!Number.isFinite(degrees)) return

  useGameStore.setState({ initialCameraYaw: (degrees * Math.PI) / 180 })
}

/**
 * Honours `?tilt=DEGREES` by seeding the walking camera's orbit pitch.
 *
 * `?look=` for the other axis. Negative tilts the view up, because a lower
 * orbit pitch seats the camera below the player's eyeline and aims it upward —
 * which is the only way anything above the springing line gets into a capture.
 * The casino's vault is the reason it exists: a player can drag to look at it
 * and `npm run shots` cannot, so it was rendering every frame into nobody's
 * view and no regression shot could have told anyone.
 */
function applyTiltShortcut(): void {
  const tilt = new URLSearchParams(window.location.search).get('tilt')
  if (tilt === null) return

  const degrees = Number(tilt)
  if (!Number.isFinite(degrees)) return

  useGameStore.setState({ initialCameraPitch: (degrees * Math.PI) / 180 })
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
 * - `?boot=water` stands at the pool, at the far end of the same room.
 * - `?boot=clinic` stands on Red River Plasma's floor.
 * - `?boot=drawing` sits in a chair with the needle already in.
 * - `?boot=broke` sits at blackjack with nothing, so the marker is on offer.
 * - `?boot=debt` sits there with nothing *and* a marker outstanding, which is
 *   the state that sends the player to the clinic.
 * - `?boot=designer` opens the dressing-room stage.
 * - `?boot=shop` stands on The Gilded Hanger's floor, everything affordable.
 * - `?boot=display` stands at the sequin jacket, its prompt and card up.
 * - `?boot=mirror` stands on the fitting plinth in a gown and a pendant that
 *   have not been paid for.
 * - `?boot=checkout` stands at the counter with the same two on approval and a
 *   bankroll that covers the bill.
 * - `?boot=short` is the same counter with $600 in hand, so the button reads
 *   how far off it is instead of what it would cost.
 * - `?boot=held` stands at the door in an unpaid gown with the clerk's line up,
 *   which is the second state of the exit prompt and cannot be walked to.
 * - `?dressed` puts the whole wardrobe on the player. A modifier, not a scene:
 *   compose it with any `?boot=` to check the outfit where it has to survive —
 *   `?boot=shop&dressed` for the anchors up close, `?boot=settled&dressed` for
 *   the gown on a stool, `?boot=strip&dressed` for the cane and the walk cycle.
 * - `?boot=strip` marks the character as designed and stands on the street.
 * - `?boot=northend` and `?boot=southend` stand at the two ends of the street,
 *   where it meets its cross streets.
 * - `?boot=shopfront` stands on the street a few paces from The Gilded Hanger,
 *   which is the only way to look at the storefront without walking there.
 * - `?boot=clinicfront` does the same for Red River Plasma, further down the
 *   same side of the street.
 * - `?boot=casinofront` does the same for the Golden Ace, across the road, and
 *   takes `?look=90` rather than `-90` because it faces the other way.
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
  applyAppearanceShortcut()
  applyOrbitShortcut()
  applyLookShortcut()
  applyTiltShortcut()

  const params = new URLSearchParams(window.location.search)
  const boot = params.get('boot')
  if (!boot) return

  const known = [
    'welcome',
    'settings',
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
    'water',
    'shop',
    'display',
    'case',
    'mirror',
    'checkout',
    'short',
    'held',
    'shopfront',
    'clinicfront',
    'casinofront',
    'strip',
    'northend',
    'southend',
  ]
  if (!known.includes(boot)) return

  if (boot === 'welcome') {
    /*
     * The one link that *keeps* the welcome screen up.
     *
     * It resets rather than merely declining to skip, because a capture profile
     * has `hasWelcomed` false already and a human's browser does not — without
     * the reset this link would work in `npm run shots` and show the strip to
     * the person checking it by hand.
     */
    useSessionStore.getState().reset()
    return
  }

  /*
   * Every other boot link puts the player straight into the game, on the same
   * rule that already skips the first-run designer: these links exist to make a
   * capture reproducible, and a menu in front of the scene is not that.
   *
   * Mode follows `?mp=1` so the opt-in keeps working. `npm run multiplayer`
   * needs `?boot=strip` to skip the designer *and* needs the socket, and the
   * socket is now gated on mode as well as on suppression.
   */
  useSessionStore
    .getState()
    .completeWelcome(params.get('mp') === '1' ? PlayMode.Multiplayer : PlayMode.Single)

  if (boot === 'settings') {
    /*
     * The settings panel, open on the strip.
     *
     * Multiplayer rather than Single so the capture shows the toggle in the
     * state that has something to say — and because the mode a `?boot=` link
     * sets is otherwise never visible in any shot.
     */
    useAppearanceStore.getState().completeDesign()
    useSessionStore.getState().openSettings()
    return
  }

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

  if (boot === 'casinofront') {
    // Other side of the street, so `?look=90` rather than `-90`.
    useAppearanceStore.getState().completeDesign()
    useGameStore.setState({ spawnPosition: CASINOFRONT_VIEWPOINT })
    return
  }

  if (boot === 'northend' || boot === 'southend') {
    // Compose with `?look=180` at the north end to look back up the street; the
    // south end already faces the right way.
    useAppearanceStore.getState().completeDesign()
    useGameStore.setState({
      spawnPosition: boot === 'northend' ? NORTH_END_VIEWPOINT : SOUTH_END_VIEWPOINT,
    })
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
    // Standing just inside the door, with enough in hand to buy anything on the
    // floor including the $900 pendant. Compose with `?dressed` to see the
    // fixtures marked Yours instead of priced.
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().adjustBankroll(SHOPPING_SPREE - useGameStore.getState().bankroll)
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    return
  }

  if (boot === 'case') {
    /*
     * At the jewellery case, prompt up, turned to look into it.
     *
     * The capture that would have caught the case bug. Every fixture in this
     * room had a link except the two glass cases, and the play camera trails the
     * player down the length of the shop — so the only shots anyone ever took of
     * the cases were of the far wall with a case edge-on in the corner, and four
     * items sealed inside a solid cream box went unnoticed.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    const chain = displayFor('gold-rope-chain')
    useGameStore.setState({
      shopPosition: chain?.standAt ?? SHOP_ENTRANCE,
      shopFacing: chain?.facing === undefined ? 0 : chain.facing + Math.PI,
      nearbyDisplay: 'gold-rope-chain',
    })

    // ...and the camera behind them, looking into the case rather than past it.
    if (!new URLSearchParams(window.location.search).has('look')) {
      useGameStore.setState({ initialCameraYaw: CASE_LOOK })
    }
    return
  }

  if (boot === 'display') {
    /*
     * At the sequin jacket on the window platform, prompt up.
     *
     * The capture that says whether a fixture reads as its item and whether the
     * price card can be read from where a player actually stands.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    const jacket = displayFor('sequin-jacket')
    useGameStore.setState({
      shopPosition: jacket?.standAt ?? SHOP_ENTRANCE,
      // Facing the mannequin, not the far wall. Without this the capture is of
      // the player's back and the fixture the prompt names is behind the camera.
      shopFacing: jacket?.facing === undefined ? 0 : jacket.facing + Math.PI,
      nearbyDisplay: 'sequin-jacket',
    })

    /*
     * ...and the camera behind them, looking the same way.
     *
     * `facing` turns the character; the trailing camera's seat comes from
     * `initialCameraYaw` and stays where it was, which left the first version of
     * this capture looking at the player's face with the jacket out of frame.
     * Skipped when `?look=` is present, so an explicit angle still wins.
     */
    if (!new URLSearchParams(window.location.search).has('look')) {
      useGameStore.setState({ initialCameraYaw: WINDOW_LOOK })
    }
    return
  }

  if (boot === 'mirror') {
    /*
     * On the fitting plinth in the gown and the pendant, neither paid for, with
     * a bankroll that covers one of them and not the other.
     *
     * The whole feature in one frame: try anything on, buy what you can afford.
     * $600 leaves the $520 gown buyable and the $900 pendant $300 short.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    useGameStore.getState().adjustBankroll(FITTING_BANKROLL - useGameStore.getState().bankroll)
    useAppearanceStore.getState().tryOn('crimson-gown')
    useAppearanceStore.getState().tryOn('solitaire-pendant')
    useGameStore.getState().standAtMirror()
    return
  }

  if (boot === 'checkout' || boot === 'short') {
    /*
     * At the counter with the same gown and pendant on approval.
     *
     * Two links rather than one because the button has two states and both are
     * worth a capture: `checkout` can settle the $1,420 bill, `short` is $820
     * off it. The bill is all-or-nothing now, so `FITTING_BANKROLL` no longer
     * straddles the two items — it is simply under the total.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    const purse = boot === 'checkout' ? SHOPPING_SPREE : FITTING_BANKROLL
    useGameStore.getState().adjustBankroll(purse - useGameStore.getState().bankroll)
    useAppearanceStore.getState().tryOn('crimson-gown')
    useAppearanceStore.getState().tryOn('solitaire-pendant')
    useGameStore.getState().standAtCheckout()
    return
  }

  if (boot === 'held') {
    /*
     * At the door in unpaid goods, with the clerk's line already up.
     *
     * The one interaction in the shop that cannot be captured by walking to a
     * spot: it is a *second* state of the exit prompt, reached by pressing F
     * once. Setting it here is what lets `npm run shots` see it at all.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    useAppearanceStore.getState().tryOn('crimson-gown')
    useGameStore.setState({
      shopPosition: [SHOP_EXIT[0], 0, SHOP_EXIT[2] - 1.2],
      shopFacing: 0,
      nearbyExit: true,
      heldAtDoor: true,
    })

    /*
     * ...and the camera swung round to look back at the door.
     *
     * At rest it trails the player, and a player standing at the door has a
     * wall a metre behind them: `CAMERA_BOUNDS` clamps the seat to just above
     * their head and the capture comes back as a plan view of a hat. Skipped
     * when `?look=` is present, so an explicit angle still wins.
     */
    if (!new URLSearchParams(window.location.search).has('look')) {
      useGameStore.setState({ initialCameraYaw: DOOR_LOOK })
    }
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

  if (boot === 'water') {
    /*
     * At the pool, in the gap between the two tables.
     *
     * `?boot=floor` arrives at the door, eighteen metres from the waterfall,
     * and the capture script can only *press* keys — it has no way to hold one
     * long enough to walk the length of the room. So the only view of the water
     * court anybody could check was the one from the far end of it, and the
     * whole point of putting it at the back of a room you walk down is that you
     * walk down to it.
     */
    useAppearanceStore.getState().completeDesign()
    useGameStore.getState().enterVenue(VenueId.GoldenAce)
    useGameStore.setState({ floorPosition: [AISLE_CENTER_X, 0, WATER_COURT.maxZ + 1.4] })
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
