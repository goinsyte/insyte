import { Db } from "@insyte/database/Db"
import { nodesOfTemplate, TEMPLATES_BY_ID } from "@insyte/domain/automations/Templates"
import { Forbidden, Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { throughGate } from "../../stores/domain/Gate.ts"
import { ShopifyGraphql } from "../../stores/domain/Ports.ts"
import { topicOf } from "../../tickets/domain/Rules.ts"
import { findingOf, WINDOW_DAYS } from "../domain/Finding.ts"
import {
  type AgreeOfflineInput,
  AnalysisNotReady,
  type CountryDelivery,
  type DeliveryPromise,
  type Finding,
  FirstAnalysisView,
  type MailFacts,
  OfflineAgreed,
  type OfflinePlan,
  type PrepareInput,
  type Read,
  SetupFacts
} from "../domain/FirstAnalysis.ts"
import { hoursFor, offlineLevelsOf } from "../domain/Offline.ts"
import { Analyses } from "../domain/Ports.ts"
import {
  deliverySheet,
  historyOf,
  predictionsOf,
  promisesIn,
  READS,
  readsFor,
  titlesOf,
  updateDay,
  watchOf
} from "../domain/Rules.ts"
import { Makers } from "../Links.ts"

/*
 * The first analysis (M6.5, M15 step 5). `start` makes the store's one analysis (after its first import) and starts the
 * Workflow that reads it; starting again only makes sure that Workflow runs. The Workflow's steps read the mirror
 * (orders, parcels per country), the inbox when there is one, the product pages, then Shopify (countries and
 * policies), then work out the finding or the early read; every step ticks its read off. A Shopify read that fails (a
 * missing scope, a store without credentials) is said as unreadable, never guessed. `prepare` keeps the operator's
 * answers and makes what they chose through the slices that own it: the automation as a draft, never published, and
 * the sheet; the customer agent waits for M15.8. `agreeOffline` writes the offline plan into the autonomy policy as
 * one undoable version and keeps the hours for the customer agent.
 */

/** What every Workflow step needs, read once at the start. */
export interface AnalysisContext {
  readonly analysisId: string
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
}

interface Made {
  readonly automationId?: string | null
  readonly sheetId?: string | null
}

interface Row {
  readonly id: string
  readonly storeId: string
  readonly state: "reading" | "early" | "found" | "failed"
  readonly reads: ReadonlyArray<Read>
  readonly setup: unknown
  readonly finding: Finding | null
  readonly predictions: FirstAnalysisView["predictions"]
  readonly watch: FirstAnalysisView["watch"]
  readonly titles: Partial<FirstAnalysisView["prepared"]>
  readonly answers: Record<string, string> | null
  readonly prepared: ReadonlyArray<"automation" | "agent" | "sheet">
  readonly preparedAt: Date | null
  readonly made: Made
  readonly offline: OfflinePlan | null
}

const decodeFacts = Schema.decodeUnknownOption(SetupFacts)

/** The workspace's imported store, the one the analysis reads. */
const storeOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ id: string }>`select id from stores where status <> 'disconnected' and last_synced_at is not null
                        order by created_at desc limit 1`,
    (rows) => rows[0]?.id
  )

const mirrorCounts = (sql: SqlClient.SqlClient, storeId: string) =>
  Effect.map(
    sql<{ products: number; customers: number; orders: number; days: number }>`
      select (select count(*) from products where store_id = ${storeId})::int as products,
             (select count(*) from customers where store_id = ${storeId})::int as customers,
             (select count(*) from orders where store_id = ${storeId})::int as orders,
             coalesce((select floor(extract(epoch from now() - min(placed_at)) / 86400) from orders
                       where store_id = ${storeId}), 0)::int as days`,
    (rows) => rows[0] ?? { products: 0, customers: 0, orders: 0, days: 0 }
  )

const NO_FACTS: SetupFacts = {
  shipsTo: null,
  policies: null,
  promises: [],
  gateways: [],
  orders: 0,
  products: 0,
  customers: 0,
  days: 0,
  delivered: 0,
  refundReasons: 0
}

const NO_TITLES = titlesOf(NO_FACTS)

const factsOf = (setup: unknown): SetupFacts => Option.getOrElse(decodeFacts(setup), () => NO_FACTS)

const regions = (() => {
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" })
  } catch {
    return undefined
  }
})()

