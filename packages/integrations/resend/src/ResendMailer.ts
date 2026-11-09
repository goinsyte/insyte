import { type Mail, Mailer, MailNotSent } from "@insyte/modules/shared/domain/Mailer"
import { Config, Effect, Layer } from "effect"
import { MailRenderer, type Rendered } from "./MailRenderer.ts"
import { MailUrls } from "./MailUrls.ts"
import { Resend } from "./Resend.ts"

/*
 * The `Mailer` port over Resend (16 §3): staging and production, where `MAIL_ADAPTER=resend`. The adapter owns the
 * templates (`emails/`, rendered by `MailRenderer`), the links they carry (`MailUrls`, from `CONSOLE_ORIGIN`) and the
 * sender, `MAIL_FROM`: `noreply@mail.goinsyte.com` once that domain is verified in Resend. A mail that does not go is
 * `MailNotSent` with the reason; the caller logs it and goes on.
 */

/** The same mail, sent twice within a day, is one mail: the kind, the address and the link, hashed. */
const idempotencyKey = (mail: Mail) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${mail.kind}|${mail.to.toLowerCase()}|${mail.url ?? ""}`)
    )
    return `${mail.kind}/${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
  })

const missing = (mail: Mail, what: string) => new MailNotSent({ kind: mail.kind, reason: `${mail.kind} needs ${what}` })

const link = (mail: Mail) => mail.url === undefined ? Effect.fail(missing(mail, "a link")) : Effect.succeed(mail.url)

export const ResendMailer = Layer.effect(
  Mailer,
  Effect.gen(function*() {
    const resend = yield* Resend
    const renderer = yield* MailRenderer
    const urls = yield* MailUrls
    const from = yield* Config.String("MAIL_FROM").pipe(Config.withDefault("Insyte <noreply@mail.goinsyte.com>"))

    /** The mail's subject and bodies, by its kind. A mail missing what its kind needs is not sent. */
    const render = (mail: Mail): Effect.Effect<Rendered, MailNotSent> => {
      const rendered = (() => {
        switch (mail.kind) {
          case "auth.verify":
            return Effect.flatMap(link(mail), (url) => renderer.render("auth.verify", { url }))
          case "auth.reset":
            return Effect.flatMap(link(mail), (url) => renderer.render("auth.reset", { url }))
          case "auth.signup_existing":
            return renderer.render("auth.signup_existing", { loginUrl: urls.console("/login") })
          case "team.invite": {
            const facts = mail.invitation
            if (facts === undefined) return Effect.fail(missing(mail, "its facts"))
            return Effect.flatMap(link(mail), (url) => renderer.render("team.invite", { url, ...facts }))
          }
        }
      })()
      return rendered.pipe(
        Effect.catchTag(
          "MailRenderError",
          (error) => Effect.fail(new MailNotSent({ kind: mail.kind, reason: error.reason }))
        )
      )
    }

    return Mailer.of({
      send: Effect.fn("ResendMailer.send")(function*(mail: Mail) {
        const rendered = yield* render(mail)
        yield* resend.send({ from, to: mail.to, ...rendered, idempotencyKey: yield* idempotencyKey(mail) }).pipe(
          Effect.mapError((error) => new MailNotSent({ kind: mail.kind, reason: error.reason }))
        )
      })
    })
  })
).pipe(Layer.provide([Resend.layer, MailRenderer.layer, MailUrls.layer]))
