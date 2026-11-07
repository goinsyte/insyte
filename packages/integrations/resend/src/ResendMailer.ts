import { type Mail, Mailer, MailNotSent } from "@insyte/modules/shared/domain/Mailer"
import { Config, Effect, Layer } from "effect"
import { renderAuthMail } from "./AuthMails.ts"
import { Resend } from "./Resend.ts"

/*
 * The `Mailer` port over Resend (16 §3): staging and production, where `MAIL_ADAPTER=resend`. The adapter owns the
 * template (`AuthMails.ts`) and the sender, `MAIL_FROM`: `noreply@mail.goinsyte.com` once that domain is verified in
 * Resend. A mail that does not go is `MailNotSent` with Resend's reason; the caller logs it and goes on.
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

export const ResendMailer = Layer.effect(
  Mailer,
  Effect.gen(function*() {
    const resend = yield* Resend
    const from = yield* Config.String("MAIL_FROM").pipe(Config.withDefault("Insyte <noreply@mail.goinsyte.com>"))
    return Mailer.of({
      send: Effect.fn("ResendMailer.send")(function*(mail: Mail) {
        const rendered = yield* Effect.try({
          try: () => renderAuthMail(mail.kind, mail.url),
          catch: (error) => new MailNotSent({ kind: mail.kind, reason: String(error) })
        })
        yield* resend.send({ from, to: mail.to, ...rendered, idempotencyKey: yield* idempotencyKey(mail) }).pipe(
          Effect.mapError((error) => new MailNotSent({ kind: mail.kind, reason: error.reason }))
        )
      })
    })
  })
).pipe(Layer.provide(Resend.layer))
