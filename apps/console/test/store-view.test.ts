import { Cause, Effect, Option } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { choiceOf, inViewOf, storeInView, storeKey, viewStoreOf, withStore } from "../src/data/in-view.ts"

/*
 * The store switch's rules (M6 multi-store): which store is in view for a choice, how a read's input and key carry it,
 * and that a store-bound read is the read of the store in view, so switching never shows the other store's rows.
 */

const two = [{ id: "sto_a" }, { id: "sto_b" }]

describe("the store in view", () => {
  it("is every store until one is chosen, and with one store there is nothing to choose", () => {
    expect(storeInView(two, undefined)).toBeNull()
    expect(storeInView(two, { id: null })).toBeNull()
    expect(storeInView(two, { id: "sto_b" })).toBe("sto_b")
    expect(storeInView([{ id: "sto_a" }], { id: "sto_a" })).toBeNull()
  })

  it("falls back to every store for a store the member no longer reaches", () => {
    expect(storeInView(two, { id: "sto_gone" })).toBeNull()
  })

  it("reads a saved choice, and nothing from a value that is not one", () => {
    expect(choiceOf({ id: "sto_a" })).toEqual({ id: "sto_a" })
    expect(choiceOf({ id: null })).toEqual({ id: null })
    expect(choiceOf(undefined)).toBeUndefined()
    expect(choiceOf({ id: 3 })).toBeUndefined()
    expect(choiceOf("sto_a")).toBeUndefined()
  })

  it("keeps the last frame's store when the frame fails to read again, and is every store when it never read", () => {
    const frame = { stores: two, prefs: { sections: { store: { value: { id: "sto_b" } } } } }
    expect(viewStoreOf(AsyncResult.initial(true), undefined)).toBeUndefined()
    expect(viewStoreOf(AsyncResult.success(frame), undefined)).toBe("sto_b")
    expect(viewStoreOf(AsyncResult.success(frame), { id: null })).toBeNull()
    const failed = AsyncResult.failure<typeof frame, string>(Cause.fail("offline"), {
      previousSuccess: Option.some(AsyncResult.success(frame))
    })
    expect(viewStoreOf(failed, undefined)).toBe("sto_b")
    expect(viewStoreOf(AsyncResult.failure(Cause.fail("signed out")), undefined)).toBeNull()
  })

  it("adds the store to a read's input and key only when it is one store", () => {
    expect(withStore({ limit: 50 }, undefined)).toEqual({ limit: 50 })
    expect(withStore({ limit: 50 }, "sto_a")).toEqual({ limit: 50, storeId: "sto_a" })
    expect(storeKey(undefined)).toBe("all")
    expect(storeKey("sto_a")).toBe("sto_a")
  })
})

describe("a store-bound read", () => {
  const setup = () => {
    const view = Atom.make<string | null | undefined>(undefined)
    const asked: Array<string | undefined> = []
    const refreshed: Array<string> = []
    const results = new Map<string, Atom.Writable<AsyncResult.AsyncResult<string, never>>>()
    const read = inViewOf(view)((storeId) => {
      asked.push(storeId)
      const state = Atom.make<AsyncResult.AsyncResult<string, never>>(AsyncResult.initial(true))
      results.set(storeKey(storeId), state)
      // As a server read: refreshing it reads again.
      return Atom.readable((get) => get(state), () => refreshed.push(storeKey(storeId)))
    })
    const registry = AtomRegistry.make()
    registry.mount(read)
    return { view, asked, refreshed, results, read, registry }
  }

  it("waits until the store in view is known, then reads that store", () => {
    const { view, asked, results, read, registry } = setup()
    expect(AsyncResult.isInitial(registry.get(read))).toBe(true)
    expect(asked).toEqual([])
    registry.set(view, null)
    expect(asked).toEqual([undefined])
    registry.set(results.get("all")!, AsyncResult.success("every store's rows"))
    expect(registry.get(read)).toEqual(AsyncResult.success("every store's rows"))
  })

  it("starts empty on a switch, never with the other store's rows", async () => {
    const { view, asked, results, read, registry } = setup()
    registry.set(view, "sto_a")
    registry.set(results.get("sto_a")!, AsyncResult.success("rows of a"))
    registry.set(view, "sto_b")
    expect(asked).toEqual(["sto_a", "sto_b"])
    expect(AsyncResult.isInitial(registry.get(read))).toBe(true)
    registry.set(results.get("sto_b")!, AsyncResult.success("rows of b"))
    expect(await Effect.runPromise(AtomRegistry.getResult(registry, read))).toBe("rows of b")
    // Back on the first store: its own read again (kept, or read anew), never the second store's rows.
    registry.set(view, "sto_a")
    expect(registry.get(read)).not.toEqual(AsyncResult.success("rows of b"))
  })

  it("refreshes the store in view's read only, in the registry that asks", () => {
    const { view, refreshed, read, registry } = setup()
    registry.set(view, "sto_a")
    registry.refresh(read)
    expect(refreshed).toEqual(["sto_a"])
    registry.set(view, "sto_b")
    expect(refreshed).toEqual(["sto_a"])
    registry.refresh(read)
    expect(refreshed).toEqual(["sto_a", "sto_b"])
    // Another registry (another tab, the server's render) on another store refreshes its own.
    const other = AtomRegistry.make()
    other.mount(read)
    other.set(view, null)
    other.refresh(read)
    expect(refreshed).toEqual(["sto_a", "sto_b", "all"])
    registry.refresh(read)
    expect(refreshed).toEqual(["sto_a", "sto_b", "all", "sto_b"])
  })
})
