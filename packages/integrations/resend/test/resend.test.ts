import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { renderAuthMail } from "../src/AuthMails.ts"
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
  ConfigProvider.fromEnvRecord({ RESEND_API_KEY: "re_key", MAIL_FROM: "Insyte <noreply@mail.goinsyte.com>" })
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

describe("ResendMailer", () => {
  const mailer = (http: Layer.Layer<HttpClient.HttpClient>) =>
    ResendMailer.pipe(Layer.provide(http), Layer.provide(config))
  const url = "https://app.example/api/auth/verify-email?token=a"

  it("sends the Dutch mail of the kind, from MAIL_FROM, with a stable idempotency key", async () => {
    const seen: Array<Seen> = []
    const http = fakeResend(() => Promise.resolve(Response.json({ id: "re_2" })), seen)
    const sendIt = Effect.flatMap(
      Effect.service(Mailer),
      (m) => m.send({ kind: "auth.verify", to: "Eva@Example.com", url })
    )
    await Effect.runPromise(Effect.andThen(sendIt, sendIt).pipe(Effect.provide(mailer(http))))
    expect(seen[0]?.body).toMatchObject({
      from: "Insyte <noreply@mail.goinsyte.com>",
      subject: "Bevestig je e-mailadres voor Insyte",
      text: renderAuthMail("auth.verify", url).text
    })
    expect(seen[0]?.headers["idempotency-key"]).toMatch(/^auth\.verify\/[0-9a-f]{64}$/)
    expect(seen[1]?.headers["idempotency-key"]).toBe(seen[0]?.headers["idempotency-key"])
  })

  it("turns a refusal into MailNotSent", async () => {
    const http = fakeResend(() => Promise.resolve(Response.json({ message: "nope" }, { status: 422 })))
    const result = await Effect.runPromiseExit(
      Effect.flatMap(Effect.service(Mailer), (m) => m.send({ kind: "auth.reset", to: "eva@example.com", url })).pipe(
        Effect.provide(mailer(http))
      )
    )
    expect(Exit.isFailure(result) && JSON.stringify(result.cause)).toContain("MailNotSent")
  })
})

describe("renderAuthMail", () => {
  it("renders each kind in Dutch, with its link in the text and, escaped, in the HTML", () => {
    const url = "https://app.example/api/auth/verify-email?token=a&callbackURL=%2Fonboarding"
    const verify = renderAuthMail("auth.verify", url)
    expect(verify.subject).toBe("Bevestig je e-mailadres voor Insyte")
    expect(verify.text).toContain(`E-mailadres bevestigen: ${url}`)
    expect(verify.html).toContain(url.replaceAll("&", "&amp;"))
    expect(verify.html).not.toContain("#000000")
    expect(renderAuthMail("auth.reset", url).text).toContain("30 minuten")
  })

  it("renders the existing-account notice without a link, and refuses a link mail without one", () => {
    const existing = renderAuthMail("auth.signup_existing", undefined)
    expect(existing.subject).toBe("Je hebt al een account bij Insyte")
    expect(existing.html).not.toContain("<a href")
    expect(() => renderAuthMail("auth.verify", undefined)).toThrow("needs a link")
  })
})
