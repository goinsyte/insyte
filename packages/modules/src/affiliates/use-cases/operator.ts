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
  FlaggedConversion,
  ProgramView,
  type Tier,
  UNNAMED_REASON
} from "../domain/Affiliates.ts"
import type {
  ApplicationsInput,
  ApproveInput,
  EraseInput,
  ListInput,
  ProgramInput,
  RejectInput,
  ReviewConversionInput,
  SetCodeInput,
  SetPausedInput,
  SetTierInput
} from "../domain/Inputs.ts"
import {
  codeFrom,
  codeTaken,
  commissionOf,
  currencyOf,
  DEFAULT_TIERS,
  freeCode,
  holdCode,
  programOf,
  rateOf,
  startProgram,
  tiersOf
} from "./program.ts"

/*
 * The brand's side of the programme (M16 step 5; widgets/06 Part C), as a member: `affiliates` 1 reads, 2 decides
 * applications and changes an affiliate's tier, pause or code, 3 runs the programme, its money and an erasure. An
 * affiliate's earnings are summed over the conversions of the stores the member reaches (`storeScope`); the programme,
 * its affiliates and its payouts span the stores, so only someone who reaches every store changes anything here, and
 * someone held to some stores sees no payment details.
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

/** The programme as the brand reads it: its own, or the defaults it would start with (nothing is made by reading). */
export const programView = Effect.fn("Affiliates.programView")(function*(sql: SqlClient.SqlClient) {
  const p = yield* programOf(sql)
  const tiers = p === undefined ? DEFAULT_TIERS : yield* tiersOf(sql)
  const currency = yield* currencyOf(sql)
  const [store] = yield* sql<{ id: string }>`select id from stores where status <> 'disconnected' limit 1`
  return new ProgramView({
    started: p !== undefined,
    enabled: p?.enabled ?? false,
    returnDays: p?.returnDays ?? 14,
    payoutDay: p?.payoutDay ?? 15,
    attributionDays: p?.attributionDays ?? 30,
    defaultTier: p?.defaultTier ?? "bronze",
    discountPercent: p?.discountPercent ?? 10,
    tiers,
    rejectReasons: p?.rejectReasons ?? [],
    faqs: p?.faqs ?? [],
    applyPath: p === undefined ? "" : `/partners/${p.applySlug}`,
    currency,
    storeConnected: store !== undefined
  })
})

/** "Opslaan" on the programme's settings; the first time, this starts it. */
export const updateProgram = Effect.fn("Affiliates.updateProgram")(function*(input: ProgramInput) {
  yield* Policy.require("affiliates", 3)
  yield* everyStore
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* startProgram(sql)
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
    select a.id, a.name, a.email, a.code, a.tier, a.rate, a.status, a.joined_at,
           case when a.discount_state = 'erased' then 'off' else a.discount_state end as discount_state, a.discount_error,
           coalesce(s.conversions, 0)::int as conversions, coalesce(s.earned, 0)::bigint as earned
    from affiliates a
    left join lateral (
      select count(*) filter (where c.status not in ('reversed', 'flagged')) as conversions,
             sum(c.commission_minor) filter (where c.status not in ('reversed', 'flagged')) as earned
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
  const { storeScope } = yield* CurrentPrincipal
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
        // How an affiliate is paid spans the stores: someone held to some sees none of it.
        payment: storeScope !== null || pay?.method === null || pay?.method === undefined
          ? null
          : { method: pay.method, hint: pay.hint ?? "" }
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
  yield* everyStore
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
  yield* everyStore
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
  yield* everyStore
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
      if ((yield* programOf(sql)) === undefined) {
        return yield* new Conflict({ entity: "affiliate_application", reason: "closed" })
      }
      const rate = rateOf(yield* tiersOf(sql), input.tier)
      const id = mintId("aff")
      yield* sql`insert into affiliates (id, workspace_id, user_id, name, email, code, tier, rate, application_id,
                                         approved_by, approved_at, payment_method)
                 values (${id}, ${principal.workspaceId}, ${app.userId}, ${app.name}, ${app.email}, ${input.code},
                         ${input.tier}, ${rate}, ${app.id}, ${principal.id}, now(), null)`
      yield* holdCode(sql, input.code, id)
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
  yield* everyStore
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
  yield* everyStore
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

/**
 * "Code wijzigen": another code for an affiliate whose discount Shopify has not made yet, or refused ("Code bestaat al
 * in Shopify"). Free in the workspace; the old one ends now, and the new one's discount is asked for.
 */
export const setCode = Effect.fn("Affiliates.setCode")(function*(input: SetCodeInput) {
  yield* Policy.require("affiliates", 2)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const outboxId = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [a] = yield* sql<{ id: string; code: string; discountState: DiscountState | "erased" }>`
        select id, code, discount_state from affiliates where id = ${input.affiliateId} for update`
      if (a === undefined) return yield* new NotFound({ entity: "affiliate", id: input.affiliateId })
      if (a.discountState === "made") return yield* new Conflict({ entity: "affiliate", reason: "discount_made" })
      if (a.discountState === "erased") return yield* new Conflict({ entity: "affiliate", reason: "erased" })
      if (a.code === input.code) return null
      if (yield* codeTaken(sql, input.code, a.id)) return yield* new Invalid({ fields: { code: "taken" } })
      yield* sql`update affiliate_codes set valid_until = now()
                 where workspace_id = app_workspace_id() and affiliate_id = ${a.id} and code = ${a.code}`
      yield* holdCode(sql, input.code, a.id)
      yield* sql`update affiliates set code = ${input.code}, discount_state = 'pending', discount_error = null,
                   shopify_discount_id = null
                 where id = ${a.id}`
      yield* audit(sql, "affiliate.code_changed", "affiliate", a.id, { code: [a.code, input.code] })
      return yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.discount_requested",
        workspaceId: principal.workspaceId,
        affiliateIds: [a.id]
      })
    })
  )
  if (outboxId !== null) yield* relay.kick([outboxId])
  return new AffiliatesChange({ ids: [input.affiliateId], undo: null })
})

