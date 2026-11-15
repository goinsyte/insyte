import { describe, expect, it } from "vitest"
import { failure, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Settings that take effect (M17 step 20.1b, "no settings page is simulated"), through the Worker against Shopify's
 * and AfterShip's recorded twins. Never saved, a shopper's mail is as it always was: Insyte's own look, no status line
 * of Verzending's, and a sentence that only led up to an empty link dropped. Saved, Huisstijl's colour and logo reach
 * the returns portal and the shopper's mail (the logo served to anyone once saved, and kept for the mails that carried
 * it), Verzending's sentence the tracking mail, and Sjablonen' links the team's words: an order's mail and an inbox
 * reply. A workspace of two stores shows neither store's logo: the section is the workspace's.
 */

interface Captured {
  readonly kind: string
  readonly reference: string | null
  readonly subject: string | null
  readonly bodyText: string | null
  readonly look?: { color: string | null; logoPath: string | null } | null
  readonly status?: { text: string; show: string } | null
}

/** The mails captured to `to`, one record's where `reference` names it. */
const captured = async (to: string, reference?: string) =>
  (await (await call(
    `http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}${
      reference === undefined ? "" : `&reference=${encodeURIComponent(reference)}`
    }`
  )).json() as { mails: Array<Captured> }).mails

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const SVG = btoa(
  "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><rect width=\"10\" height=\"10\"/></svg>"
)

const ordersOf = async (cookie: string, storeId?: string) =>
  ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.filter((o) => storeId === undefined || o.storeId === storeId)

/** What is in line goes: its undo window passed, the relay run. */
const sentMail = async (workspace: string) => {
  await pastUndo(workspace)
  await relay(workspace)
}

const save = async (cookie: string, section: "shipping" | "links" | "brand", value: (v: never) => unknown) => {
  const now = ok(await rpc("WorkspaceSettings.get", { section }, cookie))
  return ok(
    await rpc("WorkspaceSettings.save", {
      section,
      value: value(now.value as never) as never,
      baseVersion: now.version
    }, cookie)
  )
}

const upload = async (cookie: string, name: string, mime: "image/png" | "image/svg+xml", data: string) =>
  ok(await rpc("Brand.uploadLogo", { name, mime, data }, cookie))

/** An order's mail with these words, and the mail as the shopper got it. */
const mailed = async (store: { cookie: string; workspace: string }, orderId: string, to: string, subject: string) => {
  const queued = ok(
    await rpc("Orders.emailCustomer", {
      orderId,
      subject,
      body: "Hoi,\n\nVertel je ons wat je ervan vindt? {review_link}\n\nGroet"
    }, store.cookie)
  )
  await sentMail(store.workspace)
  return (await captured(to, queued.mail.id))[0]!
}

/** "Track & trace-update sturen" for one order, sent: the shopper's mail as they got it. */
const trackingMail = async (store: { cookie: string; workspace: string }, orderId: string, to: string) => {
  ok(await rpc("Orders.sendTrackingUpdate", { ids: [orderId] }, store.cookie))
  const waiting = (await outboxOf(store.workspace)).filter((e) =>
    e.event === "order.mail" && e.relayedAt === null && !e.cancelled
  )
  expect(waiting).toHaveLength(1)
  await sentMail(store.workspace)
  return (await captured(to, (waiting[0]!.payload as { mailId: string }).mailId))[0]!
}

/** AfterShip telling Insyte a parcel is ready at a pickup point, named by our delivery id. */
const readyForPickup = (deliveryId: string) =>
  call("http://api.public.test/hooks/aftership", {
    method: "POST",
    headers: { "content-type": "application/json", "aftership-hmac-sha256": "valid" },
    body: JSON.stringify({
      event: "tracking_update",
      msg: {
        id: "as_3S301",
        tag: "AvailableForPickup",
        checkpoints: [{ checkpoint_time: "2026-11-09T10:00:00Z", message: "Ligt bij het afhaalpunt" }],
        custom_fields: { insyte_delivery: deliveryId }
      }
    })
  })

