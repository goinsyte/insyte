import { Db } from "@insyte/database/Db"
import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AffiliateDashboard,
  AffiliateNotes,
  AffiliatePayment,
  AffiliatePayout,
  AffiliatePayouts,
  AffiliateProfile,
  AffiliateResources,
  ConversionList,
  type ConversionRow,
  type ConversionStatus,
  CurrentAffiliate,
  type DiscountState,
  LinkDetail,
  LinkList,
  LinkMade,
  LinkRow,
  type Medium,
  type PaymentMethod,
  type PayoutMonth,
  type PayoutStatus,
  type Tier,
  type Week
} from "../domain/Affiliates.ts"
import type { ConversionsInput, CreateLinkInput, PaymentInput, ProfileInput } from "../domain/Inputs.ts"
import { monthOf, payDayOf, randomSlug } from "./program.ts"
import { resourceRows } from "./team.ts"

/*
 * The affiliate portal (M16 step 3; widgets/06 Part B), as the affiliate itself (`Db.scopedPartner`, kind `affiliate`,
 * its own row as `app.partner_id`): RLS answers its own rows and nothing else, and its conversions only through
 * `affiliate_conversions_v`, which names no shopper. Its writes are its links (made, archived), its name, and where
 * its money goes (the account sealed at once, shown masked, never logged).
 */

export const PORTAL_RESTORE = "affiliate_portal.restore"

/** Where Insyte's click redirect lives (`https://<public api host>`), set by the api Worker; empty in tests. */
export const RedirectOrigin = Context.Reference<string>("affiliates/RedirectOrigin", { defaultValue: () => "" })

const DAY = 86_400_000

const self = Effect.flatMap(Effect.service(CurrentPrincipal), (p) =>
  p.kind === "affiliate" && p.partnerId !== null
    ? Effect.succeed({ affiliateId: p.partnerId, principal: p })
    : Effect.die(new Error("the affiliate portal needs an affiliate principal")))

const actor = Effect.map(self, ({ affiliateId }) => ({ kind: "affiliate" as const, id: affiliateId }))

const audit = (
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

interface ProgramRow {
  readonly returnDays: number
  readonly payoutDay: number
  readonly currency: string
  readonly faqs: ReadonlyArray<{ q: string; a: string }>
}

const programOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<ProgramRow>`select return_days, payout_day, currency, faqs from affiliate_programs`,
    ([p]) => p ?? { returnDays: 14, payoutDay: 15, currency: "EUR", faqs: [] }
  )

interface ConvRow {
  readonly id: string
  readonly orderNumber: string
  readonly productTitle: string
  readonly linkLabel: string | null
  readonly attributedBy: "link" | "code"
  readonly baseMinor: string
  readonly commissionMinor: string
  readonly status: ConversionStatus
  readonly placedAt: Date
  readonly linkId: string | null
  readonly payoutId: string | null
  readonly month: string
}

const conversionOf = (r: ConvRow): ConversionRow => ({
  id: r.id,
  orderNumber: r.orderNumber,
  productTitle: r.productTitle,
  linkLabel: r.linkLabel,
  attributedBy: r.attributedBy,
  amountMinor: Number(r.baseMinor),
  commissionMinor: Number(r.commissionMinor),
  status: r.status,
  placedAt: r.placedAt.getTime()
})

const conversions = (sql: SqlClient.SqlClient, where: ReturnType<SqlClient.SqlClient["and"]>, limit = 500) =>
  Effect.map(
    sql<ConvRow>`
      select id, order_number, product_title, link_label, attributed_by, base_minor, commission_minor, status,
             placed_at, link_id, payout_id, month
      from affiliate_conversions_v where ${where}
      order by placed_at desc, id desc limit ${limit}`,
    (rows) => rows
  )

