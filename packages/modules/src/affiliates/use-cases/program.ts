import { Invalid } from "@insyte/domain/Errors"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type Tier, type TierDef } from "../domain/Affiliates.ts"

/*
 * The programme's own (M16 step 3): its row, the month an amount falls in, and the codes. A workspace has no programme
 * until the brand starts one, by its first invitation or by saving the programme's settings (\`startProgram\`, with the
 * defaults: tiers 10, 12 and 15 %, 14 days to return, paid on the 15th). Before that it has no apply page, takes no
 * conversions and closes nothing; a read never makes one.
 */

export const DEFAULT_TIERS: ReadonlyArray<TierDef> = [
  { tier: "bronze", rate: 10, threshold: 0 },
  { tier: "silver", rate: 12, threshold: 100 },
  { tier: "gold", rate: 15, threshold: 250 }
]

export interface Program {
  readonly workspaceId: string
  readonly enabled: boolean
  readonly returnDays: number
  readonly payoutDay: number
  readonly attributionDays: number
  readonly defaultTier: Tier
  readonly discountPercent: number
  readonly applySlug: string
  readonly faqs: ReadonlyArray<{ q: string; a: string }>
  readonly rejectReasons: ReadonlyArray<string>
  readonly storefrontBaseUrl: string | null
  readonly storeId: string | null
}

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"

/** A random slug of `length` from an alphabet without look-alikes: the apply page's and a link's. */
export const randomSlug = (length: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("")
}

/** `YYYY-MM` of an instant, in UTC. */
export const monthOf = (at: Date) => at.toISOString().slice(0, 7)

/** The month before `month`. */
export const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  return monthOf(new Date(Date.UTC(y, m - 2, 1)))
}

/** The programme's payout day for `month`: that day of the month after it, `YYYY-MM-DD`. */
export const payDayOf = (month: string, payoutDay: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(y, m, payoutDay)).toISOString().slice(0, 10)
}

/** Capitals and digits that cannot be misread (no 0/O, 1/I/L), for a code's suffix. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** A code's random part: \`n\` capitals and digits. */
export const codeSuffix = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")

/** Shopify takes capitals and digits; a name becomes its first word's, ten at most. */
export const codeFrom = (name: string) =>
  (name.trim().split(/\s+/)[0] ?? "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10)
    .padEnd(3, "X")

const PROGRAM_FIELDS = (sql: SqlClient.SqlClient) =>
  sql`workspace_id, enabled, return_days, payout_day, attribution_days, default_tier, discount_percent, apply_slug,
      faqs, reject_reasons, storefront_base_url, store_id`

/** The workspace's programme, if the brand started one. Reads only. */
export const programOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<Program>`select ${PROGRAM_FIELDS(sql)} from affiliate_programs where workspace_id = app_workspace_id()`,
    ([found]) => found
  )

/**
 * The programme, started with its defaults if this is the first time (one row per workspace). Only from what the
 * brand does to run one: an invitation, its settings saved.
 */
export const startProgram = Effect.fn("Affiliates.startProgram")(function*(sql: SqlClient.SqlClient) {
  const found = yield* programOf(sql)
  if (found !== undefined) return found
  yield* sql`insert into affiliate_programs (workspace_id, apply_slug, currency)
             values (app_workspace_id(), ${randomSlug(12)},
                     coalesce((select currency from workspaces where id = app_workspace_id()), 'EUR'))
             on conflict (workspace_id) do nothing`
  for (const [position, t] of DEFAULT_TIERS.entries()) {
    yield* sql`insert into affiliate_tiers (workspace_id, tier, rate, threshold, position)
               values (app_workspace_id(), ${t.tier}, ${t.rate}, ${t.threshold}, ${position})
               on conflict do nothing`
  }
  return (yield* programOf(sql))!
})

export const tiersOf = (sql: SqlClient.SqlClient) =>
  sql<{ tier: Tier; rate: string; threshold: number }>`
    select tier, rate, threshold from affiliate_tiers where workspace_id = app_workspace_id() order by position`.pipe(
    Effect.map((rows) =>
      rows.length === 0
        ? DEFAULT_TIERS
        : rows.map((r): TierDef => ({ tier: r.tier, rate: Number(r.rate), threshold: r.threshold }))
    )
  )

export const rateOf = (tiers: ReadonlyArray<TierDef>, tier: Tier) =>
  tiers.find((t) => t.tier === tier)?.rate ?? DEFAULT_TIERS.find((t) => t.tier === tier)!.rate

/** The programme's currency (the workspace's when it was made); an affiliate reads it too. */
export const currencyOf = (sql: SqlClient.SqlClient) =>
  sql<{ currency: string | null }>`select currency from affiliate_programs where workspace_id = app_workspace_id()`
    .pipe(Effect.map(([w]) => w?.currency ?? "EUR"))

/** A code is free when no affiliate of the workspace holds it, now or in the last 90 days. */
export const codeTaken = (sql: SqlClient.SqlClient, code: string, except?: string) =>
  sql<{ taken: boolean }>`
    select exists (select 1 from affiliate_codes c where c.workspace_id = app_workspace_id() and c.code = ${code}
                     and (c.valid_until is null or c.valid_until > now())
                     and c.affiliate_id is distinct from ${except ?? null}) as taken`.pipe(
    Effect.map(([r]) => r?.taken ?? false)
  )

/** The first free code from `base`: itself, else with 2, 3… */
export const freeCode = Effect.fn("Affiliates.freeCode")(function*(sql: SqlClient.SqlClient, base: string) {
  for (let n = 1; n < 100; n++) {
    const code = n === 1 ? base : `${base.slice(0, 18)}${n}`
    if (!(yield* codeTaken(sql, code))) return code
  }
  return yield* new Invalid({ fields: { code: "taken" } })
})

/** Commission in minor units: the base at the rate, rounded half up. */
export const commissionOf = (baseMinor: number, rate: number) => Math.round((baseMinor * rate) / 100)
