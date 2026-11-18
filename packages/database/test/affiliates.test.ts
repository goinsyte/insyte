import { PgClient } from "@effect/sql-pg"
import { mintId, UserId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect, Layer, Redacted, Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"
import { TENANT_TABLES } from "../src/Tenancy.ts"

/*
 * The affiliate projection (M16 steps 3–5, 0108): one workspace, two affiliates, each with a link, a conversion and its
 * ledger. An affiliate reads its own rows and nothing else: not the other affiliate's, never the orders, the customers
 * or the team; its conversions only through `affiliate_conversions_v`, which names no shopper. The ledger is
 * append-only for the app. As `insyte_app`, which owns nothing and bypasses nothing.
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"
const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) })))))
  )

const runId = Date.now().toString(36)
const ws = Schema.decodeSync(WorkspaceId)(mintId("ws"))
const user = () => Schema.decodeSync(UserId)(mintId("usr"))
const ids = {
  owner: user(),
  userA: user(),
  userB: user(),
  member: mintId("mem"),
  store: mintId("sto"),
  affA: mintId("aff"),
  affB: mintId("aff"),
  linkA: mintId("alk"),
  linkB: mintId("alk"),
  orderA: mintId("ord"),
  orderB: mintId("ord"),
  convA: mintId("acv"),
  convB: mintId("acv"),
  slugA: `a${runId}`.padEnd(10, "0").slice(0, 12),
  slugB: `b${runId}`.padEnd(10, "0").slice(0, 12)
}

const LEVELS = {} as Principal["role"]["levels"]
const SPECIALS = {} as Principal["role"]["specials"]
const affiliateOf = (id: string, userId: UserId): Principal => ({
  kind: "affiliate",
  id,
  userId,
  workspaceId: ws,
  partnerId: id,
  role: {
    id: "affiliate",
    label: "Affiliate",
    version: 0,
    levels: LEVELS,
    specials: SPECIALS,
    refundLimit: null,
    stores: []
  },
  storeScope: []
})
const asA = Effect.provideService(CurrentPrincipal, affiliateOf(ids.affA, ids.userA))
const asB = Effect.provideService(CurrentPrincipal, affiliateOf(ids.affB, ids.userB))
const email = (u: string) => `aff-${runId}-${u}@example.com`.toLowerCase()

const fixture = Effect.gen(function*() {
  const db = yield* Db
  yield* db.routing((sql) =>
    Effect.forEach(
      [ids.owner, ids.userA, ids.userB],
      (id) =>
        sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
            values (${id}, ${id}, ${email(id)}, true, now(), now())`
    )
  )
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`insert into workspaces (id, name, slug) values (${ws}, 'Merk', ${`af-${runId}`})`
      yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('owner', ${ws}, 'Eigenaar', 'system', '{}')`
      yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${ids.member}, ${ws}, ${ids.owner}, 'owner')`
      const conn = mintId("con")
      yield* sql`insert into connections (id, workspace_id, provider, account_ref) values (${conn}, ${ws}, 'shopify', ${`af-${runId}`})`
      yield* sql`insert into stores (id, workspace_id, connection_id, shop_domain, name)
                 values (${ids.store}, ${ws}, ${conn}, ${`af-${runId}.myshopify.com`}, 'Winkel')`
      yield* sql`insert into affiliate_programs (workspace_id, apply_slug, currency) values (${ws}, ${`prog${runId}`}, 'EUR')`
      for (const [aff, u, code] of [[ids.affA, ids.userA, "ANNA"], [ids.affB, ids.userB, "BRAM"]] as const) {
        yield* sql`insert into affiliates (id, workspace_id, user_id, name, email, code, tier, rate, payment_method,
                                           payment_account_sealed, payment_account_hint)
                   values (${aff}, ${ws}, ${u}, ${code}, ${email(u)}, ${code}, 'bronze', 10, 'bank',
                           '\\x00'::bytea, '•••• 1234')`
        yield* sql`insert into affiliate_codes (workspace_id, code, affiliate_id) values (${ws}, ${code}, ${aff})`
      }
      for (const [link, aff, slug] of [[ids.linkA, ids.affA, ids.slugA], [ids.linkB, ids.affB, ids.slugB]] as const) {
        yield* sql`insert into affiliate_links (id, workspace_id, affiliate_id, label, destination_id, destination_path,
                                                medium, campaign_slug, url, short_slug)
                   values (${link}, ${ws}, ${aff}, 'Instagram', 'home', '/', 'social', 'zomer', 'https://x.test/', ${slug})`
      }
      for (
        const [order, conv, aff, link] of [[ids.orderA, ids.convA, ids.affA, ids.linkA], [
          ids.orderB,
          ids.convB,
          ids.affB,
          ids.linkB
        ]] as const
      ) {
        yield* sql`insert into orders (id, workspace_id, store_id, shopify_id, number, customer_email, customer_name,
                                       status, payment_status, fulfillment_status, total_minor, subtotal_minor,
                                       shipping_minor, tax_minor, discounts_minor, currency, placed_at, external_updated_at)
                   values (${order}, ${ws}, ${ids.store}, ${order}, ${`#${order.slice(-4)}`}, 'klant@example.com',
                           'Klant Naam', 'paid', 'paid', 'unfulfilled', 5000, 5000, 0, 0, 0, 'EUR', now(), now())`
        yield* sql`insert into affiliate_conversions (id, workspace_id, affiliate_id, link_id, order_id, store_id,
                                                      order_number, attributed_by, base_minor, commission_minor, rate,
                                                      currency, placed_at, month)
                   values (${conv}, ${ws}, ${aff}, ${link}, ${order}, ${ids.store}, ${`#${order.slice(-4)}`}, 'link',
                           5000, 500, 10, 'EUR', now(), to_char(now(), 'YYYY-MM'))`
        yield* sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, conversion_id, kind, amount_minor,
                                                         currency, month)
                   values (${mintId("ale")}, ${ws}, ${aff}, ${conv}, 'accrual', 500, 'EUR', to_char(now(), 'YYYY-MM'))`
      }
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))
})

/** What an affiliate may read of a table at all, beside its own projection (0108). */
const PROJECTED = new Set([
  "affiliate_programs",
  "affiliate_tiers",
  "affiliate_applications",
  "affiliates",
  "affiliate_codes",
  "affiliate_links",
  "affiliate_ledger_entries",
  "affiliate_payouts",
  "affiliate_resources",
  "notifications",
  "audit_events",
  "outbox",
  "undo_tokens"
])

/** The brand's owner, reaching every store. */
const memberOf = (): Principal => ({
  ...affiliateOf(ids.member, ids.owner),
  kind: "member",
  partnerId: null,
  role: { ...affiliateOf(ids.member, ids.owner).role, id: "owner", stores: "all" },
  storeScope: null
})
const asMember = <A, E>(f: (sql: Parameters<Parameters<Db["Service"]["scoped"]>[0]>[0]) => Effect.Effect<A, E>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scoped(f)).pipe(Effect.provideService(CurrentPrincipal, memberOf()))
const asSystem = <A, E>(f: (sql: Parameters<Parameters<Db["Service"]["scopedFor"]>[0]>[0]) => Effect.Effect<A, E>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(f)).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))

