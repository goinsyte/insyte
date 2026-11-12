import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Chargebacks (M13 step 3, the evidence half of step 4): a case opened by hand, numbered `DSP-n`, counted in its tab and
 * in the workspace's record; its note with Undo; files uploaded through the session's route into its pack, removed and
 * put back with Undo, and reordered; accepting it as lost, which cannot be taken back and closes the pack. The deadline
 * reminders come once each, five days, two days and six hours out, as a timeline line and a note for the team, and the
 * case waits on Start's queue while it needs evidence.
 */

const DAY = 86_400_000
const HOST = "http://api.public.test"

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const v1 = async (path: string, token: string) => {
  const response = await call(`${HOST}/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: response.status, body: await response.json() as Json }
}

const tool = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { isError: message.result.isError as boolean, value: JSON.parse(message.result.content[0].text) as Json }
}

const upload = (cookie: string, chargebackId: string, type = "application/pdf", name = "pakbon.pdf") =>
  call(`http://api.test/api/chargebacks/${chargebackId}/evidence`, {
    method: "PUT",
    headers: { cookie, "content-type": type, "x-file-name": encodeURIComponent(name) },
    body: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])
  })

const remind = async (workspace: string, at: number) =>
  (await (await call(
    `http://api.test/api/__dev/chargebacks/remind?workspace=${workspace}&at=${new Date(at).toISOString()}`,
    { method: "POST" }
  )).json() as { outboxIds: Array<string> }).outboxIds

const manual = {
  provider: "stripe" as const,
  customer: { name: "Sanne de Vries" },
  amountMinor: 8_950,
  reasonCode: "not_received" as const
}

