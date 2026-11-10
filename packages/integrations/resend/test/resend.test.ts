import { type Mail, Mailer } from "@insyte/modules/shared/domain/Mailer"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { type EmailKind, EMAILS } from "../src/emails/index.ts"
import { dark, light, mix } from "../src/emails/theme.ts"
import { MailRenderer, renderEmail } from "../src/MailRenderer.ts"
import { urlsFor } from "../src/MailUrls.ts"
import { Resend } from "../src/Resend.ts"
import { ResendMailer } from "../src/ResendMailer.ts"

interface Seen {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
}

/* A fake Resend: answers from a function and records what it was sent. Fails like the fetch client when told to. */
const fakeResend = (answer: () => Promise<Response>, seen: Array<Seen> = []) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.tryPromise({
        try: async () => {
          const body = new TextDecoder().decode((request.body as { body: Uint8Array }).body)
          seen.push({ url: url.href, headers: request.headers, body: JSON.parse(body) })
          return HttpClientResponse.fromWeb(request, await answer())
        },
        catch: (cause) =>
          new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
      })
    )
  )

const config = ConfigProvider.layer(
  ConfigProvider.fromEnvRecord({
    RESEND_API_KEY: "re_key",
    MAIL_FROM: "Insyte <noreply@mail.goinsyte.com>",
    CONSOLE_ORIGIN: "https://console.stage.example"
  })
)

const outgoing = {
  from: "Insyte <noreply@mail.goinsyte.com>",
  to: "eva@example.com",
  subject: "S",
  html: "<p>H</p>",
  text: "T"
}

const send = (http: Layer.Layer<HttpClient.HttpClient>, idempotencyKey?: string) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(Resend), (r) => r.send({ ...outgoing, idempotencyKey })).pipe(
      Effect.provide(Resend.layer.pipe(Layer.provide(http), Layer.provide(config)))
    )
  )

describe("Resend", () => {
  it("posts the mail with the key as a bearer token and the idempotency key, and returns Resend's id", async () => {
    const seen: Array<Seen> = []
    const result = await send(fakeResend(() => Promise.resolve(Response.json({ id: "re_1" })), seen), "auth.verify/x")
    expect(result).toEqual(Exit.succeed({ id: "re_1" }))
    expect(seen[0]?.url).toBe("https://api.resend.com/emails")
    expect(seen[0]?.headers["authorization"]).toBe("Bearer re_key")
    expect(seen[0]?.headers["idempotency-key"]).toBe("auth.verify/x")
    expect(seen[0]?.body).toMatchObject({ to: ["eva@example.com"], subject: "S", text: "T" })
  })

  it("sends a file with the mail as Resend takes it: its name and base64 content", async () => {
    const seen: Array<Seen> = []
    await Effect.runPromiseExit(
      Effect.flatMap(Effect.service(Resend), (r) =>
        r.send({
          ...outgoing,
          attachments: [{ filename: "pakbon-1001.pdf", content: new TextEncoder().encode("%PDF-1.7") }]
        })).pipe(
          Effect.provide(Resend.layer.pipe(
            Layer.provide(fakeResend(() => Promise.resolve(Response.json({ id: "re_2" })), seen)),
            Layer.provide(config)
          ))
        )
    )
    expect(seen[0]?.body["attachments"]).toEqual([{ filename: "pakbon-1001.pdf", content: btoa("%PDF-1.7") }])
  })

  it("fails with Resend's reason when it refuses, and when it cannot be reached; never with the key", async () => {
    const refused = await send(
      fakeResend(() =>
        Promise.resolve(Response.json({ name: "validation_error", message: "domain not verified" }, { status: 403 }))
      )
    )
    expect(JSON.stringify(refused)).toContain("resend 403: validation_error domain not verified")
    const unreachable = await send(fakeResend(() => Promise.reject(new Error("offline"))))
    expect(JSON.stringify(unreachable)).toContain("resend unreachable")
    expect(JSON.stringify([refused, unreachable])).not.toContain("re_key")
  })
})

const mailer = (http: Layer.Layer<HttpClient.HttpClient>) =>
  ResendMailer.pipe(Layer.provide(http), Layer.provide(config))

const sendWith = (http: Layer.Layer<HttpClient.HttpClient>, mail: Mail) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(Mailer), (m) => m.send(mail)).pipe(Effect.provide(mailer(http)))
  )

