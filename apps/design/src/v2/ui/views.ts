import { useSyncExternalStore } from "react"
import type { Group } from "./filter-model.ts"

/*
 * Saved views: a named filter on one list, kept so the person can come back to "Vertraagd bij DHL"
 * without building it again. Keyed by the list ("bestellingen", "tickets"), held for the visit like
 * the rest of the demo's state (`demo.ts`), and pinnable: a pinned view stands first among the tabs.
 * `active` is the view each list shows; null is the list's own "Alles".
 */

type SavedView = { readonly id: string; readonly name: string; readonly filter: Group; readonly pinned: boolean }

type ListViews = { readonly views: ReadonlyArray<SavedView>; readonly active: string | null }

let lists: Readonly<Record<string, ListViews>> = {}
const listeners = new Set<() => void>()
const NONE: ListViews = { views: [], active: null }

function set(key: string, next: (l: ListViews) => ListViews) {
  lists = { ...lists, [key]: next(lists[key] ?? NONE) }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let seq = 0
const mapViews = (l: ListViews, id: string, fn: (v: SavedView) => SavedView): ListViews => ({
  ...l,
  views: l.views.map((v) => (v.id === id ? fn(v) : v))
})

/** Views a list starts with, once per visit: the kit seeds one so the tabs are there to try. */
export function seedViews(key: string, views: ReadonlyArray<Omit<SavedView, "id">>) {
  if (lists[key] !== undefined) return
  lists = { ...lists, [key]: { views: views.map((v, i) => ({ ...v, id: `${key}-${i}` })), active: null } }
}

/** One list's views and what to do with them; the component re-renders when they change. */
export function useSavedViews(key: string) {
  const list = useSyncExternalStore(subscribe, () => lists[key] ?? NONE)
  return {
    views: list.views.toSorted((a, b) => Number(b.pinned) - Number(a.pinned)),
    active: list.views.find((v) => v.id === list.active) ?? null,
    save: (name: string, filter: Group) => {
      const id = `${key}-v${seq++}`
      set(key, (l) => ({ views: [...l.views, { id, name, filter, pinned: false }], active: id }))
    },
    update: (id: string, filter: Group) => set(key, (l) => mapViews(l, id, (v) => ({ ...v, filter }))),
    rename: (id: string, name: string) => set(key, (l) => mapViews(l, id, (v) => ({ ...v, name }))),
    togglePin: (id: string) => set(key, (l) => mapViews(l, id, (v) => ({ ...v, pinned: !v.pinned }))),
    setActive: (id: string | null) => set(key, (l) => ({ ...l, active: id })),
    /** Take a view out; the answer puts it back where it was, active again if it was. */
    remove: (id: string) => {
      const before = lists[key] ?? NONE
      const at = before.views.findIndex((v) => v.id === id)
      const gone = before.views[at]
      set(key, (l) => ({ views: l.views.filter((v) => v.id !== id), active: l.active === id ? null : l.active }))
      return () => {
        if (gone === undefined) return
        set(key, (l) => ({
          views: [...l.views.slice(0, at), gone, ...l.views.slice(at)],
          active: before.active === id ? id : l.active
        }))
      }
    }
  }
}
