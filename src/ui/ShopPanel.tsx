import { useEffect } from 'react'
import {
  itemsInSlot,
  SLOT_LABELS,
  SLOT_ORDER,
  type ShopItem,
  type Slot,
} from '../character/catalog'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { getVenue, type VenueId } from '../world/venues'

/*
 * The shop's catalogue, grouped by slot.
 *
 * Purchases go through `useAppearanceStore.buy`, which debits the same bankroll
 * the tables use. There is no second ledger and nothing here is refundable —
 * a shop that bought items back would be a money printer, since prices are
 * fixed and the bankroll is not.
 */

interface ShopPanelProps {
  venueId: VenueId
}

interface RowProps {
  item: ShopItem
  owned: boolean
  worn: boolean
  bankroll: number
}

function ItemRow({ item, owned, worn, bankroll }: RowProps) {
  const buy = useAppearanceStore((state) => state.buy)
  const equip = useAppearanceStore((state) => state.equip)
  const unequip = useAppearanceStore((state) => state.unequip)

  const shortfall = item.price - bankroll

  return (
    <li className={`shop__item${worn ? ' shop__item--worn' : ''}`}>
      {/* Standing in for a thumbnail: the item's own colour, which is what
          distinguishes the two pairs of shoes and the three jackets. */}
      <span className="shop__swatch" style={{ background: item.colors.primary }} aria-hidden />

      <span className="shop__item-text">
        <span className="shop__item-name">{item.name}</span>
        <span className="shop__item-blurb">{item.blurb}</span>
      </span>

      {owned ? (
        <span className="shop__actions">
          {worn ? (
            <button type="button" className="button" onClick={() => unequip(item.slot)}>
              Take off
            </button>
          ) : (
            <button type="button" className="button" onClick={() => equip(item.id)}>
              Wear
            </button>
          )}
        </span>
      ) : (
        <span className="shop__actions">
          <span className={`shop__price${shortfall > 0 ? ' shop__price--short' : ''}`}>
            {shortfall > 0 ? `$${shortfall.toLocaleString()} short` : `$${item.price.toLocaleString()}`}
          </span>
          <button
            type="button"
            className="button button--primary"
            disabled={shortfall > 0}
            onClick={() => buy(item.id)}
          >
            Buy
          </button>
        </span>
      )}
    </li>
  )
}

export function ShopPanel({ venueId }: ShopPanelProps) {
  const venue = getVenue(venueId)
  const bankroll = useGameStore((state) => state.bankroll)
  const leaveVenue = useGameStore((state) => state.leaveVenue)
  const openDesigner = useGameStore((state) => state.openDesigner)
  const owned = useAppearanceStore((state) => state.owned)
  const equipped = useAppearanceStore((state) => state.equipped)

  /*
   * Escape leaves, as it does at both tables. Every other door in the game
   * closes on this key; a shop that ignored it would read as the one room you
   * can get stuck in.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') leaveVenue()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leaveVenue])

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__title">{venue.name}</h1>
        <p className="shop__subtitle">
          Dress the part. None of it changes your odds — it only changes who is losing.
        </p>
      </header>

      {SLOT_ORDER.map((slot: Slot) => (
        <section key={slot} className="shop__group">
          <h2 className="shop__group-label">{SLOT_LABELS[slot]}</h2>
          <ul className="shop__group" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {itemsInSlot(slot).map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                owned={owned.includes(item.id)}
                worn={equipped[slot] === item.id}
                bankroll={bankroll}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="shop__leave">
        <button type="button" className="button" onClick={openDesigner}>
          Use the mirror
        </button>
        <button type="button" className="button button--ghost" onClick={leaveVenue}>
          Back to the strip <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
