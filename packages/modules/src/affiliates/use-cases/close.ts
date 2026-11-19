import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type Tier, UNNAMED_REASON } from "../domain/Affiliates.ts"
import { settle } from "./conversions.ts"
import { currencyOf, monthOf, payDayOf, programOf, tiersOf } from "./program.ts"

/*
 * The month's close for affiliates (M16 step 5; domain.md §14.1, §12.10), in `MonthlyCloseWorkflow` on the 1st: per
 * affiliate, one payout for the month that ended, over its conversions of that month and any earlier one not paid out
 * yet, its sums read off the ledger. Only a month that has ended (UTC) closes; the running month has no payout and
 * "loopt nog". Run again, it writes the same: the payout is unique per affiliate and month, and one the brand already
 * approved or paid is left as it is. Then the tiers: an affiliate whose approved conversions over the last three
 * months reach a higher tier's threshold moves up (never down).
 *
 * As the system in the workspace. No money moves: a payout is a record the brand approves and marks paid.
 */

/** The open payouts' sums, read again off the ledger (a conversion approved or reversed since the close). */
export const refreshPayouts = (sql: SqlClient.SqlClient) =>
  sql`
    update affiliate_payouts p set
      conversions = s.conversions, gross_minor = s.gross, reversed_minor = s.reversed, total_minor = s.gross + s.reversed,
      approvable_minor = s.approvable, in_window_minor = s.in_window
    from (
      select p2.id,
             count(distinct c.id) filter (where c.status <> 'reversed')::int as conversions,
             coalesce(sum(e.amount_minor) filter (where e.kind = 'accrual'), 0)::bigint as gross,
             coalesce(sum(e.amount_minor) filter (where e.kind = 'reversal'), 0)::bigint as reversed,
             coalesce(sum(e.amount_minor) filter (where e.kind in ('accrual', 'reversal')
                                                  and c.status in ('approved', 'paid')), 0)::bigint as approvable,
             coalesce(sum(e.amount_minor) filter (where e.kind in ('accrual', 'reversal')
                                                  and c.status = 'pending'), 0)::bigint as in_window
      from affiliate_payouts p2
      left join affiliate_conversions c on c.payout_id = p2.id
      left join affiliate_ledger_entries e on e.conversion_id = c.id
      where p2.workspace_id = app_workspace_id() and p2.status = 'approvable'
      group by p2.id
    ) s
    where p.id = s.id`

export const closeIn = Effect.fn("Affiliates.closeIn")(function*(
  sql: SqlClient.SqlClient,
  month: string,
  at: Date = new Date()
) {
  // The running month never closes.
  if (month >= monthOf(at)) return { ended: false, payouts: [] as ReadonlyArray<string>, promoted: [] }
  const program = yield* programOf(sql)
  if (program === undefined) return { ended: false, payouts: [] as ReadonlyArray<string>, promoted: [] }
  const payDay = payDayOf(month, program.payoutDay)
  const currency = yield* currencyOf(sql)
  // Every affiliate with a conversion of the month, or an earlier one not in a payout yet.
  const due = yield* sql<{ affiliateId: string }>`
    select distinct c.affiliate_id from affiliate_conversions c
    where c.workspace_id = app_workspace_id() and c.month <= ${month} and c.payout_id is null
      and c.status in ('pending', 'approved')`
  const payouts: Array<string> = []
  for (const { affiliateId } of due) {
    const [payout] = yield* sql<{ id: string; status: string }>`
      insert into affiliate_payouts (id, workspace_id, affiliate_id, month, currency, pay_day)
      values (${mintId("apo")}, app_workspace_id(), ${affiliateId}, ${month}, ${currency}, ${payDay})
      on conflict (affiliate_id, month) do update set closed_at = affiliate_payouts.closed_at
      returning id, status`
    if (payout === undefined || payout.status !== "approvable") continue
    yield* sql`update affiliate_conversions set payout_id = ${payout.id}
               where workspace_id = app_workspace_id() and affiliate_id = ${affiliateId} and month <= ${month}
                 and payout_id is null and status in ('pending', 'approved')`
    payouts.push(payout.id)
  }
  yield* refreshPayouts(sql)
  const promoted = yield* promote(sql, month)
  return { ended: true, payouts, promoted }
})

const RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 }

/**
 * The tiers at the close: approved (and paid) conversions placed in the three months ending with `month`; the highest
 * tier whose threshold they reach, if it is higher than the affiliate's. A promotion only.
 */
