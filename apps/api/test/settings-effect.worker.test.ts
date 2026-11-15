import { describe, expect, it } from "vitest"
import { ok, pastUndo, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Settings that take effect (M17 step 20.1b, "no settings page is simulated"), through the Worker against Shopify's
 * recorded twin. Never saved, a shopper sees what a new workspace starts from: Insyte's own look, the default wording
 * of the parcel's status, and a sentence with a link dropped. Saved, Huisstijl's colour and logo reach the returns
 * portal and the shopper's mail (the logo served to anyone, only while it is the chosen one), Verzending's sentence the
 * tracking mail, and Sjablonen' links the team's words: an order's mail and an inbox reply.
 */

interface Captured {
  readonly kind: string
  readonly reference: string | null
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

const DEFAULT_WORDING = [
  "Je bestelling is verzonden",
  "Verzonden",
  "Onderweg",
  "Wordt vandaag bezorgd",
  "We kijken naar je zending",
  "Bezorgd"
]

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

describe("settings that take effect", () => {
  it("shows the shopper defaults until the pages are saved, and the saved values after", async () => {
    const store = await importedStore("effect")
    const first = (await ordersOf(store.cookie)).find((o) => o.number === "#1003")!
    const to = first.customerEmail!

    // Never saved: the order's mail drops the sentence with the empty review link and wears Insyte's own look.
    const plain = ok(
      await rpc("Orders.emailCustomer", {
        orderId: first.id,
        subject: "Je bestelling",
        body: "Hoi,\n\nVertel je ons wat je ervan vindt? {review_link}\n\nGroet"
      }, store.cookie)
    )
    // The tracking mail says the parcel's status in the default wording.
    const tracked = ok(await rpc("Orders.sendTrackingUpdate", { ids: [first.id] }, store.cookie))
    expect(tracked.orders.map((o) => o.number)).toEqual(["#1003"])
    await sentMail(store.workspace)
    const [message] = await captured(to, plain.mail.id)
    expect(message).toMatchObject({ kind: "order.message", bodyText: "Hoi,\n\nGroet", look: null })
    const trackingMails = (await captured(to)).filter((m) => m.kind === "order.message" && m.status)
    expect(trackingMails).toHaveLength(1)
    expect(DEFAULT_WORDING).toContain(trackingMails[0]!.status!.text)
    expect(trackingMails[0]!.look).toBeNull()

    // The portal in its own look.
    const handle = ok(await rpc("Returns.settings", undefined, store.cookie)).portal.handle
    expect(ok(await rpc("Portal.store", { handle })).look).toEqual({ color: null, logoUrl: null })

    // Saved: Huisstijl (a logo and a dark colour), Verzending (every status worded), Sjablonen (the review link).
    const logo = ok(await rpc("Brand.uploadLogo", { name: "logo.png", mime: "image/png", data: PNG }, store.cookie))
    const unchosen = ok(
      await rpc("Brand.uploadLogo", { name: "ander.png", mime: "image/png", data: PNG }, store.cookie)
    )
    await save(
      store.cookie,
      "brand",
      (v: Record<string, unknown>) => ({ ...v, logoFileId: logo.fileId, color: "#7a1f3d" })
    )
    await save(store.cookie, "shipping", (v: { statuses: Array<{ id: string; show: string }> }) => ({
      statuses: v.statuses.map((s) => ({ ...s, label: `Stand ${s.id} bij {vervoerder}`, show: "all" }))
    }))
    await save(store.cookie, "links", () => ({
      review: `https://effect-${run}.example/review`,
      unsubscribe: "",
      restock: ""
    }))

    const logoPath = `/api/brand/${store.workspace}/logo/${logo.fileId}`
    const page = ok(await rpc("Portal.store", { handle }))
    expect(page.look).toEqual({ color: "#7A1F3D", logoUrl: logoPath })
    // The logo is anyone's to load, without a session; a logo uploaded and not chosen is not.
    const served = await call(`http://api.test${logoPath}`)
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("image/png")
    expect(served.headers.get("cache-control")).toContain("public")
    expect(served.headers.get("content-security-policy")).toContain("sandbox")
    expect((await call(`http://api.test/api/brand/${store.workspace}/logo/${unchosen.fileId}`)).status).toBe(404)
    expect((await call(`http://api.test/api/brand/wks_nobody0000000/logo/${logo.fileId}`)).status).toBe(404)

    const linked = ok(
      await rpc("Orders.emailCustomer", {
        orderId: first.id,
        subject: "Je bestelling",
        body: "Hoi,\n\nVertel je ons wat je ervan vindt? {review_link}\n\nGroet"
      }, store.cookie)
    )
    // A second store of the workspace: its parcel is new, and the workspace's settings are its too.
    const second = await anotherStore(store, "effect-2")
    const other = (await ordersOf(store.cookie, second.storeId)).find((o) => o.number === "#1003")!
    ok(await rpc("Orders.sendTrackingUpdate", { ids: [other.id] }, store.cookie))
    await sentMail(store.workspace)

    const look = { color: "#7A1F3D", logoPath }
    const [withLink] = await captured(to, linked.mail.id)
    expect(withLink).toMatchObject({
      bodyText: `Hoi,\n\nVertel je ons wat je ervan vindt? https://effect-${run}.example/review\n\nGroet`,
      look
    })
    const newest = (await captured(other.customerEmail!)).filter((m) => m.kind === "order.message" && m.status)
    const told = newest.find((m) => m.status!.text.startsWith("Stand "))
    expect(told).toBeDefined()
    expect(told!.status!.show).toBe("all")
    expect(told!.status!.text).toMatch(/^Stand [a-z]+ bij \S/)
    expect(told!.look).toEqual(look)
  }, 240_000)

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
    await sentMail(store.workspace)
    const [mail] = await captured(customer, replied.message.id)
    expect(mail?.kind).toBe("support.message")
    expect(mail?.bodyText).toBe(`Hoi,\n\nJe hoort het hier: https://effect-${run}.example/terug.`)
    expect(mail?.look ?? null).toBeNull()
  }, 180_000)
})
