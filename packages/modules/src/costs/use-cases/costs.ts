import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  type CostLine,
  CostsFigures,
  CostsList,
  type CostSource,
  type FiguresInput,
  type ListInput,
  type Month
} from "../domain/Costs.ts"
import {
  addMonths,
  adsFrom,
  costOf,
  figuresOf,
  type LineRule,
  type MonthBasis,
  monthsBetween
} from "../domain/Figures.ts"

/*
 * Kosten's reads (M13 step 5; widgets/02 `/costs`): the lines with what each costs per month, and the months' figures.
 * Revenue and orders are the daily facts' counted ones (`fact_orders_day`, the rule in `@insyte/domain/Revenue`),
 * inside the role's stores, each day's amount brought into the workspace's currency at that day's rate (§B.0.5). The
 * lines and ad spend are the workspace's. An ad line reads from its account while that account is connected; until an
 * account can be connected (Meta and Google Ads need app keys) no line reads and every ad month is typed.
 */

/** How many months one read may span, the design's five comfortably inside it. */
const MAX_MONTHS = 36

export const workspaceMonth = Effect.fn("Costs.workspaceMonth")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<{ currency: string; current: string }>`
    select currency, to_char(now() at time zone timezone, 'YYYY-MM') as current
    from workspaces where id = app_workspace_id()`
  return { currency: row!.currency.trim(), current: row!.current as Month }
})

const firstOf = (month: string) => `${month}-01`

/** The days read up to and with `until`, where one is given; the whole months otherwise. */
const upTo = (sql: SqlClient.SqlClient, column: string, until: string | undefined) =>
  until === undefined ? sql`true` : sql`${sql.literal(column)} <= ${until}::date`

/**
 * Counted revenue and orders per month, in the role's stores, converted at each day's rate; a day without a rate is
 * left out of revenue and counted in `unconverted`.
 */
const basisOf = Effect.fn("Costs.basis")(function*(
  sql: SqlClient.SqlClient,
  from: string,
  to: string,
  until?: string
) {
  const scope = yield* inScope(sql, "f.store_id")
  const rows = yield* sql<{ month: string; orders: number; revenueMinor: string; unconverted: number }>`
    with d as (
      select f.day, f.currency, sum(f.counted_orders)::bigint as orders, sum(f.counted_revenue_minor) as revenue
      from fact_orders_day f
      where f.day >= ${firstOf(from)}::date and f.day < ${firstOf(addMonths(to, 1))}::date
        and ${upTo(sql, "f.day", until)} and ${scope}
      group by f.day, f.currency
    )
    select to_char(d.day, 'YYYY-MM') as month, sum(d.orders)::int as orders,
           coalesce(sum(round(d.revenue * case when d.currency = w.currency then 1 else fx.rate end)), 0)::text
             as revenue_minor,
           count(*) filter (where d.currency <> w.currency and fx.rate is null and d.revenue <> 0)::int
             as unconverted
    from d
    cross join (select currency from workspaces where id = app_workspace_id()) w
    left join lateral (
      select x.rate from fx_rates x
      where d.currency <> w.currency and x.base = d.currency and x.quote = w.currency and x.day <= d.day
      order by x.day desc limit 1) fx on true
    group by 1`
  return new Map<string, MonthBasis & { readonly unconverted: number }>(
    rows.map((
      r
    ) => [r.month, {
      revenueMinor: Number(r.revenueMinor),
      orders: Number(r.orders),
      unconverted: Number(r.unconverted)
    }])
  )
})

interface LineRow {
  readonly id: string
  readonly name: string
  readonly kind: CostLine["kind"]
  readonly rate: number | null
  readonly rateMinor: string | null
  readonly source: CostSource
  readonly reads: boolean
  readonly hasTyped: boolean
}