/** The last twelve weeks, oldest first: commission and conversions by the day placed, clicks by the day clicked. */
const weeksOf = Effect.fn("AffiliatePortal.weeks")(function*(
  sql: SqlClient.SqlClient,
  linkId: string | null,
  now: Date
) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY
  const start = new Date(end - 12 * 7 * DAY)
  const link = linkId === null ? sql`true` : sql`link_id = ${linkId}`
  const conv = yield* sql<{ placedAt: Date; commissionMinor: string; status: string }>`
    select placed_at, commission_minor, status from affiliate_conversions_v
    where placed_at >= ${start} and ${link}`
  const clicks = yield* sql<{ day: Date; clicks: number }>`
    select day, sum(clicks)::int as clicks from affiliate_clicks_v where day >= ${start} and ${link} group by day`
  const weeks: Array<{ end: number; earnedMinor: number; conversions: number; clicks: number }> = Array.from(
    { length: 12 },
    (_, i) => ({ end: start.getTime() + (i + 1) * 7 * DAY - 1, earnedMinor: 0, conversions: 0, clicks: 0 })
  )
  const at = (t: number) => weeks[Math.min(11, Math.max(0, Math.floor((t - start.getTime()) / (7 * DAY))))]!
  for (const c of conv) {
    if (c.status === "reversed") continue
    const w = at(c.placedAt.getTime())
    w.earnedMinor += Number(c.commissionMinor)
    w.conversions += 1
  }
  for (const k of clicks) at(k.day.getTime()).clicks += k.clicks
  return weeks as ReadonlyArray<Week>
})

interface LinkRaw {
  readonly id: string
  readonly label: string
  readonly url: string
  readonly shortSlug: string
  readonly medium: Medium
  readonly createdAt: Date
  readonly archivedAt: Date | null
  readonly clicks: number
  readonly conversions: number
  readonly revenue: string
  readonly commission: string
}

const linkRows = Effect.fn("AffiliatePortal.linkRows")(function*(sql: SqlClient.SqlClient, linkId?: string) {
  const origin = yield* RedirectOrigin
  const rows = yield* sql<LinkRaw>`
    select l.id, l.label, l.url, l.short_slug, l.medium, l.created_at, l.archived_at,
           coalesce((select sum(k.clicks) from affiliate_clicks_v k where k.link_id = l.id), 0)::int as clicks,
           coalesce(c.conversions, 0)::int as conversions, coalesce(c.revenue, 0)::bigint as revenue,
           coalesce(c.commission, 0)::bigint as commission
    from affiliate_links l
    left join lateral (
      select count(*) filter (where v.status <> 'reversed') as conversions,
             sum(v.base_minor) filter (where v.status <> 'reversed') as revenue,
             sum(v.commission_minor) filter (where v.status <> 'reversed') as commission
      from affiliate_conversions_v v where v.link_id = l.id
    ) c on true
    where ${linkId === undefined ? sql`true` : sql`l.id = ${linkId}`}
    order by l.archived_at is not null, l.created_at desc, l.id desc
    limit 500`
  return rows.map((r) =>
    new LinkRow({
      id: r.id,
      label: r.label,
      url: `${origin}/r/${r.shortSlug}`,
      storefrontUrl: r.url,
      medium: r.medium,
      clicks: r.clicks,
      conversions: r.conversions,
      revenueMinor: Number(r.revenue),
      commissionMinor: Number(r.commission),
      createdAt: r.createdAt.getTime(),
      archived: r.archivedAt !== null
    })
  )
})

interface Me {
  readonly name: string
  readonly email: string
  readonly code: string
  readonly tier: Tier
  readonly rate: string
  readonly discountState: DiscountState
  readonly paymentMethod: PaymentMethod | null
  readonly paymentAccountHint: string | null
  readonly paymentTaxId: string | null
}

const meOf = (sql: SqlClient.SqlClient) =>
  Effect.flatMap(
    sql<Me>`
      select name, email, code, tier, rate,
             case when discount_state = 'erased' then 'off' else discount_state end as discount_state,
             payment_method, payment_account_hint, payment_tax_id
      from affiliates where id = app_partner_id()`,
    ([me]) => me === undefined ? Effect.die(new Error("the affiliate's own row is not there")) : Effect.succeed(me)
  )

const tiersOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<
      { tier: Tier; rate: string; threshold: number }
    >`select tier, rate, threshold from affiliate_tiers order by position`,
    (rows) => rows.map((t) => ({ tier: t.tier, rate: Number(t.rate), threshold: t.threshold }))
  )

export const dashboard = Effect.fn("AffiliatePortal.dashboard")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const now = new Date()
      const program = yield* programOf(sql)
      const me = yield* meOf(sql)
      const [owed] = yield* sql<{ sum: string }>`
        select coalesce(sum(amount_minor), 0)::bigint as sum from affiliate_ledger_entries`
      const since30 = new Date(now.getTime() - 30 * DAY)
      const quarter = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
      const [counts] = yield* sql<{ conv30: number; quarter: number }>`
        select count(*) filter (where placed_at >= ${since30} and status <> 'reversed')::int as conv30,
               count(*) filter (where placed_at >= ${quarter} and status in ('approved', 'paid'))::int as quarter
        from affiliate_conversions_v`
      const [clicks] = yield* sql<{ n: number }>`
        select coalesce(sum(clicks), 0)::int as n from affiliate_clicks_v where day >= ${since30}`
      const recent = yield* conversions(sql, sql.and([sql`true`]), 5)
      const links = yield* linkRows(sql)
      const [resources] = yield* sql<{ n: number }>`select count(*)::int as n from affiliate_resources`
      return new AffiliateDashboard({
        owedMinor: Number(owed?.sum ?? 0),
        currency: program.currency,
        nextPayout: { payDay: payDayOf(monthOf(now), program.payoutDay), method: me.paymentMethod },
        conversions30d: counts?.conv30 ?? 0,
        clicks30d: clicks?.n ?? 0,
        quarterConversions: counts?.quarter ?? 0,
        weeks: yield* weeksOf(sql, null, now),
        recent: recent.map(conversionOf),
        tiers: yield* tiersOf(sql),
        bestLinks: links.filter((l) => !l.archived).sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks)
          .slice(0, 3),
        linksCount: links.filter((l) => !l.archived).length,
        resourcesCount: resources?.n ?? 0,
        returnDays: program.returnDays,
        asOf: now.getTime()
      })
    })
  )
})

export const listLinks = Effect.fn("AffiliatePortal.links.list")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const rows = yield* linkRows(sql)
      return new LinkList({
        rows,
        totals: {
          clicks: rows.reduce((s, l) => s + l.clicks, 0),
          conversions: rows.reduce((s, l) => s + l.conversions, 0)
        },
        currency: (yield* programOf(sql)).currency
      })
    })
  )
})

export const getLink = Effect.fn("AffiliatePortal.links.get")(function*(linkId: string) {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [link] = yield* linkRows(sql, linkId)
      if (link === undefined) return yield* new NotFound({ entity: "affiliate_link", id: linkId })
      return new LinkDetail({
        link,
        weeks: yield* weeksOf(sql, linkId, new Date()),
        currency: (yield* programOf(sql)).currency
      })
    })
  )
})

export const destinations = Effect.fn("AffiliatePortal.links.destinations")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.map(
      sql<{ id: string; title: string; path: string }>`select id, title, path from affiliate_destinations_v`,
      (
        rows
      ) => [
        { id: "home", label: "Homepage", path: "/" },
        ...rows.map((r) => ({ id: r.id, label: r.title, path: r.path }))
      ]
    )
  )
})

/**
 * "Link maken": a link to the store's own page with the campaign's tags, and Insyte's short redirect that counts the
 * click. The page is one of `destinations` (the affiliate never names an address), so the redirect can only ever
 * land on the store.
 */