/** A country code in Dutch ("US" → "Verenigde Staten"); the code itself where the runtime does not know it. */
export const countryName = (code: string): string => {
  try {
    return regions?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

const viewOf = (
  row: Row | undefined,
  store: { products: number; customers: number; orders: number; days: number }
) => {
  const mail = row === undefined ? undefined : factsOf(row.setup).mail
  return new FirstAnalysisView({
    state: row?.state ?? "none",
    store: { ...store, mails: mail?.mails ?? 0 },
    history: historyOf(store),
    reads: row?.reads ?? READS,
    finding: row?.state === "found" ? row.finding : null,
    predictions: row?.predictions ?? [],
    watch: row?.watch ?? [],
    prepared: { ...NO_TITLES, ...row?.titles },
    chosen: row?.preparedAt === null || row?.preparedAt === undefined
      ? null
      : { ids: row.prepared, answers: row.answers ?? {} },
    made: { automationId: row?.made.automationId ?? null, sheetId: row?.made.sheetId ?? null },
    offline: row?.offline ?? null
  })
}

const SELECT = `fa.id, fa.store_id, fa.state, fa.reads, fa.setup, fa.finding, fa.predictions, fa.watch, fa.titles,
  fa.answers, fa.prepared, fa.prepared_at, fa.made, fa.offline`

/** The step's view: the workspace's analysis as it stands, or `none` before it began. */
export const get = Effect.fn("FirstAnalysis.get")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const storeId = yield* storeOf(sql)
      if (storeId === undefined) return viewOf(undefined, { products: 0, customers: 0, orders: 0, days: 0 })
      const [row] = yield* sql<Row>`select ${sql.literal(SELECT)} from first_analyses fa where fa.store_id = ${storeId}`
      return viewOf(row, yield* mirrorCounts(sql, storeId))
    })
  )
})

/** Makes the store's analysis if it has none, and makes sure its reading runs; answers the view. */
export const start = Effect.fn("FirstAnalysis.start")(function*() {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const reading = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const storeId = yield* storeOf(sql)
      if (storeId === undefined) return undefined
      // The inbox is read when the team's mail is in Insyte; without a mailbox the reading leaves it out.
      const [box] = yield* sql<{ any: boolean }>`
        select exists (select 1 from mailboxes where status = 'connected') as any`
      yield* sql`insert into first_analyses (id, workspace_id, store_id, reads)
                 values (${mintId("fan")}, app_workspace_id(), ${storeId},
                         ${JSON.stringify(readsFor(box?.any === true))}::jsonb)
                 on conflict (store_id) do nothing`
      const [row] = yield* sql<{ id: string; state: string }>`
        select id, state from first_analyses where store_id = ${storeId}`
      return row?.state === "reading" ? { id: row.id, storeId } : undefined
    })
  )
  // Named by the analysis: asking twice finds the one already reading.
  if (reading !== undefined) {
    const analyses = yield* Analyses
    yield* analyses.start({ key: reading.id, workspaceId: principal.workspaceId, storeId: reading.storeId })
  }
  return yield* get()
})

/** The analysis to act on, locked, once its reading is over; none while it still reads (or there is none). */
const settled = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const storeId = yield* storeOf(sql)
    if (storeId === undefined) return undefined
    const [row] = yield* sql<Row>`
      select ${sql.literal(SELECT)} from first_analyses fa
      where fa.store_id = ${storeId} and fa.state <> 'reading' for update`
    return row
  })

/** What the first analysis writes on the draft it prepares: read before it is switched on. */
const DRAFT_NOTE = "Klaargezet door de eerste analyse. Zet hem aan wanneer je de mail hebt gelezen."

/** The library's delivery update, sent on the store's own day. */
const deliveryUpdate = (day: number) => {
  const template = TEMPLATES_BY_ID["tpl_eta_update"]!
  return nodesOfTemplate(template, () => mintId("node")).map((n) =>
    n.variantId === "trigger.schedule"
      ? {
        ...n,
        config: { ...n.config, days: day, summary: `Elke dag om 9:00: bestellingen die ${day} dagen onderweg zijn` }
      }
      : n
  )
}

/** A refusal the person's role gives: the item waits as pending. Anything else the slice refuses is a defect here. */
const orPending = <E extends { readonly _tag: string }, R>(made: Effect.Effect<string, E, R>) =>
  made.pipe(
    Effect.map((id): string | null => id),
    Effect.catch((e) => (e instanceof Forbidden ? Effect.succeed(null) : Effect.die(e)))
  )

/**
 * "Klaarzetten": the operator's answers and the items to have ready, each made through its own slice as the person: the
 * delivery update as a draft automation (never published or switched on here), the "Levertijd per land" sheet with
 * the store's own counts. Made once: preparing again keeps what was made. An item the person's role may not make, and
 * the customer agent (M15.8), wait as chosen. Refused while the analysis still reads.
 */
