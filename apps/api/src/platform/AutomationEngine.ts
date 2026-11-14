import type * as Context from "@insyte/modules/automations/use-cases/context"
import type * as Engine from "@insyte/modules/automations/use-cases/engine"
import { Effect } from "effect"

/*
 * The automation engine, loaded when a run is started or walked (M12 step 3; ADR-0041 §3): the jobs Worker starts
 * without it, and the relay's sink, the schedule's tick and the run's Workflow import it on first use. A failed load is
 * tried again on the next use; the step it failed is retried as any other.
 */

type EngineModule = typeof Engine

let loading: Promise<EngineModule> | undefined
let loadingContext: Promise<typeof Context> | undefined

/** The engine's module. */
export const engine = (): Promise<
  EngineModule
> => (loading ??= import("@insyte/modules/automations/use-cases/engine").catch((error: unknown) => {
  loading = undefined
  throw error
}))

/** A run's record read for its history (`inputOf`). */
export const runContext = (): Promise<
  typeof Context
> => (loadingContext ??= import("@insyte/modules/automations/use-cases/context").catch((error: unknown) => {
  loadingContext = undefined
  throw error
}))

/** `f` with the engine's module. */
export const withEngine = <A, E, R>(f: (e: EngineModule) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.promise(engine), f)
