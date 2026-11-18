import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AffiliateDetail,
  AffiliateList,
  AffiliateRow,
  AffiliatesChange,
  ApplicationList,
  ApplicationRow,
  type DiscountState,
  ProgramView,
  type Tier
} from "../domain/Affiliates.ts"
import type {
  ApplicationsInput,
  ApproveInput,
  ListInput,
  ProgramInput,
  RejectInput,
  SetPausedInput,
  SetTierInput
} from "../domain/Inputs.ts"
import { codeFrom, codeTaken, currencyOf, ensureProgram, freeCode, rateOf, tiersOf } from "./program.ts"

/*
 * The brand's side of the programme (M16 step 5; widgets/06 Part C), as a member: `affiliates` 1 reads, 2 decides
 * applications and changes an affiliate's tier or pause, 3 runs the programme. An affiliate's earnings are summed over
 * the conversions of the stores the member reaches (`storeScope`); the programme's settings and its payouts span the
 * stores, so only someone who reaches every store changes them.
 */

export const RESTORE = "affiliates.restore"

/** Only someone who reaches every store (`storeScope` null) changes what spans them. */
export const everyStore = Effect.flatMap(
  Effect.service(CurrentPrincipal),
  (p) => p.storeScope === null ? Effect.void : Effect.fail(new Invalid({ fields: { stores: "forbidden" } }))
)

const actor = Effect.map(Effect.service(CurrentPrincipal), (p) => ({ kind: p.kind, id: p.id }))

export const audit = (
  sql: SqlClient.SqlClient,
  action: string,
  subjectType: string,
  subjectId: string,
  diff?: Record<string, unknown>
) =>
  Effect.flatMap(
    Effect.all([Effect.service(CurrentPrincipal), actor]),
    ([p, a]) => Audit.write(sql, p.workspaceId, a, { action, subjectType, subjectId, diff })
  )

export const program = Effect.fn("Affiliates.program")(function*() {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => programView(sql))
})

export const programView = Effect.fn("Affiliates.programView")(function*(sql: SqlClient.SqlClient) {
  const p = yield* ensureProgram(sql)
  const tiers = yield* tiersOf(sql)
  const currency = yield* currencyOf(sql)
  const [store] = yield* sql<{ id: string }>`select id from stores where status <> 'disconnected' limit 1`
  return new ProgramView({
    enabled: p.enabled,
    returnDays: p.returnDays,
    payoutDay: p.payoutDay,
    attributionDays: p.attributionDays,
    defaultTier: p.defaultTier,
    discountPercent: p.discountPercent,
    tiers,
    rejectReasons: p.rejectReasons,
    faqs: p.faqs,
    applyPath: `/partners/${p.applySlug}`,
    currency,
    storeConnected: store !== undefined
  })
})

export const updateProgram = Effect.fn("Affiliates.updateProgram")(function*(input: ProgramInput) {
  yield* Policy.require("affiliates", 3)
  yield* everyStore
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* ensureProgram(sql)
      yield* sql`update affiliate_programs set
                   enabled = ${input.enabled ?? before.enabled},
                   return_days = ${input.returnDays ?? before.returnDays},
                   payout_day = ${input.payoutDay ?? before.payoutDay},
                   discount_percent = ${input.discountPercent ?? before.discountPercent}
                 where workspace_id = app_workspace_id()`
      yield* audit(sql, "affiliate.program_updated", "affiliate_program", before.workspaceId, { ...input })
      return yield* programView(sql)
    })
  )
})

interface Row {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly code: string
  readonly tier: Tier
  readonly rate: string
  readonly status: "active" | "paused"
  readonly conversions: number
  readonly earned: string
  readonly joinedAt: Date
  readonly discountState: DiscountState
  readonly discountError: string | null
}

const rowOf = (r: Row) =>
  new AffiliateRow({
    id: r.id,
    name: r.name,
    email: r.email,
    code: r.code,
    tier: r.tier,
    rate: Number(r.rate),
    status: r.status,
    conversions: r.conversions,
    earnedMinor: Number(r.earned),
    joinedAt: r.joinedAt.getTime(),
    discount: r.discountState,
    discountError: r.discountError
  })

