import { Connect, withConnection } from "@insyte/database/Connect"
import { type Mail, Mailer, MailNotSent } from "@insyte/modules/shared/domain/Mailer"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

/**
 * The records whose mails the capture adapter refuses, as a mail server that bounces them would
 * (`POST /api/__dev/mail/refuse`): so what happens to a mail that does not go can be seen locally and in the worker
 * tests. Only this isolate's, and never in production, where the capture adapter is not used.
 */
export const refusedReferences = new Set<string>()

/**
 * The records whose mails find the provider busy, as Resend's 429 (`POST /api/__dev/mail/refuse?busy=1`): so a mail
 * tried again later can be seen. Only this isolate's, and never in production.
 */
export const busyReferences = new Set<string>()

/**
 * The sending domains whose `from` the capture adapter refuses as Resend does a domain that is not verified
 * (`POST /api/__dev/mail/refuse-sender`): so a brand's mail falling back to Insyte's address can be seen. Only this
 * isolate's, and never in production.
 */
export const refusedSenderDomains = new Set<string>()

const senderRefused = (mail: Mail) =>
  mail.from !== undefined && refusedSenderDomains.has(mail.from.slice(mail.from.lastIndexOf("@") + 1).toLowerCase())

/**
 * The address and the answer address the capture adapter was asked to send a record's newest mail with (E-mail en
 * domein, M17 step 20.1c), by its reference, for the dev route: `captured_mail` predates them. Only this isolate's.
 */
export const capturedSenders = new Map<string, { readonly from: string | null; readonly replyTo: string | null }>()

/** What a member's mail says on top, so a test can read it: a note's sentence, a digest's count. */
const subjectOf = (mail: Mail): string | null =>
  mail.support?.subject ?? mail.orderMessage?.subject ?? mail.memberNote?.title ??
    (mail.digest === undefined ? null : `${mail.digest.primary.length + mail.digest.other.length} meldingen`)

/**
 * The capture adapter: a mail is a row in `captured_mail`, written on a connection of its own, and the dev route reads
 * it back (`DevRoutes.ts`). What local, the worker tests and previews use; Resend replaces it where `MAIL_ADAPTER`
 * says so.
 */
export const MailerCapture = Layer.effect(
  Mailer,
  Effect.map(Effect.service(Connect), (connect) =>
    Mailer.of({
      send: (mail) =>
        mail.reference !== undefined && refusedReferences.has(mail.reference)
          ? Effect.fail(new MailNotSent({ kind: mail.kind, reason: "het adres weigert de mail" }))
          : senderRefused(mail)
          ? Effect.fail(
            new MailNotSent({
              kind: mail.kind,
              reason: "resend 403: validation_error The domain is not verified.",
              senderRefused: true
            })
          )
          // After a refused sender, so the fallback to Insyte's address can find the provider busy too.
          : mail.reference !== undefined && busyReferences.has(mail.reference)
          ? Effect.fail(
            new MailNotSent({ kind: mail.kind, reason: "resend 429: rate_limit_exceeded", retryable: true })
          )
          : Effect.sync(() => {
            if (mail.reference !== undefined) {
              capturedSenders.set(mail.reference, { from: mail.from ?? null, replyTo: mail.replyTo ?? null })
            }
          }).pipe(
            Effect.andThen(withConnection(Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) =>
              sql`insert into captured_mail (kind, to_address, url, reference, sender, subject, body_text)
                values (${mail.kind}, ${mail.to.toLowerCase()}, ${mail.url ?? mail.memberNote?.path ?? null},
                        ${mail.reference ?? null}, ${mail.sender ?? null}, ${subjectOf(mail)},
                        ${mail.support?.text ?? mail.orderMessage?.paragraphs.join("\n\n") ?? null})`))),
            Effect.provideService(Connect, connect),
            Effect.asVoid,
            Effect.mapError((error) => new MailNotSent({ kind: mail.kind, reason: error.message }))
          )
    }))
)
