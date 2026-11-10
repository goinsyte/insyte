import { Connect, withConnection } from "@insyte/database/Connect"
import { Mailer, MailNotSent } from "@insyte/modules/shared/domain/Mailer"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

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
        withConnection(Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) =>
          sql`insert into captured_mail (kind, to_address, url, reference, sender)
              values (${mail.kind}, ${mail.to.toLowerCase()}, ${mail.url ?? null}, ${mail.reference ?? null},
                      ${mail.sender ?? null})`)).pipe(
            Effect.provideService(Connect, connect),
            Effect.asVoid,
            Effect.mapError((error) =>
              new MailNotSent({ kind: mail.kind, reason: error.message })
            )
          )
    }))
)