describe("chargebacks", () => {
  it("opens a case by hand as DSP-n, counts it, notes it with Undo and takes it back with Undo", async () => {
    const store = await importedStore("cb-life")
    const empty = ok(await rpc("Chargebacks.list", {}, store.cookie))
    expect(empty.rows).toEqual([])
    expect(empty.counts).toEqual({ all: 0, actionRequired: 0, submitted: 0, won: 0, lost: 0 })
    expect(empty.stats).toMatchObject({ open: 0, won: 0, decided: 0, wonPct: 0, recoveredMinor: 0 })

    const { caseNumber } = ok(await rpc("Chargebacks.nextCaseNumber", undefined, store.cookie))
    expect(caseNumber).toBe("DSP-1")
    expect(failure(await rpc("Chargebacks.createManual", { ...manual, customer: { name: "  " } }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { customer: "required" } })
    expect(failure(await rpc("Chargebacks.createManual", { ...manual, amountMinor: 0 }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { amount: "invalid" } })

    const before = Date.now()
    const made = ok(
      await rpc("Chargebacks.createManual", { ...manual, note: "Klant zegt niets ontvangen" }, store.cookie)
    )
    const created = made.chargebacks[0]!
    expect(created).toMatchObject({
      caseNumber: "DSP-1",
      provider: "stripe",
      fromProvider: false,
      status: "awaiting_evidence",
      reason: "item_not_received",
      reasonCode: "not_received",
      amountMinor: 8_950,
      customerName: "Sanne de Vries",
      note: "Klant zegt niets ontvangen",
      evidenceCount: 0
    })
    // Fourteen days to gather the evidence.
    expect(created.deadlineAt - before).toBeGreaterThanOrEqual(14 * DAY - 1_000)
    expect(created.deadlineAt - before).toBeLessThanOrEqual(14 * DAY + 60_000)
    expect(made.undo).not.toBeNull()
    // The number moved on; a typed one that is taken is refused.
    expect(ok(await rpc("Chargebacks.nextCaseNumber", undefined, store.cookie)).caseNumber).toBe("DSP-2")
    expect(failure(await rpc("Chargebacks.createManual", { ...manual, caseNumber: "dsp-1" }, store.cookie)))
      .toMatchObject({ _tag: "CaseNumberTaken", caseNumber: "dsp-1" })

    const listed = ok(await rpc("Chargebacks.list", { tab: "action_required" }, store.cookie))
    expect(listed.rows.map((r) => r.id)).toEqual([created.id])
    expect(listed.counts).toMatchObject({ all: 1, actionRequired: 1, lost: 0 })
    expect(listed.stats.open).toBe(1)
    expect(ok(await rpc("Chargebacks.list", { tab: "won" }, store.cookie)).rows).toEqual([])
    expect(ok(await rpc("Chargebacks.list", { q: "sanne" }, store.cookie)).rows).toHaveLength(1)
    expect(ok(await rpc("Chargebacks.list", { q: "niemand" }, store.cookie)).rows).toHaveLength(0)

    const noted = ok(
      await rpc("Chargebacks.setNote", { id: created.id, note: "Track & trace opgevraagd" }, store.cookie)
    )
    expect(noted.chargebacks[0]!.note).toBe("Track & trace opgevraagd")
    ok(await rpc("Shared.undo", { token: noted.undo!.token }, store.cookie))
    expect(ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).chargeback.note).toBe(
      "Klant zegt niets ontvangen"
    )

    const detail = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie))
    expect(detail.timeline.map((e) => e.kind)).toEqual(["opened"])
    expect(detail.evidence).toEqual([])

    // A case opened in error is taken back, and its number given again.
    const mistaken = ok(await rpc("Chargebacks.createManual", manual, store.cookie))
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, store.cookie))
    expect(failure(await rpc("Chargebacks.get", { id: mistaken.chargebacks[0]!.id }, store.cookie))).toMatchObject({
      _tag: "NotFound"
    })
  })

  it("takes files into the pack through the session's route, with Undo, in the team's order", async () => {
    const store = await importedStore("cb-pack")
    const created = ok(await rpc("Chargebacks.createManual", manual, store.cookie)).chargebacks[0]!

    expect((await upload(store.cookie, created.id, "application/x-msdownload")).status).toBe(415)
    expect((await upload("", created.id)).status).toBe(401)
    expect((await upload(store.cookie, "cb_none")).status).toBe(404)

    const first = await upload(store.cookie, created.id)
    expect(first.status).toBe(201)
    const pdf = await first.json() as { id: string; name: string; sizeBytes: number }
    expect(pdf).toMatchObject({ name: "pakbon.pdf", sizeBytes: 8 })
    const png = await (await upload(store.cookie, created.id, "image/png", "foto.png")).json() as { id: string }

    const added = ok(
      await rpc("Chargebacks.addEvidence", { chargebackId: created.id, fileIds: [pdf.id, png.id] }, store.cookie)
    )
    expect(added.chargebacks[0]!.evidenceCount).toBe(2)
    // A file is in a pack once.
    expect(
      ok(await rpc("Chargebacks.addEvidence", { chargebackId: created.id, fileIds: [pdf.id] }, store.cookie))
        .chargebacks[0]!.evidenceCount
    ).toBe(2)
    // Another case's file, or one that is not there, is not this case's.
    expect(
      failure(await rpc("Chargebacks.addEvidence", { chargebackId: created.id, fileIds: ["fil_none"] }, store.cookie))
    )
      .toMatchObject({ _tag: "NotFound" })

    const packed = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie))
    expect(packed.evidence.map((e) => [e.name, e.source, e.kind])).toEqual([
      ["pakbon.pdf", "upload", "upload"],
      ["foto.png", "upload", "upload"]
    ])
    // The file opens for whoever may see the case.
    const opened = await call(`http://api.test/api/files/${pdf.id}`, { headers: { cookie: store.cookie } })
    expect(opened.status).toBe(200)
    expect(opened.headers.get("content-type")).toBe("application/pdf")

    const [a, b] = packed.evidence
    ok(await rpc("Chargebacks.reorderEvidence", { chargebackId: created.id, itemIds: [b!.id, a!.id] }, store.cookie))
    expect(ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).evidence.map((e) => e.id)).toEqual([
      b!.id,
      a!.id
    ])
    expect(
      failure(await rpc("Chargebacks.reorderEvidence", { chargebackId: created.id, itemIds: [a!.id] }, store.cookie))
    )
      .toMatchObject({ _tag: "Invalid", fields: { itemIds: "every_item_once" } })

    const removed = ok(
      await rpc("Chargebacks.removeEvidence", { chargebackId: created.id, itemId: b!.id }, store.cookie)
    )
    expect(removed.chargebacks[0]!.evidenceCount).toBe(1)
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, store.cookie))
    const back = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie))
    expect(back.evidence.map((e) => e.id)).toEqual([b!.id, a!.id])
    expect(back.timeline.map((e) => e.kind)).toEqual(["opened", "evidence_added"])
  })

  it("accepts a case as lost without Undo, and a closed case takes nothing more", async () => {
    const store = await importedStore("cb-accept")
    const created = ok(await rpc("Chargebacks.createManual", manual, store.cookie)).chargebacks[0]!
    const accepted = ok(await rpc("Chargebacks.accept", { ids: [created.id] }, store.cookie))
    expect(accepted.undo).toBeNull()
    expect(accepted.chargebacks[0]).toMatchObject({ status: "lost" })
    expect(failure(await rpc("Chargebacks.accept", { ids: [created.id] }, store.cookie))).toMatchObject({
      _tag: "CaseClosed",
      status: "lost"
    })
    expect((await upload(store.cookie, created.id)).status).toBe(409)
    const list = ok(await rpc("Chargebacks.list", {}, store.cookie))
    expect(list.counts).toMatchObject({ actionRequired: 0, lost: 1 })
    expect(list.stats).toMatchObject({ open: 0, decided: 1, won: 0, wonPct: 0 })
    expect(ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).timeline.map((e) => e.kind)).toEqual([
      "opened",
      "accepted"
    ])
  })

  it("lets the service role work a case but not accept it, and keeps each workspace's cases its own", async () => {
    const store = await importedStore("cb-roles")
    const email = `cb-${run}-service@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const service = await join(email)
    const created = ok(await rpc("Chargebacks.createManual", manual, service)).chargebacks[0]!
    expect(failure(await rpc("Chargebacks.accept", { ids: [created.id] }, service))).toMatchObject({
      _tag: "Forbidden"
    })

    const other = await importedStore("cb-other")
    expect(failure(await rpc("Chargebacks.get", { id: created.id }, other.cookie))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Chargebacks.list", {}, other.cookie)).rows).toEqual([])
    expect((await upload(other.cookie, created.id)).status).toBe(404)
  })

  it("reminds the team once at five days, two days and six hours, and keeps the case on Start's queue", async () => {
    const store = await importedStore("cb-remind")
    const created = ok(await rpc("Chargebacks.createManual", manual, store.cookie)).chargebacks[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)

    const queued = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.find((r) =>
      r.subjectId === created.id
    )
    expect(queued).toMatchObject({ kind: "chargeback_deadline", valueMinor: 8_950 })
    expect(queued!.title).toContain(created.caseNumber)

    const deadline = created.deadlineAt
    // Not yet: more than five days out.
    expect(await remind(store.workspace, deadline - 6 * DAY)).toEqual([])
    expect(await remind(store.workspace, deadline - 5 * DAY + 60_000)).toHaveLength(1)
    // Once per offset.
    expect(await remind(store.workspace, deadline - 5 * DAY + 120_000)).toEqual([])
    expect(await remind(store.workspace, deadline - 2 * DAY + 60_000)).toHaveLength(1)
    expect(await remind(store.workspace, deadline - 6 * 3_600_000 + 60_000)).toHaveLength(1)
    expect(await remind(store.workspace, deadline - 3_600_000)).toEqual([])
    await relay(store.workspace)

    const timeline = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).timeline
    expect(timeline.filter((e) => e.kind === "deadline_reminder").map((e) => e.data["offset"])).toEqual([
      "5d",
      "2d",
      "6h"
    ])
    const me = ok(await sessionMe(store.cookie)).principals[0]!
    expect(me.workspaceId).toBe(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    const deadlines = notes.filter((n) => n.kind === "chargeback.deadline")
    expect(deadlines).toHaveLength(3)
    expect(deadlines[0]).toMatchObject({ subjectType: "chargeback", subjectId: created.id })

    // A lost case is reminded no more and leaves the queue.
    ok(await rpc("Chargebacks.accept", { ids: [created.id] }, store.cookie))
    await relay(store.workspace)
    const after = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.find((r) => r.subjectId === created.id)
    expect(after?.state ?? "resolved").toBe("resolved")
  })

  it("reads the cases through /v1 and MCP, as a key that may look", async () => {
    const store = await importedStore("cb-v1")
    const created = ok(await rpc("Chargebacks.createManual", manual, store.cookie)).chargebacks[0]!
    const viewer = ok(
      await rpc("ApiKeys.create", {
        label: "Alleen kijken",
        access: { kind: "role", roleId: "view" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret

    const page = await v1("/chargebacks?tab=action_required", viewer)
    expect(page.status).toBe(200)
    expect(page.body).toMatchObject({
      data: [{
        id: created.id,
        case_number: created.caseNumber,
        provider: "stripe",
        from_provider: false,
        status: "awaiting_evidence",
        amount: { amount_minor: 8_950 },
        customer: { name: "Sanne de Vries" },
        order: null,
        evidence_count: 0
      }],
      counts: { all: 1, action_required: 1 },
      stats: { open: 1, won_pct: 0 }
    })
    expect((await v1("/chargebacks?tab=won", viewer)).body.data).toEqual([])
    const one = await v1(`/chargebacks/${created.id}`, viewer)
    expect(one).toMatchObject({ status: 200, body: { id: created.id, evidence: [], timeline: [{ kind: "opened" }] } })
    expect((await v1("/chargebacks/cb_none", viewer)).status).toBe(404)

    const listed = await tool(viewer, "list_chargebacks", {})
    expect(listed.isError).toBe(false)
    expect(listed.value.data.map((c: { id: string }) => c.id)).toEqual([created.id])
    expect((await tool(viewer, "get_chargeback", { chargeback_id: created.id })).value).toMatchObject({
      case_number: created.caseNumber
    })
  })
})
