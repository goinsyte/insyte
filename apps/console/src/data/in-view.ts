import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"

/*
 * The store switch's rules (the top bar's store selector, M6 multi-store), apart from the client so they are tested on
 * their own. The console looks at one of the member's stores, or at all of them; every store-bound read is the read of
 * the store in view, keyed by it, so switching never shows the other store's rows: the next store's read starts empty
 * and fills, and going back finds the first one's again.
 */

/** A store the member reaches, as the frame lists them. */
export interface Reachable {
  readonly id: string
}

/** The member's saved choice (`Prefs.store`): a store, or every store (`null`). */
export interface StoreChoice {
  readonly id: string | null
}

/**
 * The store in view: the one chosen, while the member still reaches it and reaches more than one; otherwise every store
 * (`null`), which with a single store is that store. A choice they lost (a narrowed role, a store let go) falls back to
 * every store rather than an empty console.
 */
export const storeInView = (stores: ReadonlyArray<Reachable>, choice: StoreChoice | undefined): string | null => {
  if (stores.length < 2 || choice === undefined || choice.id === null) return null
  const id = choice.id
  return stores.some((s) => s.id === id) ? id : null
}

/** A saved choice as `Prefs.store` holds it, or none when the value is not one. */
export const choiceOf = (value: unknown): StoreChoice | undefined => {
  if (typeof value !== "object" || value === null || !("id" in value)) return undefined
  const id = (value as { id: unknown }).id
  return typeof id === "string" || id === null ? { id } : undefined
}

/** The store in view for a frame read and this tab's switch (`viewStoreAtom` in `store-view.ts`). */
export const viewStoreOf = (
  frame: AsyncResult.AsyncResult<{ readonly stores: ReadonlyArray<Reachable>; readonly prefs: SavedPrefs }, unknown>,
  chosen: StoreChoice | undefined
): string | null | undefined => {
  const value = Option.getOrUndefined(AsyncResult.value(frame))
  if (value === undefined) return AsyncResult.isFailure(frame) && !AsyncResult.isWaiting(frame) ? null : undefined
  return storeInView(value.stores, chosen ?? choiceOf(value.prefs.sections["store"]?.value))
}

/** The member's preferences, as the frame carries them. */
export interface SavedPrefs {
  readonly sections: { readonly [section: string]: { readonly value: unknown } | undefined }
}

/** A read's input for the store in view: unchanged for every store, `storeId` added for one. */
export const withStore = <P extends object>(payload: P, storeId: string | undefined): P & { storeId?: string } =>
  storeId === undefined ? payload : { ...payload, storeId }

/** The store as a read's key names it: `all`, or the store's id. */
export const storeKey = (storeId: string | undefined) => storeId ?? "all"

/**
 * A store-bound read over `view` (the store in view; `undefined` while that is not known yet): one read per store,
 * made by `read` and kept apart by store, so a serializable one carries the store in its key. Until the store in view
 * is known it waits, as a first read does. Refreshing it reads the store in view again.
 *
 * Which store's read is in view is itself an atom (`current`), so every registry (each tab, the server's render) keeps
 * its own. It changes only when the store in view does (an atom that reads the same value again tells no one), so
 * when it is read again for the same store, that is a refresh, and it refreshes that store's read.
 */
export const inViewOf =
  (view: Atom.Atom<string | null | undefined>) =>
  <A, E>(read: (storeId: string | undefined) => Atom.Atom<AsyncResult.AsyncResult<A, E>>) => {
    const perStore = Atom.family((store: string) => read(store === "" ? undefined : store))
    const current = Atom.readable((get): Atom.Atom<AsyncResult.AsyncResult<A, E>> | undefined => {
      const store = get(view)
      if (store === undefined) return undefined
      const atom = perStore(store ?? "")
      if (Option.getOrUndefined(get.self<Atom.Atom<AsyncResult.AsyncResult<A, E>> | undefined>()) === atom) {
        get.refresh(atom)
      }
      return atom
    })
    return Atom.readable(
      (get): AsyncResult.AsyncResult<A, E> => {
        const atom = get(current)
        return atom === undefined ? AsyncResult.initial(true) : get(atom)
      },
      (refresh) => refresh(current)
    )
  }
