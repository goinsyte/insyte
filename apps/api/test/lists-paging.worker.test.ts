import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { anotherStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The long lists (W3.1): Bestellingen, Producten and Klanten past 200 rows, paged on the server as the console's table
 * asks. Every order the store holds is reached once under every sort the table offers, ties broken by the id (rows that
 * share a placed time to the microsecond, a total, a name), searched and filtered as the table's columns read; a cursor
 * belongs to the order it was handed out under; and a member held to one store pages through that store's rows only,
 * whatever cursor they bring. `/v1` keeps its contract.
 */

// A JSON-RPC or REST answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const ORDERS = 230
const PRODUCTS = 210
const CUSTOMERS = 205
const BASE = Date.parse("2026-09-01T08:00:00.000Z")

const rule = (field: string, op: string, value: string | Array<string>) => ({
  kind: "group" as const,
  id: "root",
  join: "and" as const,
  children: [{ kind: "rule" as const, id: "r", field, op: op as "any", value }]
})

/** Orders, products and customers as a mirror page holds them, written through the mirror's own writer. */
const write = async (workspace: string, store: string, batch: unknown, delayed: Array<string> = []) => {
  const response = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${store}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ batch, delayed })
  })
  expect(response.status).toBe(200)
}

/** Five orders to a placed time, seven totals over and over, thirteen names: ties under every sort. */
const order = (tag: string, i: number) => {
  const placed = new Date(BASE + Math.floor(i / 5) * 60_000).toISOString()
  return {
    shopify_id: `gid://shopify/Order/${tag}${i}`,
    number: `#${tag}${i}`,
    customer_shopify_id: null,
    customer_name: `Klant ${String.fromCharCode(65 + (i % 13))}`,
    customer_email: null,
    status: i % 4 === 0 ? "shipped" : "paid",
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
    total_minor: (i % 7) * 1000,
    subtotal_minor: (i % 7) * 1000,
    shipping_minor: 0,
    tax_minor: 0,
    discounts_minor: 0,
    currency: "EUR",
    payment_gateway: null,
    card_last4: null,
    shipping_address: { country: "NL" },
    tags: i % 10 === 0 ? ["vip"] : [],
    note: null,
    channel: "web",
    referral_code: null,
    placed_at: placed,
    paid_at: placed,
    shipped_at: null,
    cancelled_at: null,
    refunded_at: null,
    external_updated_at: placed,
    raw: {}
  }
}

const product = (i: number) => ({
  shopify_id: `gid://shopify/Product/pg${i}`,
  title: `Artikel ${String(i % 40).padStart(2, "0")}`,
  handle: `artikel-${i}`,
  description_html: "",
  status: i % 9 === 0 ? "draft" : "active",
  vendor: null,
  product_type: i % 3 === 0 ? "Tassen" : null,
  tags: [],
  images: [],
  shopify_created_at: null,
  external_updated_at: new Date(BASE).toISOString(),
  raw: {}
})

const variant = (i: number) => ({
  shopify_id: `gid://shopify/ProductVariant/pg${i}`,
  product_shopify_id: `gid://shopify/Product/pg${i}`,
  inventory_item_id: null,
  tracked: null,
  sku: `PG-${i}`,
  title: "Default",
  price_minor: 1000 + (i % 5) * 250,
  compare_at_minor: null,
  position: 1
})

const customer = (i: number) => ({
  shopify_id: `gid://shopify/Customer/pg${i}`,
  email: `klant${i}@paging.test`,
  name: `Persoon ${String(i % 30).padStart(2, "0")}`,
  phone: null,
  address: null,
  country: i % 2 === 0 ? "NL" : "BE",
  tags: [],
  orders_count: i % 6,
  lifetime_value_minor: (i % 11) * 500,
  currency: "EUR",
  marketing_consent: false,
  external_updated_at: new Date(BASE).toISOString(),
  raw: {}
})

type Page = { rows: Array<Json>; nextCursor: string | null; counts: { total: number } }

/** Every page of a list, `limit` to a page, in the order handed out. */
const all = async (
  name: "Orders.list" | "Products.list" | "Customers.list",
  input: Record<string, unknown>,
  cookie: string,
  limit = 37
) => {
  const rows: Array<Json> = []
  let cursor: string | null = null
  let pages = 0
  let total = -1
  do {
    const page = ok(
      await rpc(name, { ...input, limit, ...(cursor === null ? {} : { cursor }) } as never, cookie)
    ) as unknown as Page
    rows.push(...page.rows)
    total = page.counts.total
    cursor = page.nextCursor
    pages++
  } while (cursor !== null && pages < 50)
  return { rows, total }
}

