import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AddEvidenceInput,
  AssemblePackInput,
  CaseClosed,
  CaseNumberTaken,
  ChargebackChange,
  ChargebackDetail,
  ChargebackList,
  ChargebackStats,
  CreateManualInput,
  IdInput,
  IdsInput,
  ListInput,
  NextCaseNumber,
  RemoveEvidenceInput,
  ReorderEvidenceInput,
  SetNoteInput
} from "@insyte/modules/chargebacks/domain/Chargebacks"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Pack = Schema.Union([Forbidden, NotFound, CaseClosed])

/**
 * Chargebacks (M13 steps 3 and 4): the cases with their counts and standing, one case with its pack and timeline, a
 * case opened by hand, its note, the files in its pack (each with an undo token, a reorder without), Insyte gathering
 * its pack (no undo: a pack is a draft), and accepting cases as lost, which cannot be taken back. Chargebacks ·
 * Bekijken to read, Bewerken to change, Beheren to accept.
 */
export class ChargebacksRpcs extends RpcGroup.make(
  Rpc.make("Chargebacks.list", { payload: ListInput, success: ChargebackList, error: Forbidden }),
  Rpc.make("Chargebacks.get", {
    payload: IdInput,
    success: ChargebackDetail,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Chargebacks.stats", { success: ChargebackStats, error: Forbidden }),
  Rpc.make("Chargebacks.nextCaseNumber", { success: NextCaseNumber, error: Forbidden }),
  Rpc.make("Chargebacks.createManual", {
    payload: CreateManualInput,
    success: ChargebackChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, CaseNumberTaken])
  }),
  Rpc.make("Chargebacks.setNote", {
    payload: SetNoteInput,
    success: ChargebackChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Chargebacks.accept", { payload: IdsInput, success: ChargebackChange, error: Pack }),
  Rpc.make("Chargebacks.addEvidence", { payload: AddEvidenceInput, success: ChargebackChange, error: Pack }),
  Rpc.make("Chargebacks.removeEvidence", { payload: RemoveEvidenceInput, success: ChargebackChange, error: Pack }),
  Rpc.make("Chargebacks.assemblePack", { payload: AssemblePackInput, success: ChargebackChange, error: Pack }),
  Rpc.make("Chargebacks.reorderEvidence", {
    payload: ReorderEvidenceInput,
    success: ChargebackChange,
    error: Schema.Union([Forbidden, NotFound, CaseClosed, Invalid])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
