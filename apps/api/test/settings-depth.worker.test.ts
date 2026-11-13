import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Settings depth on the server (M17 step 20.1b), through the Worker: a new workspace reads every section's defaults at
 * version 0; a save writes the next version with an audit line per changed field, a save over an older version is a
 * conflict, a bad link or OSS number names its field, and Undo writes the previous value back; a read-only colleague
 * reads but does not save. Retention counts before it erases: erasing goes on only after the saved periods were
 * counted, the nightly erase is due at 03:00 in the workspace's timezone and takes exactly what the count found, once.
 */

const deliver = async (to: string, raw: string) =>
  (await (await call("http://api.test/api/__dev/mail/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, raw })
  })).json()) as { threadId: string }

const mime = (lines: Record<string, string>, body: string) =>
  [...Object.entries(lines).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0", "", body].join("\r\n")

const dev = async (path: string, method = "POST") =>
  (await (await call(`http://api.test/api/__dev/retention/${path}`, { method })).json()) as Record<string, unknown>

const amsterdamHour = (d: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit" }).format(d))

/** Today's 03:00 in Amsterdam, as an instant. */
const threeAm = () => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date())
  return [new Date(`${day}T01:00:00Z`), new Date(`${day}T02:00:00Z`)].find((d) => amsterdamHour(d) === 3)!
}

const changesOf = async (workspace: string) =>
  (await outboxOf(workspace)).filter((e) => e.event === "records.changed" && e.payload["kind"] === "workspace_settings")

