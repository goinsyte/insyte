import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The Data hub (M14 step 5): a CSV uploaded, read on the jobs Worker, previewed, imported with Undo and removed with
 * Undo; the imported file and the store's orders exported by the `ExportWorkflow` into a file the member who asked
 * downloads, with a notification; what each role may do; and a key reading the metadata through `/v1` and MCP.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const encoder = new TextEncoder()

const put = (cookie: string, name: string, text: string, type = "text/csv") => {
  const bytes = encoder.encode(text)
  return call("http://api.test/api/data/imports", {
    method: "PUT",
    headers: {
      cookie,
      "content-type": type,
      "content-length": String(bytes.byteLength),
      "x-file-name": encodeURIComponent(name)
    },
    body: bytes
  })
}

const CSV = "﻿Naam;E-mail;Bedrag\r\nJan;jan@voorbeeld.test;12,50\r\n\"de Vries; P.\";piet@voorbeeld.test;8\r\n"

/** Uploads the CSV and makes it an import, running its read on the jobs Worker to the end. */
const imported = async (store: { cookie: string; workspace: string }, name = "klanten.csv", text = CSV) => {
  const uploaded = await put(store.cookie, name, text)
  expect(uploaded.status).toBe(201)
  const { fileId } = await uploaded.json() as { fileId: string }
  await using parses = await introspectWorkflow(env.IMPORT_PARSE)
  const file = ok(await rpc("Data.imports.upload", { fileId }, store.cookie))
  expect(file).toMatchObject({ fileName: name, state: "uploaded" })
  await relay(store.workspace)
  const [parse] = await parses.get()
  await parse!.waitForStatus("complete")
  return file.id
}

/** Asks for an export and runs its Workflow to the end. */
const exported = async (
  store: { cookie: string; workspace: string },
  ask: Parameters<typeof rpc<"Data.export">>[1]
) => {
  await using runs = await introspectWorkflow(env.EXPORT)
  const asked = ok(await rpc("Data.export", ask, store.cookie))
  expect(asked).toMatchObject({ state: "queued", fileUrl: null })
  await relay(store.workspace)
  const [instance] = await runs.get()
  await instance!.waitForStatus("complete")
  return ok(await rpc("Data.exports.get", { exportId: asked.id }, store.cookie))
}

