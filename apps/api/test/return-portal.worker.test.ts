import { describe, expect, it } from "vitest"
import { failure, ok, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The public returns portal (step 11.5, M9.3), against Shopify's recorded twin: #1001 is not delivered yet, #1002 was
 * delivered on 7 October (Klant 1, klant1@example.com). The shopper finds an order by its number and address, gets a
 * token that names that one order, and asks for a return or reports a problem; the team sees it in Te beoordelen and
 * hears of it. The windows are set wide, or narrow, so the tests do not depend on today's date.
 */

const portalOn = async (cookie: string, change: { returnDays?: number; claimDays?: number } = {}) => {
  const settings = ok(await rpc("Returns.settings", undefined, cookie))
  ok(
    await rpc("Returns.setSettings", {
      ...settings,
      returnDays: change.returnDays ?? 365,
      claimDays: change.claimDays ?? 365,
      portal: { ...settings.portal, on: true }
    }, cookie)
  )
  return settings.portal.handle
}

const photo = (token: string | null, init: { type?: string; bytes?: Uint8Array; length?: string } = {}) =>
  call("http://api.test/api/portal/photos", {
    method: "PUT",
    headers: {
      "content-type": init.type ?? "image/png",
      "x-file-name": encodeURIComponent("scheur in de naad.png"),
      ...(token === null ? {} : { "x-portal-token": token }),
      ...(init.length === undefined ? {} : { "content-length": init.length })
    },
    body: init.bytes ?? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  })

describe("returns portal", () => {
  it("finds an order by number and address, and puts the shopper's request in front of the team", async () => {
    const store = await importedStore("portal-life")
    expect(failure(await rpc("Portal.store", { handle: "nobody-here" }))).toMatchObject({ _tag: "PortalNotFound" })
    const handle = ok(await rpc("Returns.settings", undefined, store.cookie)).portal.handle
    // Off, the page says so and finds no orders.
    expect(ok(await rpc("Portal.store", { handle }))).toMatchObject({ handle, on: false })
    expect(failure(await rpc("Portal.lookup", { handle, number: "1002", email: "klant1@example.com" })))
      .toMatchObject({ _tag: "PortalNotFound" })

    await portalOn(store.cookie)
    const page = ok(await rpc("Portal.store", { handle }))
    expect(page).toMatchObject({ on: true, returnDays: 365, offered: expect.arrayContaining(["refund"]) })
    expect(page.reasons.find((r) => r.id === "quality")).toEqual({
      id: "quality",
      label: "Kwaliteit",
      claim: true,
      photoRequired: true
    })

    // A wrong address and a wrong number answer the same.
    for (
      const wrong of [{ number: "1002", email: "klant2@example.com" }, { number: "1099", email: "klant1@example.com" }]
    ) {
      expect(failure(await rpc("Portal.lookup", { handle, ...wrong }))).toMatchObject({ _tag: "OrderNotFound" })
    }
    // Not delivered yet: nothing to send back, and it says so.
    const early = ok(await rpc("Portal.lookup", { handle, number: "#1001", email: "klant1@example.com" }))
    expect(early.deliveredAt).toBeNull()
    expect(early.lines[0]).toMatchObject({
      title: "Linnen overhemd",
      return: { kind: "not_delivered" },
      // The product's other size, to exchange to.
      exchange: ["L"]
    })

    const found = ok(await rpc("Portal.lookup", { handle, number: " so-1002", email: "KLANT1@example.com " }))
    expect(found).toMatchObject({ number: "#1002", firstName: "Klant", currency: "EUR", open: null })
    expect(found.deliveredAt).toBe(Date.parse("2026-10-07T09:00:00Z"))
    const line = found.lines[0]!
    expect(line).toMatchObject({ title: "Wollen trui", unitPriceMinor: 8900, return: null, claim: null, exchange: [] })

    const started = ok(
      await rpc("Portal.start", {
        token: found.token,
        kind: "return",
        lines: [{ lineId: line.id }],
        reasonId: "too_big",
        note: "Valt ruim",
        fileIds: [],
        resolution: "refund"
      })
    )
    expect(started).toMatchObject({ kind: "return", requested: "refund", exchangeTo: null })
    expect(started.number).toMatch(/^R-10\d\d$/)

    // The team sees it in Te beoordelen, from the portal, in the shopper's words.
    const queue = ok(await rpc("Returns.list", {}, store.cookie))
    const row = queue.rows.find((r) => r.number === started.number)!
    expect(row).toMatchObject({ source: "portal", status: "review", note: "Valt ruim", reasonId: "too_big", units: 1 })
    const detail = ok(await rpc("Returns.get", { id: row.id }, store.cookie))
    expect(detail.events[0]).toMatchObject({
      who: "shopper",
      name: "Klant 1",
      text: "Retour aangevraagd in het retourportaal"
    })

    // …and hears of it.
    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.find((n) => n.kind === "return.new")).toMatchObject({
      subjectId: row.id,
      data: { number: started.number, kind: "return", orderNumber: "#1002", customer: "Klant 1" }
    })

    // Looked up again: the request is there, and the line is no longer free.
    const again = ok(await rpc("Portal.lookup", { handle, number: "1002", email: "klant1@example.com" }))
    expect(again.open).toEqual({ number: started.number, status: "review", labelCarrier: null })
    expect(again.lines[0]!.return).toEqual({ kind: "taken", number: started.number, status: "review" })
    expect(
      failure(
        await rpc("Portal.start", {
          token: again.token,
          kind: "return",
          lines: [{ lineId: line.id }],
          reasonId: "too_big",
          fileIds: [],
          resolution: "refund"
        })
      )
    ).toMatchObject({ _tag: "LineNotReturnable", why: "taken" })
  })

  it("holds the shopper to the rules, the photos to the request, and the token to its one order", async () => {
    const store = await importedStore("portal-rules")
    const handle = await portalOn(store.cookie, { returnDays: 1 })
    const delivered = ok(await rpc("Portal.lookup", { handle, number: "1002", email: "klant1@example.com" }))
    const line = delivered.lines[0]!
    // Past the return window, still inside the claim window.
    expect(line.return).toMatchObject({ kind: "window", days: 1 })
    expect(line.claim).toBeNull()
    const claim = {
      token: delivered.token,
      kind: "claim" as const,
      lines: [{ lineId: line.id }],
      reasonId: "quality",
      fileIds: [] as Array<string>,
      resolution: "replacement" as const
    }
    expect(failure(await rpc("Portal.start", { ...claim, kind: "return", reasonId: "too_big", resolution: "refund" })))
      .toMatchObject({ _tag: "LineNotReturnable", why: "window" })
    // "Beschadigd aangekomen" has its own fourteen days, long past.
    expect(failure(await rpc("Portal.start", { ...claim, reasonId: "damaged", fileIds: [] })))
      .toMatchObject({ _tag: "PhotoRequired" })
    expect(failure(await rpc("Portal.start", { ...claim, reasonId: "too_big" })))
      .toMatchObject({ _tag: "Invalid", fields: { reasonId: "unknown" } })
    expect(failure(await rpc("Portal.start", claim))).toMatchObject({ _tag: "PhotoRequired" })

    // Photos: an image, with this token, at most ten megabytes.
    expect((await photo(null)).status).toBe(401)
    expect((await photo("v1.nope.nope.nope")).status).toBe(401)
    expect((await photo(delivered.token, { type: "application/pdf" })).status).toBe(415)
    expect((await photo(delivered.token, { length: String(11 * 1024 * 1024) })).status).toBe(413)
    const uploaded = await photo(delivered.token)
    expect(uploaded.status).toBe(201)
    const { id: fileId } = await uploaded.json() as { id: string }

    const withPhoto = { ...claim, reasonId: "damaged", fileIds: [fileId] }
    expect(failure(await rpc("Portal.start", withPhoto))).toMatchObject({ _tag: "LineNotReturnable", why: "window" })
    expect(failure(await rpc("Portal.start", { ...claim, fileIds: [fileId], resolution: "discount" })))
      .toMatchObject({ _tag: "ResolutionNotAllowed" })

    // The token names #1002 only: another order's line, or a photo for another order, is not this one's.
    const other = ok(await rpc("Portal.lookup", { handle, number: "1001", email: "klant1@example.com" }))
    expect(failure(await rpc("Portal.start", { ...claim, fileIds: [fileId], lines: [{ lineId: other.lines[0]!.id }] })))
      .toMatchObject({ _tag: "LineNotReturnable", why: "unknown" })
    expect(
      failure(
        await rpc("Portal.start", {
          ...claim,
          token: other.token,
          lines: [{ lineId: other.lines[0]!.id }],
          fileIds: [fileId]
        })
      )
    )
      .toMatchObject({ _tag: "Invalid", fields: { fileIds: "unknown" } })
    const tampered = `${delivered.token.slice(0, -4)}${delivered.token.endsWith("AAAA") ? "BBBB" : "AAAA"}`
    expect(failure(await rpc("Portal.start", { ...claim, token: tampered }))).toMatchObject({
      _tag: "PortalTokenExpired"
    })

    const reported = ok(await rpc("Portal.start", { ...claim, fileIds: [fileId], note: "Naad gescheurd" }))
    expect(reported).toMatchObject({ kind: "claim", requested: "replacement" })
    const row = ok(await rpc("Returns.list", {}, store.cookie)).rows.find((r) => r.number === reported.number)!
    const detail = ok(await rpc("Returns.get", { id: row.id }, store.cookie))
    expect(detail.record).toMatchObject({ kind: "claim", quality: true, source: "portal" })
    expect(detail.photos).toEqual([`/api/files/${fileId}`])
    expect(detail.events[0]!.text).toBe("Claim gemeld in het retourportaal")
    // The photo is the return's now: the team opens it at Retouren · Bekijken.
    const opened = await call(`http://api.test${detail.photos[0]}`, { headers: { cookie: store.cookie } })
    expect(opened.status).toBe(200)
    expect(opened.headers.get("content-type")).toBe("image/png")
  })

  it("limits looking up one order number", async () => {
    const store = await importedStore("portal-limit")
    const handle = await portalOn(store.cookie)
    for (let i = 0; i < 10; i++) {
      expect(failure(await rpc("Portal.lookup", { handle, number: "1003", email: `raad${i}@example.com` })))
        .toMatchObject({ _tag: "OrderNotFound" })
    }
    // The right address no longer helps within the hour: the number is locked, not the address.
    expect(failure(await rpc("Portal.lookup", { handle, number: "1003", email: "klant2@example.com" })))
      .toMatchObject({ _tag: "PortalRateLimited", retryAfterSeconds: expect.any(Number) })
    ok(await rpc("Portal.lookup", { handle, number: "1002", email: "klant1@example.com" }))
  })
})