export const createLink = Effect.fn("AffiliatePortal.links.create")(function*(input: CreateLinkInput) {
  const { affiliateId, principal } = yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [{ n } = { n: 0 }] = yield* sql<{ n: number }>`
        select count(*)::int as n from affiliate_links where archived_at is null`
      if (n >= 200) return yield* new Invalid({ fields: { label: "count" } })
      const [base] = yield* sql<{ base: string | null }>`select affiliate_storefront() as base`
      if (base?.base === null || base?.base === undefined) {
        return yield* new Invalid({ fields: { destinationId: "store" } })
      }
      const [dest] = input.destinationId === "home"
        ? [{ path: "/" }]
        : yield* sql<{ path: string }>`select path from affiliate_destinations_v where id = ${input.destinationId}`
      if (dest === undefined) return yield* new Invalid({ fields: { destinationId: "unknown" } })
      const [me] = yield* sql<{ code: string }>`select code from affiliates where id = app_partner_id()`
      const slug = randomSlug(10)
      const url = new URL(dest.path, base.base)
      url.searchParams.set("utm_source", "insyte")
      url.searchParams.set("utm_medium", input.medium)
      url.searchParams.set("utm_campaign", input.campaign)
      url.searchParams.set("insyte_ref", slug)
      const id = mintId("ref")
      yield* sql`insert into affiliate_links (id, workspace_id, affiliate_id, label, destination_id, destination_path,
                                              medium, campaign_slug, url, short_slug)
                 values (${id}, ${principal.workspaceId}, ${affiliateId}, ${input.label.trim()}, ${input.destinationId},
                         ${dest.path}, ${input.medium}, ${input.campaign}, ${url.toString()}, ${slug})`
      yield* audit(sql, "affiliate.link_created", "affiliate_link", id, { code: me?.code ?? null })
      const undo = yield* Undo.issue(sql, { command: PORTAL_RESTORE, compensation: { kind: "archive", linkId: id } })
      const [link] = yield* linkRows(sql, id)
      return new LinkMade({ link: link!, undo })
    })
  )
})

export const archiveLink = Effect.fn("AffiliatePortal.links.archive")(function*(linkId: string) {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [l] = yield* sql<{ id: string }>`
        update affiliate_links set archived_at = now() where id = ${linkId} and archived_at is null returning id`
      if (l === undefined) return yield* new NotFound({ entity: "affiliate_link", id: linkId })
      yield* audit(sql, "affiliate.link_archived", "affiliate_link", l.id)
      const undo = yield* Undo.issue(sql, {
        command: PORTAL_RESTORE,
        compensation: { kind: "unarchive", linkId: l.id }
      })
      const [link] = yield* linkRows(sql, l.id)
      return new LinkMade({ link: link!, undo })
    })
  )
})

const PortalRestore = Schema.Struct({ kind: Schema.Literals(["archive", "unarchive"]), linkId: Schema.String })

/** The portal's own undo: a link made is archived again, an archived one back. Only for the affiliate itself. */
export const restore = Effect.fn("AffiliatePortal.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "affiliate" || principal.partnerId === null) {
    return yield* new Forbidden({ permission: "affiliate_portal", level: 0, roleLabel: principal.role.label })
  }
  const undo = yield* Schema.decodeUnknownEffect(PortalRestore)(compensation).pipe(Effect.orDie)
  yield* sql`update affiliate_links set archived_at = ${undo.kind === "archive" ? new Date() : null}
             where id = ${undo.linkId} and affiliate_id = ${principal.partnerId}`
  yield* audit(
    sql,
    undo.kind === "archive" ? "affiliate.link_archived" : "affiliate.link_restored",
    "affiliate_link",
    undo.linkId
  )
})

export const listConversions = Effect.fn("AffiliatePortal.conversions.list")(function*(input: ConversionsInput) {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const rows = yield* conversions(
        sql,
        sql.and([
          input.status === undefined ? sql`true` : sql`status = ${input.status}`,
          input.linkId === undefined ? sql`true` : sql`link_id = ${input.linkId}`
        ]),
        input.limit ?? 500
      )
      return new ConversionList({ rows: rows.map(conversionOf), currency: (yield* programOf(sql)).currency })
    })
  )
})

