import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ChargebackDetail, ChargebackList } from "@insyte/modules/chargebacks/domain/Chargebacks"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { QUEUE } from "./queue.ts"

/*
 * Chargebacks (M13): the cases with their counts and the workspace's record, primed by the route's loader; one case
 * with its pack and timeline when it opens; the number "Nieuw bewijspakket" prefills. A chargebacks command names
 * `CHARGEBACKS`, and Start's queue, which holds the cases waiting for evidence.
 */

export const CHARGEBACKS = ["chargebacks"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const chargebacksAtom = Atom.serializable(
  ConsoleClient.query("Chargebacks.list", { limit: 500 }, { reactivityKeys: CHARGEBACKS }),
  { key: "chargebacks", schema: AsyncResult.Schema({ success: ChargebackList, error: errors }), skipInitialRun: true }
)

export const chargebackAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Chargebacks.get", { id }, { reactivityKeys: CHARGEBACKS }),
    {
      key: `chargeback:${id}`,
      schema: AsyncResult.Schema({ success: ChargebackDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/** "Nieuw bewijspakket": the next `DSP-n`, read again after each case. */
export const nextCaseNumberAtom = ConsoleClient.query("Chargebacks.nextCaseNumber", undefined, {
  reactivityKeys: CHARGEBACKS
})

export const CHARGEBACK_WRITES = [...CHARGEBACKS, ...QUEUE] as const

export const chargebackWrites = {
  createManual: ConsoleClient.mutation("Chargebacks.createManual"),
  accept: ConsoleClient.mutation("Chargebacks.accept"),
  addEvidence: ConsoleClient.mutation("Chargebacks.addEvidence"),
  removeEvidence: ConsoleClient.mutation("Chargebacks.removeEvidence"),
  setNote: ConsoleClient.mutation("Chargebacks.setNote"),
  assemblePack: ConsoleClient.mutation("Chargebacks.assemblePack"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