/** The conversions that look like their affiliate's own, waiting for the brand. Money: someone held to some stores sees none. */
export const flagged = Effect.fn("Affiliates.flagged")(function*() {
  yield* Policy.require("affiliates", 1)
  const { storeScope } = yield* CurrentPrincipal
  if (storeScope !== null) return []
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.map(
      sql<{
        id: string
        affiliateId: string
        affiliateName: string
        orderNumber: string
        baseMinor: string
        rate: string
        currency: string
        placedAt: Date
      }>`
        select c.id, c.affiliate_id, a.name as affiliate_name, c.order_number, c.base_minor, c.rate, c.currency,
               c.placed_at
        from affiliate_conversions c join affiliates a on a.id = c.affiliate_id
        where c.status = 'flagged'
        order by c.placed_at desc, c.id desc limit 500`,
      (rows) =>
        rows.map((r) =>
          new FlaggedConversion({
            id: r.id,
            affiliateId: r.affiliateId,
            affiliateName: r.affiliateName,
            orderNumber: r.orderNumber,
            baseMinor: Number(r.baseMinor),
            commissionMinor: commissionOf(Number(r.baseMinor), Number(r.rate)),
            currency: r.currency,
            placedAt: r.placedAt.getTime(),
            reason: "self"
          })
        )
    )
  )
})

/**
 * The brand's answer on a flagged conversion: accepted, it earns from now on as any other (its accrual written, its
 * window followed); turned down, it is reversed as the affiliate's own and never earns.
 */
