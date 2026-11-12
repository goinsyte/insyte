import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AutomationChange,
  AutomationDetail,
  AutomationList,
  AutomationVersion,
  CreateInput,
  DraftSaved,
  FieldsInput,
  IdInput,
  InvalidFlow,
  ListInput,
  NothingToPublish,
  PublishInput,
  Recommendation,
  SaveDraftInput,
  SetStatusInput,
  TriggerFieldRow,
  UpdateSettingsInput
} from "@insyte/modules/automations/domain/Automations"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Changed = Schema.Union([Forbidden, NotFound])

/**
 * Automations (M12 step 1): the list, one flow with its versions and settings, the fields a trigger offers, the
 * recommended templates, and every change with an undo token (a draft save needs none). Automatiseringen · Bekijken to
 * read, Bewerken for drafts, Beheren to pause, remove and change settings; publishing, turning on and granting a right
 * take `automations.publish`.
 */
export class AutomationsRpcs extends RpcGroup.make(
  Rpc.make("Automations.list", { payload: ListInput, success: AutomationList, error: Forbidden }),
  Rpc.make("Automations.get", { payload: IdInput, success: AutomationDetail, error: Changed }),
  Rpc.make("Automations.versions", { payload: IdInput, success: Schema.Array(AutomationVersion), error: Changed }),
  Rpc.make("Automations.fields", { payload: FieldsInput, success: Schema.Array(TriggerFieldRow), error: Forbidden }),
  Rpc.make("Automations.recommended", { success: Schema.Array(Recommendation), error: Forbidden }),
  Rpc.make("Automations.create", {
    payload: CreateInput,
    success: AutomationChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Automations.saveDraft", {
    payload: SaveDraftInput,
    success: DraftSaved,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Automations.duplicate", { payload: IdInput, success: AutomationChange, error: Changed }),
  Rpc.make("Automations.remove", { payload: IdInput, success: AutomationChange, error: Changed }),
  Rpc.make("Automations.restore", { payload: IdInput, success: AutomationChange, error: Changed }),
  Rpc.make("Automations.publish", {
    payload: PublishInput,
    success: AutomationChange,
    error: Schema.Union([Forbidden, NotFound, NothingToPublish, InvalidFlow])
  }),
  Rpc.make("Automations.setStatus", {
    payload: SetStatusInput,
    success: AutomationChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Automations.updateSettings", {
    payload: UpdateSettingsInput,
    success: AutomationChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
