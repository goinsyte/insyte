import { unzip } from "@insyte/modules/privacy/domain/Archive"
import { EXCLUDED } from "@insyte/modules/privacy/use-cases/exports"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Je gegevens (M17 step 5, PLAN 48). What the workspace holds, counted, with where and who reaches it; the full export
 * made by its run a page at a time as one ZIP of CSV and JSON per table, holding every table the database has for the
 * workspace (or one left out with a reason), every row the workspace's own and none of its secrets; the daily sweep's
 * scheduled export made once, and a file past its 7 days gone; a shopper's access package, and an erasure that leaves
 * the shopper nowhere in the workspace; deleting the workspace, stopped during the wait and purged after it. The
 * export, its schedule and the deletion are the owner's alone; a colleague is refused.
 */

/** The owner's alone: refused naming `owner`, which no role can be given. */
const owner = { _tag: "Forbidden", permission: "owner", roleLabel: "Beheerder" }

const download = async (fileId: string, cookie: string) => {
  const response = await call(`http://api.test/api/files/${fileId}`, { headers: { cookie } })
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) }
}

const entriesOf = async (bytes: Uint8Array) => {
  const decoder = new TextDecoder()
  return new Map((await unzip(bytes)).map((e) => [e.name, decoder.decode(e.bytes)]))
}

/** Every page of a part, in order: `json/orders.json`, `json/orders-0002.json`, … */
const rowsOf = (entries: Map<string, string>, part: string) =>
  [...entries.keys()].filter((name) => name === `json/${part}.json` || name.startsWith(`json/${part}-`)).sort()
    .flatMap((name) => JSON.parse(entries.get(name)!) as Array<Record<string, unknown>>)

interface Census {
  readonly counts: Record<string, number>
  readonly found: ReadonlyArray<{ readonly table: string; readonly column: string }>
}

/** What the database holds for the workspace, by table; with `find`, where that text is. */
const census = async (workspace: string, find = ""): Promise<Census> =>
  (await (await call(
    `http://api.test/api/__dev/privacy/census?workspace=${workspace}&find=${encodeURIComponent(find)}`
  )).json()) as Census

const dev = async (path: string) => (await call(`http://api.test/api/__dev/privacy/${path}`, { method: "POST" })).json()

/** A request made, and its run, started by the relay delivering it, watched to its end. */
const made = async <A>(workspace: string, ask: () => Promise<A>): Promise<A> => {
  await using workflows = await introspectWorkflow(env.PRIVACY_EXPORT)
  const asked = await ask()
  await relay(workspace)
  const [instance] = await workflows.get()
  expect(instance).toBeDefined()
  await instance!.waitForStatus("complete")
  return asked
}

