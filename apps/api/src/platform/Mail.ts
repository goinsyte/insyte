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
 * The address and the answer address the capture adapter was asked to send a record's newest mail with (E-mail en
 * domein, M17 step 20.1c), by its reference, for the dev route: `captured_mail` predates them. Only this isolate's.
 */
export const capturedSenders = new Map<string, { readonly from: string | null; readonly replyTo: string | null }>()

/** What a member's mail says on top, so a test can read it: a note's sentence, a digest's count. */
const subjectOf = (mail: Mail): string | null =>
  mail.memberNote?.title ??
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
          : Effect.sync(() => {
            if (mail.reference !== undefined) {
              capturedSenders.set(mail.reference, { from: mail.from ?? null, replyTo: mail.replyTo ?? null })
            }
          }).pipe(
            Effect.andThen(withConnection(Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) =>
              sql`insert into captured_mail (kind, to_address, url, reference, sender, subject, body_text)
                values (${mail.kind}, ${mail.to.toLowerCase()}, ${mail.url ?? mail.memberNote?.path ?? null},
                        ${mail.reference ?? null}, ${mail.sender ?? null}, ${mail.support?.subject ?? subjectOf(mail)},
                        ${mail.support?.text ?? null})`))),
            Effect.provideService(Connect, connect),
            Effect.asVoid,
            Effect.mapError((error) => new MailNotSent({ kind: mail.kind, reason: error.message }))
          )
    }))
)
