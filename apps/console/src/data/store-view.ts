import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { frameAtom } from "./frame.ts"
import { choiceOf, inViewOf, type StoreChoice, storeInView } from "./in-view.ts"

/*
 * The store the console looks at (the top bar's store switch, M6 multi-store): the member's choice as `Prefs.store`
 * keeps it, over the stores the frame says they reach. A switch counts at once in this tab (`chosenStoreAtom`), before
 * the preference is written. On the server it is the saved choice, so the first paint is the store's already.
 */

/** This tab's switch, ahead of the saved preference; none until the member switches. */
export const chosenStoreAtom = Atom.make<StoreChoice | undefined>(undefined).pipe(Atom.keepAlive)

/**
 * The store in view: a store's id, `null` for every store the member reaches, `undefined` while the frame is read. A
 * frame that cannot be read (signed out, no workspace) is every store, so a read outside the frame does not wait.
 */
export const viewStoreAtom = Atom.make((get): string | null | undefined => {
  const frame = get(frameAtom)
  if (AsyncResult.isFailure(frame) && !AsyncResult.isWaiting(frame)) return null
  const value = Option.getOrUndefined(AsyncResult.value(frame))
  if (value === undefined) return undefined
  return storeInView(value.stores, get(chosenStoreAtom) ?? choiceOf(value.prefs.sections["store"]?.value))
})

/** A store-bound read of the store in view (`inViewOf`). */
export const inView = inViewOf(viewStoreAtom)
