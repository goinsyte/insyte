import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AutomationDetail, AutomationList, Recommendation } from "@insyte/modules/automations/domain/Automations"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Automations (M12 step 1): every flow with its counts, primed by the list's loader; one flow with its versions,
 * settings and what is wrong per step, primed by the builder's; the templates the workspace's records recommend. Every
 * automation command names `AUTOMATIONS`, except a draft save, which the builder already holds.
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
  undo: ConsoleClient.mutation("Shared.undo")
} as const
