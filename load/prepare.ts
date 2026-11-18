/*
 * The load test's data (M18 "Performance"): a founder with a workspace holding the `busy` scenario ten times over, on
 * the LOCAL stack only. Ten stores, each the recorded twin's import plus a busy week written through the Shopify
 * mirror's own writer (`/api/__dev/facts/orders`): 300 orders, 80 products, 200 customers a store. Writes the session
 * and a sample of ids to `load/.session.json` (git-ignored) for `load/rpc.k6.ts`.
 *
 *   bun run --filter @insyte/console build && cd apps/console && bunx vite preview --port 4300   (the console with the API)
 *   bun load/prepare.ts
 *
 * Refuses any origin but localhost: a deployed stage is load-tested only when Ishak says so, by hand.
 */
import { writeFileSync } from "node:fs"

const BASE = process.env["INSYTE_URL"] ?? "http://localhost:4300"
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) {
  console.error(`load/prepare: ${BASE} is not local; the load test's data is written to the local stack only.`)
  process.exit(1)
}

const STORES = 10
const ORDERS = 300
const PRODUCTS = 80
const CUSTOMERS = 200
const PASSWORD = "een-lang-wachtwoord"

const post = (path: string, body: unknown, cookie = "") =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
    body: JSON.stringify(body)
  })

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

let id = 0
/** One console RPC over the wire the console uses (NDJSON), and its value; a failure throws with its cause. */
const rpc = async <A = unknown>(tag: string, payload: unknown, cookie: string): Promise<A> => {
  const response = await fetch(`${BASE}/api/rpc/v1`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/ndjson", cookie },
    body: `${JSON.stringify({ _tag: "Request", id: String(id++), tag, payload, headers: [] })}\n`
  })
  const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l))
  const exit = (lines.flat() as Array<{ _tag: string; exit?: { _tag: string; value: A } }>)
    .find((m) => m._tag === "Exit")?.exit
  if (exit?._tag !== "Success") throw new Error(`${tag}: ${JSON.stringify(exit ?? lines)}`)
  return exit.value
}