export const promote = Effect.fn("Affiliates.promote")(function*(sql: SqlClient.SqlClient, month: string) {
  const tiers = yield* tiersOf(sql)
  const [y, m] = month.split("-").map(Number) as [number, number]
  const from = new Date(Date.UTC(y, m - 3, 1))
  const to = new Date(Date.UTC(y, m, 1))
  const counts = yield* sql<{ id: string; tier: Tier; n: number }>`
    select a.id, a.tier,
           (select count(*) from affiliate_conversions c where c.affiliate_id = a.id and c.status in ('approved', 'paid')
              and c.placed_at >= ${from} and c.placed_at < ${to})::int as n
    from affiliates a where a.workspace_id = app_workspace_id() and a.status = 'active'`
  const promoted: Array<{ id: string; from: Tier; to: Tier }> = []
  for (const a of counts) {
    const reached = [...tiers].filter((t) => a.n >= t.threshold).sort((x, z) => RANK[z.tier] - RANK[x.tier])[0]
    if (reached === undefined || RANK[reached.tier] <= RANK[a.tier]) continue
    yield* sql`update affiliates set tier = ${reached.tier}, rate = ${reached.rate} where id = ${a.id}`
    yield* sql`insert into audit_events (id, workspace_id, actor_kind, actor_id, action, subject_type, subject_id, diff)
               values (${mintId("aud")}, app_workspace_id(), 'system', 'monthly_close', 'affiliate.tier_promoted',
                       'affiliate', ${a.id}, ${JSON.stringify({ tier: [a.tier, reached.tier], quarter: a.n })}::jsonb)`
    promoted.push({ id: a.id, from: a.tier, to: reached.tier })
  }
  return promoted
})

/** The workspaces with a programme, for the close and the daily approval. Ids only. */
export const programWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from affiliate_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/** One workspace's close of `month` (`CurrentWorkspace`, as `system`): the conversions followed first, then payouts. */
export const closeWorkspace = Effect.fn("Affiliates.closeWorkspace")(function*(month: string, at: Date = new Date()) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* settle(sql, { at })
      return yield* closeIn(sql, month, at)
    })
  )
})

/** A rejected application is kept this long after the decision, then purged (domain.md §18.2). */
export const REJECTED_RETENTION_DAYS = 180
/** Clicks are kept this long, then dropped (domain.md §18.2: 13 months online). */
export const CLICK_RETENTION_MONTHS = 13

/**
 * What the programme no longer needs, gone: rejected applications 180 days after the decision, clicks after 13 months.
 * There is no partition job yet (every partitioned table has its default partition only), so the clicks are deleted
 * here, by date. As of \`at\`.
 */
export const retain = (sql: SqlClient.SqlClient, at: Date) =>
  Effect.all({
    applications: Effect.map(
      sql<{ id: string }>`
        delete from affiliate_applications
        where workspace_id = app_workspace_id() and status = 'rejected'
          and decided_at < ${at}::timestamptz - make_interval(days => ${REJECTED_RETENTION_DAYS})
        returning id`,
      (rows) => rows.length
    ),
    clicks: Effect.map(
      sql<{ id: string }>`
        delete from affiliate_clicks
        where workspace_id = app_workspace_id()
          and at < ${at}::timestamptz - make_interval(months => ${CLICK_RETENTION_MONTHS})
        returning id`,
      (rows) => rows.length
    )
  })

/**
 * The daily approval (03:00 UTC): every conversion still in its window followed (delivery, refunds, cancels), those
 * past it approved, the open payouts' sums read again, and what is past its keeping purged (\`retain\`). One workspace
 * (\`CurrentWorkspace\`, as \`system\`).
 */
export const settleWorkspace = Effect.fn("Affiliates.settleWorkspace")(function*(at: Date = new Date()) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const changed = yield* settle(sql, { at })
      if (changed.length > 0) yield* refreshPayouts(sql)
      yield* endErased(sql)
      const purged = yield* retain(sql, at)
      return { changed: changed.length, purged }
    })
  )
})

/**
 * An erased affiliate's discount still held (its store was not connected when they were erased, refused its grant, or
 * Shopify was unreachable through every try) is asked to end again, once a day, while a store is connected; a code
 * Shopify made without naming it (`UNNAMED_REASON`) is looked up by its code again, to be kept or ended (W13.6).
 */
const endErased = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const rows = yield* sql<{ id: string; workspaceId: string }>`
      select a.id, a.workspace_id from affiliates a
      where ((a.discount_state = 'erased' and a.shopify_discount_id is not null)
             or (a.discount_state in ('pending', 'erased') and a.discount_error = ${UNNAMED_REASON}))
        and exists (select 1 from stores s where s.workspace_id = a.workspace_id and s.status = 'connected')
      order by a.id limit 100`
    const [first] = rows
    if (first === undefined) return
    yield* Outbox.write(sql, first.workspaceId, {
      type: "affiliate.discount_requested",
      workspaceId: first.workspaceId,
      affiliateIds: rows.map((r) => r.id)
    })
  })

/** Every programme's daily approval, one workspace after another; one that fails is logged, the rest still run. */
export const settleSweep = Effect.fn("Affiliates.settleSweep")(function*(at: Date = new Date()) {
  for (const workspaceId of yield* programWorkspaces) {
    yield* settleWorkspace(at).pipe(
      Effect.provideService(CurrentWorkspace, { id: workspaceId }),
      Effect.catchCause((cause) =>
        Effect.logWarning("affiliates: a workspace's daily approval failed", { workspaceId, cause })
      )
    )
  }
})
