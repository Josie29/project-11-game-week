import { useEffect } from 'react'
import type { ShopItem } from '../character/catalog'
import { approvalTotal, onApproval } from '../character/fitting'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_LABEL } from '../world/controls'
import { getVenue, type VenueId } from '../world/venues'

/*
 * The till, at the counter.
 *
 * The shop was a list with a Buy beside every row, then a room whose mirror
 * doubled as the till. It is a shop now: the stock is on fixtures, F puts
 * anything on for nothing, the mirror shows you what you look like in it, and
 * this is where you hand it over and find out whether you can afford the lot.
 *
 * One bill and one button, which is the part that changed. Paying item by item
 * let a player with $600 buy the gown and walk to the door still wearing an
 * unpaid pendant, and left them holding a purchase they made to find out what
 * they could afford. A bill is either settled or it is not.
 *
 * Nothing here is refundable: a shop that bought items back would be a money
 * printer, since prices are fixed and the bankroll is not.
 */

interface CheckoutPanelProps {
  venueId: VenueId
}

interface RowProps {
  item: ShopItem
}

function BillRow({ item }: RowProps) {
  const takeOff = useAppearanceStore((state) => state.takeOff)

  return (
    <li className="shop__item shop__item--stacked">
      <span className="shop__item-head">
        {/* Standing in for a thumbnail: the item's own colour, which is what
            distinguishes the two pairs of shoes and the three jackets. */}
        <span className="shop__swatch" style={{ background: item.colors.primary }} aria-hidden />
        <span className="shop__item-name">{item.name}</span>
        <span className="shop__price">${item.price.toLocaleString()}</span>
      </span>

      <span className="shop__actions">
        <button type="button" className="button button--ghost" onClick={() => takeOff(item.slot)}>
          Put it back
        </button>
      </span>
    </li>
  )
}

export function CheckoutPanel({ venueId }: CheckoutPanelProps) {
  const venue = getVenue(venueId)
  const bankroll = useGameStore((state) => state.bankroll)
  const leaveCheckout = useGameStore((state) => state.leaveCheckout)
  const checkout = useAppearanceStore((state) => state.checkout)
  const clearFitting = useAppearanceStore((state) => state.clearFitting)
  const fitting = useAppearanceStore((state) => state.fitting)

  const bill = onApproval(fitting)
  const total = approvalTotal(fitting)
  const shortfall = total - bankroll

  /*
   * Escape steps back off the counter, as it stands you up at both tables and
   * off the plinth. It does not leave the shop — a key that skipped from the
   * till straight onto the street would be the one thing in the building that
   * teleports.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') leaveCheckout()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leaveCheckout])

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__title">{venue.name}</h1>
        <p className="shop__subtitle">
          {bill.length > 0
            ? 'Everything you have on, and what it comes to.'
            : 'Nothing on the counter.'}
        </p>
      </header>

      {bill.length > 0 ? (
        <>
          <section className="shop__group">
            <h2 className="shop__group-label">On the counter</h2>
            <ul className="shop__group" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {bill.map((item) => (
                <BillRow key={item.id} item={item} />
              ))}
            </ul>
          </section>

          {/*
            The total against the bankroll, said out loud. Four things tried on
            across a room is easy to lose track of, and the whole reason the
            till is a counter is so the number arrives in one piece.
          */}
          <dl className="shop__tally">
            <div>
              <dt>Total</dt>
              <dd className={shortfall > 0 ? 'shop__price--short' : undefined}>
                ${total.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Bankroll</dt>
              <dd>${bankroll.toLocaleString()}</dd>
            </div>
          </dl>

          <div className="shop__leave">
            <button
              type="button"
              className="button button--primary"
              disabled={shortfall > 0}
              onClick={() => checkout()}
            >
              {shortfall > 0 ? `$${shortfall.toLocaleString()} short` : `Pay $${total.toLocaleString()}`}
            </button>
            {/*
              The way out of a bill you cannot pay, and the reason the clerk's
              refusal at the door is a nudge rather than a lock: without one
              button that empties the counter, getting under the total means
              walking back to every fixture you tried something on at.
            */}
            <button type="button" className="button button--ghost" onClick={clearFitting}>
              Put it all back
            </button>
          </div>
        </>
      ) : (
        <p className="shop__empty">
          Everything you have on is yours. Walk the floor and press{' '}
          <kbd>{INTERACT_LABEL}</kbd> at anything you want to try.
        </p>
      )}

      <div className="shop__leave">
        <button type="button" className="button button--ghost" onClick={leaveCheckout}>
          Step back <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