describe("ResendMailer", () => {
  const url = "https://console.stage.example/api/auth/verify-email?token=a"

  it("sends the Dutch mail of the kind, from MAIL_FROM, with a stable idempotency key", async () => {
    const seen: Array<Seen> = []
    const http = fakeResend(() => Promise.resolve(Response.json({ id: "re_2" })), seen)
    const sendIt = Effect.flatMap(
      Effect.service(Mailer),
      (m) => m.send({ kind: "auth.verify", to: "Eva@Example.com", url })
    )
    await Effect.runPromise(Effect.andThen(sendIt, sendIt).pipe(Effect.provide(mailer(http))))
    const expected = await renderEmail("auth.verify", { url })
    expect(seen[0]?.body).toMatchObject({
      from: "Insyte <noreply@mail.goinsyte.com>",
      subject: "Bevestig je e-mailadres voor Insyte",
      text: expected.text,
      html: expected.html
    })
    expect(seen[0]?.headers["idempotency-key"]).toMatch(/^auth\.verify\/[0-9a-f]{64}$/)
    expect(seen[1]?.headers["idempotency-key"]).toBe(seen[0]?.headers["idempotency-key"])
  })

  it("links the existing-account notice to the sign-in page of CONSOLE_ORIGIN", async () => {
    const seen: Array<Seen> = []
    const http = fakeResend(() => Promise.resolve(Response.json({ id: "re_3" })), seen)
    await sendWith(http, { kind: "auth.signup_existing", to: "eva@example.com" })
    expect(seen[0]?.body["subject"]).toBe("Je hebt al een account bij Insyte")
    expect(seen[0]?.body["text"]).toContain("Naar de inlogpagina: https://console.stage.example/login")
  })

  it("sends the invitation with its facts", async () => {
    const seen: Array<Seen> = []
    const http = fakeResend(() => Promise.resolve(Response.json({ id: "re_4" })), seen)
    await sendWith(http, {
      kind: "team.invite",
      to: "amber@example.com",
      url: "https://console.stage.example/invitations/inv_1?k=abc",
      invitation: { workspace: "Northwind", inviter: "Elena Hart", role: "Klantenservice", expiresAt: new Date() }
    })
    expect(seen[0]?.body["subject"]).toBe("Elena Hart nodigt je uit voor Northwind")
  })

  it("sends a shopper's return mail in the store's name, with the portal's link and the label attached (M9.3)", async () => {
    const seen: Array<Seen> = []
    const http = fakeResend(() => Promise.resolve(Response.json({ id: "re_6" })), seen)
    const returnMail = {
      shop: "Northwind & Co.",
      customer: "Anna de Vries",
      number: "R-1042",
      kind: "return" as const,
      orderNumber: "#1002",
      items: [{ title: "Linnen overhemd", variant: "M", qty: 1 }],
      portal: "northwind",
      label: { carrier: "PostNL", tracking: "3SRET1042" }
    }
    await sendWith(http, {
      kind: "return.label",
      to: "anna@example.com",
      sender: returnMail.shop,
      reference: "ret_1",
      returnMail,
      attachments: [{ filename: "retourlabel-R-1042.pdf", content: new TextEncoder().encode("%PDF-1.7") }]
    })
    expect(seen[0]?.body).toMatchObject({
      from: "\"Northwind & Co.\" <noreply@mail.goinsyte.com>",
      subject: "Je retourlabel voor R-1042",
      attachments: [{ filename: "retourlabel-R-1042.pdf" }]
    })
    expect(seen[0]?.body["text"]).toContain("Naar het retourportaal: https://console.stage.example/retour/northwind")
    expect(seen[0]?.body["text"]).toContain("3SRET1042")
    const noFacts = await sendWith(http, { kind: "return.resolved", to: "anna@example.com" })
    expect(Exit.isFailure(noFacts) && JSON.stringify(noFacts.cause)).toContain("return.resolved needs its return")
  })

  it("turns a refusal, a missing link and missing facts into MailNotSent, and sends nothing for the last two", async () => {
    const refused = await sendWith(
      fakeResend(() => Promise.resolve(Response.json({ message: "nope" }, { status: 422 }))),
      { kind: "auth.reset", to: "eva@example.com", url }
    )
    expect(Exit.isFailure(refused) && JSON.stringify(refused.cause)).toContain("MailNotSent")
    const seen: Array<Seen> = []
    const http = fakeResend(() => Promise.resolve(Response.json({ id: "re_5" })), seen)
    const noLink = await sendWith(http, { kind: "auth.verify", to: "eva@example.com" })
    expect(Exit.isFailure(noLink) && JSON.stringify(noLink.cause)).toContain("auth.verify needs a link")
    const noFacts = await sendWith(http, { kind: "team.invite", to: "eva@example.com", url })
    expect(Exit.isFailure(noFacts) && JSON.stringify(noFacts.cause)).toContain("team.invite needs its facts")
    expect(seen).toHaveLength(0)
  })
})