describe("the Data hub", () => {
  it("reads an uploaded CSV, imports it with Undo and removes it with Undo", async () => {
    const store = await importedStore("data")
    const before = ok(await rpc("Data.overview", undefined, store.cookie))
    expect(before).toMatchObject({ imports: 0, importedRows: 0, stores: { connected: 1, total: 1 } })
    expect(before.orders).toBeGreaterThan(0)

    // What is not a CSV is refused at the door; so is a file without a declared size.
    expect((await put(store.cookie, "foto.png", "\u0000PNG", "image/png")).status).toBe(415)
    const unsized = await call("http://api.test/api/data/imports", {
      method: "PUT",
      headers: { cookie: store.cookie, "content-type": "text/csv", "x-file-name": "x.csv" },
      body: new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode("a\n1\n"))
          c.close()
        }
      }),
      // @ts-expect-error a streamed body in workerd
      duplex: "half"
    })
    expect(unsized.status).toBe(411)
    expect((await put("", "x.csv", "a\n1\n")).status).toBe(401)

    const id = await imported(store)
    const preview = ok(await rpc("Data.imports.preview", { importId: id }, store.cookie))
    expect(preview.import).toMatchObject({ state: "parsed", header: ["Naam", "E-mail", "Bedrag"], rowCount: 2 })
    expect(preview.firstRows).toEqual([["Jan", "jan@voorbeeld.test", "12,50"], [
      "de Vries; P.",
      "piet@voorbeeld.test",
      "8"
    ]])
    // Not in Tabel's counts until it is imported.
    expect(ok(await rpc("Data.overview", undefined, store.cookie))).toMatchObject({ imports: 0, importedRows: 0 })

    const committed = ok(await rpc("Data.imports.commit", { importId: id }, store.cookie))
    expect(committed.import.state).toBe("done")
    expect(committed.undo).not.toBeNull()
    expect(failure(await rpc("Data.imports.commit", { importId: id }, store.cookie)))
      .toMatchObject({ _tag: "ImportNotReady", state: "done" })
    expect(ok(await rpc("Data.overview", undefined, store.cookie))).toMatchObject({ imports: 1, importedRows: 2 })
    expect(ok(await rpc("Data.imports.rows", { importId: id, q: "vries" }, store.cookie)))
      .toEqual({ rows: [["de Vries; P.", "piet@voorbeeld.test", "8"]], total: 1, next: null })

    // Undo of the import takes it out again; Data.imports.restore puts it back.
    ok(await rpc("Shared.undo", { token: committed.undo!.token }, store.cookie))
    expect(ok(await rpc("Data.imports.list", undefined, store.cookie)).rows).toEqual([])
    ok(await rpc("Data.imports.restore", { importId: id }, store.cookie))
    expect(ok(await rpc("Data.imports.list", undefined, store.cookie)).rows.map((r) => r.id)).toEqual([id])

    // Removing it comes with Undo.
    const removed = ok(await rpc("Data.imports.remove", { importId: id }, store.cookie))
    expect(removed.undo).not.toBeNull()
    expect(failure(await rpc("Data.imports.preview", { importId: id }, store.cookie)))
      .toMatchObject({ _tag: "ImportNotFound" })
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, store.cookie))
    expect(ok(await rpc("Data.imports.preview", { importId: id }, store.cookie)).import.state).toBe("done")

    // A file cancelled before it is imported is gone with its file, nothing to undo.
    const other = await imported(store, "leeg.csv", "a,b\n1,2\n")
    expect(ok(await rpc("Data.imports.remove", { importId: other }, store.cookie)).undo).toBeNull()
    expect(failure(await rpc("Data.imports.preview", { importId: other }, store.cookie)))
      .toMatchObject({ _tag: "ImportNotFound" })

    // A file that cannot be read says why, with its line.
    const broken = await imported(store, "kapot.csv", "a,b\n1,\"open\n2,3\n")
    expect(ok(await rpc("Data.imports.preview", { importId: broken }, store.cookie)).import)
      .toMatchObject({ state: "failed", error: "parse_failed", errorLine: 2 })
  }, 180_000)

  it("exports the orders and an imported file into a file the member who asked downloads", async () => {
    const store = await importedStore("data-export")
    const unknown = failure(
      await rpc("Data.export", { source: "orders", columns: ["number", "secret"] }, store.cookie)
    )
    expect(unknown).toMatchObject({ _tag: "UnknownColumn", column: "secret" })

    const orders = await exported(store, { source: "orders", columns: ["number", "customer", "total"] })
    expect(orders).toMatchObject({ state: "ready", source: "orders" })
    expect(orders.fileName).toMatch(/^bestellingen-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(orders.rowsWritten).toBe(ok(await rpc("Data.overview", undefined, store.cookie)).orders)
    expect(orders.expiresAt! - orders.finishedAt!).toBe(7 * 24 * 60 * 60 * 1000)
    expect(orders.fileUrl).toMatch(/^\/api\/files\/fil_/)

    const file = await call(`http://api.test${orders.fileUrl}`, { headers: { cookie: store.cookie } })
    expect(file.status).toBe(200)
    expect(file.headers.get("content-type")).toContain("text/csv")
    expect(file.headers.get("content-disposition")).toContain("attachment")
    const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(await file.arrayBuffer())
    const lines = text.split("\r\n")
    expect(lines[0]).toBe("﻿Bestelling;Klant;Totaal")
    expect(lines.slice(1).filter((l) => l !== "")).toHaveLength(orders.rowsWritten)
    expect(text).toContain("#1001;")
    expect((await call(`http://api.test${orders.fileUrl}`)).status).toBe(401)

    // The member hears it is ready.
    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.find((n) => n.kind === "data.export")).toMatchObject({
      subjectType: "export",
      subjectId: orders.id,
      data: { state: "ready", rows: orders.rowsWritten }
    })

    // An imported file exports with the columns asked, in their order.
    const id = await imported(store)
    expect(failure(await rpc("Data.export", { source: { import: id }, columns: ["0"] }, store.cookie)))
      .toMatchObject({ _tag: "ImportNotReady" })
    ok(await rpc("Data.imports.commit", { importId: id }, store.cookie))
    expect(failure(await rpc("Data.export", { source: { import: id }, columns: ["3"] }, store.cookie)))
      .toMatchObject({ _tag: "UnknownColumn", column: "3" })
    const subset = await exported(store, { source: { import: id }, columns: ["2", "0"] })
    expect(subset).toMatchObject({ state: "ready", fileName: "klanten-export.csv", rowsWritten: 2 })
    const body = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(
      await (await call(`http://api.test${subset.fileUrl}`, { headers: { cookie: store.cookie } })).arrayBuffer()
    )
    expect(body).toBe("﻿Bedrag;Naam\r\n12,50;Jan\r\n8;\"de Vries; P.\"\r\n")

    const mine = ok(await rpc("Data.exports.list", {}, store.cookie)).rows
    expect(mine.map((r) => r.id)).toEqual([subset.id, orders.id])
  }, 180_000)

  it("lets each role do what it may, and a key read the metadata", async () => {
    const store = await importedStore("data-roles")
    const colleagues = (["view", "finance"] as const).map((role) => ({
      role,
      email: `data-${run}-${role}@invited.test`
    }))
    ok(
      await rpc("Invitations.send", {
        rows: colleagues.map((c) => ({ email: c.email, roleId: c.role, stores: "all" as const }))
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const view = await join(colleagues[0]!.email)
    const finance = await join(colleagues[1]!.email)

    // Alleen lezen sees the hub and brings nothing in or out.
    expect(ok(await rpc("Data.overview", undefined, view)).orders).toBeGreaterThan(0)
    expect((await put(view, "x.csv", "a\n1\n")).status).toBe(403)
    expect(failure(await rpc("Data.export", { source: "orders", columns: ["number"] }, view)))
      .toMatchObject({ _tag: "Forbidden", permission: "data.export" })

    // Financiën may export; the owner's file is not theirs to download.
    const ownersExport = await exported(store, { source: "orders", columns: ["number"] })
    const theirs = ok(await rpc("Data.exports.get", { exportId: ownersExport.id }, finance))
    expect(theirs).toMatchObject({ state: "ready", fileUrl: null })
    expect((await call(`http://api.test${ownersExport.fileUrl}`, { headers: { cookie: finance } })).status).toBe(404)
    expect(ok(await rpc("Data.exports.list", {}, finance)).rows).toEqual([])
    const financeExport = await exported({ cookie: finance, workspace: store.workspace }, {
      source: "orders",
      columns: ["number", "total"]
    })
    expect(financeExport.fileUrl).not.toBeNull()

    // A key with Alleen lezen reads the imports and every export, never a download link.
    const token = ok(
      await rpc("ApiKeys.create", {
        label: "Rapportage",
        access: { kind: "role", roleId: "view" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const get = async (path: string) => {
      const response = await call(`http://api.public.test/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
      return { status: response.status, body: await response.json() as Json }
    }
    expect(await get("/imports")).toEqual({ status: 200, body: { data: [] } })
    const listed = await get("/exports")
    expect(listed.status).toBe(200)
    expect(listed.body.data.map((e: Json) => e.id)).toEqual([financeExport.id, ownersExport.id])
    expect(listed.body.data[0]).not.toHaveProperty("file_url")
    expect(await get(`/exports/${ownersExport.id}`)).toMatchObject({
      status: 200,
      body: { id: ownersExport.id, source: "orders", state: "ready", rows_written: ownersExport.rowsWritten }
    })
    expect((await get("/exports/exp_none")).status).toBe(404)
  }, 240_000)
})
