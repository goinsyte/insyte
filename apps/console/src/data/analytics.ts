import { Forbidden, Invalid, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import {
  AnalyticsOverview,
  AnalyticsPeriods,
  type ExplainRef,
  type PairInput
} from "@insyte/modules/analytics/domain/Analytics"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Analyse (M14 step 2): the months the pickers offer and the six figures for the member's two months, primed by the
 * route's loader and carried in the document; the charts, the findings and an explanation read once the page is
 * there. An order, a ticket or a store changing names `ANALYTICS` (`realtime.ts`), since every figure sums them. The
 * drawer's orders are read a page at a time, on request.
 */

export const ANALYTICS = ["analytics"] as const

const errors = Schema.Union([Forbidden, Invalid, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
const periodErrors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const periodsAtom = Atom.serializable(
  ConsoleClient.query("Analytics.periods", undefined, { reactivityKeys: ANALYTICS }),
  {
    key: "analytics.periods",
    schema: AsyncResult.Schema({ success: AnalyticsPeriods, error: periodErrors }),
    skipInitialRun: true
  }
)

/** One pair's key, `2026-11:2026-10`. */
export const pairKey = (p: PairInput) => `${p.a}:${p.b}`
const pairOf = (key: string): PairInput => {
  const [a = "", b = ""] = key.split(":")
  return { a, b }
}

export const overviewAtom = Atom.family((key: string) =>
  Atom.serializable(
    ConsoleClient.query("Analytics.overview", pairOf(key), { reactivityKeys: ANALYTICS }),
    {
      key: `analytics.overview:${key}`,
      schema: AsyncResult.Schema({ success: AnalyticsOverview, error: errors }),
      skipInitialRun: true
    }
  )
)

export const chartsAtom = Atom.family((key: string) =>
  ConsoleClient.query("Analytics.charts", pairOf(key), { reactivityKeys: ANALYTICS })
)

export const findingsAtom = Atom.family((key: string) =>
  ConsoleClient.query("Analytics.findings", pairOf(key), { reactivityKeys: ANALYTICS })
)

/** One explanation's key: the ref as JSON, built in one order so the same mark is the same read. */
export const refKey = (ref: ExplainRef) => JSON.stringify(ref)

export const explainAtom = Atom.family((key: string) =>
  ConsoleClient.query("Analytics.explain", JSON.parse(key) as ExplainRef, { reactivityKeys: ANALYTICS })
)

/** The drawer's orders, forty at a time from the cursor the last page gave. */
export const analyticsReads = { records: ConsoleClient.mutation("Analytics.records") } as const