/** The affiliates with their conversions and earnings in the stores the member reaches. */
const affiliateRows = Effect.fn("Affiliates.rows")(
  function*(sql: SqlClient.SqlClient, where: ReturnType<SqlClient.SqlClient["and"]>) {
    const fence = yield* inScope(sql, "c.store_id")
    return yield* sql<Row>`
    select a.id, a.name, a.email, a.code, a.tier, a.rate, a.status, a.joined_at, a.discount_state, a.discount_error,
           coalesce(s.conversions, 0)::int as conversions, coalesce(s.earned, 0)::bigint as earned
    from affiliates a
    left join lateral (
      select count(*) filter (where c.status <> 'reversed') as conversions,
             sum(c.commission_minor) filter (where c.status <> 'reversed') as earned
      from affiliate_conversions c where c.affiliate_id = a.id and ${fence}
    ) s on true
    where ${where}
    order by a.joined_at desc, a.id desc
    limit 1000`
  }
)

export const list = Effect.fn("Affiliates.list")(function*(input: ListInput) {
  yield* Policy.require("affiliates", 1)
  const { storeScope } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const q = input.q?.trim().toLowerCase()
      const rows = yield* affiliateRows(
        sql,
        sql.and([
          input.status === undefined ? sql`true` : sql`a.status = ${input.status}`,
          input.tier === undefined ? sql`true` : sql`a.tier = ${input.tier}`,
          q === undefined || q === ""
            ? sql`true`
            : sql`(lower(a.name) like ${`%${q}%`} or a.email like ${`%${q}%`} or lower(a.code) like ${`%${q}%`})`
        ])
      )
      const [counts] = yield* sql<{ active: number; paused: number; pending: number; invites: number; due: string }>`
        select (select count(*) from affiliates where status = 'active')::int as active,
               (select count(*) from affiliates where status = 'paused')::int as paused,
               (select count(*) from affiliate_applications where status = 'pending')::int as pending,
               (select count(*) from invitations where kind = 'affiliate' and accepted_at is null
                  and revoked_at is null and declined_at is null and expires_at > now())::int as invites,
               (select coalesce(sum(approvable_minor), 0) from affiliate_payouts where status = 'approvable')::bigint
                 as due`
      return new AffiliateList({
        rows: rows.map(rowOf),
        counts: {
          active: counts?.active ?? 0,
          paused: counts?.paused ?? 0,
          pendingApplications: counts?.pending ?? 0,
          invites: counts?.invites ?? 0
        },
        // Payouts span the stores: someone held to some sees none of them.
        toApproveMinor: storeScope === null ? Number(counts?.due ?? 0) : 0,
        currency: yield* currencyOf(sql)
      })
    })
  )
})

export const get = Effect.fn("Affiliates.get")(function*(affiliateId: string) {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* affiliateRows(sql, sql.and([sql`a.id = ${affiliateId}`]))
      if (row === undefined) return yield* new NotFound({ entity: "affiliate", id: affiliateId })
      const fence = yield* inScope(sql, "c.store_id")
      const [month] = yield* sql<{ sum: string }>`
        select coalesce(sum(c.commission_minor), 0)::bigint as sum from affiliate_conversions c
        where c.affiliate_id = ${affiliateId} and c.status in ('pending', 'approved')
          and c.month = to_char(now() at time zone 'UTC', 'YYYY-MM') and ${fence}`
      const [pay] = yield* sql<{ method: "paypal" | "bank" | "wise" | null; hint: string | null }>`
        select payment_method as method, payment_account_hint as hint from affiliates where id = ${affiliateId}`
      return new AffiliateDetail({
        affiliate: rowOf(row),
        thisMonthMinor: Number(month?.sum ?? 0),
        currency: yield* currencyOf(sql),
        payment: pay?.method === null || pay?.method === undefined ? null : { method: pay.method, hint: pay.hint ?? "" }
      })
    })
  )
})

/** A change an affiliate's row can take back: its tier and rate, its pause. */
const snapshotOf = (sql: SqlClient.SqlClient, affiliateId: string) =>
  sql<{ id: string; tier: Tier; rate: string; status: string }>`
    select id, tier, rate, status from affiliates where id = ${affiliateId} for update`

