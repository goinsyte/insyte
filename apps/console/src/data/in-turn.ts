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

/** Each atom's last write still out, per registry. */
const lanes = new WeakMap<AtomRegistry.AtomRegistry, WeakMap<object, Promise<unknown>>>()

/** Runs `write` once every earlier write to `atom` in `registry` that went through here has settled. */
export function inTurn<A>(registry: AtomRegistry.AtomRegistry, atom: object, write: () => Promise<A>): Promise<A> {
  let byAtom = lanes.get(registry)
  if (byAtom === undefined) {
    byAtom = new WeakMap()
    lanes.set(registry, byAtom)
  }
  const run = (byAtom.get(atom) ?? Promise.resolve()).then(write)
  byAtom.set(atom, run.then(() => undefined, () => undefined))
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