const run = <A, E>(effect: Effect.Effect<A, E, MailRenderer>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(MailRenderer.layer)))

describe("MailRenderer", () => {
  it("renders through its layer", async () => {
    const result = await run(
      Effect.flatMap(Effect.service(MailRenderer), (r) => r.render("auth.reset", { url: "https://a.example/r" }))
    )
    expect(Exit.isSuccess(result) && result.value.text).toContain("Nieuw wachtwoord kiezen: https://a.example/r")
  })

  it("fails with MailRenderError, naming the kind, when a template cannot render its props", async () => {
    const props = { ...EMAILS["team.supplier_invite"].preview(urlsFor("https://a.example")), scopes: undefined }
    const result = await run(
      Effect.flatMap(Effect.service(MailRenderer), (r) => r.render("team.supplier_invite", props as never))
    )
    expect(Exit.isFailure(result) && JSON.stringify(result.cause)).toContain("MailRenderError")
    expect(JSON.stringify(result)).toContain("team.supplier_invite")
  })
})

/* Every hex a mail may carry: the tokens' two maps, and the mark's and the grid's flattened chalk. */
const PALETTE = new Set([
  ...Object.values(light),
  ...Object.values(dark),
  ...[0.2, 0.5, 0.6, 0.09].map((alpha) => mix("mesh-ink", "abyss", alpha))
])
/* Never in a mail: black, and the pink and green fields and inks (on text or anywhere). */
const BANNED = new Set([
  "#000000",
  "#000",
  light["signal-green"],
  light["signal-green-bg"],
  dark["signal-green"],
  dark["signal-green-bg"],
  light["person-2"],
  light["person-4"],
  light["signal-red"],
  dark["signal-red"]
])

const KINDS = Object.keys(EMAILS) as Array<EmailKind>
const ORIGINS = ["https://console.one.example", "http://localhost:4300"] as const

