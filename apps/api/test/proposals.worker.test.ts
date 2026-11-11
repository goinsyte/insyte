import { describe, expect, it } from "vitest"
import { failure, join, mailsAbout, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Plates and proposals on Start (step 12.2a, M10.2), against Shopify's recorded twin. A return in review inside the
 * policy gets a plate; filing it approves the return as the person and the row settles; Undo puts the return back and a
 * fresh plate is drawn. A role that may see returns but not approve them is refused. "Negeren" sets the plate aside
 * with the row, and Undo brings both back; drawing again adds a revision; a return approved elsewhere supersedes its
 * plate. A quality check sent in gets a plate whose confidence rests on the supplier's record, read through /v1.
 *
 * Step 12.2b: a delayed order's plate is the shopper's delay mail, which leaves once the undo window has passed (Undo
 * calls it off); one that does not go puts the row back with "Opnieuw proberen". A sold-out variant's plate opens a
 * reorder ticket on the filer, with Undo. A plate past its deadline expires and is not drawn again.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const undo = async (cookie: string, token: string | undefined) =>
  ok(await rpc("Shared.undo", { token: token! }, cookie))

const send = async (method: string, path: string, token: string, key?: string) => {
  const response = await call(`${HOST}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(key === undefined ? {} : { "idempotency-key": key }) }
  })
  return { status: response.status, body: await response.json() as Json }
}

const startReturn = async (cookie: string, workspace: string) => {
  // The twin's orders were delivered on 7 October: a 60-day window keeps #1002 inside the policy.
  const settings = ok(await rpc("Returns.settings", undefined, cookie))
  ok(await rpc("Returns.setSettings", { ...settings, returnDays: 60 }, cookie))
  const order = ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.find((o) => o.number === "#1002")!
  const line = ok(await rpc("Orders.get", { id: order.id }, cookie)).lines[0]!
  const started = ok(
    await rpc("Returns.start", {
      orderId: order.id,
      lines: [{ lineId: line.id, qty: 1 }],
      reasonId: "too_small",
      requested: "refund"
    }, cookie)
  ).returns[0]!
  await relay(workspace)
  return { started, line }
}

/** The workspace's undo compensations, as the dev route reads them (without the hashes). */
const undoOf = async (workspace: string) =>
  ((await (await call(`http://api.test/api/__dev/undo?workspace=${workspace}`)).json()) as {
    tokens: Array<{ command: string; compensation: unknown; used: boolean }>
  }).tokens

const refresh = (workspace: string) =>
  call(`http://api.test/api/__dev/queue/refresh?workspace=${workspace}`, { method: "POST" })

const rowFor = async (cookie: string, subjectId: string) =>
  ok(await rpc("Queue.list", { tab: "all" }, cookie)).rows.find((r) => r.subjectId === subjectId)

describe("plates and proposals", () => {
  it("draws a return's plate, files it as the person with Undo, and refuses a role that may not approve", async () => {
    const store = await importedStore("pp-life")
    const { started, line } = await startReturn(store.cookie, store.workspace)

    const row = (await rowFor(store.cookie, started.id))!
    expect(row.proposal).toMatchObject({
      number: started.number,
      state: "open",
      action: { _tag: "ApproveReturn", returnId: started.id },
      revisions: 1,
      plate: {
        heading: `Retour ${started.number} goedkeuren`,
        before: { label: "Zoals het record nu is" },
        after: { label: "Zoals getekend", value: expect.stringContaining("Goedgekeurd · terugbetalen") },
        fileLabel: "Goedkeuren zoals getekend",
        confidence: 0.92,
        confidenceWord: "Hoog",
        confidenceBasis: "eerste retour van deze klant in 90 dagen",
        witness: row.storeName
      }
    })
    expect(row.proposal!.plate.before.value).toContain("In beoordeling · 1 artikel")
    expect(row.proposal!.plate.body).toContain("binnen de termijn van 60 dagen")
    expect(row.proposalId).toBe(row.proposal!.id)
    const drawn = ok(await rpc("Queue.list", { tab: "drawn" }, store.cookie))
    expect(drawn.counts.drawn).toBe(1)
    expect(drawn.rows.map((r) => r.id)).toEqual([row.id])
    expect(ok(await rpc("Proposals.get", { id: row.proposal!.id }, store.cookie))).toEqual(row.proposal)

    // Financiën sees returns but may not approve them: the plate is theirs to read, not to file.
    const email = `pp-finance-${run}@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "finance", stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const finance = await join(email)
    expect((await rowFor(finance, started.id))?.proposal?.id).toBe(row.proposal!.id)
    expect(failure(await rpc("Proposals.file", { id: row.proposal!.id }, finance))).toMatchObject({
      _tag: "Forbidden"
    })
    expect(ok(await rpc("Returns.get", { id: started.id }, store.cookie)).record.status).toBe("review")

    // Filed: the return is approved as the person, the row settles on the same call.
    const filed = ok(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))
    expect(filed.proposal).toMatchObject({ state: "executed", filedAt: expect.any(Number) })
    expect(ok(await rpc("Returns.get", { id: started.id }, store.cookie)).record.status).toBe("awaiting_parcel")
    expect(await rowFor(store.cookie, started.id)).toBeUndefined()
    expect(failure(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))).toMatchObject({
      _tag: "ProposalClosed",
      state: "executed"
    })

    // The filing's Undo keeps the approval's own token only by its hash: no row holds a token that could be redeemed.
    const restore = (await undoOf(store.workspace)).findLast((t) => t.command === "proposals.restore")!
    expect(restore.compensation).toEqual({
      kind: "filed",
      id: row.proposal!.id,
      innerHash: expect.stringMatching(/^[0-9a-f]{64}$/)
    })
    expect(JSON.stringify(await undoOf(store.workspace))).not.toContain("und_")

    // Undo: the return back in review, the proposal reverted, and the row back with a fresh plate. Both tokens are spent.
    await undo(store.cookie, filed.undo?.token)
    expect(ok(await rpc("Returns.get", { id: started.id }, store.cookie)).record.status).toBe("review")
    expect(ok(await rpc("Proposals.get", { id: row.proposal!.id }, store.cookie)).state).toBe("reverted")
    // The filing's two tokens, the approval's and the filing's own, issued last on its transaction.
    expect((await undoOf(store.workspace)).slice(-2)).toMatchObject([
      { command: "returns.restore", used: true },
      { command: "proposals.restore", used: true }
    ])
    expect(failure(await rpc("Shared.undo", { token: filed.undo!.token }, store.cookie))).toMatchObject({
      _tag: "Conflict"
    })
    const back = (await rowFor(store.cookie, started.id))!
    expect(back.proposal).toMatchObject({ state: "open", action: { returnId: started.id } })
    expect(back.proposal!.id).not.toBe(row.proposal!.id)

    // "Negeren": the row seen and its plate set aside; Undo brings both back.
    const seen = ok(await rpc("Queue.markSeen", { id: back.id }, store.cookie))
    expect(seen.row).toMatchObject({ state: "seen", proposal: null })
    expect(ok(await rpc("Proposals.get", { id: back.proposal!.id }, store.cookie)).state).toBe("discarded")
    expect(ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).counts.drawn).toBe(0)
    await undo(store.cookie, seen.undo?.token)
    expect((await rowFor(store.cookie, started.id))?.proposal?.id).toBe(back.proposal!.id)

    // Drawn again: a new revision of the same plate.
    const redrawn = ok(await rpc("Proposals.redraw", { id: back.proposal!.id }, store.cookie))
    expect(redrawn.proposal).toMatchObject({ revisions: 2, plate: { revision: 2 } })

    // Approved elsewhere: the plate is superseded with its row.
    ok(await rpc("Returns.approve", { ids: [started.id] }, store.cookie))
    await relay(store.workspace)
    expect(await rowFor(store.cookie, started.id)).toBeUndefined()
    expect(ok(await rpc("Proposals.get", { id: back.proposal!.id }, store.cookie)).state).toBe("superseded")
    expect(line.unitPriceMinor).toBeGreaterThan(0)
  })

  it("draws a quality check's plate from the supplier's record, and reads it through /v1, where a key without quality.approve is refused", async () => {
    const store = await importedStore("pp-quality")
    const linen = ok(await rpc("Products.list", {}, store.cookie)).rows.find((p) => p.title === "Linnen overhemd")!
    const { checkId } = ok(
      await rpc("Quality.request", {
        productId: linen.id,
        kind: "batch",
        variants: ["M"],
        deliverables: ["photos"],
        dueAt: Date.now() + 4 * 86_400_000,
        note: "Foto's van de nieuwe batch"
      }, store.cookie)
    )
    const { path } = ok(await rpc("Quality.link", { id: checkId! }, store.cookie))
    const token = decodeURIComponent(new URL(path, "http://console").searchParams.get("k")!)
    const uploaded = await call("http://api.test/api/quality/media", {
      method: "PUT",
      headers: { "content-type": "image/png", "x-check-token": token, "x-file-name": "naad.png" },
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    })
    const { id: fileId } = await uploaded.json() as { id: string }
    ok(await rpc("QualityLink.submit", { token, fileIds: [fileId], by: "Marco" }))
    await relay(store.workspace)

    const row = (await rowFor(store.cookie, checkId!))!
    expect(row.proposal).toMatchObject({
      action: { _tag: "ApproveQualityCheck", checkId },
      plate: {
        heading: "Kwaliteitscontrole Linnen overhemd goedkeuren",
        confidence: 0.5,
        confidenceWord: "Redelijk",
        confidenceBasis: "eerste controle van Atelier Noord",
        before: { value: "Ingestuurd · partij · 1 foto" }
      }
    })

    const secret = ok(
      await rpc("ApiKeys.create", {
        label: "Kwaliteit",
        access: { kind: "role", roleId: "admin" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const queue = await send("GET", "/queue?tab=all", secret)
    expect(queue.status).toBe(200)
    const item = queue.body.data.find((r: Json) => r.subject_id === checkId)
    expect(item.proposal).toMatchObject({
      id: row.proposal!.id,
      action: { kind: "approve_quality_check", subject_id: checkId },
      confidence: 0.5,
      confidence_basis: "eerste controle van Atelier Noord"
    })
    expect(await send("GET", `/proposals/${row.proposal!.id}`, secret)).toMatchObject({
      status: 200,
      body: { state: "open", heading: "Kwaliteitscontrole Linnen overhemd goedkeuren" }
    })
    // A key holds no quality.approve: filing runs the command as the key, and the command refuses it.
    expect(await send("POST", `/proposals/${row.proposal!.id}/file`, secret, crypto.randomUUID())).toMatchObject({
      status: 403,
      body: { error: { code: "ScopeMissingV1", scope: "quality.approve" } }
    })
    ok(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))
    expect(await send("POST", `/proposals/${row.proposal!.id}/file`, secret, crypto.randomUUID())).toMatchObject({
      status: 409,
      body: { error: { code: "ConflictV1", reason: "closed" } }
    })
    expect(ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).checks[0]).toMatchObject({
      status: "approved"
    })
    expect(await rowFor(store.cookie, checkId!)).toBeUndefined()
  })
})

describe("plates that send or open something (12.2b)", () => {
  it("draws a delayed order's mail, sends it once its undo window has passed, and offers to try again when it does not go", async () => {
    const store = await importedStore("pp-delay")
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1003")!
    // #1003's parcel has not moved since 5 October: the tracking sweep delays it, and the queue draws its plate.
    await call(`http://api.test/api/__dev/tracking/sweep?workspace=${store.workspace}`, { method: "POST" })
    await relay(store.workspace)

    const row = (await rowFor(store.cookie, order.id))!
    expect(row).toMatchObject({ kind: "order_delayed", state: "open" })
    // The recorded shop's shoppers are `klant{n}@example.com`; the plate names the one it mails.
    const email = /Mail aan (\S+):/.exec(row.proposal?.plate.after.value ?? "")?.[1] ?? ""
    expect(email).toMatch(/^klant\d+@example\.com$/)
    expect(row.proposal).toMatchObject({
      number: "#1003",
      state: "open",
      action: { _tag: "NotifyDelayedOrder", orderId: order.id, subject: "Je bestelling #1003 is later dan verwacht" },
      plate: {
        heading: "Klant van #1003 op de hoogte brengen",
        before: { value: expect.stringContaining("Vertraagd · klant nog niet ingelicht") },
        after: { value: expect.stringContaining(`Mail aan ${email}: "Je bestelling #1003 is later dan verwacht"`) },
        fileLabel: "Versturen zoals getekend",
        confidenceBasis: "nog geen nieuwe leverdatum bekend",
        confidenceWord: "Goed"
      },
      executionError: null
    })
    const action = row.proposal!.action as { paragraphs: ReadonlyArray<string> }
    expect(action.paragraphs[1]).toContain("We weten nog niet precies wanneer hij bij je is")

    // Filed: the mail waits out the undo window, the row is decided by the filer, and Undo calls the mail off.
    const filed = ok(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))
    expect(filed.proposal).toMatchObject({ state: "filed", executedAt: null })
    expect(await rowFor(store.cookie, order.id)).toMatchObject({ state: "seen", proposal: null })
    const mailEvent = (await outboxOf(store.workspace)).findLast((e) => e.event === "order.delay_mail")!
    expect(mailEvent).toMatchObject({ due: false, relayedAt: null })
    await undo(store.cookie, filed.undo?.token)
    expect(ok(await rpc("Proposals.get", { id: row.proposal!.id }, store.cookie)).state).toBe("reverted")
    expect((await outboxOf(store.workspace)).find((e) => e.id === mailEvent.id)?.cancelled).toBe(true)
    const back = (await rowFor(store.cookie, order.id))!
    expect(back).toMatchObject({ state: "open", proposal: { state: "open" } })
    expect(back.proposal!.id).not.toBe(row.proposal!.id)

    // The address bounces: the mail does not go, the row is back with the plate, which says why and tries again.
    await call(`http://api.test/api/__dev/mail/refuse?reference=${order.id}`, { method: "POST" })
    ok(await rpc("Proposals.file", { id: back.proposal!.id }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const failed = (await rowFor(store.cookie, order.id))!
    expect(failed).toMatchObject({
      state: "open",
      proposal: {
        id: back.proposal!.id,
        state: "execution_failed",
        executionError: "het adres weigert de mail",
        plate: {
          fileLabel: "Opnieuw proberen",
          body: expect.stringMatching(/^Dit ging niet: het adres weigert de mail\./)
        }
      }
    })
    expect(await mailsAbout(email, order.id)).toEqual([])

    // Tried again once the address takes mail: it goes, once, in the store's name.
    await call(`http://api.test/api/__dev/mail/refuse?reference=${order.id}&off=1`, { method: "POST" })
    expect(ok(await rpc("Proposals.file", { id: back.proposal!.id }, store.cookie)).proposal.state).toBe("filed")
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(ok(await rpc("Proposals.get", { id: back.proposal!.id }, store.cookie))).toMatchObject({
      state: "executed",
      executedAt: expect.any(Number),
      executionError: null
    })
    const mails = await mailsAbout(email, order.id)
    expect(mails).toMatchObject([{ kind: "order.delayed", sender: expect.any(String) }])
    // Told: the row stays decided and no plate is drawn for it again.
    await refresh(store.workspace)
    expect(await rowFor(store.cookie, order.id)).toMatchObject({ state: "seen", proposal: null })
    expect(failure(await rpc("Proposals.file", { id: back.proposal!.id }, store.cookie))).toMatchObject({
      _tag: "ProposalClosed",
      state: "executed"
    })
  })

  it("draws a reorder ticket for a sold-out variant, opens it on the filer with Undo, and lets a plate past its deadline expire", async () => {
    const store = await importedStore("pp-stock", "upd")
    const level = await call("http://api.public.test/hooks/shopify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "inventory_levels/update",
        "x-shopify-shop-domain": store.shop,
        "x-shopify-webhook-id": `pp-${run}-1`,
        "x-shopify-hmac-sha256": "valid"
      },
      body: JSON.stringify({ inventory_item_id: 11, location_id: 900, available: 0 })
    })
    expect(level.status).toBe(200)
    let row: Awaited<ReturnType<typeof rowFor>>
    for (let i = 0; i < 50 && row?.proposal == null; i++) {
      await refresh(store.workspace)
      row = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.find((r) => r.kind === "stock_out")
      if (row?.proposal == null) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(row!.proposal).toMatchObject({
      number: "Linnen overhemd · M",
      action: { _tag: "CreateSupplierTicket", productId: row!.subjectId },
      plate: { fileLabel: "Ticket openen zoals getekend", witness: row!.storeName }
    })
    const plate = row!.proposal!
    expect(plate.plate.heading).toMatch(/^Linnen overhemd · M bijbestellen/)
    const action = plate.action as { title: string }

    // Through /v1, the action is a kind and the product it reorders.
    const secret = ok(
      await rpc("ApiKeys.create", {
        label: "Voorraad",
        access: { kind: "role", roleId: "admin" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    expect(await send("GET", `/proposals/${plate.id}`, secret)).toMatchObject({
      status: 200,
      body: {
        state: "open",
        action: { kind: "create_supplier_ticket", subject_id: row!.subjectId },
        file_label: "Ticket openen zoals getekend",
        execution_error: null
      }
    })

    // Filed: a high ticket on the filer, labelled for the supply chain; the row is decided, and Undo takes it all back.
    const filed = ok(await rpc("Proposals.file", { id: plate.id }, store.cookie))
    expect(filed.proposal.state).toBe("executed")
    const ticket = ok(await rpc("Tickets.list", {}, store.cookie)).rows.find((t) => t.title === action.title)
    expect(ticket).toMatchObject({ priority: "high", source: "insyte", labels: ["Leveringsketen"] })
    expect(ticket!.assignees).toHaveLength(1)
    expect(await rowFor(store.cookie, row!.subjectId)).toMatchObject({ state: "seen" })
    await undo(store.cookie, filed.undo?.token)
    expect(ok(await rpc("Tickets.list", {}, store.cookie)).rows.find((t) => t.title === action.title)).toBeUndefined()
    const again = (await rowFor(store.cookie, row!.subjectId))!
    expect(again).toMatchObject({ state: "open", proposal: { state: "open" } })

    // Past its deadline: the refresh lets it expire, and it is not drawn again for the row.
    await call(`http://api.test/api/__dev/proposals/lapse?workspace=${store.workspace}&id=${again.proposal!.id}`, {
      method: "POST"
    })
    await refresh(store.workspace)
    expect(ok(await rpc("Proposals.get", { id: again.proposal!.id }, store.cookie)).state).toBe("expired")
    expect(await rowFor(store.cookie, row!.subjectId)).toMatchObject({ state: "open", proposal: null })
  })
})
