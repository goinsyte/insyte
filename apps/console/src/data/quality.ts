import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { LinkExpired, QualityView, SupplierCheck } from "@insyte/modules/quality/domain/Quality"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { RETURNS } from "./returns.ts"

/*
 * Kwaliteit (M9.4): one product's checks, complaints, rate and phase, read when its tab opens; the commands, each
 * naming `QUALITY`. The supplier's link page reads its check on the server, keyed by the link.
 */

export const QUALITY = ["quality"] as const

const errors = Schema.Union([Forbidden, NotFound, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const qualityAtom = Atom.family((productId: string) =>
  Atom.serializable(ConsoleClient.query("Quality.list", { productId }, { reactivityKeys: QUALITY }), {
    key: `quality:${productId}`,
    schema: AsyncResult.Schema({ success: QualityView, error: errors }),
    skipInitialRun: true
  })
)

/**
 * The figures per product (the list's Aandacht cuts, the product's Retouren block) and per supplier (the suppliers'
 * quality columns), over the last 90 days. A verdict, a check and a return change them.
 */
export const productStatsAtom = ConsoleClient.query("Quality.stats", {}, {
  reactivityKeys: [...QUALITY, ...RETURNS]
})
export const supplierStatsAtom = ConsoleClient.query("Quality.stats", { bySupplier: true }, {
  reactivityKeys: [...QUALITY, ...RETURNS]
})
export const productFiguresAtom = Atom.family((productId: string) =>
  ConsoleClient.query("Quality.stats", { productId }, { reactivityKeys: [...QUALITY, ...RETURNS] })
)

export const qualityWrites = {
  request: ConsoleClient.mutation("Quality.request"),
  approve: ConsoleClient.mutation("Quality.approve"),
  reject: ConsoleClient.mutation("Quality.reject"),
  setPhase: ConsoleClient.mutation("Quality.setPhase"),
  link: ConsoleClient.mutation("Quality.link"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

/** The supplier's link page: the check its token names. */
export const linkedCheckAtom = Atom.family((token: string) =>
  Atom.serializable(
    ConsoleClient.query("QualityLink.check", { token }, { reactivityKeys: [`quality-link:${token}`] }),
    {
      key: `quality-link:${token}`,
      schema: AsyncResult.Schema({
        success: SupplierCheck,
        error: Schema.Union([LinkExpired, RpcClientError.RpcClientError])
      }),
      skipInitialRun: true
    }
  )
)

export const linkWrites = { submit: ConsoleClient.mutation("QualityLink.submit") } as const