export const setTier = Effect.fn("Affiliates.setTier")(function*(input: SetTierInput) {
  yield* Policy.require("affiliates", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* snapshotOf(sql, input.affiliateId)
      if (before === undefined) return yield* new NotFound({ entity: "affiliate", id: input.affiliateId })
      const rate = rateOf(yield* tiersOf(sql), input.tier)
      yield* sql`update affiliates set tier = ${input.tier}, rate = ${rate} where id = ${input.affiliateId}`
      yield* audit(sql, "affiliate.tier_changed", "affiliate", input.affiliateId, { tier: [before.tier, input.tier] })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: {
          kind: "affiliate",
          id: before.id,
          tier: before.tier,
          rate: Number(before.rate),
          status: before.status
        }
      })
      return new AffiliatesChange({ ids: [input.affiliateId], undo })
    })
  )
})

export const setPaused = Effect.fn("Affiliates.setPaused")(function*(input: SetPausedInput) {
  yield* Policy.require("affiliates", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* snapshotOf(sql, input.affiliateId)
      if (before === undefined) return yield* new NotFound({ entity: "affiliate", id: input.affiliateId })
      const status = input.paused ? "paused" : "active"
      yield* sql`update affiliates set status = ${status} where id = ${input.affiliateId}`
      yield* audit(sql, input.paused ? "affiliate.paused" : "affiliate.resumed", "affiliate", input.affiliateId)
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: {
          kind: "affiliate",
          id: before.id,
          tier: before.tier,
          rate: Number(before.rate),
          status: before.status
        }
      })
      return new AffiliatesChange({ ids: [input.affiliateId], undo })
    })
  )
})

interface AppRow {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly businessName: string | null
  readonly country: string | null
  readonly channel: string | null
  readonly audience: string | null
  readonly motivation: string | null
  readonly mainUrl: string | null
  readonly status: "pending" | "approved" | "rejected"
  readonly reason: string | null
  readonly appliedAt: Date
  readonly decidedAt: Date | null
  readonly reappliedFrom: string | null
}

const applicationOf = (r: AppRow) =>
  new ApplicationRow({
    id: r.id,
    name: r.name,
    email: r.email,
    businessName: r.businessName,
    country: r.country,
    channel: r.channel,
    audience: r.audience,
    motivation: r.motivation,
    mainUrl: r.mainUrl,
    status: r.status,
    reason: r.reason,
    appliedAt: r.appliedAt.getTime(),
    decidedAt: r.decidedAt?.getTime() ?? null,
    reappliedFrom: r.reappliedFrom
  })

const APPLICATION_FIELDS = (sql: SqlClient.SqlClient) =>
  sql`id, user_id, name, email, business_name, country, channel, audience, motivation, main_url, status, reason,
      applied_at, decided_at, reapplied_from`

export const applications = Effect.fn("Affiliates.applications")(function*(input: ApplicationsInput) {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<AppRow>`
        select ${APPLICATION_FIELDS(sql)} from affiliate_applications
        where ${
        input.status === undefined
          ? sql`true`
          : input.status === "pending"
          ? sql`status = 'pending'`
          : sql`status <> 'pending'`
      }
        order by applied_at desc, id desc limit 500`
      const [counts] = yield* sql<{ pending: number; decided: number }>`
        select count(*) filter (where status = 'pending')::int as pending,
               count(*) filter (where status <> 'pending')::int as decided
        from affiliate_applications`
      return new ApplicationList({
        rows: rows.map(applicationOf),
        counts: { pending: counts?.pending ?? 0, decided: counts?.decided ?? 0 }
      })
    })
  )
})

export const proposeCode = Effect.fn("Affiliates.proposeCode")(function*(name: string) {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.map(freeCode(sql, codeFrom(name)), (code) => ({ code })))
})

/**
 * "Goedkeuren": the applicant becomes an affiliate on the tier chosen with the code given (free in the workspace), its
 * Shopify discount asked for and the affiliate told, both once the undo window has passed. Undo takes the affiliate
 * away again and puts the application back.
 */
