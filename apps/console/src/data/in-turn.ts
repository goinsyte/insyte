import { RegistryContext, useAtomSet } from "@effect/atom-react"
import type { Exit } from "effect"
import type { AsyncResult, Atom, AtomRegistry } from "effect/reactivity"
import { useCallback, useContext } from "react"

/*
 * A command atom (`ConsoleClient.mutation`, `runtime.fn`) runs one write at a time: setting it again interrupts the run
 * still out, and a `promiseExit` setter answers with the atom's next settled result, not its own write's. So several
 * writes through one setter at once (`Promise.all` over rows, a loop, two quick clicks) send only the last, and every
 * caller gets the last one's answer. Writes through `useAtomSetInTurn` wait for the earlier ones to the same atom, so
 * each runs and each caller gets its own result.
 */

/** How long the next write waits for one that has not come back: the client has no timeout of its own. */
const STALL_MS = 30_000

/** Each atom's last write, settled or given up on, per registry. */
const lanes = new WeakMap<AtomRegistry.AtomRegistry, WeakMap<object, Promise<void>>>()

/** Resolves once `p` settles, or `ms` after it was asked, whichever is first. */
const settledOrStalled = (p: Promise<unknown>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    p.then(done, done)
  })

/**
 * Runs `write` once every earlier write to `atom` in `registry` that went through here has settled, or has been out for
 * `stallMs` since it started.
 */
export function inTurn<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: object,
  write: () => Promise<A>,
  stallMs = STALL_MS
): Promise<A> {
  let byAtom = lanes.get(registry)
  if (byAtom === undefined) {
    byAtom = new WeakMap()
    lanes.set(registry, byAtom)
  }
  const before = byAtom.get(atom) ?? Promise.resolve()
  const run = before.then(write)
  // The wait starts when this write does, so one queued behind it gets its full time.
  byAtom.set(atom, before.then(() => settledOrStalled(run, stallMs)))
  return run
}

/** `useAtomSet(atom, { mode: "promiseExit" })` whose writes go one after another, each with its own result. */
export function useAtomSetInTurn<A, E, W>(
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>
): (value: W) => Promise<Exit.Exit<A, E>> {
  const registry = useContext(RegistryContext)
  const set = useAtomSet(atom, { mode: "promiseExit" })
  return useCallback((value: W) => inTurn(registry, atom, () => set(value)), [registry, atom, set])
}
