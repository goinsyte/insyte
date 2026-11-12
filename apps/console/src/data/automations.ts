import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AutomationDetail, AutomationList, Recommendation } from "@insyte/modules/automations/domain/Automations"
import { RunList } from "@insyte/modules/automations/domain/Runs"
import type { RunDetail } from "@insyte/modules/automations/domain/Runs"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Automations (M12 step 1): every flow with its counts, primed by the list's loader; one flow with its versions,
 * settings and what is wrong per step, primed by the builder's; the templates the workspace's records recommend. Every
 * automation command names `AUTOMATIONS`, except a draft save, which the builder already holds. A flow's runs, or the
 * workspace's for Geschiedenis (M12 step 5), primed by the same loaders; a run's commands name `RUNS` and `AUTOMATIONS`.
 */

export const AUTOMATIONS = ["automations"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const automationsAtom = Atom.serializable(
  ConsoleClient.query("Automations.list", {}, { reactivityKeys: AUTOMATIONS }),
  { key: "automations", schema: AsyncResult.Schema({ success: AutomationList, error: errors }), skipInitialRun: true }
)

export const recommendedAtom = Atom.serializable(
  ConsoleClient.query("Automations.recommended", undefined, { reactivityKeys: AUTOMATIONS }),
  {
    key: "automations-recommended",
    schema: AsyncResult.Schema({ success: Schema.Array(Recommendation), error: errors }),
    skipInitialRun: true
  }
)

export const automationAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Automations.get", { id }, { reactivityKeys: AUTOMATIONS }),
    {
      key: `automation:${id}`,
      schema: AsyncResult.Schema({ success: AutomationDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

export const RUNS = ["automation-runs"] as const

/** The newest runs: one flow's, or with `""` the workspace's, as many as Geschiedenis shows. */
export const runsAtom = Atom.family((automationId: string) =>
  Atom.serializable(
    ConsoleClient.query("Runs.list", automationId === "" ? { limit: 200 } : { automationId, limit: 200 }, {
      reactivityKeys: RUNS
    }),
    {
      key: `automation-runs:${automationId}`,
      schema: AsyncResult.Schema({ success: RunList, error: errors }),
      skipInitialRun: true
    }
  )
)

/** One run with its steps, for the drawer; `""` is none open. */
export const runAtom = Atom.family((id: string): Atom.Atom<AsyncResult.AsyncResult<RunDetail, unknown>> =>
  id === "" ? Atom.make(AsyncResult.initial()) : ConsoleClient.query("Runs.get", { id }, { reactivityKeys: RUNS })
)

/** "Velden van het record" for a trigger (`Automations.fields`); the list is the catalogue's, so it is read once. */
export const automationFieldsAtom = Atom.family((triggerVariant: string) =>
  ConsoleClient.query("Automations.fields", { triggerVariant }).pipe(Atom.keepAlive)
)

export const automationWrites = {
  create: ConsoleClient.mutation("Automations.create"),
  saveDraft: ConsoleClient.mutation("Automations.saveDraft"),
  duplicate: ConsoleClient.mutation("Automations.duplicate"),
  remove: ConsoleClient.mutation("Automations.remove"),
  publish: ConsoleClient.mutation("Automations.publish"),
  setStatus: ConsoleClient.mutation("Automations.setStatus"),
  updateSettings: ConsoleClient.mutation("Automations.updateSettings"),
  undo: ConsoleClient.mutation("Shared.undo"),
  test: ConsoleClient.mutation("Automations.test"),
  rerun: ConsoleClient.mutation("Runs.rerun"),
  cancel: ConsoleClient.mutation("Runs.cancel"),
  approve: ConsoleClient.mutation("Runs.approve"),
  decline: ConsoleClient.mutation("Runs.decline")
} as const