export const approve = Effect.fn("Affiliates.approve")(function*(input: ApproveInput) {
  yield* Policy.require("affiliates", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const result = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [app] = yield* sql<AppRow>`
        select ${APPLICATION_FIELDS(sql)} from affiliate_applications where id = ${input.applicationId} for update`
      if (app === undefined) return yield* new NotFound({ entity: "affiliate_application", id: input.applicationId })
      if (app.status !== "pending") return yield* new Conflict({ entity: "affiliate_application", reason: app.status })
      const [already] = yield* sql`select 1 from affiliates where user_id = ${app.userId}`
      if (already !== undefined) return yield* new Conflict({ entity: "affiliate_application", reason: "member" })
      if (yield* codeTaken(sql, input.code)) return yield* new Invalid({ fields: { code: "taken" } })
      yield* ensureProgram(sql)
      const rate = rateOf(yield* tiersOf(sql), input.tier)
      const id = mintId("aff")
      yield* sql`insert into affiliates (id, workspace_id, user_id, name, email, code, tier, rate, application_id,
                                         approved_by, approved_at, payment_method)
                 values (${id}, ${principal.workspaceId}, ${app.userId}, ${app.name}, ${app.email}, ${input.code},
                         ${input.tier}, ${rate}, ${app.id}, ${principal.id}, now(), null)`
      yield* sql`insert into affiliate_codes (workspace_id, code, affiliate_id)
                 values (${principal.workspaceId}, ${input.code}, ${id})`
      yield* sql`update affiliate_applications set status = 'approved', decided_by = ${principal.id},
                   decided_at = now(), affiliate_id = ${id}
                 where id = ${app.id}`
      yield* audit(sql, "affiliate.approved", "affiliate_application", app.id, {
        affiliate: id,
        tier: input.tier,
        code: input.code
      })
      const told = yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.decided",
        workspaceId: principal.workspaceId,
        applicationId: app.id,
        affiliateId: id,
        decision: "approved"
      }, { afterSeconds: UNDO_SECONDS })
      const discount = yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.discount_requested",
        workspaceId: principal.workspaceId,
        affiliateIds: [id]
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "approval", applicationId: app.id, affiliateId: id },
        outboxIds: [told, discount]
      })
      return { change: new AffiliatesChange({ ids: [id], undo }), outboxIds: [told, discount] }
    })
  )
  yield* relay.kick(result.outboxIds, { afterSeconds: UNDO_SECONDS })
  return result.change
})

/** "Afwijzen": with the reason the applicant reads on the portal's gate. Undo puts the application back. */
export const reject = Effect.fn("Affiliates.reject")(function*(input: RejectInput) {
  yield* Policy.require("affiliates", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const result = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [app] = yield* sql<{ id: string; status: string }>`
        select id, status from affiliate_applications where id = ${input.applicationId} for update`
      if (app === undefined) return yield* new NotFound({ entity: "affiliate_application", id: input.applicationId })
      if (app.status !== "pending") return yield* new Conflict({ entity: "affiliate_application", reason: app.status })
      yield* sql`update affiliate_applications set status = 'rejected', reason = ${input.reason.trim()},
                   decided_by = ${principal.id}, decided_at = now()
                 where id = ${app.id}`
      yield* audit(sql, "affiliate.rejected", "affiliate_application", app.id)
      const told = yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.decided",
        workspaceId: principal.workspaceId,
        applicationId: app.id,
        affiliateId: null,
        decision: "rejected"
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "rejection", applicationId: app.id },
        outboxIds: [told]
      })
      return { change: new AffiliatesChange({ ids: [app.id], undo }), outboxIds: [told] }
    })
  )
  yield* relay.kick(result.outboxIds, { afterSeconds: UNDO_SECONDS })
  return result.change
})

/** "Opnieuw proberen" on a code Shopify did not take: asked for again. */
export const retryDiscount = Effect.fn("Affiliates.retryDiscount")(function*(affiliateId: string) {
  yield* Policy.require("affiliates", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const outboxId = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [a] = yield* sql<{ id: string }>`
        update affiliates set discount_state = 'pending', discount_error = null
        where id = ${affiliateId} and discount_state in ('failed', 'off') returning id`
      if (a === undefined) return yield* new NotFound({ entity: "affiliate", id: affiliateId })
      yield* audit(sql, "affiliate.discount_retried", "affiliate", affiliateId)
      return yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.discount_requested",
        workspaceId: principal.workspaceId,
        affiliateIds: [affiliateId]
      })
    })
  )
  yield* relay.kick([outboxId])
  return new AffiliatesChange({ ids: [affiliateId], undo: null })
})
