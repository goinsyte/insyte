import { Effect, Exit } from "effect"
import { Atom, AtomRegistry } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { inTurn } from "../src/data/in-turn.ts"

/*
 * Several writes through one command atom at once (a bulk action over rows): each must run and answer for itself. The
 * setter here is the one `useAtomSet(atom, { mode: "promiseExit" })` returns: set the atom, then wait for its next
 * settled result.
 */

function slips() {
  const finished: Array<string> = []
  const atom = Atom.fn((id: string) =>
    Effect.gen(function*() {
      yield* Effect.sleep("5 millis")
      if (id === "bad") return yield* Effect.fail("refused" as const)
      finished.push(id)
      return `slip ${id}`
    })
  )
  const registry = AtomRegistry.make()
  registry.mount(atom)
  const set = (id: string) => {
    registry.set(atom, id)
    return Effect.runPromiseExit(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }))
  }
  return { atom, registry, set, finished }
}

const values = (exits: ReadonlyArray<Exit.Exit<string, unknown>>) =>
  exits.map((e) => (Exit.isSuccess(e) ? e.value : "failed"))

describe("writes through one command atom", () => {
  // A canary for effect's fn atoms: if this starts failing, an upgrade changed how overlapping writes behave, and
  // `useAtomSetInTurn` may no longer be needed (or may need another look).
  it("at once, run only the last and all answer with its result", async () => {
    const { set, finished } = slips()
    const exits = await Promise.all(["a", "b", "c"].map(set))
    expect(finished).toEqual(["c"])
    expect(values(exits)).toEqual(["slip c", "slip c", "slip c"])
  })

  it("in turn, all run and each answers for itself", async () => {
    const { atom, registry, set, finished } = slips()
    const exits = await Promise.all(["a", "b", "c"].map((id) => inTurn(registry, atom, () => set(id))))
    expect(finished).toEqual(["a", "b", "c"])
    expect(values(exits)).toEqual(["slip a", "slip b", "slip c"])
  })

  it("in turn, go on after one is refused", async () => {
    const { atom, registry, set, finished } = slips()
    const exits = await Promise.all(["a", "bad", "c"].map((id) => inTurn(registry, atom, () => set(id))))
    expect(finished).toEqual(["a", "c"])
    expect(values(exits)).toEqual(["slip a", "failed", "slip c"])
  })

  it("in turn, wait only for writes to the same atom", async () => {
    const { atom, registry } = slips()
    const other = Atom.fn((id: string) => Effect.succeed(id))
    void inTurn(registry, atom, () => new Promise<never>(() => undefined))
    await expect(inTurn(registry, other, () => Promise.resolve("b"))).resolves.toBe("b")
  })

  it("in turn, go on once a write has been out too long", async () => {
    const { atom, registry, set, finished } = slips()
    const stalled = new Promise<never>(() => undefined)
    void inTurn(registry, atom, () => stalled, 20)
    // Queued behind the stalled write: each gets its own wait, counted from when the one before it started.
    const next = inTurn(registry, atom, () => set("a"), 20)
    const after = inTurn(registry, atom, () => set("b"), 20)
    expect(values(await Promise.all([next, after]))).toEqual(["slip a", "slip b"])
    expect(finished).toEqual(["a", "b"])
  })
})
