import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { FirstAnalysisView } from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The first analysis (M6.5): the store's early read, primed by the onboarding loader when the person is on the
 * analysis step and carried in the document. The Workflow's steps send `records.changed {first_analysis}`, which names
 * `FIRST_ANALYSIS`, so each read ticks off as the server reads it. Starting it and keeping the choices are mutations.
 */

export const FIRST_ANALYSIS = ["first-analysis"] as const

export const firstAnalysisAtom = Atom.serializable(
  ConsoleClient.query("FirstAnalysis.get", undefined, { reactivityKeys: FIRST_ANALYSIS }),
  {
    key: "first-analysis",
    schema: AsyncResult.Schema({
      success: FirstAnalysisView,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const firstAnalysisWrites = {
  start: ConsoleClient.mutation("FirstAnalysis.start"),
  prepare: ConsoleClient.mutation("FirstAnalysis.prepare")
} as const