describe("settings that take effect", () => {
  it("leaves the shopper's mail as it was until the pages are saved, and shows the saved values after", async () => {
    const store = await importedStore("effect")
    const first = (await ordersOf(store.cookie)).find((o) => o.number === "#1003")!
    const to = first.customerEmail!

    // Never saved: the order's mail drops the question that led up to the empty review link and wears Insyte's look;
    // the tracking mail carries no status of Verzending's, so it is the mail it always was.
    const plain = await mailed(store, first.id, to, "Je bestelling")
    expect(plain).toMatchObject({ kind: "order.message", bodyText: "Hoi,\n\nGroet", look: null })
    expect(await trackingMail(store, first.id, to)).toMatchObject({ kind: "order.message", status: null, look: null })

    // The portal in its own look.
    const handle = ok(await rpc("Returns.settings", undefined, store.cookie)).portal.handle
    expect(ok(await rpc("Portal.store", { handle })).look).toEqual({ color: null, logoUrl: null })

    // Saved: Huisstijl (a logo and a dark colour), Verzending (every status worded), Sjablonen (the review link).
    const logo = await upload(store.cookie, "logo.png", "image/png", PNG)
    const unchosen = await upload(store.cookie, "ander.png", "image/png", PNG)
    await save(
      store.cookie,
      "brand",
      (v: Record<string, unknown>) => ({ ...v, logoFileId: logo.fileId, color: "#7a1f3d" })
    )
    await save(store.cookie, "shipping", (v: { statuses: Array<{ id: string; show: string }> }) => ({
      statuses: v.statuses.map((s) => ({ ...s, label: `Stand ${s.id} bij {vervoerder}`, show: "all" }))
    }))
    const review = `https://effect-${run}.example/review?a=$&b=$'`
    await save(store.cookie, "links", () => ({ review, unsubscribe: "", restock: "" }))

    const logoPath = `/api/brand/${store.workspace}/logo/${logo.fileId}`
    expect(ok(await rpc("Portal.store", { handle })).look).toEqual({ color: "#7A1F3D", logoUrl: logoPath })
    // The logo is anyone's to load, without a session, and the edge cache answers the next one; a logo uploaded and
    // never saved is not, nor one under another workspace.
    const served = await call(`http://api.test${logoPath}`)
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("image/png")
    expect(served.headers.get("cache-control")).toContain("public")
    expect(served.headers.get("content-security-policy")).toContain("sandbox")
    await expect.poll(async () =>
      (await caches.default.match(`https://brand-logo.cache${logoPath}`))?.headers.get("content-type")
    ).toBe("image/png")
    expect((await call(`http://api.test/api/brand/${store.workspace}/logo/${unchosen.fileId}`)).status).toBe(404)
    expect((await call(`http://api.test/api/brand/wks_nobody0000000/logo/${logo.fileId}`)).status).toBe(404)

    // The links in the subject and the words, `$` and all; the look on the mail.
    const look = { color: "#7A1F3D", logoPath }
    const linked = await mailed(store, first.id, to, "Je review: {review_link}")
    expect(linked).toMatchObject({
      subject: `Je review: ${review}`,
      bodyText: `Hoi,\n\nVertel je ons wat je ervan vindt? ${review}\n\nGroet`,
      look
    })

    // A logo saved once and then replaced still loads, for the mails that carried it (never asked for before here, so
    // not from the edge cache).
    const earlier = await upload(store.cookie, "eerder.png", "image/png", PNG)
    await save(store.cookie, "brand", (v: Record<string, unknown>) => ({ ...v, logoFileId: earlier.fileId }))
    // The limits hold for the words as they go out, links in: under them as typed, over them with the link.
    expect(failure(
      await rpc("Orders.emailCustomer", {
        orderId: first.id,
        subject: "Je bestelling",
        body: `${"x".repeat(9_970)} {review_link}`
      }, store.cookie)
    )).toMatchObject({ _tag: "Invalid", fields: { body: "too_long" } })

    // An SVG logo: the portal shows it, a mail does not (Gmail and Outlook do not), and heads with the store's name.
    const svg = await upload(store.cookie, "logo.svg", "image/svg+xml", SVG)
    await save(store.cookie, "brand", (v: Record<string, unknown>) => ({ ...v, logoFileId: svg.fileId }))
    expect(ok(await rpc("Portal.store", { handle })).look?.logoUrl).toBe(
      `/api/brand/${store.workspace}/logo/${svg.fileId}`
    )
    expect((await mailed(store, first.id, to, "Je bestelling")).look).toEqual({ color: "#7A1F3D", logoPath: null })
    expect((await call(`http://api.test/api/brand/${store.workspace}/logo/${earlier.fileId}`)).status).toBe(200)
    // A logo a scan refused is never served.
    const refused = `/api/brand/${store.workspace}/logo/${svg.fileId}`
    await call(`http://api.test/api/__dev/files/scan?workspace=${store.workspace}&file=${svg.fileId}&state=rejected`, {
      method: "POST"
    })
    expect((await call(`http://api.test${refused}`)).status).toBe(404)
    expect(ok(await rpc("Portal.store", { handle })).look?.logoUrl).toBeNull()
    await save(store.cookie, "brand", (v: Record<string, unknown>) => ({ ...v, logoFileId: logo.fileId }))

    // A second store of the workspace: the workspace's wording is its too, but neither store shows the logo, which
    // would be the other's. Its parcel waits at a pickup point, which Verzending words on its own.
    const second = await anotherStore(store, "effect-2")
    expect(ok(await rpc("Portal.store", { handle })).look).toEqual({ color: "#7A1F3D", logoUrl: null })
    const other = (await ordersOf(store.cookie, second.storeId)).find((o) => o.number === "#1003")!
    await call(`http://api.test/api/__dev/tracking/sweep?workspace=${store.workspace}`, { method: "POST" })
    const parcel = ok(await rpc("Orders.tracking", { orderId: other.id }, store.cookie)).parcels[0]!
    expect((await readyForPickup(parcel.deliveryId!)).status).toBe(200)
    expect(await trackingMail(store, other.id, other.customerEmail!)).toMatchObject({
      status: { text: "Stand pickup bij PostNL", show: "all" },
      look: { color: "#7A1F3D", logoPath: null }
    })
  }, 300_000)

  it("puts Sjablonen' links in an inbox reply, and leaves the team's plain message unbranded", async () => {
    const store = await importedStore("effect-inbox")
    const box = ok(
      await rpc("Mailboxes.connect", {
        provider: "forward",
        address: `support@effect-${run}.example`,
        label: "Effect"
      }, store.cookie)
    )
    const customer = `klant-${run}@effect.example`
    const raw = [
      `From: <${customer}>`,
      `To: <support@effect-${run}.example>`,
      "Subject: Weer op voorraad?",
      `Message-ID: <effect-${run}@effect.example>`,
      "Date: Tue, 10 Nov 2026 09:00:00 +0100",
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      "Wanneer is de trui er weer?"
    ].join("\r\n")
    const delivered = await (await call("http://api.test/api/__dev/mail/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: box.forwardingAddress, raw })
    })).json() as { threadId: string }
    await save(store.cookie, "links", () => ({
      review: "",
      unsubscribe: "",
      restock: `https://effect-${run}.example/terug`
    }))
    await save(store.cookie, "brand", (v: Record<string, unknown>) => ({ ...v, color: "#7a1f3d" }))
    const replied = ok(
      await rpc("Threads.reply", {
        threadId: delivered.threadId,
        body: "Hoi,\n\nJe hoort het hier: {voorraad_link}. Laat een review achter: {review_link}"
      }, store.cookie)
    )
    // A new mail: the links in its subject too, and its limits held after.
    ok(
      await rpc("Threads.compose", {
        to: customer,
        subject: "Weer binnen: {voorraad_link}",
        body: "Hoi,\n\nHij is er weer: {voorraad_link}"
      }, store.cookie)
    )
    expect(failure(
      await rpc("Threads.compose", {
        to: customer,
        subject: "Weer binnen",
        body: `${"x".repeat(99_975)} {voorraad_link}`
      }, store.cookie)
    )).toMatchObject({ _tag: "Invalid", fields: { body: "too_long" } })
    await sentMail(store.workspace)
    const [mail] = await captured(customer, replied.message.id)
    expect(mail?.kind).toBe("support.message")
    expect(mail?.bodyText).toBe(`Hoi,\n\nJe hoort het hier: https://effect-${run}.example/terug.`)
    expect(mail?.look ?? null).toBeNull()
    const fresh = (await captured(customer)).find((m) => m.reference !== replied.message.id)
    expect(fresh?.subject).toBe(`Weer binnen: https://effect-${run}.example/terug`)
  }, 180_000)
})
