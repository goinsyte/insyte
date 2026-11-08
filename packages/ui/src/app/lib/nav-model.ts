import type { NavActions, NavState } from "../stores/nav-store"
import { MAX_PINNED_FRIENDS } from "./nav-limits"

/*
 * The rail's and the top bar's preferences as plain logic over any state: the demo's store and the console's saved
 * preferences run the same actions, and the frame reads both through `navPrefsOf`.
 */

export const MAX_RAIL_ADDONS = 4

/** The saved order, with rail items it does not know yet appended. */
export function ensureFullOrder(saved: ReadonlyArray<string>, all: ReadonlyArray<string>) {
  const result: Array<string> = []
  for (const k of saved) if (all.includes(k)) result.push(k)
  for (const k of all) if (!result.includes(k)) result.push(k)
  return result
}

export function navActions(get: () => NavState, set: (patch: Partial<NavState>) => void): NavActions {
  return {
    toggleHidden: (to) => {
      const hidden = get().hidden
      set({ hidden: hidden.includes(to) ? hidden.filter((x) => x !== to) : [...hidden, to] })
    },
    setOrder: (order) => set({ order }),
    moveRailItem: (to, direction, allKeys) => {
      const order = get().order
      const current = order.length === 0 ? [...allKeys] : ensureFullOrder(order, allKeys)
      const idx = current.indexOf(to)
      if (idx === -1) return
      const swap = direction === "up" ? idx - 1 : idx + 1
      if (swap < 0 || swap >= current.length) return
      const next = [...current]
      ;[next[idx], next[swap]] = [next[swap]!, next[idx]!]
      set({ order: next })
    },
    togglePinned: (id) => {
      const current = get().pinnedAddons
      if (current.includes(id)) {
        set({ pinnedAddons: current.filter((x) => x !== id) })
        return true
      }
      if (current.length >= MAX_RAIL_ADDONS) return false
      set({ pinnedAddons: [...current, id] })
      return true
    },
    togglePinnedFriend: (id) => {
      const current = get().pinnedFriends
      if (current.includes(id)) {
        set({ pinnedFriends: current.filter((x) => x !== id) })
        return true
      }
      if (current.length >= MAX_PINNED_FRIENDS) return false
      set({ pinnedFriends: [...current, id] })
      return true
    },
    setShortcut: (to, shortcut) => {
      const next = { ...get().shortcuts }
      if (shortcut === null) delete next[to]
      else next[to] = shortcut
      set({ shortcuts: next })
    },
    setThemeMode: (themeMode) => set({ themeMode })
  }
}

/** What the frame reads of the preferences: the state, its questions and its actions (`useNavPrefs`). */
export function navPrefsOf(nav: NavState & NavActions) {
  const { hidden, order, pinnedAddons, pinnedFriends, shortcuts, themeMode } = nav
  return {
    state: { hidden, order, pinnedAddons, pinnedFriends, shortcuts, themeMode },
    isHidden: (to: string) => hidden.includes(to),
    toggleHidden: nav.toggleHidden,
    moveRailItem: nav.moveRailItem,
    sortedRail: (allKeys: Array<string>) => (order.length === 0 ? allKeys : ensureFullOrder(order, allKeys)),
    isAddonPinned: (id: string) => pinnedAddons.includes(id),
    isFriendPinned: (id: string) => pinnedFriends.includes(id),
    pinnedCount: (installedIds: Array<string>) => pinnedAddons.filter((id) => installedIds.includes(id)).length,
    // The old API took (id, installedIds) and ignored the second.
    togglePinned: (id: string, _installedIds: Array<string>) => nav.togglePinned(id),
    togglePinnedFriend: nav.togglePinnedFriend,
    setShortcut: nav.setShortcut,
    setThemeMode: nav.setThemeMode
  }
}
