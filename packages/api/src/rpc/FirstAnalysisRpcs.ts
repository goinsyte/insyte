import { Forbidden, Invalid } from "@insyte/domain/Errors"
import { AutonomyLocked, AutonomyStale } from "@insyte/modules/agent/domain/Autonomy"
import {
  AgreeOfflineInput,
  AnalysisNotReady,
  FirstAnalysisView,
  OfflineAgreed,
  PrepareInput
} from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Onboarding's analysis and offline steps (M6.5, M15 step 5): the store's first analysis, starting it once its import
 * is in, the operator's answers and what "Klaarzetten" makes, and the offline plan. Reading is `settings` Bekijken,
 * starting and preparing Bewerken (each item also its own area's right), the offline plan the `ai.autonomy` special;
 * never reachable by a key.
 */
export class FirstAnalysisRpcs extends RpcGroup.make(
  Rpc.make("FirstAnalysis.get", { success: FirstAnalysisView, error: Forbidden }),
  Rpc.make("FirstAnalysis.start", { success: FirstAnalysisView, error: Forbidden }),
  Rpc.make("FirstAnalysis.prepare", {
    payload: PrepareInput,
    success: FirstAnalysisView,
    error: Schema.Union([Forbidden, AnalysisNotReady])
  }),
  Rpc.make("FirstAnalysis.agreeOffline", {
    payload: AgreeOfflineInput,
    success: OfflineAgreed,
    error: Schema.Union([Forbidden, Invalid, AnalysisNotReady, AutonomyLocked, AutonomyStale])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
