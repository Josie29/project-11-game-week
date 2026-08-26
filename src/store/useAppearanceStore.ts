import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_APPEARANCE,
  sanitizeAppearance,
  type Appearance,
} from '../character/appearance'
import {
  findItem,
  sanitizeEquipped,
  sanitizeOwned,
  Slot,
  type EquippedItems,
} from '../character/catalog'
import {
  approvalTotal,
  fitted,
  isFitting,
  NO_FITTING,
  payFor,
  withItem,
  withoutSlot,
  type Fitting,
} from '../character/fitting'
import { FALLBACK_NAME, sanitizePlayerName } from '../world/presence'
import { useGameStore } from './useGameStore'

/** Why a bill did not settle, or that it did. */
export enum CheckoutResult {
  Paid = 'paid',
  /** Nothing on approval: there is no bill to pay. */
  NothingOwing = 'nothing-owing',
  /** The bankroll will not cover the lot. Nothing is bought and nothing comes off. */
  TooExpensive = 'too-expensive',
}

interface AppearanceStore {
  appearance: Appearance
  /** Item ids the player has paid for. The record of what was actually bought. */
  owned: string[]
  equipped: EquippedItems
  /**
   * What is on the body on approval: tried on in the shop, not paid for.
   *
   * Never persisted, and cleared on the way out of the shop. `equipped` still
   * means "owned and worn", which is what keeps `sanitizeEquipped`'s guard
   * meaningful.
   */
  fitting: Fitting
  /** False until the designer has been through once, which gates the first spawn. */
  hasDesigned: boolean
  /**
   * What other players see over this one's head.
   *
   * Lives with the wardrobe rather than the bankroll because it is part of who
   * the player decided to be, chosen in the same screen as the rest of it.
   */
  playerName: string

  setAppearance: (appearance: Appearance) => void
  setPlayerName: (name: string) => void
  completeDesign: () => void
  /**
   * Settles the whole bill at the counter: everything on approval, in one move.
   *
   * All of it or none of it, which is the difference between a counter and the
   * per-item Buy button this replaced. It leaves the goods on the body because
   * that is where they already are — the player is standing at the till wearing
   * them, and a purchase that undressed them would read as a failure.
   */
  checkout: () => CheckoutResult
  equip: (itemId: string) => void
  unequip: (slot: Slot) => void
  /**
   * Puts an item on, whether or not it is owned.
   *
   * Ownership decides which layer it lands in, so a caller never has to know:
   * something already paid for is equipped and persists, anything else goes on
   * approval.
   */
  tryOn: (itemId: string) => void
  /**
   * Takes the top layer off a slot.
   *
   * Anything on approval comes off first, revealing whatever is owned
   * underneath; a second call unequips that. Two presses of F, each doing the
   * obvious thing.
   */
  takeOff: (slot: Slot) => void
  /** Hands everything unpaid for back. Called on the way out of the shop. */
  clearFitting: () => void
  /** Wipes the wardrobe and reopens the designer. Dev and "start over" only. */
  reset: () => void
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set, get) => ({
      appearance: DEFAULT_APPEARANCE,
      owned: [],
      equipped: {},
      fitting: NO_FITTING,
      hasDesigned: false,
      playerName: FALLBACK_NAME,

      setAppearance: (appearance) => set({ appearance }),

      // Sanitized on the way in as well as on the way out: this is the one
      // field a player types, and it is drawn to a canvas for strangers.
      setPlayerName: (name) => set({ playerName: sanitizePlayerName(name) }),

      completeDesign: () => set({ hasDesigned: true }),

      checkout: () => {
        const { equipped, owned, fitting } = get()
        if (!isFitting(fitting)) return CheckoutResult.NothingOwing

        // Read the bankroll at the moment of payment rather than from a
        // subscription, so a hand settling mid-click cannot let an unaffordable
        // bill through on a stale number.
        const game = useGameStore.getState()
        if (game.bankroll < approvalTotal(fitting)) return CheckoutResult.TooExpensive

        const settled = payFor(equipped, owned, fitting)

        game.adjustBankroll(-settled.total)
        // Paid for, worn, and off approval together. Nothing changes place on
        // the body — it only stops being borrowed.
        set({
          owned: [...settled.owned],
          equipped: settled.equipped,
          fitting: NO_FITTING,
        })
        return CheckoutResult.Paid
      },

      equip: (itemId) => {
        const item = findItem(itemId)
        // Equipping something unowned would hand out a $900 pendant for free.
        if (!item || !get().owned.includes(item.id)) return

        // Wearing something you own clears anything borrowed in that slot;
        // otherwise the borrowed item would go on covering it.
        set({
          equipped: { ...get().equipped, [item.slot]: item.id },
          fitting: withoutSlot(get().fitting, item.slot),
        })
      },

      unequip: (slot) => {
        const next = { ...get().equipped }
        delete next[slot]
        set({ equipped: next })
      },

      tryOn: (itemId) => {
        const item = findItem(itemId)
        if (!item) return

        if (get().owned.includes(item.id)) {
          get().equip(item.id)
          return
        }

        set({ fitting: withItem(get().fitting, item) })
      },

      takeOff: (slot) => {
        const { fitting } = get()

        if (fitting[slot] !== undefined) {
          set({ fitting: withoutSlot(fitting, slot) })
          return
        }

        get().unequip(slot)
      },

      clearFitting: () => set({ fitting: NO_FITTING }),

      reset: () =>
        set({
          appearance: DEFAULT_APPEARANCE,
          owned: [],
          equipped: {},
          fitting: NO_FITTING,
          hasDesigned: false,
        }),
    }),
    {
      // A separate key from `neon-strip-save` on purpose: adding the wardrobe
      // must not invalidate an existing player's bankroll.
      name: 'neon-strip-wardrobe',
      /*
       * Everything in this store is user-writable localStorage, and all three
       * fields feed geometry. A stale enum member or a since-removed item id
       * renders as a hole in the character rather than an error, so each is
       * coerced back into something drawable on the way in.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppearanceStore>
        const owned = sanitizeOwned(saved.owned)

        return {
          ...current,
          appearance: sanitizeAppearance(saved.appearance),
          owned,
          equipped: sanitizeEquipped(saved.equipped, owned),
          hasDesigned: saved.hasDesigned === true,
          playerName: sanitizePlayerName(saved.playerName),
        }
      },
      /*
       * `fitting` is deliberately absent.
       *
       * It is the one field that holds items the player has not paid for, so
       * writing it to `localStorage` would be handing out the wardrobe: the
       * save would come back with a $900 pendant on the body, and unlike
       * `equipped` there is no ownership check that could drop it again.
       * Reloading in a changing room is the same as walking out of one.
       */
      partialize: (state) => ({
        appearance: state.appearance,
        playerName: state.playerName,
        owned: state.owned,
        equipped: state.equipped,
        hasDesigned: state.hasDesigned,
      }),
    },
  ),
)

/**
 * What the character is wearing right now: owned kit, plus anything on approval.
 *
 * Every figure that represents *the player* reads this rather than `equipped` —
 * the walking rig and the mirror both. Outside the shop the fitting is empty and
 * it resolves to `equipped` unchanged, so it is safe everywhere.
 *
 * Memoised rather than derived inside the selector: `fitted` returns a fresh
 * object, and zustand compares selector results by identity, so selecting it
 * directly would re-render on every store write in the game.
 */
export function useFittedEquipped(): EquippedItems {
  const equipped = useAppearanceStore((state) => state.equipped)
  const fitting = useAppearanceStore((state) => state.fitting)

  return useMemo(() => fitted(equipped, fitting), [equipped, fitting])
}
