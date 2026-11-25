import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { toMinor } from "../../stores/domain/Mirror.ts"

/*
 * A limit in the workspace's currency held against an amount in another: a role's refund limit and a flow's are set in
 * the currency the workspace counts in (`workspaces.currency`), an order is refunded in its store's own. The limit is
 * converted at the latest ECB rate in `fx_rates`, never the amount, so the refund stays in the order's currency.
 */

/**
 * `limitMinor` in `from` (the workspace's currency) as an amount in `to` (the order's), at `rate` (1 `to` = rate
 * `from`), rounded down: never more than may be refunded.
 */
export const limitIn = (limitMinor: number, from: string, to: string, rate: number) =>
  from === to ? limitMinor : Math.floor((limitMinor / toMinor("1", from) / rate) * toMinor("1", to) + 1e-6)

/** 1 `base` = this much `quote`, at the latest day on or before today; 1 within one currency; none before a fill. */
export const latestRate = Effect.fn("Fx.latestRate")(function*(sql: SqlClient.SqlClient, base: string, quote: string) {
  if (base === quote) return 1
  const [fx] = yield* sql<{ rate: string }>`
    select rate::text as rate from fx_rates
    where base = ${base} and quote = ${quote} and day <= current_date order by day desc limit 1`
  return fx === undefined ? undefined : Number(fx.rate)
})

/** The caller's refund limit on one order: in the order's currency, and as the role has it. */
export interface RefundLimitIn {
  /** In the order's currency, minor units; null while there is no rate to convert the role's limit at. */
  readonly limitMinor: number | null
  readonly currency: string
  /** The role's own limit, in the workspace's currency. */
  readonly roleMinor: number
  readonly roleCurrency: string
}

/**
 * The caller's refund limit on an order in `currency`: none for the owner or a role without one. The role's limit is
 * in the workspace's currency; an order in another is held to it at the latest rate.
 */
export const refundLimitIn = Effect.fn("Fx.refundLimitIn")(function*(sql: SqlClient.SqlClient, currency: string) {
  const principal = yield* CurrentPrincipal
  const limit = principal.role.refundLimit
  if (principal.role.id === "owner" || limit === null) return null
  const [w] = yield* sql<{ currency: string }>`select currency from workspaces where id = app_workspace_id()`
  const own = (w?.currency ?? "EUR").trim().toUpperCase()
  const to = currency.trim().toUpperCase()
  const roleMinor = Math.round(limit * toMinor("1", own))
  const rate = yield* latestRate(sql, to, own)
  return {
    limitMinor: rate === undefined ? null : limitIn(roleMinor, own, to, rate),
    currency: to,
    roleMinor,
    roleCurrency: own
  } satisfies RefundLimitIn
})