/** The live lines, each with its typed months and, where it reads from a connected account, the account's spend. */
const linesOf = Effect.fn("Costs.lines")(function*(
  sql: SqlClient.SqlClient,
  from: string,
  to: string,
  until?: string
) {
  const lines = yield* sql<LineRow>`
    select l.id, l.name, l.kind, l.rate::float8 as rate, l.rate_minor::text as rate_minor, l.source,
           (l.kind = 'ads' and l.source <> 'manual' and exists (
             select 1 from connections c
             where c.provider = l.source and c.status = 'connected'
               and (l.connection_id is null or c.id = l.connection_id))) as reads,
           exists (select 1 from cost_line_amounts a where a.line_id = l.id) as has_typed
    from cost_lines l
    where l.deleted_at is null
    order by l.position, l.created_at, l.id`
  const typed = yield* sql<{ lineId: string; month: string; amountMinor: string }>`
    select a.line_id, to_char(a.month, 'YYYY-MM') as month, a.amount_minor::text as amount_minor
    from cost_line_amounts a join cost_lines l on l.id = a.line_id
    where l.deleted_at is null and a.month between ${firstOf(from)}::date and ${firstOf(to)}::date`
  const spend = yield* sql<{ lineId: string; month: string; spendMinor: string }>`
    select l.id as line_id, to_char(s.day, 'YYYY-MM') as month,
           coalesce(sum(round(s.spend_minor * case when s.currency = w.currency then 1 else fx.rate end)), 0)::text
             as spend_minor
    from cost_lines l
    cross join (select currency from workspaces where id = app_workspace_id()) w
    join connections c on c.provider = l.source and c.status = 'connected'
      and (l.connection_id is null or c.id = l.connection_id)
    join ad_spend_day s on s.connection_id = c.id
      and s.day >= ${firstOf(from)}::date and s.day < ${firstOf(addMonths(to, 1))}::date
      and ${upTo(sql, "s.day", until)}
    left join lateral (
      select x.rate from fx_rates x
      where s.currency <> w.currency and x.base = s.currency and x.quote = w.currency and x.day <= s.day
      order by x.day desc limit 1) fx on true
    where l.deleted_at is null and l.kind = 'ads'
    group by 1, 2`
  const typedBy = new Map<string, Map<string, number>>()
  for (const t of typed) {
    const m = typedBy.get(t.lineId) ?? new Map<string, number>()
    m.set(t.month, Number(t.amountMinor))
    typedBy.set(t.lineId, m)
  }
  const spendBy = new Map<string, Map<string, number>>()
  for (const s of spend) {
    const m = spendBy.get(s.lineId) ?? new Map<string, number>()
    m.set(s.month, Number(s.spendMinor))
    spendBy.set(s.lineId, m)
  }
  return lines.map((l) => ({
    row: l,
    rule: {
      kind: l.kind,
      rate: l.rate === null ? null : Number(l.rate),
      rateMinor: l.rateMinor === null ? null : Number(l.rateMinor),
      typed: typedBy.get(l.id) ?? new Map<string, number>(),
      account: l.reads ? (spendBy.get(l.id) ?? new Map<string, number>()) : null
    } satisfies LineRule
  }))
})

const NO_BASIS: MonthBasis = { revenueMinor: 0, orders: 0 }

const rangeOf = (input: typeof ListInput.Type, current: Month) => {
  const to = input.to ?? current
  const from = input.from ?? addMonths(to, -4)
  if (from > to) return new Invalid({ fields: { from: "after_to" } })
  const months = monthsBetween(from, to)
  if (months.length > MAX_MONTHS) return new Invalid({ fields: { from: "too_long" } })
  return months
}

/** Kosten: the lines, what each costs per month of the range, and the months' figures. Analyse · Bekijken. */
export const list = Effect.fn("Costs.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("analytics", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { currency, current } = yield* workspaceMonth(sql)
      const months = rangeOf(input, current)
      if (months instanceof Invalid) return yield* months
      const from = months[0]!
      const to = months[months.length - 1]!
      const basis = yield* basisOf(sql, from, to)
      const lines = yield* linesOf(sql, from, to)
      const rules = lines.map((l) => l.rule)
      return new CostsList({
        currency,
        months,
        current,
        lines: lines.map(({ row, rule }) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          rate: rule.rate,
          rateMinor: rule.rateMinor,
          source: row.source,
          readsFromSource: row.reads,
          hasTyped: row.hasTyped,
          cells: Object.fromEntries(months.map((m) => [m, costOf(rule, m, basis.get(m) ?? NO_BASIS)]))
        })),
        figures: months.map((m) => figuresOf(rules, m, basis.get(m) ?? NO_BASIS))
      })
    })
  )
})

/**
 * The months' figures on a transaction already scoped to the workspace, with what the Meta and Google Ads lines cost
 * apart, for INSYTE() (M14 step 4, through analytics' `CostFigures`). The revenue, orders and ad spend read stop at
 * `until` when one is given (the month under way's today, as INSYTE()'s sales read it); Kosten itself reads whole
 * months. The caller has checked Analyse · Bekijken.
 */
export const figuresIn = Effect.fn("Costs.figuresIn")(function*(
  sql: SqlClient.SqlClient,
  wanted: ReadonlyArray<string>,
  until?: string
) {
  const months: Array<Month> = [...new Set(wanted)].sort()
  if (months.length === 0) return []
  const from = months[0]!
  const to = months[months.length - 1]!
  const basis = yield* basisOf(sql, from, to, until)
  const lines = (yield* linesOf(sql, from, to, until)).map((l) => ({ rule: l.rule, source: l.row.source }))
  const rules = lines.map((l) => l.rule)
  return months.map((m) => {
    const b = basis.get(m) ?? NO_BASIS
    return {
      ...figuresOf(rules, m, b),
      metaMinor: adsFrom(lines, "meta", m, b),
      googleMinor: adsFrom(lines, "google_ads", m, b),
      unconverted: basis.get(m)?.unconverted ?? 0
    }
  })
})

/** The month figures alone, for Analyse and INSYTE() (M14), `/v1` and MCP. Analyse · Bekijken. */
export const figures = Effect.fn("Costs.figures")(function*(input: typeof FiguresInput.Type) {
  yield* Policy.require("analytics", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { currency } = yield* workspaceMonth(sql)
      const months = yield* figuresIn(sql, input.months)
      return new CostsFigures({
        currency,
        figures: months.map(({ metaMinor: _meta, googleMinor: _google, unconverted: _unconverted, ...figures }) =>
          figures
        )
      })
    })
  )
})
