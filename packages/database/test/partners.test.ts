import { PgClient } from "@effect/sql-pg"
import { mintId, UserId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect, Layer, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { beforeAll, describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"
import { TENANT_TABLES } from "../src/Tenancy.ts"

/*
 * The partner suite (M16 step 1, 06 §5): one workspace, two suppliers on one order, each with a contact. A contact reads
 * its own supplier's projection and nothing else: not the other supplier's line on the same order, not another order,
 * not the team or the stores, never the customer's address book or the internal note through the supplier views. As
 * `insyte_app`, which owns nothing and bypasses nothing.
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"
const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) })))))
  )

const runId = Date.now().toString(36)
const ws = Schema.decodeSync(WorkspaceId)(mintId("ws"))
const user = (_tag: string) => Schema.decodeSync(UserId)(mintId("usr"))
const ids = {
  owner: user("o"),
  userA: user("a"),
  userB: user("b"),
  member: mintId("mem"),
  store: mintId("sto"),
  supA: mintId("sup"),
  supB: mintId("sup"),
  contactA: mintId("sct"),
  contactB: mintId("sct"),
  order: mintId("ord"),
  otherOrder: mintId("ord"),
  lineA: mintId("oln"),
  lineB: mintId("oln"),
  productA: mintId("prd"),
  productB: mintId("prd"),
  variantA: mintId("var"),
  variantB: mintId("var"),
  invitation: mintId("inv")
}

const LEVELS = {} as Principal["role"]["levels"]
const SPECIALS = {} as Principal["role"]["specials"]
const contactOf = (id: string, supplierId: string, userId: UserId): Principal => ({
  kind: "supplier_contact",
  id,
  userId,
  workspaceId: ws,
  partnerId: supplierId,
  role: {
    id: "supplier_contact",
    label: "Leverancier",
    version: 0,
    levels: LEVELS,
    specials: SPECIALS,
    refundLimit: null,
    stores: []
  },
  storeScope: []
})
const memberPrincipal: Principal = {
  kind: "member",
  id: ids.member,
  userId: ids.owner,
  workspaceId: ws,
  partnerId: null,
  role: {
    id: "owner",
    label: "Eigenaar",
    version: 1,
    levels: LEVELS,
    specials: SPECIALS,
    refundLimit: null,
    stores: "all"
  },
  storeScope: null
}
const asA = Effect.provideService(CurrentPrincipal, contactOf(ids.contactA, ids.supA, ids.userA))
const asB = Effect.provideService(CurrentPrincipal, contactOf(ids.contactB, ids.supB, ids.userB))

/** The fixture, written as `system` in the workspace: what the brand's own sync and forwarding would have made. */
const fixture = Effect.gen(function*() {
  const db = yield* Db
  yield* db.routing((sql) =>
    Effect.forEach(
      [ids.owner, ids.userA, ids.userB],
      (id) =>
        sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
          values (${id}, ${id}, ${`partners-${runId}-${id}@example.com`}, true, now(), now())`
    )
  )
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`insert into workspaces (id, name, slug) values (${ws}, 'Merk', ${`p-${runId}`})`
      yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('owner', ${ws}, 'Eigenaar', 'system', '{}')`
      yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${ids.member}, ${ws}, ${ids.owner}, 'owner')`
      yield* sql`insert into teams (id, workspace_id, name) values (${mintId("team")}, ${ws}, 'Team')`
      const conn = mintId("con")
      yield* sql`insert into connections (id, workspace_id, provider, account_ref) values (${conn}, ${ws}, 'shopify', ${`p-${runId}`})`
      yield* sql`insert into stores (id, workspace_id, connection_id, shop_domain, name)
                 values (${ids.store}, ${ws}, ${conn}, ${`p-${runId}.myshopify.com`}, 'Winkel')`
      yield* sql`insert into customers (id, workspace_id, store_id, shopify_id, email, external_updated_at)
                 values (${mintId("cus")}, ${ws}, ${ids.store}, ${`c-${runId}`}, 'klant@example.com', now())`
      for (const [id, name] of [[ids.supA, "Leverancier A"], [ids.supB, "Leverancier B"]] as const) {
        yield* sql`insert into suppliers (id, workspace_id, name, created_by) values (${id}, ${ws}, ${name}, ${ids.member})`
      }
      for (const [id, sup, u] of [[ids.contactA, ids.supA, ids.userA], [ids.contactB, ids.supB, ids.userB]] as const) {
        yield* sql`insert into supplier_contacts (id, workspace_id, supplier_id, user_id, name, role, joined_at)
                   values (${id}, ${ws}, ${sup}, ${u}, ${id}, 'owner', now())`
      }
      for (const [id, sup] of [[ids.productA, ids.supA], [ids.productB, ids.supB]] as const) {
        yield* sql`insert into products (id, workspace_id, store_id, shopify_id, title, handle, status, external_updated_at)
                   values (${id}, ${ws}, ${ids.store}, ${id}, ${id}, ${id}, 'active', now())`
        yield* sql`insert into product_supply (workspace_id, product_id, supplier_id) values (${ws}, ${id}, ${sup})`
      }
      for (const [id, product] of [[ids.variantA, ids.productA], [ids.variantB, ids.productB]] as const) {
        yield* sql`insert into variants (id, workspace_id, store_id, product_id, shopify_id, sku, title, price_minor)
                   values (${id}, ${ws}, ${ids.store}, ${product}, ${id}, ${`SKU-${id}`}, 'Maat M', 4999)`
        yield* sql`insert into inventory_levels (workspace_id, variant_id, location_id, available)
                   values (${ws}, ${id}, 'winkel', 7)`
      }
      // An open invitation for B's person to supplier A's portal, its token "right".
      yield* sql`insert into invitations (id, workspace_id, kind, email, token_hash, supplier_id, invited_by, expires_at)
                 values (${ids.invitation}, ${ws}, 'supplier_portal', ${`partners-${runId}-${ids.userB}@example.com`},
                         sha256('right'::bytea), ${ids.supA}, ${ids.member}, now() + interval '1 day')`
      for (const order of [ids.order, ids.otherOrder]) {
        yield* sql`insert into orders (id, workspace_id, store_id, shopify_id, number, customer_email, note, supplier_note,
                                       status, payment_status, fulfillment_status, total_minor, subtotal_minor,
                                       shipping_minor, tax_minor, discounts_minor, currency, placed_at,
                                       shipping_address, external_updated_at)
                   values (${order}, ${ws}, ${ids.store}, ${order}, ${`#${order.slice(-4)}`}, 'klant@example.com',
                           'intern: niet voor leveranciers', 'voor de leverancier', 'paid', 'paid', 'unfulfilled', 5000,
                           5000, 0, 0, 0, 'EUR', now(),
                           '{"name":"Klant","line1":"Straat 1","city":"Utrecht","country":"NL","phone":"0612345678"}',
                           now())`
      }
      yield* sql`insert into order_lines (id, workspace_id, store_id, order_id, shopify_id, title, quantity, unit_price_minor, product_id)
                 values (${ids.lineA}, ${ws}, ${ids.store}, ${ids.order}, ${ids.lineA}, 'Van A', 1, 2500, ${ids.productA}),
                        (${ids.lineB}, ${ws}, ${ids.store}, ${ids.order}, ${ids.lineB}, 'Van B', 1, 2500, ${ids.productB})`
      // Both suppliers work on the first order; only B on the second.
      for (
        const [order, sup, line] of [[ids.order, ids.supA, ids.lineA], [ids.order, ids.supB, ids.lineB], [
          ids.otherOrder,
          ids.supB,
          ids.lineB
        ]] as const
      ) {
        yield* sql`insert into forwarding_items (id, workspace_id, store_id, order_id, supplier_id, line_ids, state)
                   values (${mintId("fwd")}, ${ws}, ${ids.store}, ${order}, ${sup}, ${[line]}::text[], 'awaiting')`
        yield* sql`insert into supplier_work (workspace_id, order_id, supplier_id) values (${ws}, ${order}, ${sup})`
      }
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))
})

/** What a contact may read of a table at all, beside its own supplier's projection (0075). */
const PROJECTED = new Set([
  "suppliers",
  "supplier_contacts",
  "supplier_work",
  "forwarding_items",
  "product_supply",
  "supplier_integrations",
  "orders",
  "order_lines",
  "products",
  "variants",
  "inventory_levels",
  "supplier_statements",
  "supplier_statement_lines",
  "quality_checks",
  "quality_check_media",
  "files",
  "undo_tokens",
  // Its own audit lines go in; it reads none back (member side only), and the outbox frames it writes are its own.
  // `orders` and `order_lines` are projected but closed to direct reads: the closed-tables test counts them.
  "audit_events",
  "outbox"
])

describe("partners", () => {
  beforeAll(async () => {
    await run(fixture)
  })

  it("shows contact A only its own supplier's line of a shared order, and not B's other order", async () => {
    const seen = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.all({
            orders: sql<{ id: string }>`select id from supplier_orders_v order by id`,
            lines: sql<{ id: string }>`select id from supplier_lines_v order by id`,
            suppliers: sql<{ id: string }>`select id from supplier_self_v`,
            products: sql<{ id: string }>`select id from supplier_products_v`,
            variants: sql<{ id: string }>`select id from supplier_variants_v`,
            work: sql<{ supplierId: string }>`select supplier_id as "supplierId" from supplier_work`,
            legs: sql<{ supplierId: string }>`select supplier_id as "supplierId" from forwarding_items`,
            contacts: sql<{ id: string }>`select id from supplier_contacts`,
            viewLines: sql<{ id: string }>`select id from supplier_lines_v`
          })
        )).pipe(asA)
    )
    expect(seen.orders.map((r) => r.id)).toEqual([ids.order])
    expect(seen.lines.map((r) => r.id)).toEqual([ids.lineA])
    expect(seen.viewLines.map((r) => r.id)).toEqual([ids.lineA])
    expect(seen.suppliers.map((r) => r.id)).toEqual([ids.supA])
    expect(seen.products.map((r) => r.id)).toEqual([ids.productA])
    expect(seen.variants.map((r) => r.id)).toEqual([ids.variantA])
    expect(seen.work.map((r) => r.supplierId)).toEqual([ids.supA])
    expect(seen.legs.map((r) => r.supplierId)).toEqual([ids.supA])
    expect(seen.contacts.map((r) => r.id)).toEqual([ids.contactA])
  })

  it("shows contact B both its orders and only its own lines", async () => {
    const seen = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.all({
            orders: sql<{ id: string }>`select id from supplier_orders_v order by id`,
            lines: sql<{ id: string }>`select id from supplier_lines_v`
          })
        )).pipe(asB)
    )
    expect(new Set(seen.orders.map((r) => r.id))).toEqual(new Set([ids.order, ids.otherOrder]))
    expect(seen.lines.map((r) => r.id)).toEqual([ids.lineB])
  })

  it("keeps the customer's email and phone and the internal note out of the supplier's order view", async () => {
    const [row] = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scopedPartner((sql) =>
            sql<Record<string, unknown>>`select * from supplier_orders_v where id = ${ids.order}`
          )
      ).pipe(asA)
    )
    const text = JSON.stringify(row)
    expect(row).toBeDefined()
    expect(text).not.toContain("klant@example.com")
    expect(text).not.toContain("0612345678")
    expect(text).not.toContain("intern: niet voor leveranciers")
    expect(text).toContain("voor de leverancier")
    expect(Object.keys(row!)).not.toContain("total_minor")
  })

  it("shuts a contact out of every tenant table outside its projection", async () => {
    const seen = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.forEach(
            TENANT_TABLES.filter((t) => !PROJECTED.has(t)),
            (table) =>
              Effect.map(
                sql<{ n: string }>`select count(*)::text as n from ${sql(table)}`,
                ([row]) => [table, Number(row!.n)] as const
              )
          )
        )).pipe(asA)
    )
    expect(seen.filter(([, n]) => n > 0)).toEqual([])
    const [workspace] = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scopedPartner((sql) => sql<{ id: string; name: string }>`select id, name from partner_workspace_v`)
      ).pipe(asA)
    )
    expect(workspace).toEqual({ id: ws, name: "Merk" })
  })

  it("closes the tables that hold the customer, the internal note and the money to a contact reading them directly", async () => {
    for (const as of [asA, asB]) {
      const seen = await run(
        Effect.flatMap(Effect.service(Db), (db) =>
          db.scopedPartner((sql) =>
            Effect.all({
              orders: sql<{ n: number }>`select count(*)::int as n from orders`,
              lines: sql<{ n: number }>`select count(*)::int as n from order_lines`,
              customers: sql<{ n: number }>`select count(*)::int as n from customers`,
              byName: sql<{ n: number }>`select count(*)::int as n from orders where id = ${ids.order}`,
              // Shelf prices, the store's raw product data, the brand's forwarding settings and its checks.
              suppliers: sql<{ n: number }>`select count(*)::int as n from suppliers`,
              products: sql<{ n: number }>`select count(*)::int as n from products`,
              variants: sql<{ n: number }>`select count(*)::int as n from variants`,
              checks: sql<{ n: number }>`select count(*)::int as n from quality_checks`
            })
          )).pipe(as)
      )
      expect(Object.values(seen).map((rows) => rows[0]!.n)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    }
  })

  it("leaves a member's reads as they were, and shows a member nothing through the supplier views", async () => {
    const seen = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scoped((sql) =>
          Effect.all({
            orders: sql<{ n: number }>`select count(*)::int as n from orders`,
            lines: sql<{ n: number }>`select count(*)::int as n from order_lines`,
            customers: sql<{ n: number }>`select count(*)::int as n from customers`,
            email: sql<{ e: string }>`select customer_email as e from orders where id = ${ids.order}`,
            viewOrders: sql<{ n: number }>`select count(*)::int as n from supplier_orders_v`,
            viewLines: sql<{ n: number }>`select count(*)::int as n from supplier_lines_v`
          })
        )).pipe(Effect.provideService(CurrentPrincipal, memberPrincipal))
    )
    expect(seen.orders[0]!.n).toBe(2)
    expect(seen.lines[0]!.n).toBe(2)
    expect(seen.customers[0]!.n).toBe(1)
    expect(seen.email[0]!.e).toBe("klant@example.com")
    expect([seen.viewOrders[0]!.n, seen.viewLines[0]!.n]).toEqual([0, 0])
  })

  it("lets a contact change its own work but not the other supplier's", async () => {
    const changed = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.all({
            own:
              sql`update supplier_work set status = 'to_ship' where order_id = ${ids.order} and supplier_id = ${ids.supA} returning 1`,
            other:
              sql`update supplier_work set status = 'to_ship' where order_id = ${ids.order} and supplier_id = ${ids.supB} returning 1`
          })
        )).pipe(asA)
    )
    expect(changed.own.length).toBe(1)
    expect(changed.other.length).toBe(0)
  })

  it("lists a person their own supplier contacts before any workspace is chosen", async () => {
    const held = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.forUser((sql) => sql<{ contactId: string }>`select contact_id as "contactId" from supplier_principals()`)
      ).pipe(
        Effect.provideService(CurrentUser, {
          id: ids.userA,
          email: "",
          name: "",
          emailVerified: true,
          image: null,
          twoFactorEnabled: false
        })
      )
    )
    expect(held.map((h) => h.contactId)).toEqual([ids.contactA])
  })

  /** Whether the write fails, each in its own transaction (a refused statement ends the one it is in). */
  const refused = (as: typeof asA, f: (sql: SqlClient.SqlClient) => Effect.Effect<unknown, unknown>) =>
    run(Effect.flatMap(Effect.service(Db), (db) => db.scopedPartner(f)).pipe(as, Effect.exit)).then((exit) =>
      exit._tag === "Failure"
    )

  it("refuses a contact new rows of work or supply, and a change to whose work it is", async () => {
    expect(
      await refused(
        asA,
        (sql) =>
          sql`insert into supplier_work (workspace_id, order_id, supplier_id) values (${ws}, ${ids.otherOrder}, ${ids.supA})`
      )
    ).toBe(true)
    expect(
      await refused(
        asA,
        (sql) =>
          sql`insert into product_supply (workspace_id, product_id, supplier_id) values (${ws}, ${ids.productB}, ${ids.supA})`
      )
    ).toBe(true)
    // The guard: only the work's state, never which supplier or which lines.
    expect(
      await refused(
        asA,
        (sql) =>
          sql`update supplier_work set supplier_id = ${ids.supB} where order_id = ${ids.order} and supplier_id = ${ids.supA}`
      )
    ).toBe(true)
    expect(
      await refused(
        asA,
        (sql) =>
          sql`update forwarding_items set line_ids = ${[ids.lineA, ids.lineB]}::text[] where supplier_id = ${ids.supA}`
      )
    ).toBe(true)
    expect(
      await refused(asA, (sql) => sql`update product_supply set is_primary = false where supplier_id = ${ids.supA}`)
    ).toBe(true)
    // …while its own lead time is its to change.
    const lead = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scopedPartner((sql) =>
            sql`update product_supply set lead_days = 4 where supplier_id = ${ids.supA} returning 1`
          )
      ).pipe(asA)
    )
    expect(lead.length).toBe(1)
  })

  it("lets a contact report its own stock and not touch the store's counts", async () => {
    expect(
      await refused(
        asA,
        (sql) =>
          sql`insert into inventory_levels (workspace_id, variant_id, location_id, available, source)
            values (${ws}, ${ids.variantA}, 'winkel', 99, 'shopify')
            on conflict (variant_id, location_id, source) do update set available = 99`
      )
    ).toBe(true)
    expect(
      await refused(
        asA,
        (sql) =>
          sql`insert into inventory_levels (workspace_id, variant_id, location_id, available, source)
            values (${ws}, ${ids.variantB}, 'supplier', 3, 'supplier')`
      )
    ).toBe(true)
    const seen = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.all({
            own:
              sql`insert into inventory_levels (workspace_id, variant_id, location_id, available, source, reported_by)
                     values (${ws}, ${ids.variantA}, 'supplier', 3, 'supplier', ${ids.contactA}) returning 1`,
            store: sql`update inventory_levels set available = 0 where variant_id = ${ids.variantA}
                       and source = 'shopify' returning 1`,
            levels: sql<{ n: number }>`select count(*)::int as n from inventory_levels`
          })
        )).pipe(asA)
    )
    expect([seen.own.length, seen.store.length, seen.levels[0]!.n]).toEqual([1, 0, 2])
  })

  it("does not let a contact change its own access", async () => {
    const changed = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.all({
            role: sql`update supplier_contacts set role = 'owner' where id = ${ids.contactA} returning 1`,
            scopes: sql`update supplier_contacts set portal_scopes = '{}' where id = ${ids.contactA} returning 1`,
            revoked: sql`update supplier_contacts set revoked_at = null where id = ${ids.contactA} returning 1`
          })
        )).pipe(asA)
    )
    expect([changed.role.length, changed.scopes.length, changed.revoked.length]).toEqual([0, 0, 0])
  })

  it("keeps a contact to its own outbox frames, of the kinds the portal sends", async () => {
    const frame = (event: string, payload: Record<string, unknown>) => (sql: SqlClient.SqlClient) =>
      sql`insert into outbox (id, workspace_id, event, payload) values (${mintId("obx")}, ${ws}, ${event}, ${
        JSON.stringify(payload)
      }::jsonb)`
    expect(await refused(asA, frame("member.invited", { invitationId: ids.invitation }))).toBe(true)
    expect(await refused(asA, frame("partner.changed", { supplierId: ids.supB }))).toBe(true)
    expect(
      await refused(
        asA,
        frame("order.updated", { change: "fulfil", supplierId: ids.supA, userId: `member:${ids.member}` })
      )
    ).toBe(true)
    await run(
      Effect.flatMap(Effect.service(Db), (db) => db.scopedPartner(frame("partner.changed", { supplierId: ids.supB })))
        .pipe(asB)
    )
    const [own] = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.scopedPartner((sql) =>
          Effect.andThen(
            frame("partner.changed", { supplierId: ids.supA })(sql),
            sql<{ n: number; others: number }>`select count(*)::int as n,
                     count(*) filter (where created_by_principal <> ${ids.contactA})::int as others from outbox`
          )
        )).pipe(asA)
    )
    expect(own).toEqual({ n: 1, others: 0 })
    expect(await refused(asA, (sql) => sql`delete from outbox where workspace_id = ${ws}`)).toBe(false)
    const [left] = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scopedPartner((sql) => sql<{ n: number }>`select count(*)::int as n from outbox`)
      ).pipe(asA)
    )
    expect(left!.n).toBe(1)
  })

  it("joins nobody on an invitation's id without its token", async () => {
    const asUserB = Effect.provideService(CurrentUser, {
      id: ids.userB,
      email: "",
      name: "",
      emailVerified: true,
      image: null,
      twoFactorEnabled: false
    })
    const join = (token: string) =>
      run(
        Effect.flatMap(Effect.service(Db), (db) =>
          db.asUserIn(ws)((sql) =>
            sql<{ id: string | null }>`select supplier_contact_join(${ids.invitation}, sha256(${token}::bytea),
                                                                    ${mintId("sct")}) as id`
          )).pipe(asUserB)
      )
    const [wrong] = await join("wrong")
    expect(wrong!.id).toBeNull()
    const [right] = await join("right")
    // B's person already has its own supplier; for A's they are a new contact, and A has an owner, so staff.
    expect(right!.id).toMatch(/^sct/)
    const [role] = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scopedFor((sql) => sql<{ role: string }>`select role from supplier_contacts where id = ${right!.id}`)
      ).pipe(
        Effect.provideService(CurrentWorkspace, { id: ws })
      )
    )
    expect(role!.role).toBe("staff")
  })
})