const run = Date.now().toString(36)
const email = `load-${run}@example.com`
const signedUp = await post("/api/auth/sign-up/email", { name: "Lars Load", email, password: PASSWORD })
if (!signedUp.ok) throw new Error(`sign-up: ${signedUp.status} ${await signedUp.text()}`)
const { mails } = await (await fetch(`${BASE}/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
  mails: Array<{ url: string }>
}
const verify = new URL(mails[0]!.url)
await fetch(`${BASE}${verify.pathname}${verify.search}`, { redirect: "manual" })
const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password: PASSWORD }))

await rpc("Onboarding.advance", { step: "role", persona: "admin" }, cookie)
await rpc(
  "Onboarding.advance",
  { step: "organization", name: `Load ${run}`, slug: `load-${run}`, country: "NL", teamSize: "2-5" },
  cookie
)
await rpc("Onboarding.advance", { step: "plan", plan: "growth", cycle: "monthly" }, cookie)
await rpc("Onboarding.advance", { step: "store", choice: "later" }, cookie)
await rpc("Onboarding.advance", { step: "ready" }, cookie)
const me = await rpc<{ principals: Array<{ workspaceId: string }> }>("Session.me", null, cookie)
const workspace = me.principals[0]!.workspaceId

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const BASE_TIME = Date.parse("2026-11-09T08:00:00.000Z")
const at = (i: number) => new Date(BASE_TIME + i * 97_000).toISOString()
const order = (s: number, i: number) => ({
  shopify_id: `gid://shopify/Order/L${s}x${i}`,
  number: `#L${s}${String(i).padStart(4, "0")}`,
  customer_shopify_id: `gid://shopify/Customer/L${s}x${i % CUSTOMERS}`,
  customer_name: `Klant ${i % CUSTOMERS}`,
  customer_email: null,
  status: i % 5 === 0 ? "shipped" : "paid",
  payment_status: i % 17 === 0 ? "refunded" : "paid",
  fulfillment_status: i % 5 === 0 ? "fulfilled" : "unfulfilled",
  total_minor: 1500 + (i % 23) * 350,
  subtotal_minor: 1500 + (i % 23) * 350,
  shipping_minor: 495,
  tax_minor: 0,
  discounts_minor: 0,
  currency: "EUR",
  payment_gateway: "ideal",
  card_last4: null,
  shipping_address: {
    name: `Klant ${i % CUSTOMERS}`,
    line1: `Dorpsstraat ${1 + (i % 90)}`,
    line2: null,
    city: i % 3 === 0 ? "Antwerpen" : "Utrecht",
    postcode: i % 3 === 0 ? "2000" : "3511 AB",
    region: null,
    country: i % 3 === 0 ? "BE" : "NL",
    phone: null
  },
  tags: i % 10 === 0 ? ["vip"] : [],
  note: null,
  channel: "web",
  referral_code: null,
  placed_at: at(i),
  paid_at: at(i),
  shipped_at: i % 5 === 0 ? at(i + 40) : null,
  cancelled_at: null,
  refunded_at: null,
  external_updated_at: at(i),
  raw: {}
})
const product = (s: number, i: number) => ({
  shopify_id: `gid://shopify/Product/L${s}x${i}`,
  title: `Artikel ${s}-${i}`,
  handle: `artikel-${s}-${i}`,
  description_html: "",
  status: i % 9 === 0 ? "draft" : "active",
  vendor: null,
  product_type: i % 3 === 0 ? "Tassen" : "Kleding",
  tags: [],
  images: [],
  shopify_created_at: null,
  external_updated_at: at(0),
  raw: {}
})
const variant = (s: number, i: number) => ({
  shopify_id: `gid://shopify/ProductVariant/L${s}x${i}`,
  product_shopify_id: `gid://shopify/Product/L${s}x${i}`,
  inventory_item_id: null,
  tracked: null,
  sku: `L${s}-${i}`,
  title: "Default",
  price_minor: 1995 + (i % 5) * 500,
  compare_at_minor: null,
  position: 1
})
const customer = (s: number, i: number) => ({
  shopify_id: `gid://shopify/Customer/L${s}x${i}`,
  email: `klant${s}-${i}@load.test`,
  name: `Klant ${i}`,
  phone: null,
  address: null,
  country: i % 3 === 0 ? "BE" : "NL",
  tags: [],
  orders_count: 1 + (i % 4),
  lifetime_value_minor: 2500 + (i % 11) * 900,
  currency: "EUR",
  marketing_consent: false,
  external_updated_at: at(0),
  raw: {}
})

for (let s = 0; s < STORES; s++) {
  const seeded = await fetch(
    `${BASE}/api/__dev/stores/seed?tag=load${s}&name=${encodeURIComponent(`Winkel ${s + 1}`)}`,
    {
      method: "POST",
      headers: { origin: BASE, cookie }
    }
  )
  const { storeId } = await seeded.json() as { storeId: string }
  const written = await post(`/api/__dev/facts/orders?workspace=${workspace}&store=${storeId}`, {
    batch: {
      orders: range(ORDERS).map((i) => order(s, i)),
      products: range(PRODUCTS).map((i) => product(s, i)),
      variants: range(PRODUCTS).map((i) => variant(s, i)),
      customers: range(CUSTOMERS).map((i) => customer(s, i))
    }
  })
  if (!written.ok) throw new Error(`store ${s}: ${written.status} ${await written.text()}`)
  console.log(`store ${s + 1} of ${STORES}: ${storeId}`)
}

const sample = async (tag: string) =>
  (await rpc<{ rows: Array<{ id: string }> }>(tag, { limit: 50 }, cookie)).rows.map((r) => r.id)
const session = {
  base: BASE,
  cookie,
  workspace,
  orders: await sample("Orders.list"),
  products: await sample("Products.list"),
  customers: await sample("Customers.list")
}
writeFileSync(new URL("./.session.json", import.meta.url), JSON.stringify(session, null, 2))
console.log(`load/.session.json: ${workspace}, ${STORES * ORDERS} orders, ${STORES * PRODUCTS} products`)
