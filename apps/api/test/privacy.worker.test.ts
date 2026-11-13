import { unzip } from "@insyte/modules/privacy/domain/Archive"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Je gegevens (M17 step 5, PLAN 48). What the workspace holds, counted, with where and who reaches it; the full export
 * made by its run as one ZIP of CSV and JSON per table, with every row the workspace's own and none of its secrets;
 * a shopper's access package and erasure; deleting the workspace, stopped during the wait and purged after it. The
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
    const inventory = ok(await rpc("Privacy.inventory", undefined, store.cookie))
    const held = Object.fromEntries(inventory.categories.map((c) => [c.id, c.count]))
    expect(manifest.counts["orders"]).toBe(held["orders"])
    expect(manifest.counts["products"]).toBe(held["products"])
    expect(manifest.counts["connection_credentials"]).toBeUndefined()

    for (const [part, n] of Object.entries(manifest.counts)) {
      const rows = JSON.parse(entries.get(`json/${part}.json`)!) as Array<Record<string, unknown>>
      expect(rows, part).toHaveLength(n)
      // A CSV has the table's columns in its header; a table with no rows has none to name.
      const csv = entries.get(`csv/${part}.csv`)!
      if (n === 0) expect(csv.trim(), part).toBe("")
      else expect(csv.split("\r\n")[0]!.split(","), part).toEqual(expect.arrayContaining(Object.keys(rows[0]!)))
      for (const r of rows) {
        if ("workspace_id" in r) expect(r["workspace_id"], part).toBe(store.workspace)
        for (const column of Object.keys(r)) expect(column, part).not.toMatch(/(_hash$|sealed|^reply_token$)/)
      }
    }
  })

  it("makes a shopper's package, and erases a shopper", async () => {
    const shopper = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows.find((c) => c.email !== null)!
    expect(failure(await rpc("Privacy.requestAccess", { email: "niemand@example.test" }, store.cookie)))
      .toMatchObject({ _tag: "ShopperNotFound" })

    const { id } = await made(
      store.workspace,
      async () => ok(await rpc("Privacy.requestAccess", { email: shopper.email! }, store.cookie))
    )
    const asked = ok(await rpc("Privacy.requests", undefined, store.cookie)).shoppers.find((r) => r.id === id)!
    expect(asked).toMatchObject({ kind: "access", source: "operator", state: "ready" })
    const entries = await entriesOf((await download(asked.fileId!, store.cookie)).bytes)
    const customers = JSON.parse(entries.get("json/customers.json")!) as Array<{ id: string; email: string }>
    expect(customers.map((c) => c.id)).toEqual([shopper.id])

    const erased = ok(await rpc("Privacy.requestErasure", { email: shopper.email! }, store.cookie))
    const after = ok(await rpc("Privacy.requests", undefined, store.cookie)).shoppers.find((r) => r.id === erased.id)!
    expect(after).toMatchObject({ kind: "erasure", state: "done" })
    // Gone from Klanten; their orders stay, without their name and address.
    expect(failure(await rpc("Customers.get", { id: shopper.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Privacy.requestAccess", { email: shopper.email! }, store.cookie))).toMatchObject({
      _tag: "ShopperNotFound"
    })
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
    expect(ok(await rpc("Privacy.requests", undefined, store.cookie)).deletion).toMatchObject({ id: first.id })
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

    expect(ok(await sessionMe(store.cookie)).principals).toEqual([])
    expect(ok(await rpc("Privacy.inventory", undefined, other.cookie)).categories).toEqual(before)
  })
})