/** A cursor as a caller could write one: any JSON, base64url. */
const tampered = (key: unknown) =>
  btoa(JSON.stringify(key)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

/** Each key not before the one ahead of it, and the ids of a tie in the same direction. */
const inOrder = (rows: Array<Json>, key: (r: Json) => string | number, desc: boolean) => {
  for (let i = 1; i < rows.length; i++) {
    const a = key(rows[i - 1]!)
    const b = key(rows[i]!)
    const step = a === b ? (rows[i - 1]!.id < rows[i]!.id ? 1 : -1) : a < b ? 1 : -1
    expect(desc ? -step : step, `rows ${i - 1} and ${i}`).toBe(1)
  }
}

/** A facet's counts, added up. */
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((n, v) => n + v, 0)

const once = (rows: Array<Json>) => expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)

describe("the long lists, paged on the server", () => {
  let owner = { cookie: "", workspace: "", storeId: "" }
  let other = ""

  it("reaches every order once under every order the table offers", async () => {
    const someone = await person("paging", "Paging B.V.")
    const workspace = ok(await sessionMe(someone.cookie)).principals[0]!.workspaceId
    const seeded = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: someone.cookie }
    })
    const { storeId } = await seeded.json() as { storeId: string }
    owner = { cookie: someone.cookie, workspace, storeId }
    await write(
      workspace,
      storeId,
      {
        orders: Array.from({ length: ORDERS }, (_, i) => order("P", i)),
        products: Array.from({ length: PRODUCTS }, (_, i) => product(i)),
        variants: Array.from({ length: PRODUCTS }, (_, i) => variant(i)),
        customers: Array.from({ length: CUSTOMERS }, (_, i) => customer(i))
      },
      ["gid://shopify/Order/P3", "gid://shopify/Order/P4"]
    )

    // The newest first, to the end, past 200; five orders share each placed time, to the microsecond.
    const newest = await all("Orders.list", {}, owner.cookie)
    expect(newest.total).toBe(ORDERS + 5)
    expect(newest.rows).toHaveLength(ORDERS + 5)
    once(newest.rows)
    inOrder(newest.rows, (r) => r.placedAt, true)

    // Every order the table sorts by, both ways, with ties on each.
    const sorts: Array<[string, (r: Json) => string | number]> = [
      ["total", (r) => r.totalMinor],
      ["customer_name", (r) => r.customerName.toLowerCase()],
      ["line_count", (r) => r.lineCount],
      ["placed_at", (r) => r.placedAt]
    ]
    for (const [field, key] of sorts) {
      for (const desc of [false, true]) {
        const sorted = await all("Orders.list", { sort: { field, desc } }, owner.cookie, 41)
        expect(sorted.rows, `${field} ${desc ? "desc" : "asc"}`).toHaveLength(ORDERS + 5)
        once(sorted.rows)
        inOrder(sorted.rows, key, desc)
      }
    }
    // The number as a number: #P2 before #P10.
    const numbers = (await all("Orders.list", { sort: { field: "number", desc: false }, q: "#P" }, owner.cookie))
      .rows.map((r) => r.number)
    expect(numbers.slice(0, 3)).toEqual(["#P0", "#P1", "#P2"])
    expect(numbers.indexOf("#P2")).toBeLessThan(numbers.indexOf("#P10"))
    expect(numbers).toHaveLength(ORDERS)
    for (const field of ["store_name", "state", "supplier"]) {
      const sorted = await all("Orders.list", { sort: { field, desc: true } }, owner.cookie, 50)
      expect(sorted.rows).toHaveLength(ORDERS + 5)
      once(sorted.rows)
    }
  }, 120_000)

  it("searches and filters as the table's columns read, across pages", async () => {
    const searched = await all("Orders.list", { q: "Klant D", sort: { field: "total", desc: true } }, owner.cookie, 5)
    expect(searched.rows.length).toBe(searched.total)
    expect(searched.rows.every((r) => r.customerName === "Klant D")).toBe(true)
    expect(searched.total).toBe(Array.from({ length: ORDERS }, (_, i) => i % 13).filter((n) => n === 3).length)

    const big = await all("Orders.list", { filter: rule("total", "gt", "40") }, owner.cookie)
    expect(big.rows.every((r) => r.totalMinor > 4000)).toBe(true)
    expect(big.rows.length).toBe(big.total)

    const delayed = ok(await rpc("Orders.list", { filter: rule("state", "any", ["delayed"]) }, owner.cookie))
    expect(delayed.rows.map((r) => r.number).toSorted()).toEqual(["#P3", "#P4"])
    const first = ok(await rpc("Orders.list", { limit: 12 }, owner.cookie))
    expect(first.counts.state["delayed"]).toBe(2)
    expect(first.counts.delayed).toBe(2)
    expect(first.counts.status["paid"]).toBeGreaterThan(first.counts.state["paid"] ?? 0)

    const tagged = ok(
      await rpc("Orders.list", { filter: rule("tag_text", "contains", "vip"), limit: 200 }, owner.cookie)
    )
    expect(tagged.counts.total).toBe(ORDERS / 10)
    const stores = ok(
      await rpc("Orders.list", { filter: rule("store_name", "any", ["Insyte MVP Test"]) }, owner.cookie)
    )
    expect(stores.counts.total).toBe(ORDERS + 5)
    // The twin's paid order went to a supplier; the seeded ones to none.
    const none = ok(await rpc("Orders.list", { filter: rule("supplier", "empty", "") }, owner.cookie))
    const some = ok(await rpc("Orders.list", { filter: rule("supplier", "not_empty", "") }, owner.cookie))
    expect(none.counts.total).toBeGreaterThanOrEqual(ORDERS)
    expect(none.counts.total + some.counts.total).toBe(ORDERS + 5)
    const named = some.rows[0]?.suppliers[0]?.name
    if (named !== undefined) {
      expect(ok(await rpc("Orders.list", { filter: rule("supplier", "any", [named]) }, owner.cookie)).counts.total)
        .toBe(some.counts.total)
    }
  })

  it("holds a cursor to the order it was handed out under", async () => {
    const own = ok(await rpc("Orders.list", { limit: 3 }, owner.cookie))
    const sorted = ok(await rpc("Orders.list", { limit: 3, sort: { field: "total", desc: true } }, owner.cookie))
    expect(
      failure(await rpc("Orders.list", { cursor: own.nextCursor!, sort: { field: "total", desc: true } }, owner.cookie))
    )
      .toMatchObject({ _tag: "CursorInvalid" })
    expect(failure(await rpc("Orders.list", { cursor: sorted.nextCursor! }, owner.cookie))).toMatchObject({
      _tag: "CursorInvalid"
    })
    expect(
      failure(
        await rpc("Orders.list", { cursor: sorted.nextCursor!, sort: { field: "total", desc: false } }, owner.cookie)
      )
    )
      .toMatchObject({ _tag: "CursorInvalid" })
    // The list's own order, asked for by name, is the same order and takes its cursor.
    expect(
      ok(
        await rpc(
          "Orders.list",
          { limit: 3, cursor: own.nextCursor!, sort: { field: "placed_at", desc: true } },
          owner.cookie
        )
      ).rows
    )
      .toHaveLength(3)
    // A cursor from before the list could be sorted (the placed time in milliseconds) still reads.
    const last = own.rows.at(-1)!
    const legacy = btoa(JSON.stringify([last.placedAt, last.id])).replaceAll("+", "-").replaceAll("/", "_").replace(
      /=+$/,
      ""
    )
    expect(ok(await rpc("Orders.list", { limit: 3, cursor: legacy }, owner.cookie)).rows[0]!.id).not.toBe(last.id)
    expect(failure(await rpc("Orders.list", { sort: { field: "raw; drop table orders", desc: true } }, owner.cookie)))
      .toMatchObject({ _tag: "FilterFieldUnknown" })
    // A name every object has is no field of a list's either.
    for (const field of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(failure(await rpc("Orders.list", { sort: { field, desc: true } }, owner.cookie)), field)
        .toMatchObject({ _tag: "FilterFieldUnknown" })
      expect(failure(await rpc("Customers.list", { filter: rule(field, "contains", "x") }, owner.cookie)), field)
        .toMatchObject({ _tag: "FilterFieldUnknown" })
    }
  })

  it("refuses a tampered cursor as a cursor, never as a failure of its own", async () => {
    const id = "ord_x"
    const cursors: Array<["Orders.list" | "Products.list" | "Customers.list", Record<string, unknown>, unknown]> = [
      // The list's own order, by placed time: past what a date can hold, no such day, no such hour, a year 0.
      ["Orders.list", {}, [8.64e15 + 1, id]],
      ["Orders.list", {}, [Number.MAX_SAFE_INTEGER, id]],
      ["Orders.list", {}, ["2026-02-30 10:00:00+00", id]],
      ["Orders.list", {}, ["2026-13-01 10:00:00+00", id]],
      ["Orders.list", {}, ["2026-01-01 25:00:00+00", id]],
      ["Orders.list", {}, ["0000-01-01 10:00:00+00", id]],
      ["Orders.list", {}, ["2026-01-01 10:00:00+99", id]],
      ["Orders.list", {}, ["2026-01-01 10:00:00+00", "ord\u0000x"]],
      // A number past every bound, or not a number at all.
      ["Orders.list", { sort: { field: "total", desc: true } }, ["1e999999", id, "total", 1]],
      ["Orders.list", { sort: { field: "total", desc: true } }, ["9".repeat(400), id, "total", 1]],
      ["Orders.list", { sort: { field: "total", desc: true } }, ["NaN", id, "total", 1]],
      ["Orders.list", { sort: { field: "total", desc: true } }, [1e300, id, "total", 1]],
      // Text the database cannot hold: a NUL, half a surrogate pair.
      ["Orders.list", { sort: { field: "customer_name", desc: false } }, ["a\u0000b", id, "customer_name", 0]],
      ["Orders.list", { sort: { field: "customer_name", desc: false } }, ["\ud800", id, "customer_name", 0]],
      ["Products.list", {}, ["tas\u0000", "prd_x"]],
      ["Customers.list", { sort: { field: "last_order", desc: true } }, ["infinity!", "cus_x", "last_order", 1]],
      // Not a key at all.
      ["Orders.list", {}, [{ at: 1 }, id]],
      ["Orders.list", {}, [null, id]],
      ["Orders.list", {}, ["2026-01-01 10:00:00+00", 7]]
    ]
    for (const [name, input, key] of cursors) {
      const cursor = tampered(key)
      expect(failure(await rpc(name, { ...input, cursor, limit: 3 } as never, owner.cookie)), JSON.stringify(key))
        .toMatchObject({ _tag: "CursorInvalid" })
    }
    expect(failure(await rpc("Orders.list", { cursor: "%%%", limit: 3 }, owner.cookie)))
      .toMatchObject({ _tag: "CursorInvalid" })
  })

  it("pages the products and the customers past 200, the cuts and their counts with them", async () => {
    const titles = await all("Products.list", {}, owner.cookie)
    expect(titles.total).toBe(PRODUCTS + 3)
    expect(titles.rows).toHaveLength(PRODUCTS + 3)
    once(titles.rows)
    inOrder(titles.rows, (r) => r.title.toLowerCase(), false)
    for (const field of ["price", "margin", "product_type", "stock", "supplier_name", "cost"]) {
      const sorted = await all("Products.list", { sort: { field, desc: true } }, owner.cookie, 50)
      expect(sorted.rows, field).toHaveLength(PRODUCTS + 3)
      once(sorted.rows)
    }
    inOrder(
      (await all("Products.list", { sort: { field: "price", desc: true } }, owner.cookie)).rows,
      (r) => r.priceMinMinor ?? 0,
      true
    )
    const first = ok(await rpc("Products.list", { limit: 12 }, owner.cookie))
    expect(first.summary).toMatchObject({ products: PRODUCTS + 3, costed: false })
    expect(ok(await rpc("Products.list", { limit: 12, cursor: first.nextCursor! }, owner.cookie)).summary).toBeNull()
    // The summary is the whole catalogue's, so only the first page with nothing chosen reads it.
    expect(
      ok(await rpc("Products.list", { limit: 12, sort: { field: "title", desc: false } }, owner.cookie)).summary
        ?.products
    ).toBe(PRODUCTS + 3)
    for (
      const input of [
        { q: "Artikel" },
        { filter: rule("product_type", "any", ["Tassen"]) },
        { sort: { field: "price", desc: true } },
        { attention: "returns" }
      ]
    ) {
      expect(
        ok(await rpc("Products.list", { ...input, limit: 12 } as never, owner.cookie)).summary,
        JSON.stringify(input)
      )
        .toBeNull()
    }
    // The margin's key is its exact value: a cursor under it pages on, both ways.
    for (const desc of [false, true]) {
      const page = ok(await rpc("Products.list", { limit: 5, sort: { field: "margin", desc } }, owner.cookie))
      expect(
        ok(
          await rpc(
            "Products.list",
            { limit: 5, sort: { field: "margin", desc }, cursor: page.nextCursor! },
            owner.cookie
          )
        ).rows
      )
        .toHaveLength(5)
    }
    const bags = ok(
      await rpc("Products.list", { filter: rule("product_type", "any", ["Tassen"]), limit: 200 }, owner.cookie)
    )
    expect(bags.counts.total).toBe(PRODUCTS / 3)
    const sku = ok(await rpc("Products.list", { filter: rule("product", "contains", "PG-17") }, owner.cookie))
    expect(sku.rows.map((p) => p.sku).toSorted()).toEqual(
      ["PG-17", "PG-170", "PG-171", "PG-172", "PG-173", "PG-174", "PG-175", "PG-176", "PG-177", "PG-178", "PG-179"]
        .toSorted()
    )
    // The Aandacht flags filter as the cut (#158) pages: nothing here has returns.
    const flagged = ok(await rpc("Products.list", { filter: rule("return_high", "any", ["yes"]) }, owner.cookie))
    expect(flagged.counts.total).toBe(
      ok(await rpc("Products.list", { attention: "returns" }, owner.cookie)).counts.total
    )
    expect(ok(await rpc("Products.list", { filter: rule("return_high", "any", ["no"]) }, owner.cookie)).counts.total)
      .toBe(PRODUCTS + 3 - flagged.counts.total)

    const names = await all("Customers.list", {}, owner.cookie)
    expect(names.total).toBe(CUSTOMERS + 3)
    once(names.rows)
    inOrder(names.rows, (r) => r.name.toLowerCase(), false)
    const valued = await all("Customers.list", { sort: { field: "lifetime", desc: true } }, owner.cookie, 23)
    expect(valued.rows).toHaveLength(CUSTOMERS + 3)
    once(valued.rows)
    inOrder(valued.rows, (r) => r.lifetimeValueMinor, true)
    for (const field of ["email", "country", "orders", "aov", "last_order"]) {
      const sorted = await all("Customers.list", { sort: { field, desc: false } }, owner.cookie, 50)
      expect(sorted.rows, field).toHaveLength(CUSTOMERS + 3)
      once(sorted.rows)
    }
    const counts = ok(await rpc("Customers.list", { limit: 1 }, owner.cookie)).counts
    expect(counts.new + counts.returning).toBe(CUSTOMERS + 3)
    expect(counts.duplicates).toBe(0)
    const few = ok(await rpc("Customers.list", { filter: rule("orders", "lt", "3"), limit: 1 }, owner.cookie))
    expect(few.counts.total).toBe(counts.new)
    // The profiles the console shows as duplicates are counted as that, not as new or returning, as its filter reads.
    const twins = names.rows.slice(0, 3).map((c) => c.id)
    const apart = ok(await rpc("Customers.list", { limit: 1, duplicates: twins }, owner.cookie)).counts
    expect(apart.duplicates).toBe(3)
    expect(apart.new + apart.returning).toBe(CUSTOMERS + 3 - 3)
    const newOnes = {
      kind: "group" as const,
      id: "root",
      join: "and" as const,
      children: [
        { kind: "rule" as const, id: "a", field: "orders", op: "lt" as const, value: "3" },
        { kind: "rule" as const, id: "b", field: "id", op: "none" as const, value: twins }
      ]
    }
    expect(ok(await rpc("Customers.list", { filter: newOnes, limit: 1, duplicates: twins }, owner.cookie)).counts.total)
      .toBe(apart.new)
    const ids = names.rows.slice(0, 4).map((c) => c.id)
    expect(
      ok(await rpc("Customers.list", { filter: rule("id", "any", ids) }, owner.cookie)).rows.map((c) => c.id).toSorted()
    )
      .toEqual(ids.toSorted())
  }, 120_000)

  it("pages a member held to one store through that store's rows only, whatever cursor they bring", async () => {
    other = (await anotherStore(owner, "paging-b")).storeId
    await write(owner.workspace, other, {
      orders: Array.from({ length: 20 }, (_, i) => order("Q", i)),
      products: Array.from(
        { length: 4 },
        (_, i) => ({ ...product(500 + i), shopify_id: `gid://shopify/Product/q${i}` })
      ),
      customers: Array.from(
        { length: 4 },
        (_, i) => ({ ...customer(500 + i), shopify_id: `gid://shopify/Customer/q${i}` })
      )
    })
    const email = `paging-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: [owner.storeId] }] }, owner.cookie))
    await pastUndo(owner.workspace)
    await relay(owner.workspace)
    const held = await join(email)

    const everything = await all("Orders.list", { sort: { field: "total", desc: true } }, owner.cookie, 60)
    expect(new Set(everything.rows.map((o) => o.storeId))).toEqual(new Set([owner.storeId, other]))
    const theirs = await all("Orders.list", { sort: { field: "total", desc: true } }, held, 60)
    expect(theirs.total).toBe(ORDERS + 5)
    expect(theirs.rows.every((o) => o.storeId === owner.storeId)).toBe(true)
    once(theirs.rows)

    // The owner's cursor, deep into the other store's rows, opens nothing more to them.
    const deep = ok(await rpc("Orders.list", { limit: 200, sort: { field: "total", desc: true } }, owner.cookie))
    const after = await all("Orders.list", { sort: { field: "total", desc: true }, cursor: deep.nextCursor! }, held, 60)
    expect(after.rows.every((o) => o.storeId === owner.storeId)).toBe(true)
    expect(ok(await rpc("Orders.list", { filter: rule("store_name", "none", ["Insyte MVP Test"]) }, held)).counts.total)
      .toBe(0)
    // The other store holds products and customers of its own, which the owner sees and the held member does not.
    for (const name of ["Products.list", "Customers.list"] as const) {
      const seen = (await all(name, {}, owner.cookie, 100)).rows
      expect(seen.filter((r) => r.storeId === other).length, name).toBeGreaterThanOrEqual(4)
      const rows = (await all(name, {}, held, 100)).rows
      expect(rows.length, name).toBeGreaterThan(0)
      expect(rows.every((r) => r.storeId === owner.storeId), name).toBe(true)
    }
    expect(ok(await rpc("Products.list", { limit: 1 }, held)).summary?.products).toBe(PRODUCTS + 3)

    // The facets count the member's store alone, as the rows they page through.
    const ownersOrders = ok(await rpc("Orders.list", { limit: 1 }, owner.cookie)).counts
    const heldOrders = ok(await rpc("Orders.list", { limit: 1 }, held)).counts
    expect(sum(heldOrders.status)).toBe(ORDERS + 5)
    expect(sum(heldOrders.state)).toBe(ORDERS + 5)
    expect(heldOrders.delayed).toBe(2)
    expect(sum(ownersOrders.status)).toBeGreaterThan(sum(heldOrders.status))
    const ownersProducts = ok(await rpc("Products.list", { limit: 1 }, owner.cookie)).counts
    const heldProducts = ok(await rpc("Products.list", { limit: 1 }, held)).counts
    expect(sum(heldProducts.status)).toBe(PRODUCTS + 3)
    expect(sum(ownersProducts.status)).toBeGreaterThan(sum(heldProducts.status))
    const ownersCustomers = ok(await rpc("Customers.list", { limit: 1 }, owner.cookie)).counts
    const heldCustomers = ok(await rpc("Customers.list", { limit: 1 }, held)).counts
    expect(heldCustomers.new + heldCustomers.returning).toBe(CUSTOMERS + 3)
    expect(ownersCustomers.new + ownersCustomers.returning).toBeGreaterThan(CUSTOMERS + 3)
  }, 240_000)

  it("keeps /v1's lists as they were: a page, its total, the next cursor", async () => {
    const { secret } = ok(
      await rpc("ApiKeys.create", {
        label: "Paging",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, owner.cookie)
    )
    const seen: Array<string> = []
    let url = "http://api.public.test/v1/orders?limit=100"
    for (let i = 0; i < 10; i++) {
      const response = await call(url, { headers: { authorization: `Bearer ${secret}` } })
      expect(response.status).toBe(200)
      const body = await response.json() as Json
      expect(Object.keys(body).toSorted()).toEqual(["data", "next_cursor", "total"])
      seen.push(...body.data.map((o: Json) => o.id))
      if (body.next_cursor === null) break
      url = `http://api.public.test/v1/orders?limit=100&cursor=${body.next_cursor}`
    }
    expect(new Set(seen).size).toBe(ORDERS + 5 + 5 + 20)
    const products = await (await call("http://api.public.test/v1/products?limit=200", {
      headers: { authorization: `Bearer ${secret}` }
    })).json() as Json
    expect(products.data).toHaveLength(200)
    expect(products.next_cursor).not.toBeNull()
  }, 120_000)
})