export const reviewConversion = Effect.fn("Affiliates.reviewConversion")(function*(input: ReviewConversionInput) {
  yield* Policy.require("affiliates", 3)
  yield* everyStore
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [c] = yield* sql<
        { id: string; affiliateId: string; baseMinor: string; rate: string; currency: string; month: string }
      >`
        select id, affiliate_id, base_minor, rate, currency, month from affiliate_conversions
        where id = ${input.conversionId} and status = 'flagged' for update`
      if (c === undefined) return yield* new NotFound({ entity: "affiliate_conversion", id: input.conversionId })
      if (input.accept) {
        const commission = commissionOf(Number(c.baseMinor), Number(c.rate))
        yield* sql`update affiliate_conversions set status = 'pending', commission_minor = ${commission}
                   where id = ${c.id}`
        yield* sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, conversion_id, kind,
                                                         amount_minor, currency, month)
                   values (${mintId("ale")}, app_workspace_id(), ${c.affiliateId}, ${c.id}, 'accrual', ${commission},
                           ${c.currency}, ${c.month})`
      } else {
        yield* sql`update affiliate_conversions set status = 'reversed', reversal_reason = 'self', reversed_at = now()
                   where id = ${c.id}`
      }
      yield* audit(
        sql,
        input.accept ? "affiliate.conversion_accepted" : "affiliate.conversion_refused",
        "affiliate_conversion",
        c.id
      )
      return new AffiliatesChange({ ids: [c.id], undo: null })
    })
  )
})

/**
 * Erasing a person on their request (GDPR art. 17), as the brand: an affiliate, or someone who only applied. What names
 * or reaches them goes (name, address, payment details, answers, their account's link, their notes and invitations);
 * their links are archived and their codes ended, so nothing earns any more. The money stays as the books need it:
 * conversions, the ledger and payouts keep their amounts, under the affiliate's id only. Its Shopify discount is
 * ended (deactivated) by the discount step, through the outbox: the person is gone, so nothing earns under the code any
 * more. Its title never named them (\`titleOf\`). No undo.
 */
export const erase = Effect.fn("Affiliates.erase")(function*(input: EraseInput) {
  yield* Policy.require("affiliates", 3)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [who] = "affiliateId" in input
        ? yield* sql<{ userId: string; email: string; affiliateId: string | null }>`
            select user_id, email, id as affiliate_id from affiliates where id = ${input.affiliateId} for update`
        : yield* sql<{ userId: string; email: string; affiliateId: string | null }>`
            select a.user_id, a.email, f.id as affiliate_id
            from affiliate_applications a left join affiliates f on f.user_id = a.user_id
            where a.id = ${input.applicationId}`
      if (who === undefined) {
        return yield* new NotFound({
          entity: "affiliateId" in input ? "affiliate" : "affiliate_application",
          id: "affiliateId" in input ? input.affiliateId : input.applicationId
        })
      }
      const gone = `erased:${mintId("era")}`
      const address = `${gone.slice(7)}@erased.invalid`
      if (who.affiliateId !== null) {
        yield* sql`update affiliates set name = 'Gewiste affiliate', email = ${address}, user_id = ${gone},
                     status = 'paused', payment_method = null, payment_account_sealed = null,
                     payment_account_hint = null, payment_tax_id = null, payment_updated_at = null
                   where id = ${who.affiliateId}`
        yield* sql`update affiliate_links set archived_at = coalesce(archived_at, now())
                   where affiliate_id = ${who.affiliateId}`
        yield* sql`update affiliate_codes set valid_until = now()
                   where affiliate_id = ${who.affiliateId} and (valid_until is null or valid_until > now())`
        yield* sql`delete from notifications where recipient_kind = 'affiliate' and recipient_id = ${who.affiliateId}`
        yield* sql`update affiliates set discount_state = 'erased',
                     discount_error = case when discount_error = ${UNNAMED_REASON} then discount_error end
                   where id = ${who.affiliateId}`
      }
      // Its discount, if Shopify has one or a step is making one, is ended by the step (\`discountWriteBack\`).
      const outboxId = who.affiliateId === null ? null : yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.discount_requested",
        workspaceId: principal.workspaceId,
        affiliateIds: [who.affiliateId]
      })
      yield* sql`update affiliate_applications set
                   name = 'Gewiste aanvrager', email = ${address}, user_id = ${gone}, business_name = null,
                   country = null, channel = null, audience = null, motivation = null, main_url = null,
                   payout_method_hint = null, reason = null,
                   status = case when status = 'pending' then 'rejected' else status end
                 where user_id = ${who.userId}`
      yield* sql`delete from invitations where kind = 'affiliate' and email = ${who.email}`
      yield* audit(
        sql,
        "affiliate.erased",
        who.affiliateId === null ? "affiliate_application" : "affiliate",
        who.affiliateId ?? ("applicationId" in input ? input.applicationId : "")
      )
      return {
        outboxId,
        change: new AffiliatesChange({
          ids: [who.affiliateId ?? ("applicationId" in input ? input.applicationId : "")],
          undo: null
        })
      }
    })
  )
  if (outboxId !== null) yield* relay.kick([outboxId])
  return change
})