interface PayoutRaw {
  readonly id: string
  readonly month: string
  readonly conversions: number
  readonly grossMinor: string
  readonly reversedMinor: string
  readonly totalMinor: string
  readonly status: "approvable" | "approved" | "paid"
  readonly payDay: string
  readonly paidAt: Date | null
  readonly methodSnapshot: PaymentMethod | null
}

const payoutOf = (p: PayoutRaw): PayoutMonth => ({
  month: p.month,
  conversions: p.conversions,
  grossMinor: Number(p.grossMinor),
  reversedMinor: Number(p.reversedMinor),
  totalMinor: Number(p.totalMinor),
  status: p.status satisfies PayoutStatus,
  payDay: p.payDay,
  paidAt: p.paidAt?.getTime() ?? null
})

const PAYOUT_FIELDS = (sql: SqlClient.SqlClient) =>
  sql`id, month, conversions, gross_minor, reversed_minor, total_minor, status, to_char(pay_day, 'YYYY-MM-DD') as pay_day, paid_at, method_snapshot`

export const listPayouts = Effect.fn("AffiliatePortal.payouts.list")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const program = yield* programOf(sql)
      const me = yield* meOf(sql)
      const months = yield* sql<PayoutRaw>`
        select ${PAYOUT_FIELDS(sql)} from affiliate_payouts order by month desc limit 36`
      const running = monthOf(new Date())
      const [current] = yield* sql<{ approved: string; pending: string }>`
        select coalesce(sum(commission_minor) filter (where status = 'approved'), 0)::bigint as approved,
               coalesce(sum(commission_minor) filter (where status = 'pending'), 0)::bigint as pending
        from affiliate_conversions_v where payout_id is null`
      return new AffiliatePayouts({
        months: months.map(payoutOf),
        current: {
          month: running,
          approvedMinor: Number(current?.approved ?? 0),
          pendingMinor: Number(current?.pending ?? 0)
        },
        paidLifetimeMinor: months.filter((m) => m.status === "paid").reduce((s, m) => s + Number(m.totalMinor), 0),
        payoutDay: program.payoutDay,
        returnDays: program.returnDays,
        currency: program.currency,
        payment: me.paymentMethod === null ? null : { method: me.paymentMethod, hint: me.paymentAccountHint ?? "" }
      })
    })
  )
})

export const getPayout = Effect.fn("AffiliatePortal.payouts.get")(function*(month: string) {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [p] = yield* sql<PayoutRaw>`select ${PAYOUT_FIELDS(sql)} from affiliate_payouts where month = ${month}`
      if (p === undefined) return yield* new NotFound({ entity: "affiliate_payout", id: month })
      const me = yield* meOf(sql)
      const rows = yield* conversions(sql, sql.and([sql`payout_id = ${p.id}`]))
      return new AffiliatePayout({
        payout: payoutOf(p),
        rows: rows.map(conversionOf),
        method: p.methodSnapshot ?? me.paymentMethod,
        taxId: me.paymentTaxId,
        currency: (yield* programOf(sql)).currency
      })
    })
  )
})

export const resources = Effect.fn("AffiliatePortal.resources")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const rows = yield* resourceRows(sql, (id) => `/api/affiliate/resources/${id}`)
      return new AffiliateResources({ resources: rows, faqs: (yield* programOf(sql)).faqs })
    })
  )
})

const notesOf = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const rows = yield* sql<
      { id: string; kind: string; data: Record<string, unknown>; createdAt: Date; readAt: Date | null }
    >`
      select id, kind, data, created_at, read_at from notifications
      where recipient_kind = 'affiliate' and recipient_id = app_partner_id() and archived_at is null
      order by created_at desc limit 100`
    return new AffiliateNotes({
      rows: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        data: r.data,
        createdAt: r.createdAt.getTime(),
        read: r.readAt !== null
      })),
      unread: rows.filter((r) => r.readAt === null).length
    })
  })

