# Dev deep links

Query parameters that boot the app into a given state. **Stripped from
production builds** — they work against `npm run dev` and preview builds only,
which is why `npm run walkthrough` drives the real UI instead.

| URL | Scene |
| --- | --- |
| `?boot=casino` | seated at blackjack, awaiting a bet |
| `?boot=table` | a hand dealt |
| `?boot=settled` | a hand played out |
| `?boot=split` | a stacked pair, ready to split |
| `?boot=resplit` | a pair, with a third of the same rank behind it |
| `?boot=insurance` | an ace showing, the insurance offer up |
| `?boot=push` | two twenties, so a push's wording can be read |
| `?boot=draw` | a dealer who must draw twice |
| `?boot=craps` | at the craps rail with a pass line down |
| `?boot=placed` | craps with a point set and all six numbers covered |
| `?boot=floor` | standing on the casino floor, between the tables |
| `?boot=water` | at the pool at the far end of the same room, under the waterfall |
| `?boot=clinic` | standing on Red River Plasma's floor |
| `?boot=clinicfront` | at the clinic's door, prompt up |
| `?boot=broke` | at blackjack with nothing, marker on offer |
| `?boot=debt` | at blackjack with nothing and a marker outstanding |
| `?boot=designer` | the dressing-room stage |
| `?boot=shop` | on The Gilded Hanger's floor, bankroll topped up |
| `?boot=display` | at the sequin jacket, its prompt and price card up |
| `?boot=mirror` | on the fitting plinth, a gown and a pendant on approval |
| `?boot=checkout` | at the counter, the same bill, enough in hand to settle it |
| `?boot=short` | the same counter, $820 short of the bill |
| `?boot=held` | at the door in an unpaid gown, the clerk calling you back |
| `?boot=shopfront` | at the shop's door, prompt up, to look at the storefront |
| `?boot=casinofront` | the same at the Golden Ace, across the road; takes `?look=90` |
| `?boot=dressed` | the shop, every wardrobe slot filled |
| `?boot=strip` | the street, with the first-run designer skipped |
| `?boot=welcome` | the welcome screen, held up rather than skipped |
| `?boot=northend` | at the north junction, where the strip meets its cross street |
| `?boot=southend` | the same at the south end |
| `?mp=1` | re-enables multiplayer under a `?boot=` link, which otherwise suppresses it |
| `?seat=N` | which blackjack stool, 0 (first base) to 4 (third base) |
| `?look=DEGREES` | swings the walking camera round before it settles |
| `?tilt=DEGREES` | tilts it up or down; negative looks up, at a ceiling |
| `?sheet=hair` | every hairstyle in one frame, labelled |
| `?sheet=items` | every catalogue item, one per figure |
| `?sheet=garments` | the four starter garments |
| `?sheet=builds` | three silhouettes across four garments |
| `?sheet=skin` | every skin, hair and garment swatch |
| `?build=` `?hair=` `?garment=` | one appearance field, by enum member |
| `?skin=` `?haircolor=` `?garmentcolor=` | one palette swatch, by id |
| `?wear=id,id` | grants and equips catalogue items |
| `?turn=DEGREES` | turns the dressing-room stage; 180 is the back |
| `?pitch=DEGREES` | raises the dressing-room camera; positive looks down |
| `?zoom=METRES` | how far it stands off; under 2.4 it frames the head |
| `?time=HH:MM` | opens at that hour, clock still running |
| `?freeze` | holds the clock and both turntables, so a capture is reproducible |

## Notes

- `?time=` and `?freeze` compose with any `?boot=`. Every scene in `npm run
  shots` pins both — the clock runs during the settle delay, so an unpinned
  capture lands on a different sky and different HUD digits each run.
- Captures run in a fresh browser profile, so a bare `/` opens the welcome
  screen and then the designer. Every `?boot=` link clears both; `?boot=strip`
  exists so a strip regression shot is not a picture of a menu.
- `?boot=welcome` *resets* `hasWelcomed` rather than declining to skip it — a
  capture profile has the flag false already, so a link that only declined to
  skip would pass `npm run shots` and still show the strip to a person opening
  it by hand.
- `?look=` exists because the play camera trails the player, so every facade
  and the shop's own window platform are seen at a glancing angle or from
  behind. `?tilt=` covers the axis it does not: the camera looks *down*, so a
  ceiling renders every frame into nobody's view.
- `?pitch=` and `?zoom=` exist because half a character audit is invisible from
  eye level and at full length. `?zoom=` raises the look target toward the head
  as it comes in — a zoom that frames the collarbone is not a zoom.
- `?wear=` is **authoritative about every slot, not additive**; with nothing
  after it, it strips the figure.
- `?turn=` exists because for months every character capture was a front view,
  which is exactly the angle a broken ponytail looks fine from.
- `?sheet=` collapses a three-hundred-capture audit into one frame per sweep.
  Sheets cap at two rows — a third stands behind the second and cannot be seen.
  `contactSheet.test.ts` asserts the item sheet covers the catalogue exactly.
