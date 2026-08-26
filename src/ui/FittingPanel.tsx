import { useEffect } from 'react'
import type { ShopItem } from '../character/catalog'
import { approvalTotal, onApproval } from '../character/fitting'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_LABEL } from '../world/controls'
import { getVenue, type VenueId } from '../world/venues'

/*
 * The till, at the mirror.
 *
 * The shop used to be a list of all twelve items with a Buy beside each one.
 * It is a room now: the stock is on fixtures, F puts anything on for nothing,
 * and this is where you find out what you are standing in and whether you can
 * afford it.
 *
 * So it lists only what is on approval — worn, unpaid for — and nothing else.
 * Purchases go through `useAppearanceStore.buy`, which debits the same bankroll
 * the tables use. Nothing here is refundable: a shop that bought items back
 * would be a money printer, since prices are fixed and the bankroll is not.
 */

interface FittingPanelProps {
  venueId: VenueId
}

interface RowProps {
  item: ShopItem
  bankroll: number
}

function ApprovalRow({ item, bankroll }: RowProps) {
  const buy = useAppearanceStore((state) => state.buy)
  const takeOff = useAppearanceStore((state) => state.takeOff)

  const shortfall = item.price - bankroll

  /*
   * Stacked rather than in one line.
   *
   * The catalogue row this replaces carried a price and one button; this one
   * carries a price and two, and in a 26rem column that squeezed the blurb to
   * two words a line. The name and the price belong together on the top line —
   * they are the pair the player is comparing — and the buttons get a line of
   * their own underneath.
   */
  return (
    <li className="shop__item shop__item--stacked">
      <span className="shop__item-head">
        {/* Standing in for a thumbnail: the item's own colour, which is what
            distinguishes the two pairs of shoes and the three jackets. */}
        <span className="shop__swatch" style={{ background: item.colors.primary }} aria-hidden />
        <span className="shop__item-name">{item.name}</span>
        <span className={`shop__price${shortfall > 0 ? ' shop__price--short' : ''}`}>
          {shortfall > 0
            ? `$${shortfall.toLocaleString()} short`
            : `$${item.price.toLocaleString()}`}
        </span>
      </span>

      <span className="shop__item-blurb">{item.blurb}</span>

      <span className="shop__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={shortfall > 0}
          onClick={() => buy(item.id)}
        >
          Buy
        </button>
        <button type="button" className="button button--ghost" onClick={() => takeOff(item.slot)}>
          Take off
        </button>
      </span>
    </li>
  )
}

export function FittingPanel({ venueId }: FittingPanelProps) {
  const venue = getVenue(venueId)
  const bankroll = useGameStore((state) => state.bankroll)
  const leaveMirror = useGameStore((state) => state.leaveMirror)
  const openDesigner = useGameStore((state) => state.openDesigner)
  const fitting = useAppearanceStore((state) => state.fitting)

  const unpaid = onApproval(fitting)
  const total = approvalTotal(fitting)

  /*
   * Escape steps back off the plinth, as it stands you up at both tables.
   *
   * It no longer leaves the shop: the shop is a room with a door in it now, and
   * a key that skipped from the changing area straight onto the street would be
   * the one place in the building that teleports.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') leaveMirror()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leaveMirror])

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__title">{venue.name}</h1>
        <p className="shop__subtitle">
          Try on anything you like. None of it changes your odds — it only changes who is losing.
        </p>
      </header>

      {unpaid.length > 0 ? (
        <>
          <section className="shop__group">
            <h2 className="shop__group-label">On approval</h2>
            <ul className="shop__group" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {unpaid.map((item) => (
                <ApprovalRow key={item.id} item={item} bankroll={bankroll} />
              ))}
            </ul>
          </section>

          {/*
            The total, said out loud. Four things tried on across a room is easy
            to lose track of, and finding out at the till is the sort of surprise
            a bankroll this fragile does not need.
          */}
          <dl className="shop__tally">
            <div>
              <dt>What you have on</dt>
              <dd className={total > bankroll ? 'shop__price--short' : undefined}>
                ${total.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Bankroll</dt>
              <dd>${bankroll.toLocaleString()}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="shop__empty">
          Everything you have on is yours. Walk the floor and press{' '}
          <kbd>{INTERACT_LABEL}</kbd> at anything you want to try.
        </p>
      )}

      <div className="shop__leave">
        <button type="button" className="button" onClick={openDesigner}>
          Change your look
        </button>
        <button type="button" className="button button--ghost" onClick={leaveMirror}>
          Step down <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