export const notifications = Effect.fn("AffiliatePortal.notifications")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner(notesOf)
})

export const readNotifications = Effect.fn("AffiliatePortal.notifications.read")(
  function*(ids?: ReadonlyArray<string>) {
    yield* self
    const db = yield* Db
    return yield* db.scopedPartner((sql) =>
      Effect.gen(function*() {
        yield* sql`update notifications set read_at = now()
                 where recipient_kind = 'affiliate' and recipient_id = app_partner_id() and read_at is null
                   and ${ids === undefined ? sql`true` : sql`id in ${sql.in([...ids, ""])}`}`
        return yield* notesOf(sql)
      })
    )
  }
)

const profileOf = (me: Me) =>
  new AffiliateProfile({
    name: me.name,
    email: me.email,
    code: me.code,
    tier: me.tier,
    rate: Number(me.rate),
    discount: me.discountState
  })

export const profile = Effect.fn("AffiliatePortal.profile")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) => Effect.map(meOf(sql), profileOf))
})

/** Its name only: the code and the tier are the brand's to change (PLAN item 22). */
export const updateProfile = Effect.fn("AffiliatePortal.profile.update")(function*(input: ProfileInput) {
  yield* self
  const name = input.name.trim()
  if (name === "") return yield* new Invalid({ fields: { name: "required" } })
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      yield* sql`update affiliates set name = ${name} where id = app_partner_id()`
      yield* audit(sql, "affiliate.profile_updated", "affiliate", (yield* self).affiliateId)
      return profileOf(yield* meOf(sql))
    })
  )
})

/** What the screens show of an account: the country and the last four of an IBAN, an address's first letter. */
export const maskAccount = (method: PaymentMethod, account: string) => {
  const plain = account.replace(/\s+/g, "")
  if (method === "bank") return `${plain.slice(0, 2).toUpperCase()}•• •••• •••• ${plain.slice(-4)}`
  const [local = "", domain = ""] = plain.split("@")
  return domain === "" ? `•••${plain.slice(-3)}` : `${local.slice(0, 1)}•••@${domain}`
}

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const paymentOf = (me: Me) =>
  new AffiliatePayment({ method: me.paymentMethod, accountHint: me.paymentAccountHint, taxId: me.paymentTaxId })

export const payment = Effect.fn("AffiliatePortal.payment")(function*() {
  yield* self
  const db = yield* Db
  return yield* db.scopedPartner((sql) => Effect.map(meOf(sql), paymentOf))
})

/**
 * "Opslaan" at Uitbetaling: the account sealed before it reaches the database (`Sealer`), only its mask kept in the
 * clear. The audit says that it changed and how, never the account.
 */
export const updatePayment = Effect.fn("AffiliatePortal.payment.update")(function*(input: PaymentInput) {
  const { affiliateId } = yield* self
  const account = input.account.replace(/\s+/g, "")
  const valid = input.method === "bank" ? IBAN.test(account.toUpperCase()) : MAIL.test(account)
  if (!valid) return yield* new Invalid({ fields: { account: "format" } })
  const plain = input.method === "bank" ? account.toUpperCase() : account.toLowerCase()
  const { sealed } = yield* Effect.flatMap(Effect.service(Sealer), (s) => s.seal(plain))
  const hint = maskAccount(input.method, plain)
  const taxId = input.taxId?.trim() || null
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      yield* sql`update affiliates set payment_method = ${input.method}, payment_account_sealed = ${sealed},
                   payment_account_hint = ${hint}, payment_tax_id = ${taxId}, payment_updated_at = now()
                 where id = app_partner_id()`
      yield* audit(sql, "affiliate.payment_updated", "affiliate", affiliateId, { method: input.method })
      return paymentOf(yield* meOf(sql))
    })
  )
})

export { CurrentAffiliate }