/* The hosts a rendered mail names, the doctype's DTD aside (React Email writes it; nothing links to it). */
const hostsIn = (body: string) =>
  [...body.replace(/^<!DOCTYPE[^>]*>/, "").matchAll(/https?:\/\/([^/\s"'<>)?#]+)/g)].map((m) => m[1])

/* The string props that are links: what the mail must carry, in both bodies. */
const linksOf = (props: unknown): Array<string> =>
  Object.values(props as Record<string, unknown>).flatMap((value) => {
    if (typeof value === "string" && /^https?:/.test(value)) return [value]
    if (Array.isArray(value)) return value.flatMap(linksOf)
    if (value !== null && typeof value === "object" && !(value instanceof Date)) return linksOf(value)
    return []
  })

/** Mails answered by replying, with nothing to click: the order to a supplier, until the portal opens (M16). */
const LINKLESS: ReadonlyArray<string> = ["supplier.order"]

describe.each(KINDS)("the %s mail", (kind) => {
  it.each(ORIGINS)("renders HTML and text, carries its links, and names no host but %s", async (origin) => {
    const props = EMAILS[kind].preview(urlsFor(origin))
    const mail = await renderEmail(kind, props as never)
    const host = new URL(origin).host

    expect(mail.subject.length).toBeGreaterThan(0)
    expect(mail.html).toMatch(/^<!DOCTYPE html/)
    expect(mail.html).toContain("<html dir=\"ltr\" lang=\"nl\"")
    expect(mail.text.length).toBeGreaterThan(40)
    expect(mail.text).not.toMatch(/<[a-z]/)

    const links = linksOf(props)
    if (!LINKLESS.includes(kind)) expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(mail.text).toContain(link)
      expect(mail.html).toContain(link.replaceAll("&", "&amp;"))
    }

    expect(new Set([...hostsIn(mail.html), ...hostsIn(mail.text)])).toEqual(
      new Set(LINKLESS.includes(kind) ? [] : [host])
    )
  })

  it("uses only the tokens' colours: no black, no pink or green, and no white text", async () => {
    const mail = await renderEmail(kind, EMAILS[kind].preview(urlsFor(ORIGINS[0])) as never)
    const colours = [...mail.html.toLowerCase().matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/g)].map((m) => m[0])
    for (const colour of colours) {
      expect(BANNED.has(colour), `${colour} is banned`).toBe(false)
      expect(PALETTE.has(colour), `${colour} is not a token`).toBe(true)
    }
    expect(mail.html.toLowerCase()).not.toMatch(/\bblack\b|rgb\(0,\s*0,\s*0\)/)
    expect(mail.html.toLowerCase()).not.toMatch(/(?<![-\w])color:\s*#ffffff/)
  })
})

describe("the shopper's return mails (M9.3)", () => {
  const urls = urlsFor(ORIGINS[0])

  it("say what came in, what was decided and why, and what the shopper gets, with the code", async () => {
    const received = await renderEmail("return.received", {
      ...EMAILS["return.received"].preview(urls),
      via: "team",
      requested: "exchange",
      exchangeTo: "L"
    })
    expect(received.subject).toBe("We hebben je retour R-1042 ontvangen")
    expect(received.text).toContain("Northwind heeft je retour R-1042 voor je aangemaakt.")
    expect(received.text).toContain("een ander exemplaar in ruil (L)")

    const rejected = await renderEmail("return.rejected", EMAILS["return.rejected"].preview(urls))
    expect(rejected.subject).toBe("Je retour R-1042 is niet goedgekeurd")
    expect(rejected.text).toContain("Buiten de retourtermijn")

    const resolved = await renderEmail("return.resolved", EMAILS["return.resolved"].preview(urls))
    expect(resolved.text).toMatch(/cadeaubon van €\s54,95/)
    expect(resolved.text).toContain("K7QMW2XR9PTB4HNA")
    const refunded = await renderEmail("return.resolved", {
      ...EMAILS["return.resolved"].preview(urls),
      kind: "claim",
      resolution: { kind: "refund", amountMinor: 8900, currency: "EUR", code: null, order: null }
    })
    expect(refunded.subject).toBe("Je melding R-1042 is afgehandeld")
    expect(refunded.text).toMatch(/We betalen €\s89,00 terug/)
  })

  it("are headed and signed with the store's name, not Insyte's mark", async () => {
    const mail = await renderEmail("return.approved", EMAILS["return.approved"].preview(urls))
    expect(mail.text).toContain("Northwind · verstuurd met Insyte")
    expect(mail.text).toContain("Distributieweg 12")
  })
})

describe("the templates' content", () => {
  it("keeps the wired mails' Dutch subjects", async () => {
    const urls = urlsFor(ORIGINS[0])
    const subjects = await Promise.all(
      (["auth.verify", "auth.reset", "auth.signup_existing", "team.invite"] as const).map(async (kind) =>
        (await renderEmail(kind, EMAILS[kind].preview(urls) as never)).subject
      )
    )
    expect(subjects).toEqual([
      "Bevestig je e-mailadres voor Insyte",
      "Kies een nieuw wachtwoord voor Insyte",
      "Je hebt al een account bij Insyte",
      "Elena Hart nodigt je uit voor Northwind"
    ])
  })

  it("says how long the reset link lasts, and escapes an inviter's note", async () => {
    const reset = await renderEmail("auth.reset", { url: "https://a.example/r?x=1&y=2" })
    expect(reset.text).toContain("30 minuten")
    expect(reset.html).toContain("https://a.example/r?x=1&amp;y=2")
    const invite = await renderEmail("team.invite", {
      url: "https://a.example/invitations/inv_1?k=abc",
      workspace: "Northwind",
      inviter: "Elena Hart",
      role: "Klantenservice",
      message: "Welkom <b>Amber</b>",
      expiresAt: new Date("2026-11-15T12:00:00Z")
    })
    expect(invite.text).toContain(
      "Elena Hart nodigde je uit om als Klantenservice mee te werken in Northwind op Insyte."
    )
    expect(invite.text).toContain("Uitnodiging bekijken: https://a.example/invitations/inv_1?k=abc")
    expect(invite.text).toContain("tot 15 november")
    expect(invite.html).toContain("Welkom &lt;b&gt;Amber&lt;/b&gt;")
    expect(invite.html).not.toContain("<b>Amber</b>")
  })

  it("marks the wired kinds and only those, and keeps marketing unsent", () => {
    const wired = KINDS.filter((kind) => EMAILS[kind].wired)
    expect(wired).toEqual([
      "auth.verify",
      "auth.reset",
      "auth.signup_existing",
      "team.invite",
      "supplier.order",
      "return.received",
      "return.approved",
      "return.rejected",
      "return.label",
      "return.resolved"
    ])
    expect(KINDS.filter((kind) => EMAILS[kind].group === "marketing").every((kind) => !EMAILS[kind].wired)).toBe(true)
  })
})