const partner = <A, E>(f: (sql: Parameters<Parameters<Db["Service"]["scopedPartner"]>[0]>[0]) => Effect.Effect<A, E>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedPartner(f))

describe("affiliates", () => {
  beforeAll(async () => {
    await run(fixture)
  })

  it("shows affiliate A only its own rows, and B only B's", async () => {
    for (
      const [as, own, link, conv] of [[asA, ids.affA, ids.linkA, ids.convA], [
        asB,
        ids.affB,
        ids.linkB,
        ids.convB
      ]] as const
    ) {
      const seen = await run(
        partner((sql) =>
          Effect.all({
            affiliates: sql<{ id: string }>`select id from affiliates`,
            links: sql<{ id: string }>`select id from affiliate_links`,
            codes: sql<{ affiliateId: string }>`select affiliate_id as "affiliateId" from affiliate_codes`,
            ledger: sql<{ affiliateId: string }>`select affiliate_id as "affiliateId" from affiliate_ledger_entries`,
            conversions: sql<{ id: string }>`select id from affiliate_conversions_v`
          })
        ).pipe(as)
      )
      expect(seen.affiliates.map((r) => r.id)).toEqual([own])
      expect(seen.links.map((r) => r.id)).toEqual([link])
      expect(seen.codes.map((r) => r.affiliateId)).toEqual([own])
      expect(seen.ledger.map((r) => r.affiliateId)).toEqual([own])
      expect(seen.conversions.map((r) => r.id)).toEqual([conv])
    }
  })

  it("names no shopper in the affiliate's conversions, and closes the orders and the conversions table itself", async () => {
    const seen = await run(
      partner((sql) =>
        Effect.all({
          columns: sql<{ column: string }>`
          select column_name as column from information_schema.columns where table_name = 'affiliate_conversions_v'`,
          orders: sql<{ n: number }>`select count(*)::int as n from orders`,
          customers: sql<{ n: number }>`select count(*)::int as n from customers`,
          conversions: sql<{ n: number }>`select count(*)::int as n from affiliate_conversions`,
          clicks: sql<{ n: number }>`select count(*)::int as n from affiliate_clicks`
        })
      ).pipe(asA)
    )
    const columns = seen.columns.map((c) => c.column)
    for (const pii of ["customer_email", "customer_name", "email", "name", "order_id", "shipping_address"]) {
      expect(columns).not.toContain(pii)
    }
    expect([seen.orders, seen.customers, seen.conversions, seen.clicks].map((r) => r[0]!.n)).toEqual([0, 0, 0, 0])
  })

  it("shuts an affiliate out of every tenant table outside its projection", async () => {
    const seen = await run(
      partner((sql) =>
        Effect.forEach(
          TENANT_TABLES.filter((t) => !PROJECTED.has(t)),
          (table) =>
            Effect.map(
              sql<{ n: string }>`select count(*)::text as n from ${sql(table)}`,
              ([row]) => [table, Number(row!.n)] as const
            )
        )
      ).pipe(asA)
    )
    expect(seen.filter(([, n]) => n > 0)).toEqual([])
  })

  it("lets an affiliate rename itself but not change its code, tier, rate or the brand's discount state", async () => {
    const renamed = await run(
      partner((sql) =>
        sql<{ id: string }>`update affiliates set name = 'Anna de Vries' where id = ${ids.affA} returning id`
      ).pipe(asA)
    )
    expect(renamed.map((r) => r.id)).toEqual([ids.affA])
    for (const change of ["code = 'GRATIS'", "tier = 'gold'", "rate = 50", "status = 'active', user_id = 'x'"]) {
      const outcome = await run(
        partner((sql) => sql.unsafe(`update affiliates set ${change} where id = '${ids.affA}'`)).pipe(asA, Effect.exit)
      )
      expect([change, outcome._tag]).toEqual([change, "Failure"])
    }
    // B's row is not A's to touch.
    const other = await run(
      partner((sql) => sql<{ id: string }>`update affiliates set name = 'x' where id = ${ids.affB} returning id`).pipe(
        asA
      )
    )
    expect(other).toEqual([])
  })

  it("refuses an affiliate a code of its own making, or a change to one", async () => {
    const insert = await run(
      partner((sql) =>
        sql`insert into affiliate_codes (workspace_id, code, affiliate_id) values (${ws}, 'GRATIS100', ${ids.affA})`
      ).pipe(asA, Effect.exit)
    )
    expect(insert._tag).toBe("Failure")
    const changed = await run(
      partner((sql) =>
        sql<{ code: string }>`update affiliate_codes set valid_until = now() + interval '1 year' returning code`
      ).pipe(asA, Effect.exit)
    )
    expect(changed._tag === "Failure" || (changed._tag === "Success" && changed.value.length === 0)).toBe(true)
  })

  it("keeps the ledger append-only, for the brand as for the affiliate", async () => {
    const member: Principal = {
      ...affiliateOf(ids.member, ids.owner),
      kind: "member",
      partnerId: null,
      role: { ...affiliateOf(ids.member, ids.owner).role, id: "owner", stores: "all" },
      storeScope: null
    }
    for (
      const statement of [
        "update affiliate_ledger_entries set amount_minor = 1",
        "delete from affiliate_ledger_entries"
      ]
    ) {
      const outcome = await run(
        Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => sql.unsafe(statement))).pipe(
          Effect.provideService(CurrentPrincipal, member),
          Effect.exit
        )
      )
      expect(outcome._tag).toBe("Failure")
    }
  })

  it("lists a person only their own affiliates before any workspace is chosen", async () => {
    const rows = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.forUser((sql) =>
            sql<{ affiliateId: string }>`select affiliate_id as "affiliateId" from affiliate_principals()`
          )
      ).pipe(
        Effect.provideService(
          CurrentUser,
          { id: ids.userA, email: email(ids.userA), name: "A", emailVerified: true } as never
        )
      )
    )
    expect(rows.map((r) => r.affiliateId)).toEqual([ids.affA])
  })

  it("counts a click on a known slug only, and sends it to the store's own address", async () => {
    const [known] = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.routing((sql) =>
            sql<{ baseUrl: string; path: string; slug: string }>`
          select base_url as "baseUrl", path, slug from affiliate_click(${ids.slugA}, ${
              mintId("acl")
            }, null, null, 'NL')`
          )
      )
    )
    expect(known).toEqual({ baseUrl: `https://af-${runId}.myshopify.com`, path: "/", slug: ids.slugA })
    const unknown = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.routing((sql) => sql`select * from affiliate_click('zzzzzzzzzz', ${mintId("acl")}, null, null, null)`)
      )
    )
    expect(unknown).toEqual([])
    const clicks = await run(partner((sql) => sql<{ clicks: number }>`select clicks from affiliate_clicks_v`).pipe(asA))
    expect(clicks.map((c) => c.clicks)).toEqual([1])
    const none = await run(partner((sql) => sql<{ clicks: number }>`select clicks from affiliate_clicks_v`).pipe(asB))
    expect(none).toEqual([])
  })

  it("takes from an affiliate only the realtime frames of its own profile and links, nothing that names another", async () => {
    const write = (payload: Record<string, unknown>, event = "records.changed") =>
      run(
        partner((sql) =>
          sql`insert into outbox (id, workspace_id, event, payload)
              values (${mintId("obx")}, ${ws}, ${event}, ${JSON.stringify(payload)}::jsonb)`
        ).pipe(asA, Effect.exit)
      )
    const allowed = [
      { workspaceId: ws, kind: "affiliate", ids: [ids.affA] },
      { workspaceId: ws, kind: "affiliate_link", ids: [ids.linkA] }
    ]
    for (const payload of allowed) expect([payload, (await write(payload))._tag]).toEqual([payload, "Success"])
    const refused: Array<[string, Record<string, unknown>]> = [
      // The reviewer's: its own id under one key, another's under the key the relay reads.
      ["affiliate.discount_requested", { workspaceId: ws, affiliateId: ids.affA, affiliateIds: [ids.affB] }],
      ["affiliate.discount_requested", { workspaceId: ws, affiliateIds: [ids.affA] }],
      ["records.changed", { workspaceId: ws, kind: "affiliate", ids: [ids.affB] }],
      ["records.changed", { workspaceId: ws, kind: "affiliate", ids: [ids.affA, ids.affB] }],
      ["records.changed", { workspaceId: ws, kind: "affiliate_link", ids: [ids.linkB] }],
      ["records.changed", { workspaceId: ws, kind: "affiliate_payout", ids: [ids.affA] }],
      ["records.changed", { workspaceId: ws, kind: "affiliate", ids: [ids.affA], affiliateIds: [ids.affB] }],
      ["records.changed", { workspaceId: "ws_other", kind: "affiliate", ids: [ids.affA] }]
    ]
    for (const [event, payload] of refused) {
      expect([event, payload, (await write(payload, event))._tag]).toEqual([event, payload, "Failure"])
    }
  })

  it("lets an affiliate only cancel a frame of its own, never turn it into another", async () => {
    const id = mintId("obx")
    await run(
      partner((sql) =>
        sql`insert into outbox (id, workspace_id, event, payload) values (${id}, ${ws}, 'records.changed',
              ${JSON.stringify({ workspaceId: ws, kind: "affiliate", ids: [ids.affA] })}::jsonb)`
      ).pipe(asA)
    )
    const change = (statement: string) =>
      run(partner((sql) => sql.unsafe(statement, [id])).pipe(asA, Effect.exit)).then((e) => e._tag)
    // The reviewer's: an allowed frame, then the event and payload the relay would run as the system.
    expect(
      await change(`update outbox set event = 'affiliate.discount_requested',
                      payload = '{"workspaceId":"${ws}","affiliateIds":["${ids.affB}"]}'::jsonb where id = $1`)
    ).toBe("Failure")
    expect(await change(`update outbox set payload = payload || '{"ids":["${ids.affB}"]}'::jsonb where id = $1`)).toBe(
      "Failure"
    )
    expect(await change("update outbox set not_before = now() + interval '1 day' where id = $1")).toBe("Failure")
    expect(await change("update outbox set cancelled_at = now() where id = $1")).toBe("Success")
    expect(await change("update outbox set cancelled_at = null where id = $1")).toBe("Failure")
    const [row] = await run(
      asSystem((sql) =>
        sql<{ event: string; cancelled: boolean }>`
          select event, cancelled_at is not null as cancelled from outbox where id = ${id}`
      )
    )
    expect(row).toEqual({ event: "records.changed", cancelled: true })
    // The relay, as the system, still sets a partner's frame aside or marks it relayed (0106's dead letters).
    const relayed = await run(
      asSystem((sql) =>
        sql`update outbox set dead_lettered_at = now(), dead_letter_reason = 'x', attempts = attempts + 1,
                  relayed_at = now() where id = ${id}`
      ).pipe(Effect.exit)
    )
    expect(relayed._tag).toBe("Success")
  })

  it("keeps the ledger from a truncate, which has no row to tell the purge by", async () => {
    const [row] = await run(
      asSystem((sql) =>
        sql<{ guarded: boolean }>`
          select exists (select 1 from pg_trigger
                         where tgrelid = 'affiliate_ledger_entries'::regclass and (tgtype & 32) <> 0) as guarded`
      )
    )
    expect(row!.guarded).toBe(true)
  })

  it("keeps a conversion and its ledger when the order goes, and never deletes a conversion with money on it", async () => {
    const order = mintId("ord")
    const conv = mintId("acv")
    await run(asSystem((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into orders (id, workspace_id, store_id, shopify_id, number, customer_email, customer_name,
                                       status, payment_status, fulfillment_status, total_minor, subtotal_minor,
                                       shipping_minor, tax_minor, discounts_minor, currency, placed_at, external_updated_at)
                   values (${order}, ${ws}, ${ids.store}, ${order}, '#9001', 'k@example.com', 'K', 'paid', 'paid',
                           'unfulfilled', 4000, 4000, 0, 0, 0, 'EUR', now(), now())`
        yield* sql`insert into affiliate_conversions (id, workspace_id, affiliate_id, order_id, store_id, order_number,
                                                      attributed_by, base_minor, commission_minor, rate, currency,
                                                      placed_at, month)
                   values (${conv}, ${ws}, ${ids.affA}, ${order}, ${ids.store}, '#9001', 'code', 4000, 400, 10, 'EUR',
                           now(), to_char(now(), 'YYYY-MM'))`
        yield* sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, conversion_id, kind,
                                                         amount_minor, currency, month)
                   values (${
          mintId("ale")
        }, ${ws}, ${ids.affA}, ${conv}, 'accrual', 400, 'EUR', to_char(now(), 'YYYY-MM'))`
      })
    ))
    // Shopify's shop/redact: the store's orders go, as the system does it.
    await run(asSystem((sql) => sql`delete from orders where id = ${order}`))
    const left = await run(asSystem((sql) =>
      Effect.all({
        conversion: sql<{ orderId: string | null }>`select order_id as "orderId" from affiliate_conversions
                                                    where id = ${conv}`,
        ledger: sql<
          { n: number }
        >`select count(*)::int as n from affiliate_ledger_entries where conversion_id = ${conv}`
      })
    ))
    expect(left).toEqual({ conversion: [{ orderId: null }], ledger: [{ n: 1 }] })
    // The brand cannot delete the conversion from under its line either.
    const gone = await run(
      asMember((sql) => sql`delete from affiliate_conversions where id = ${conv}`).pipe(Effect.exit)
    )
    expect(gone._tag).toBe("Failure")
  })

  it("keeps the ledger append-only through a cascade too, until the workspace's own purge", async () => {
    // A second brand, with one affiliate, one conversion and its line.
    const ws2 = Schema.decodeSync(WorkspaceId)(mintId("ws"))
    const aff = mintId("aff")
    const conv = mintId("acv")
    const inWs2 = Effect.provideService(CurrentWorkspace, { id: ws2 })
    const system = <A, E>(f: (sql: Parameters<Parameters<Db["Service"]["scopedFor"]>[0]>[0]) => Effect.Effect<A, E>) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(f)).pipe(inWs2)
    await run(system((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into workspaces (id, name, slug) values (${ws2}, 'Merk 2', ${`af2-${runId}`})`
        yield* sql`insert into affiliate_programs (workspace_id, apply_slug, currency) values (${ws2}, ${`prog2${runId}`}, 'EUR')`
        yield* sql`insert into affiliates (id, workspace_id, user_id, name, email, code, tier, rate)
                   values (${aff}, ${ws2}, ${ids.userA}, 'C', ${email("c2")}, 'CEES', 'bronze', 10)`
        yield* sql`insert into affiliate_conversions (id, workspace_id, affiliate_id, order_number, attributed_by,
                                                      base_minor, commission_minor, rate, currency, placed_at, month)
                   values (${conv}, ${ws2}, ${aff}, '#1', 'code', 1000, 100, 10, 'EUR', now(), to_char(now(), 'YYYY-MM'))`
        yield* sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, conversion_id, kind,
                                                         amount_minor, currency, month)
                   values (${mintId("ale")}, ${ws2}, ${aff}, ${conv}, 'accrual', 100, 'EUR', to_char(now(), 'YYYY-MM'))`
      })
    ))
    // Taking the affiliate away cascades to its lines as the tables' owner: refused all the same.
    const cascaded = await run(system((sql) => sql`delete from affiliates where id = ${aff}`).pipe(Effect.exit))
    expect(cascaded._tag).toBe("Failure")
    // The workspace's deletion, once it is being purged, takes everything.
    const purged = await run(system((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into gdpr_requests (id, workspace_id, kind, payload, state, due_at, source)
                   values (${mintId("gdp")}, ${ws2}, 'workspace_delete', '{}', 'purging', now() - interval '1 day',
                           'insyte')`
        yield* sql`select purge_workspace(${ws2})`
        return yield* sql<{ n: number }>`select count(*)::int as n from affiliate_ledger_entries`
      })
    ))
    expect(purged).toEqual([{ n: 0 }])
  })

  it("holds one approval and one settlement line per payout", async () => {
    const payout = mintId("apo")
    const line = (kind: "approval" | "settlement") =>
      asSystem((sql) =>
        sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, payout_id, kind, amount_minor,
                                                  currency, month)
            values (${mintId("ale")}, ${ws}, ${ids.affA}, ${payout}, ${kind}, ${kind === "approval" ? 0 : -500}, 'EUR',
                    '2026-01')`
      )
    await run(
      asSystem((sql) =>
        sql`insert into affiliate_payouts (id, workspace_id, affiliate_id, month, currency, pay_day, status)
          values (${payout}, ${ws}, ${ids.affA}, '2026-01', 'EUR', '2026-02-15', 'paid')`
      )
    )
    await run(line("approval"))
    await run(line("settlement"))
    expect((await run(line("approval").pipe(Effect.exit)))._tag).toBe("Failure")
    expect((await run(line("settlement").pipe(Effect.exit)))._tag).toBe("Failure")
  })

  it("counts no click through an archived link or a paused affiliate", async () => {
    const tryClick = () =>
      run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.routing((sql) =>
              sql<{ slug: string }>`select slug from affiliate_click(${ids.slugB}, ${mintId("acl")}, null, null, null)`
            )
        )
      )
    await run(asMember((sql) => sql`update affiliate_links set archived_at = now() where id = ${ids.linkB}`))
    expect(await tryClick()).toEqual([])
    await run(asMember((sql) => sql`update affiliate_links set archived_at = null where id = ${ids.linkB}`))
    await run(asMember((sql) => sql`update affiliates set status = 'paused' where id = ${ids.affB}`))
    expect(await tryClick()).toEqual([])
    await run(asMember((sql) => sql`update affiliates set status = 'active' where id = ${ids.affB}`))
    expect(await tryClick()).toEqual([{ slug: ids.slugB }])
    // Two clicks tried while it was off, one counted.
    expect(await run(partner((sql) => sql<{ clicks: number }>`select clicks from affiliate_clicks_v`).pipe(asB)))
      .toEqual([{ clicks: 1 }])
  })

  it("compares addresses as one person's: case, a +tag and Gmail's dots aside", async () => {
    const keys = await run(asSystem((sql) =>
      sql<{ k: string }>`select affiliate_email_key(e) as k
                         from unnest(array['Anna.Jansen+promo@GoogleMail.com', 'annajansen@gmail.com',
                                           'Anna+x@Example.com', 'anna.jansen@example.com']) with ordinality t(e, n)
                         order by n`
    ))
    expect(keys.map((r) => r.k)).toEqual([
      "annajansen@gmail.com",
      "annajansen@gmail.com",
      "anna@example.com",
      "anna.jansen@example.com"
    ])
  })
})
