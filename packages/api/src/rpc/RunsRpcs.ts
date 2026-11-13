import { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import {
  RunChange,
  RunDecideInput,
  RunDetail,
  RunIdInput,
  RunList,
  RunListInput,
  RunRecord,
  RunRecordsInput,
  RunStats,
  RunStatsInput
} from "@insyte/modules/automations/domain/Runs"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Read = Schema.Union([Forbidden, NotFound])
const Change = Schema.Union([Forbidden, NotFound, Conflict])

/**
 * A flow's runs (M12 step 5): Automatiseringen · Bekijken reads them; Beheren runs one again ("Opnieuw") or stops it;
 * "Goedkeuring vragen" is answered by the teammate the step names, or someone who may publish.
 */
export class RunsRpcs extends RpcGroup.make(
  Rpc.make("Runs.list", { payload: RunListInput, success: RunList, error: Forbidden }),
  Rpc.make("Runs.get", { payload: RunIdInput, success: RunDetail, error: Read }),
  Rpc.make("Runs.stats", { payload: RunStatsInput, success: RunStats, error: Read }),
  Rpc.make("Runs.records", { payload: RunRecordsInput, success: Schema.Array(RunRecord), error: Read }),
  Rpc.make("Runs.rerun", { payload: RunIdInput, success: RunChange, error: Change }),
  Rpc.make("Runs.cancel", { payload: RunIdInput, success: RunChange, error: Change }),
  Rpc.make("Runs.approve", { payload: RunDecideInput, success: RunChange, error: Change }),
  Rpc.make("Runs.decline", { payload: RunDecideInput, success: RunChange, error: Change })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
