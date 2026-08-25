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
import { useGameStore } from './useGameStore'

/** Why a purchase did not go through, or that it did. */
export enum PurchaseResult {
  Bought = 'bought',
  AlreadyOwned = 'already-owned',
  TooExpensive = 'too-expensive',
  UnknownItem = 'unknown-item',
}

interface AppearanceStore {
  appearance: Appearance
  /** Item ids the player has paid for. The record of what was actually bought. */
  owned: string[]
  equipped: EquippedItems
  /** False until the designer has been through once, which gates the first spawn. */
  hasDesigned: boolean

  setAppearance: (appearance: Appearance) => void
  completeDesign: () => void
  /** Debits the bankroll and adds the item to the wardrobe. Does not equip it. */
  buy: (itemId: string) => PurchaseResult
  equip: (itemId: string) => void
  unequip: (slot: Slot) => void
  /** Wipes the wardrobe and reopens the designer. Dev and "start over" only. */
  reset: () => void
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set, get) => ({
      appearance: DEFAULT_APPEARANCE,
      owned: [],
      equipped: {},
      hasDesigned: false,

      setAppearance: (appearance) => set({ appearance }),

      completeDesign: () => set({ hasDesigned: true }),

      buy: (itemId) => {
        const item = findItem(itemId)
        if (!item) return PurchaseResult.UnknownItem

        const { owned } = get()
        if (owned.includes(item.id)) return PurchaseResult.AlreadyOwned

        // Read the bankroll at the moment of purchase rather than from a
        // subscription, so a hand settling mid-click cannot let an unaffordable
        // item through on a stale number.
        const game = useGameStore.getState()
        if (game.bankroll < item.price) return PurchaseResult.TooExpensive

        game.adjustBankroll(-item.price)
        set({ owned: [...owned, item.id] })
        return PurchaseResult.Bought
      },

      equip: (itemId) => {
        const item = findItem(itemId)
        // Equipping something unowned would hand out a $900 pendant for free.
        if (!item || !get().owned.includes(item.id)) return

        set({ equipped: { ...get().equipped, [item.slot]: item.id } })
      },

      unequip: (slot) => {
        const next = { ...get().equipped }
        delete next[slot]
        set({ equipped: next })
      },

      reset: () =>
        set({
          appearance: DEFAULT_APPEARANCE,
          owned: [],
          equipped: {},
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
        }
      },
      partialize: (state) => ({
        appearance: state.appearance,
        owned: state.owned,
        equipped: state.equipped,
        hasDesigned: state.hasDesigned,
      }),
    },
  ),
)