export const prepare = Effect.fn("FirstAnalysis.prepare")(function*(input: PrepareInput) {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const makers = yield* Makers
  const db = yield* Db
  const saved = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* settled(sql)
      if (row === undefined) return false
      const facts = factsOf(row.setup)
      const titles = { ...NO_TITLES, ...row.titles }
      let automationId = row.made.automationId ?? null
      let sheetId = row.made.sheetId ?? null
      if (input.ids.includes("automation") && automationId === null) {
        automationId = yield* orPending(makers.automation({
          name: titles.automation.title,
          description: DRAFT_NOTE,
          nodes: deliveryUpdate(updateDay(facts))
        }))
      }
      if (input.ids.includes("sheet") && sheetId === null) {
        sheetId = yield* orPending(makers.sheet({
          title: titles.sheet.title,
          tabs: [deliverySheet(facts, countryName, mintId("tab"))]
        }))
      }
      const made = { automationId, sheetId }
      yield* sql`
        update first_analyses
        set answers = ${JSON.stringify(input.answers)}::jsonb, prepared = ${[...input.ids]}::text[],
            prepared_at = now(), made = ${JSON.stringify(made)}::jsonb
        where id = ${row.id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "first_analysis.prepared",
        subjectType: "first_analysis",
        subjectId: row.id,
        diff: { ids: input.ids, made }
      })
      return true
    })
  )
  if (!saved) return yield* new AnalysisNotReady()
  return yield* get()
})

/**
 * "Afronden" on the offline step: the levels into the autonomy policy as one new version (audited, with its undo, as
 * any save on Zelfstandigheid), and the plan kept with the hours its window implies for the customer agent. Only the
 * step's own actions, forwarding only when someone else ships, and a locked action never at Zelf doen
 * (`AutonomyLocked`). Needs the `ai.autonomy` special.
 */
export const agreeOffline = Effect.fn("FirstAnalysis.agreeOffline")(function*(input: AgreeOfflineInput) {
  yield* Policy.requireAction("ai.autonomy")
  const principal = yield* CurrentPrincipal
  const makers = yield* Makers
  const db = yield* Db
  const undo = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* settled(sql)
      if (row === undefined) return yield* new AnalysisNotReady()
      const { levels, unknown } = offlineLevelsOf(input.levels, row.answers)
      if (unknown.length > 0) {
        return yield* new Invalid({ fields: Object.fromEntries(unknown.map((id) => [`levels.${id}`, "unknown"])) })
      }
      const saved = yield* makers.autonomy(sql, levels)
      const plan: OfflinePlan = {
        window: input.window,
        levels,
        hours: hoursFor(input.window),
        version: saved.version,
        at: Date.now()
      }
      yield* sql`update first_analyses set offline = ${JSON.stringify(plan)}::jsonb, offline_at = now()
                 where id = ${row.id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "first_analysis.offline_agreed",
        subjectType: "first_analysis",
        subjectId: row.id,
        diff: { window: input.window, levels, version: saved.version }
      })
      return saved.undo
    })
  )
  return new OfflineAgreed({ analysis: yield* get(), undo })
})

/* ─── the Workflow's steps ─────────────────────────────────────────────── */

/** The analysis and its store, or `null` when either is gone (disconnected since): nothing to read. */
export const begin = Effect.fn("FirstAnalysis.begin")(function*(analysisId: string) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ storeId: string; connectionId: string; shop: string }>`
      select fa.store_id, s.connection_id, s.shop_domain as shop from first_analyses fa
      join stores s on s.id = fa.store_id where fa.id = ${analysisId} and s.status <> 'disconnected'`
  )
  return row === undefined ? null : ({ analysisId, ...row } satisfies AnalysisContext as AnalysisContext | null)
})

