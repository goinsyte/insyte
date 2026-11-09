import { Forbidden } from "@insyte/domain/Errors"
import { AnalysisNotReady, FirstAnalysisView, PrepareInput } from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Onboarding's analysis step (M6.5): the store's first analysis, starting it once its import is in, and the
 * operator's answers and choices. Reading is `settings` Bekijken, starting and preparing Bewerken; never reachable by a
 * key.
 */
export class FirstAnalysisRpcs extends RpcGroup.make(
  Rpc.make("FirstAnalysis.get", { success: FirstAnalysisView, error: Forbidden }),
  Rpc.make("FirstAnalysis.start", { success: FirstAnalysisView, error: Forbidden }),
  Rpc.make("FirstAnalysis.prepare", {
    payload: PrepareInput,
    success: FirstAnalysisView,
    error: Schema.Union([Forbidden, AnalysisNotReady])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