describe("settings depth", () => {
  let owner = ""
  let viewer = ""
  let workspace = ""

  beforeAll(async () => {
    const o = await person("depth-owner", "Diepte B.V.")
    owner = o.cookie
    workspace = ok(await sessionMe(owner)).principals[0]!.workspaceId
    const email = `depth-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "view", stores: "all" }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    viewer = await join(email)
  }, 120_000)

  it("reads every section's defaults at version 0", async () => {
    const shipping = ok(await rpc("WorkspaceSettings.get", { section: "shipping" }, owner))
    expect(shipping).toMatchObject({ section: "shipping", version: 0, updatedAt: null })
    if (shipping.section !== "shipping") throw new Error("shipping")
    expect(shipping.value.statuses.map((s) => s.id)).toEqual([
      "info",
      "supplier",
      "country",
      "local",
      "noinfo",
      "transit",
      "pickup",
      "out",
      "failed",
      "exception",
      "stale",
      "delivered"
    ])
    expect(ok(await rpc("WorkspaceSettings.get", { section: "links" }, owner))).toMatchObject({
      value: { review: "", unsubscribe: "", restock: "" },
      version: 0
    })
    expect(ok(await rpc("WorkspaceSettings.get", { section: "brand" }, owner))).toMatchObject({
      value: { logoFileId: null, color: "#1F3A5F", font: "Systeem", sender: "Diepte B.V.", widget: "right" },
      logoUrl: null
    })
    expect(ok(await rpc("WorkspaceSettings.get", { section: "vat" }, owner))).toMatchObject({
      value: { stores: [], oss: false, ossNumber: "" },
      stores: []
    })
    expect(ok(await rpc("WorkspaceSettings.get", { section: "retention" }, owner))).toMatchObject({
      state: { erasing: false, lastCount: null }
    })
    expect(ok(await rpc("Shipping.statusCounts", undefined, owner))).toMatchObject({ transit: 0, delivered: 0 })
    expect(ok(await rpc("Templates.linkUsage", undefined, owner))).toEqual({ review: 0, unsubscribe: 0, restock: 0 })
  })

  it("saves a section as its next version, a line per changed field, and refuses a stale one", async () => {
    const before = (await changesOf(workspace)).length
    const saved = ok(
      await rpc("WorkspaceSettings.save", {
        section: "links",
        value: { review: " https://diepte.nl/review ", unsubscribe: "", restock: "https://diepte.nl/terug" },
        baseVersion: 0
      }, owner)
    )
    expect(saved.section).toMatchObject({
      version: 1,
      value: { review: "https://diepte.nl/review", unsubscribe: "", restock: "https://diepte.nl/terug" }
    })
    expect(saved.undo.token).toMatch(/^und_/)
    // Two fields changed: two audit lines, each a realtime change.
    expect((await changesOf(workspace)).length - before).toBe(2)
    expect(
      failure(
        await rpc("WorkspaceSettings.save", {
          section: "links",
          value: { review: "", unsubscribe: "", restock: "" },
          baseVersion: 0
        }, owner)
      )
    ).toMatchObject({ _tag: "Conflict", reason: "stale_version" })
    expect(
      failure(
        await rpc("WorkspaceSettings.save", {
          section: "links",
          value: { review: "http://diepte.nl", unsubscribe: "", restock: "" },
          baseVersion: 1
        }, owner)
      )
    ).toMatchObject({ _tag: "Invalid", fields: { review: "format" } })
  })

  it("takes a save back with Undo, as a version of its own", async () => {
    const current = ok(await rpc("WorkspaceSettings.get", { section: "shipping" }, owner))
    if (current.section !== "shipping") throw new Error("shipping")
    const statuses = current.value.statuses.map((s) => s.id === "local" ? { ...s, label: "Bij {vervoerder}" } : s)
    const saved = ok(
      await rpc("WorkspaceSettings.save", { section: "shipping", value: { statuses }, baseVersion: 0 }, owner)
    )
    expect(saved.section.version).toBe(1)
    ok(await rpc("Shared.undo", { token: saved.undo.token }, owner))
    const back = ok(await rpc("WorkspaceSettings.get", { section: "shipping" }, owner))
    if (back.section !== "shipping") throw new Error("shipping")
    expect(back.version).toBe(2)
    expect(back.value.statuses.find((s) => s.id === "local")?.label).toBe("Onderweg met {vervoerder}")
    expect(
      failure(
        await rpc("WorkspaceSettings.save", {
          section: "shipping",
          value: { statuses: statuses.map((s) => ({ ...s, label: s.id === "out" ? " " : s.label })) },
          baseVersion: 2
        }, owner)
      )
    ).toMatchObject({ _tag: "Invalid", fields: { "statuses.out.label": "required" } })
  })

  it("checks Btw and Huisstijl on the server", async () => {
    expect(
      failure(
        await rpc("WorkspaceSettings.save", {
          section: "vat",
          value: {
            stores: [{ storeId: "sto_none", currency: "EUR", vatOnShipping: true, refundInclVat: true }],
            oss: true,
            ossNumber: "NL12"
          },
          baseVersion: 0
        }, owner)
      )
    ).toMatchObject({ _tag: "Invalid", fields: { "stores.sto_none": "unknown", ossNumber: "format" } })
    const vat = ok(
      await rpc("WorkspaceSettings.save", {
        section: "vat",
        value: { stores: [], oss: true, ossNumber: "nl 123456789 b01" },
        baseVersion: 0
      }, owner)
    )
    expect(vat.section.value).toMatchObject({ oss: true, ossNumber: "NL123456789B01" })
    expect(
      failure(await rpc("Brand.uploadLogo", { name: "logo.txt", mime: "text/plain", data: "eA==" }, owner))
    ).toMatchObject({ _tag: "Invalid", fields: { logo: "mime" } })
    // A one-pixel PNG.
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    const logo = ok(await rpc("Brand.uploadLogo", { name: "logo.png", mime: "image/png", data: png }, owner))
    const brand = ok(await rpc("WorkspaceSettings.get", { section: "brand" }, owner))
    if (brand.section !== "brand") throw new Error("brand")
    expect(
      failure(
        await rpc("WorkspaceSettings.save", {
          section: "brand",
          value: { ...brand.value, logoFileId: "fil_none" },
          baseVersion: 0
        }, owner)
      )
    ).toMatchObject({ _tag: "Invalid", fields: { logoFileId: "unknown" } })
    const saved = ok(
      await rpc("WorkspaceSettings.save", {
        section: "brand",
        value: { ...brand.value, logoFileId: logo.fileId, color: "#0a2540", support: "hulp@diepte.nl" },
        baseVersion: 0
      }, owner)
    )
    expect(saved.section).toMatchObject({ logoUrl: logo.url, value: { color: "#0A2540" } })
    const served = await call(`http://api.test${logo.url}`, { headers: { cookie: owner } })
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("image/png")
    expect(served.headers.get("content-security-policy")).toContain("sandbox")
  })

  it("lets a read-only colleague read the pages and count, never save or switch", async () => {
    expect(ok(await rpc("WorkspaceSettings.get", { section: "links" }, viewer)).version).toBe(1)
    expect(
      failure(
        await rpc("WorkspaceSettings.save", {
          section: "links",
          value: { review: "", unsubscribe: "", restock: "" },
          baseVersion: 1
        }, viewer)
      )
    ).toMatchObject({ _tag: "Forbidden", permission: "settings", level: 2 })
    expect(failure(await rpc("Retention.setErasing", { on: false }, viewer))).toMatchObject({ _tag: "Forbidden" })
  })

  it("counts, then erases at night exactly what the count found, once", async () => {
    const box = ok(
      await rpc("Mailboxes.connect", { provider: "forward", address: "support@diepte.nl", label: "Diepte" }, owner)
    )
    const thread = async (n: number) =>
      (await deliver(
        box.forwardingAddress!,
        mime({
          From: `klant-${n}-${run}@voorbeeld.nl`,
          To: "support@diepte.nl",
          Subject: `Vraag ${n}`,
          "Message-ID": `<diepte-${n}-${run}@voorbeeld.nl>`,
          "Content-Type": "text/plain; charset=utf-8"
        }, "Hoi")
      )).threadId
    const old = await thread(1)
    const recent = await thread(2)
    await dev(`age?workspace=${workspace}&thread=${old}&days=800`)

    const saved = ok(await rpc("WorkspaceSettings.get", { section: "retention" }, owner))
    if (saved.section !== "retention") throw new Error("retention")
    ok(
      await rpc("WorkspaceSettings.save", {
        section: "retention",
        value: { classes: saved.value.classes.map((c) => c.id === "contact" ? { ...c, months: 12 } : c) },
        baseVersion: saved.version
      }, owner)
    )
    // Not counted yet: erasing stays off.
    expect(failure(await rpc("Retention.setErasing", { on: true }, owner))).toMatchObject({ _tag: "NotCounted" })
    // A count of other periods (the page's draft) does not count for the saved ones.
    const draft = ok(await rpc("Retention.count", { classes: [{ id: "contact", months: 24 }] }, owner))
    expect(draft.perClass["contact"]).toBe(1)
    expect(failure(await rpc("Retention.setErasing", { on: true }, owner))).toMatchObject({ _tag: "NotCounted" })
    const counted = ok(await rpc("Retention.count", {}, viewer))
    expect(counted).toMatchObject({ total: 1, perClass: { contact: 1, uploads: 0, logs: 0 } })

    const on = ok(await rpc("Retention.setErasing", { on: true }, owner))
    expect(on.state).toMatchObject({ erasing: true, lastCount: { total: 1 } })
    expect((await dev(`due?at=${threeAm().toISOString()}`, "GET"))["workspaces"]).toContain(workspace)
    expect((await dev(`due?at=${new Date(threeAm().getTime() + 3_600_000).toISOString()}`, "GET"))["workspaces"])
      .not.toContain(workspace)

    const erased = (await dev(`erase?workspace=${workspace}`))["erased"] as { perClass: Record<string, number> }
    expect(erased.perClass).toEqual(counted.perClass)
    const left = ok(await rpc("Threads.list", {}, owner)).rows.map((t) => t.id)
    expect(left).toContain(recent)
    expect(left).not.toContain(old)
    // Once a night: the run is recorded, so the sweep's later quarters pass this workspace by.
    expect((await dev(`due?at=${threeAm().toISOString()}`, "GET"))["workspaces"]).not.toContain(workspace)

    // Off again, with Undo putting it back on.
    const off = ok(await rpc("Retention.setErasing", { on: false }, owner))
    expect(off.state.erasing).toBe(false)
    ok(await rpc("Shared.undo", { token: off.undo.token }, owner))
    const back = ok(await rpc("WorkspaceSettings.get", { section: "retention" }, owner))
    expect(back.section === "retention" && back.state.erasing).toBe(true)
  })
})