/** Merges facts into the setup and ticks a read off, in one statement. */
const record = Effect.fn("FirstAnalysis.record")(
  function*(ctx: AnalysisContext, read: Read["id"], facts: Record<string, unknown>) {
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update first_analyses
          set setup = coalesce(setup, '{}'::jsonb) || ${JSON.stringify(facts)}::jsonb,
              reads = (select jsonb_agg(case when r->>'id' = ${read} then r || '{"done":true}'::jsonb else r end)
                       from jsonb_array_elements(reads) r)
          where id = ${ctx.analysisId}`
    )
  }
)

/** Orders and parcels: how much history there is, how it was paid, what was delivered and refunded with a reason. */
export const readOrders = Effect.fn("FirstAnalysis.readOrders")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  const facts = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const counts = yield* mirrorCounts(sql, ctx.storeId)
      const [more] = yield* sql<{ delivered: number; refundReasons: number; gateways: Array<string> | null }>`
        select (select count(*) from fulfilments f join orders o on o.id = f.order_id
                where o.store_id = ${ctx.storeId} and f.delivered_at is not null)::int as delivered,
               (select count(*) from refunds r join orders o on o.id = r.order_id
                where o.store_id = ${ctx.storeId} and coalesce(r.note, '') <> '')::int as refund_reasons,
               (select array_agg(distinct payment_gateway) from orders
                where store_id = ${ctx.storeId} and payment_gateway is not null) as gateways`
      // Parcels delivered over the window, per country: how many, and the median days from order to delivery.
      const countries = yield* sql<CountryDelivery>`
        select o.shipping_address->>'country' as country, count(*)::int as delivered,
               round((percentile_cont(0.5) within group (
                 order by extract(epoch from f.delivered_at - o.placed_at) / 86400))::numeric, 1)::float8 as days
        from fulfilments f join orders o on o.id = f.order_id
        where o.store_id = ${ctx.storeId} and f.delivered_at is not null and o.placed_at is not null
          and f.delivered_at > now() - make_interval(days => ${WINDOW_DAYS})
          and coalesce(o.shipping_address->>'country', '') <> ''
        group by 1`
      return {
        ...counts,
        delivered: more?.delivered ?? 0,
        refundReasons: more?.refundReasons ?? 0,
        gateways: more?.gateways ?? [],
        countries: countries.map((c) => ({ country: c.country, delivered: c.delivered, days: Number(c.days) }))
      }
    })
  )
  yield* record(ctx, "orders", facts)
})

/** The most conversations the reading classifies: the newest, which is a quarter for nearly every store. */
const MAIL_CAP = 5000
/** How much of a mail's text the rules read: the question is near the top. */
const MAIL_TEXT = 2000

/**
 * The inbox over the window (M15 step 5): every customer conversation with a mail in, its first mail classified by
 * the tickets' topic rules, and each one about where an order is tied to its sender's latest order of this store
 * placed before it, so Insyte can say whether it came before the parcel was there. Only counts are kept; no mail's
 * words leave this step. A reading without the inbox (no mailbox at its start) records nothing here.
 */
export const readMail = Effect.fn("FirstAnalysis.readMail")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  const reads = yield* db.scopedFor((sql) =>
    Effect.map(
      sql<{ reads: ReadonlyArray<Read> }>`select reads from first_analyses where id = ${ctx.analysisId}`,
      ([row]) => row?.reads ?? []
    )
  )
  if (!reads.some((r) => r.id === "mail")) return
  const mail = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const firsts = yield* sql<{ email: string; at: Date; subject: string; text: string }>`
        select lower(m.from_address) as email, m.sent_at as at, m.subject, left(m.body_text, ${MAIL_TEXT}) as text
        from email_threads t
        join lateral (select from_address, sent_at, subject, body_text from email_messages
                      where thread_id = t.id and direction = 'inbound' order by sent_at limit 1) m on true
        where t.deleted_at is null and t.spam_at is null
          and m.sent_at > now() - make_interval(days => ${WINDOW_DAYS})
        order by m.sent_at desc
        limit ${MAIL_CAP}`
      const status = firsts.filter((m) => topicOf(m.subject, m.text) === "where_is_my_order")
      const [tied] = yield* sql<{ linked: number; early: number; dayLow: number | null; dayHigh: number | null }>`
        with asked as (
          select x.email, x.at, o.placed_at, f.delivered_at
          from unnest(${status.map((m) => m.email)}::text[], ${status.map((m) => m.at.toISOString())}::timestamptz[])
            as x(email, at)
          left join lateral (select id, placed_at from orders
                             where store_id = ${ctx.storeId} and lower(customer_email) = x.email
                               and placed_at <= x.at
                             order by placed_at desc limit 1) o on true
          left join lateral (select min(delivered_at) as delivered_at from fulfilments where order_id = o.id) f on true
        ), early as (
          select floor(extract(epoch from at - placed_at) / 86400)::int as day from asked
          where placed_at is not null and (delivered_at is null or delivered_at > at)
        )
        select (select count(*) from asked where placed_at is not null)::int as linked,
               (select count(*) from early)::int as early,
               (select percentile_disc(0.25) within group (order by day) from early) as day_low,
               (select percentile_disc(0.75) within group (order by day) from early) as day_high`
      return {
        window: WINDOW_DAYS,
        mails: firsts.length,
        status: status.length,
        linked: tied?.linked ?? 0,
        early: tied?.early ?? 0,
        dayLow: tied?.dayLow ?? 0,
        dayHigh: tied?.dayHigh ?? 0
      } satisfies MailFacts
    })
  )
  yield* record(ctx, "mail", { mail })
})

/** How many product pages Insyte reads for the delivery times they promise: the most recently changed. */
const PAGES = 500

/** Product pages: the delivery times they promise. */
export const readProducts = Effect.fn("FirstAnalysis.readProducts")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  const pages = yield* db.scopedFor((sql) =>
    sql<{ descriptionHtml: string }>`
      select description_html from products where store_id = ${ctx.storeId} and status = 'active'
      order by external_updated_at desc limit ${PAGES}`
  )
  const promises: Array<DeliveryPromise> = pages.flatMap((p) => promisesIn(p.descriptionHtml, "product"))
  yield* record(ctx, "products", { promises })
})

const SHIPS_TO = "query { shop { shipsToCountries } }"
const POLICIES = "query { shop { shopPolicies { type body } } }"

/** One shop read through the store's gate; `null` when Shopify, the token or the scope says no. */
const shopRead = <A>(ctx: AnalysisContext, query: string, pick: (data: unknown) => A) =>
  Effect.gen(function*() {
    const graphql = yield* ShopifyGraphql
    const answer = yield* throughGate(ctx, 1, (token) => graphql.query(ctx.shop, token, query, {}))
    return pick(answer.data)
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.as(Effect.logInfo("first analysis: a shop read was refused", { query, cause }), null)
    )
  )

const ShopData = Schema.Struct({
  shop: Schema.Struct({
    shipsToCountries: Schema.optional(Schema.Array(Schema.String)),
    shopPolicies: Schema.optional(Schema.Array(Schema.Struct({ type: Schema.String, body: Schema.String })))
  })
})
const decodeShop = Schema.decodeUnknownSync(ShopData)

/** Shopify: the countries the store ships to, and its shipping and refund policies (with what the first promises). */
export const readPolicies = Effect.fn("FirstAnalysis.readPolicies")(function*(ctx: AnalysisContext) {
  const shipsTo = yield* shopRead(ctx, SHIPS_TO, (data) => decodeShop(data).shop.shipsToCountries ?? null)
  const policies = yield* shopRead(ctx, POLICIES, (data) => {
    const all = decodeShop(data).shop.shopPolicies ?? []
    const body = (type: string) => all.find((p) => p.type === type)?.body ?? null
    return { shipping: body("SHIPPING_POLICY"), refund: body("REFUND_POLICY") }
  })
  const db = yield* Db
  const [current] = yield* db.scopedFor((sql) =>
    sql<{ promises: Array<DeliveryPromise> | null }>`
      select setup->'promises' as promises from first_analyses where id = ${ctx.analysisId}`
  )
  const fromPolicy = policies?.shipping === null || policies === null ? [] : promisesIn(policies.shipping, "policy")
  yield* record(ctx, "policies", { shipsTo, policies, promises: [...(current?.promises ?? []), ...fromPolicy] })
})

/** Works the finding (or, without one, the early read) out of the facts read, and says the analysis is done. */
export const finish = Effect.fn("FirstAnalysis.finish")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ setup: unknown }>`select setup from first_analyses where id = ${ctx.analysisId}`
      const facts = decodeFacts(row?.setup)
      if (facts._tag === "None") return yield* Effect.die(new Error("first analysis: the setup facts are incomplete"))
      const finding = findingOf(facts.value, countryName)
      yield* sql`update first_analyses
                 set state = ${finding === null ? "early" : "found"}, finished_at = now(),
                     finding = ${finding === null ? null : JSON.stringify(finding)}::jsonb,
                     predictions = ${JSON.stringify(finding === null ? predictionsOf(facts.value) : [])}::jsonb,
                     watch = ${JSON.stringify(finding === null ? watchOf(facts.value) : [])}::jsonb,
                     titles = ${JSON.stringify(titlesOf(facts.value))}::jsonb
                 where id = ${ctx.analysisId}`
    })
  )
})

/** The reading gave up (its retries are spent): the step says so instead of reading forever. */
export const fail = Effect.fn("FirstAnalysis.fail")(function*(analysisId: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update first_analyses set state = 'failed', finished_at = now() where id = ${analysisId} and state = 'reading'`
  )
})
