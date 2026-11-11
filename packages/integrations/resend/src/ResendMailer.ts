import { type DigestLine, type Mail, Mailer, MailNotSent } from "@insyte/modules/shared/domain/Mailer"
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

/**
 * `MAIL_FROM` in another's name (a store's, to its shopper): the address stays Insyte's sending domain, the name is
 * theirs, quoted as RFC 5322 asks when it holds a special character.
 */
export const fromIn = (from: string, name: string | undefined) => {
  if (name === undefined || name.trim() === "") return from
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from.trim()
  const clean = name.replace(/["\\\r\n]/g, "").trim()
  return `${/[()<>[\]:;@,.]/.test(clean) ? `"${clean}"` : clean} <${address}>`
}

/** The same mail, sent twice within a day, is one mail: the kind, the address, the link and the reference, hashed. */
const idempotencyKey = (mail: Mail) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${mail.kind}|${mail.to.toLowerCase()}|${mail.url ?? ""}|${mail.reference ?? ""}`)
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
          case "supplier.order": {
            const facts = mail.supplierOrder
            if (facts === undefined) return Effect.fail(missing(mail, "its order"))
            return renderer.render("supplier.order", facts)
          }
          case "team.invite": {
            const facts = mail.invitation
            if (facts === undefined) return Effect.fail(missing(mail, "its facts"))
            return Effect.flatMap(link(mail), (url) => renderer.render("team.invite", { url, ...facts }))
          }
          case "return.received":
          case "return.approved":
          case "return.rejected":
          case "return.label":
          case "return.resolved": {
            const facts = mail.returnMail
            if (facts === undefined) return Effect.fail(missing(mail, "its return"))
            const portalUrl = facts.portal === null ? null : urls.console(`/retour/${encodeURIComponent(facts.portal)}`)
            return renderer.render(mail.kind, { ...facts, portalUrl })
          }
          case "order.delayed": {
            const facts = mail.orderDelay
            if (facts === undefined) return Effect.fail(missing(mail, "its order"))
            return renderer.render("order.delayed", facts)
          }
          case "member.notification": {
            const facts = mail.memberNote
            if (facts === undefined) return Effect.fail(missing(mail, "its note"))
            const { path, ...words } = facts
            return renderer.render("platform.notification", {
              ...words,
              url: urls.console(path),
              settingsUrl: urls.console("/settings/notifications")
            })
          }
          case "member.digest": {
            const facts = mail.digest
            if (facts === undefined) return Effect.fail(missing(mail, "its notes"))
            const line = (l: DigestLine) => ({ title: l.title, detail: l.detail, href: urls.console(l.path) })
            return renderer.render("platform.daily_digest", {
              workspace: facts.workspace,
              date: facts.date,
              primary: facts.primary.map(line),
              other: facts.other.map(line),
              url: urls.console("/notifications"),
              settingsUrl: urls.console("/settings/notifications")
            })
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
        yield* resend.send({
          from: fromIn(from, mail.sender),
          to: mail.to,
          ...rendered,
          idempotencyKey: yield* idempotencyKey(mail),
          attachments: mail.attachments
        }).pipe(
          Effect.mapError((error) => new MailNotSent({ kind: mail.kind, reason: error.reason }))
        )
      })
    })
  })
).pipe(Layer.provide([Resend.layer, MailRenderer.layer, MailUrls.layer]))