describe("Je gegevens", () => {
  let store = { cookie: "", workspace: "", shop: "", storeId: "" }
  let admin = ""
  let other = { cookie: "", workspace: "" }

  beforeAll(async () => {
    store = { ...(await importedStore("privacy", "priv")) }
    const email = `priv-${run}-admin@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: "all" as const }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    admin = await join(email)
    const elsewhere = await importedStore("privacy-other", "privo")
    other = { cookie: elsewhere.cookie, workspace: elsewhere.workspace }
  }, 240_000)

  it("counts what the workspace holds, says where it is, and who reaches it", async () => {
    const inventory = ok(await rpc("Privacy.inventory", undefined, store.cookie))
    const count = Object.fromEntries(inventory.categories.map((c) => [c.id, c.count]))
    expect(count["customers"]).toBeGreaterThan(0)
    expect(count["orders"]).toBeGreaterThan(0)
    expect(count["products"]).toBeGreaterThan(0)
    expect(count["team"]).toBe(2)
    expect(inventory.places.length).toBeGreaterThan(0)
    expect(inventory.subProcessors.map((s) => s.name)).toContain("Neon")
    expect(inventory.roles.find((r) => r.id === "owner")).toMatchObject({ members: 1, customers: 3, exports: true })
    expect(inventory.roles.find((r) => r.id === "admin")).toMatchObject({ members: 1 })

    const requests = ok(await rpc("Privacy.requests", undefined, store.cookie))
    expect(requests).toMatchObject({ schedule: "off", exports: [], deletion: null, owner: true })
    expect(ok(await rpc("Privacy.requests", undefined, admin)).owner).toBe(false)
  })

  it("leaves the export, its schedule and the deletion to the owner", async () => {
    expect(failure(await rpc("Workspaces.requestExport", undefined, admin))).toMatchObject(owner)
    expect(failure(await rpc("Privacy.setExportSchedule", { schedule: "weekly" }, admin))).toMatchObject(owner)
    expect(failure(await rpc("Workspaces.requestDeletion", { confirmName: "x" }, admin))).toMatchObject(owner)
    expect(failure(await rpc("Workspaces.cancelDeletion", undefined, admin))).toMatchObject(owner)
    expect(ok(await rpc("Privacy.setExportSchedule", { schedule: "monthly" }, store.cookie))).toEqual({
      schedule: "monthly"
    })
    expect(ok(await rpc("Privacy.requests", undefined, store.cookie)).schedule).toBe("monthly")
  })

  it("exports every table as CSV and JSON, the workspace's rows only, without secrets", async () => {
    const { id } = await made(store.workspace, async () => {
      const asked = ok(await rpc("Workspaces.requestExport", undefined, store.cookie))
      expect(ok(await rpc("Privacy.requests", undefined, store.cookie)).exports[0]).toMatchObject({
        id: asked.id,
        state: "open",
        fileId: null
      })
      return asked
    })

    const row = ok(await rpc("Privacy.requests", undefined, store.cookie)).exports.find((e) => e.id === id)!
    expect(row).toMatchObject({ state: "ready", source: "operator" })
    expect(row.fileId).not.toBeNull()
    expect(row.sizeBytes).toBeGreaterThan(0)

    // Only the owner downloads it; another workspace does not even see it is there.
    expect((await download(row.fileId!, admin)).status).toBe(404)
    expect((await download(row.fileId!, other.cookie)).status).toBe(404)
    const file = await download(row.fileId!, store.cookie)
    expect(file.status).toBe(200)

    const entries = await entriesOf(file.bytes)
    expect(entries.has("LEESMIJ.txt")).toBe(true)
    const manifest = JSON.parse(entries.get("manifest.json")!) as { counts: Record<string, number> }
    expect(manifest.counts["connection_credentials"]).toBeUndefined()
    // The tests read pages of three rows: a table of more is in parts.
    expect(manifest.counts["orders"]).toBeGreaterThan(3)
    expect(entries.has("json/orders-0002.json")).toBe(true)

    // Every table the database holds for the workspace is in it, or left out with a reason; with all its rows (the
    // log and the files have the export's own since).
    const held = await census(store.workspace)
    for (const [table, n] of Object.entries(held.counts)) {
      // A person's own onboarding answers: theirs, not the workspace's (its policy shows them to that person only).
      if (table === "onboarding_progress") continue
      if (table in EXCLUDED) {
        expect(manifest.counts[table], table).toBeUndefined()
        continue
      }
      expect(manifest.counts[table], table).toBeDefined()
      if (table === "audit_events" || table === "files" || table === "notifications" || table === "gdpr_requests") {
        expect(manifest.counts[table], table).toBeLessThanOrEqual(n)
      } else expect(manifest.counts[table], table).toBe(n)
    }

    for (const [part, n] of Object.entries(manifest.counts)) {
      const rows = rowsOf(entries, part)
      expect(rows, part).toHaveLength(n)
      // A CSV has the table's columns in its header; a table with no rows has none to name.
      const csv = entries.get(`csv/${part}.csv`)!
      if (n === 0) expect(csv.trim(), part).toBe("")
      else expect(csv.split("\r\n")[0]!.split(","), part).toEqual(expect.arrayContaining(Object.keys(rows[0]!)))
      expect(new Set(rows.map((r) => JSON.stringify(r))).size, part).toBe(n)
      for (const r of rows) {
        if ("workspace_id" in r) expect(r["workspace_id"], part).toBe(store.workspace)
        for (const column of Object.keys(r)) expect(column, part).not.toMatch(/(_hash$|sealed|^reply_token$)/)
      }
    }
    for (const text of entries.values()) expect(text).not.toMatch(/"sealed"|"token_hash"/)
  })

  it("makes a scheduled export once however often the sweep runs, and removes a file after its 7 days", async () => {
    // The schedule is monthly (above); the export made by hand was, say, 40 days ago.
    const byHand = ok(await rpc("Privacy.requests", undefined, store.cookie)).exports[0]!
    expect(await dev(`age?workspace=${store.workspace}&request=${byHand.id}&days=40`)).toEqual({ aged: 1 })
    await using workflows = await introspectWorkflow(env.PRIVACY_EXPORT)
    await dev("sweep")
    await dev("sweep")
    await relay(store.workspace)
    const scheduled = ok(await rpc("Privacy.requests", undefined, store.cookie)).exports.filter((e) =>
      e.source === "insyte"
    )
    expect(scheduled).toHaveLength(1)
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    const ready = ok(await rpc("Privacy.requests", undefined, store.cookie)).exports.find((e) =>
      e.id === scheduled[0]!.id
    )!
    expect(ready).toMatchObject({ state: "ready" })
    expect((await download(ready.fileId!, store.cookie)).status).toBe(200)
    // The one made by hand is past its 7 days: the sweep took it out of the bucket.
    expect((await env.FILES.list({ prefix: `${store.workspace}/privacy/${byHand.id}/` })).objects).toEqual([])

    // Eight days on: the link has lapsed, and the sweep removes the file.
    expect(await dev(`age?workspace=${store.workspace}&request=${ready.id}&days=8`)).toEqual({ aged: 1 })
    expect((await download(ready.fileId!, store.cookie)).status).toBe(404)
    await dev("sweep")
    const after = ok(await rpc("Privacy.requests", undefined, store.cookie)).exports.find((e) => e.id === ready.id)!
    expect(after.fileId).toBeNull()
    expect((await env.FILES.list({ prefix: `${store.workspace}/privacy/${ready.id}/` })).objects).toEqual([])
  })

  it("makes a shopper's package, and erases them from everything the workspace holds", async () => {
    const shopper = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows.find((c) =>
      c.email !== null && c.name.length >= 5
    )!
    const email = shopper.email!
    expect(failure(await rpc("Privacy.requestAccess", { email: "niemand@example.test" }, store.cookie)))
      .toMatchObject({ _tag: "ShopperNotFound" })

    const { id } = await made(
      store.workspace,
      async () => ok(await rpc("Privacy.requestAccess", { email }, store.cookie))
    )
    const asked = ok(await rpc("Privacy.requests", undefined, store.cookie)).shoppers.find((r) => r.id === id)!
    expect(asked).toMatchObject({ kind: "access", source: "operator", state: "ready", subject: email })
    const entries = await entriesOf((await download(asked.fileId!, store.cookie)).bytes)
    const customers = JSON.parse(entries.get("json/customers.json")!) as Array<{ id: string; email: string }>
    expect(customers.map((c) => c.id)).toEqual([shopper.id])
    expect(rowsOf(entries, "orders").length).toBeGreaterThan(0)

    // Where else the shopper turns up: a note on their order, a ticket and its comment, the team's chat, a mail.
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) =>
      o.customerId === shopper.id
    )!
    ok(await rpc("Orders.setNote", { id: order.id, body: `Bel ${shopper.name} terug, ${email}` }, store.cookie))
    const ticket = ok(
      await rpc("Tickets.create", {
        title: `Vraag van ${shopper.name}`,
        description: `Antwoord naar ${email}`,
        related: { type: "customer", id: shopper.id }
      }, store.cookie)
    ).tickets[0]!
    ok(await rpc("Tickets.comment", { id: ticket.id, body: `${shopper.name} belde nog (${email})` }, store.cookie))
    const general = ok(await rpc("Chats.list", undefined, store.cookie)).conversations[0]!.id
    ok(await rpc("Chats.send", { conversationId: general, body: `Wie helpt ${shopper.name}? ${email}` }, store.cookie))
    const box = ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: `support-${run}@privacy.test`, label: "Support" },
        store.cookie
      )
    )
    const delivered = await call("http://api.test/api/__dev/mail/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: box.forwardingAddress,
        raw: [
          `From: "${shopper.name}" <${email}>`,
          `To: support-${run}@privacy.test`,
          "Subject: Mijn bestelling",
          `Message-ID: <wissen-${run}@privacy.test>`,
          "Date: Tue, 10 Nov 2026 09:00:00 +0100",
          "Content-Type: text/plain; charset=utf-8",
          "MIME-Version: 1.0",
          "",
          `Hoi, waar blijft mijn pakket? Groet, ${shopper.name}`
        ].join("\r\n")
      })
    })
    expect(delivered.status).toBe(200)
    // Insyte AI's draft for their ticket (0074), which names them.
    const draft = ok(await rpc("Drafts.reply", { subject: { type: "ticket", id: ticket.id } }, store.cookie))
    expect(draft.text).toContain(shopper.name)
    // A CSV brought into the Data hub with them in it (0073), and an export of the orders that holds them.
    const csv = new TextEncoder().encode(
      `Naam;E-mail\r\n${shopper.name};${email}\r\nIemand anders;ander@voorbeeld.test\r\n`
    )
    const uploaded = await call("http://api.test/api/data/imports", {
      method: "PUT",
      headers: {
        cookie: store.cookie,
        "content-type": "text/csv",
        "content-length": String(csv.byteLength),
        "x-file-name": "klanten.csv"
      },
      body: csv
    })
    expect(uploaded.status).toBe(201)
    const { fileId: csvFile } = await uploaded.json() as { fileId: string }
    {
      await using parses = await introspectWorkflow(env.IMPORT_PARSE)
      expect(ok(await rpc("Data.imports.upload", { fileId: csvFile }, store.cookie)).state).toBe("uploaded")
      await relay(store.workspace)
      const [parse] = await parses.get()
      await parse!.waitForStatus("complete")
    }
    const imports = `${store.workspace}/imports/${csvFile}.csv`
    expect(await env.FILES.head(imports)).not.toBeNull()
    let ordersExport = ""
    {
      await using runs = await introspectWorkflow(env.EXPORT)
      ordersExport = ok(await rpc("Data.export", { source: "orders", columns: ["number", "customer"] }, store.cookie))
        .id
      await relay(store.workspace)
      const [instance] = await runs.get()
      await instance!.waitForStatus("complete")
    }
    const exported = ok(await rpc("Data.exports.get", { exportId: ordersExport }, store.cookie))
    expect(exported.state).toBe("ready")
    const fileOf = async () => (await call(`http://api.test${exported.fileUrl}`, { headers: { cookie: store.cookie } }))
    expect((await fileOf()).status).toBe(200)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await census(store.workspace, email)).found.length).toBeGreaterThan(3)

    // Asked again, the package holds the draft and the imported row as well.
    const again = await made(
      store.workspace,
      async () => ok(await rpc("Privacy.requestAccess", { email }, store.cookie))
    )
    const second = ok(await rpc("Privacy.requests", undefined, store.cookie)).shoppers.find((r) => r.id === again.id)!
    const more = await entriesOf((await download(second.fileId!, store.cookie)).bytes)
    expect(rowsOf(more, "drafts").map((d) => d["id"])).toContain(draft.id)
    expect(rowsOf(more, "import_rows").map((r) => r["cells"])).toEqual([[shopper.name, email]])

    const erased = ok(await rpc("Privacy.requestErasure", { email }, store.cookie))
    const after = ok(await rpc("Privacy.requests", undefined, store.cookie)).shoppers
    expect(after.find((r) => r.id === erased.id)).toMatchObject({ kind: "erasure", state: "done" })
    // The earlier package no longer names them, and is gone.
    expect(after.find((r) => r.id === id)).toMatchObject({ fileId: null })
    expect(after.find((r) => r.id === id)!.subject).not.toBe(email)
    expect((await download(asked.fileId!, store.cookie)).status).toBe(404)
    expect((await download(second.fileId!, store.cookie)).status).toBe(404)
    // The CSV as uploaded is gone from the bucket, and the export that held them can no longer be downloaded.
    expect(await env.FILES.head(imports)).toBeNull()
    expect((await fileOf()).status).toBe(404)
    // Gone from Klanten; their orders stay, without their name and address.
    expect(failure(await rpc("Customers.get", { id: shopper.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Privacy.requestAccess", { email }, store.cookie))).toMatchObject({
      _tag: "ShopperNotFound"
    })
    // And nowhere else in the workspace: no table, no column, the log and the outbox included.
    expect((await census(store.workspace, email)).found).toEqual([])
    expect((await census(store.workspace, shopper.name)).found).toEqual([])
  })

  it("holds a shopper's requests to the stores the asker reaches, a member's own included", async () => {
    // A second store in the workspace, with the same shoppers (the recorded shop is the same), and a colleague held to it.
    await using backfills = await introspectWorkflow(env.SHOPIFY_BACKFILL)
    await backfills.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const shop = `priv-second-${run}.myshopify.com`
    const { authorizeUrl } = ok(await rpc("Stores.beginConnect", { shopDomain: shop, returnPath: "/" }, store.cookie))
    const state = new URL(authorizeUrl).searchParams.get("state")!
    const landed = await call(
      `http://api.test/api/connect/shopify/callback?${new URLSearchParams({
        code: "abc",
        shop,
        state,
        hmac: "valid"
      })}`,
      { headers: { cookie: store.cookie }, redirect: "manual" }
    )
    const second = new URL(landed.headers.get("location")!, "http://console").searchParams.get("store")!
    await relay(store.workspace)
    for (const instance of await backfills.get()) await instance.waitForStatus("complete")
    const email = `priv-${run}-scoped@invited.test`
    // And one who may change the settings but not see customers.
    const created = ok(await rpc("Roles.create", { label: "Instellingen", from: null }, store.cookie))
    const role = created.roles.roles.find((r) => r.id === created.id)!
    ok(
      await rpc("Roles.update", {
        id: created.id,
        levels: { ...role.levels, settings: 2, customers: 0 },
        specials: role.specials,
        refundLimit: null,
        stores: "all"
      }, store.cookie)
    )
    const settingsOnly = `priv-${run}-settings@invited.test`
    ok(
      await rpc("Invitations.send", {
        rows: [{ email, roleId: "admin", stores: [second] }, { email: settingsOnly, roleId: created.id, stores: "all" }]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const scoped = await join(email)
    const settings = await join(settingsOnly)
    const hidden = ok(await rpc("Privacy.requests", undefined, settings))
    expect(hidden.shoppersHidden).toBe(true)
    expect(hidden.shoppers.length).toBeGreaterThan(0)
    for (const r of hidden.shoppers) expect(r.subject).toBeNull()

    const everyone = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows
    const here = everyone.find((c) => c.storeId === store.storeId && c.email !== null && c.name.length >= 5)!
    const there = everyone.find((c) => c.storeId === second && c.email === here.email)!
    expect(there).toBeDefined()

    // The colleague's package holds the second store's shopper only.
    const { id } = await made(
      store.workspace,
      async () => ok(await rpc("Privacy.requestAccess", { email: here.email! }, scoped))
    )
    const asked = ok(await rpc("Privacy.requests", undefined, scoped)).shoppers.find((r) => r.id === id)!
    const entries = await entriesOf((await download(asked.fileId!, scoped)).bytes)
    expect((JSON.parse(entries.get("json/customers.json")!) as Array<{ id: string }>).map((c) => c.id)).toEqual([
      there.id
    ])
    for (const o of rowsOf(entries, "orders")) expect(o["store_id"]).toBe(second)
    // The owner, who reaches every store, may have it too.
    expect((await download(asked.fileId!, store.cookie)).status).toBe(200)

    // Their erasure erases the second store's shopper and leaves the first store's as it was.
    ok(await rpc("Privacy.requestErasure", { email: here.email! }, scoped))
    expect(failure(await rpc("Customers.get", { id: there.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Customers.get", { id: here.id }, store.cookie)).customer).toMatchObject({ email: here.email })
  })

  it("deletes the workspace only after the wait, and stops when asked", async () => {
    const name = ok(await rpc("Privacy.requests", undefined, store.cookie)).workspaceName
    expect(failure(await rpc("Workspaces.requestDeletion", { confirmName: "Verkeerd" }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { confirmName: "mismatch" } })

    // Asked and stopped: its run wakes to nothing.
    await using lifecycle = await introspectWorkflow(env.WORKSPACE_LIFECYCLE)
    await lifecycle.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const first = ok(await rpc("Workspaces.requestDeletion", { confirmName: name }, store.cookie))
    expect(failure(await rpc("Workspaces.requestDeletion", { confirmName: name }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "deletion_waiting"
    })
    expect(ok(await rpc("Privacy.requests", undefined, store.cookie)).deletion).toMatchObject({
      id: first.id,
      stoppable: true
    })
    // The workspace works as before while it waits.
    expect(ok(await sessionMe(store.cookie)).principals).toHaveLength(1)
    ok(await rpc("Workspaces.cancelDeletion", undefined, store.cookie))
    expect(ok(await rpc("Privacy.requests", undefined, store.cookie)).deletion).toBeNull()
    await relay(store.workspace)
    for (const instance of await lifecycle.get()) await instance.waitForStatus("complete")
    expect(ok(await rpc("Privacy.inventory", undefined, store.cookie)).categories.length).toBeGreaterThan(0)

    // Asked again and waited out: the workspace is gone, and the other one is untouched.
    const before = ok(await rpc("Privacy.inventory", undefined, other.cookie)).categories
    const second = ok(await rpc("Workspaces.requestDeletion", { confirmName: name }, store.cookie))
    expect(
      (await (await call(`http://api.test/api/__dev/privacy/deletion-due?workspace=${store.workspace}`, {
        method: "POST"
      })).json()) as { due: number }
    ).toEqual({ due: 1 })
    await relay(store.workspace)
    const runs = await lifecycle.get()
    expect(runs).toHaveLength(2)
    for (const instance of runs) await instance.waitForStatus("complete")
    expect(second.id).not.toBe(first.id)
    // Before the tokens went, each shop was asked to let go of Insyte: both of them.
    // (The first run was stopped before it got there, so it has no such step to wait for.)
    const results = await Promise.all(
      runs.map((r) =>
        Promise.race([
          r.waitForStepResult({ name: "revoke" }),
          new Promise((done) => setTimeout(() => done(null), 2000))
        ])
      )
    )
    expect(results.find(Array.isArray)).toEqual(expect.arrayContaining([{ provider: "shopify", count: 2 }]))

    expect(ok(await sessionMe(store.cookie)).principals).toEqual([])
    expect(ok(await rpc("Privacy.inventory", undefined, other.cookie)).categories).toEqual(before)
  })

  it("cannot be stopped once the purge has begun, and a purge that gave up is started again", async () => {
    const name = ok(await rpc("Privacy.requests", undefined, other.cookie)).workspaceName
    {
      // The purge fails every time it is tried: the run gives up with the request taken.
      await using lifecycle = await introspectWorkflow(env.WORKSPACE_LIFECYCLE)
      await lifecycle.modifyAll(async (m) => {
        await m.disableSleeps()
        await m.disableRetryDelays()
        await m.mockStepError({ name: "purge" }, new Error("de database antwoordt niet"))
      })
      ok(await rpc("Workspaces.requestDeletion", { confirmName: name }, other.cookie))
      await dev(`deletion-due?workspace=${other.workspace}`)
      await relay(other.workspace)
      for (const instance of await lifecycle.get()) await instance.waitForStatus("errored")
    }
    expect(ok(await rpc("Privacy.requests", undefined, other.cookie)).deletion).toMatchObject({ stoppable: false })
    expect(failure(await rpc("Workspaces.cancelDeletion", undefined, other.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "purging"
    })

    // An hour past its time, the daily sweep starts it again, as a run of its own, and this one purges.
    const deletion = ok(await rpc("Privacy.requests", undefined, other.cookie)).deletion!
    expect(await dev(`age?workspace=${other.workspace}&request=${deletion.id}&days=1`)).toEqual({ aged: 1 })
    await using again = await introspectWorkflow(env.WORKSPACE_LIFECYCLE)
    await dev("sweep")
    await relay(other.workspace)
    const [restarted] = await again.get()
    expect(restarted).toBeDefined()
    await restarted!.waitForStatus("complete")
    expect(ok(await sessionMe(other.cookie)).principals).toEqual([])
  })
})
