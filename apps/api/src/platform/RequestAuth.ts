import { Db } from "@insyte/database/Db"
import { makeAuth } from "@insyte/integrations-better-auth/Auth"
import { isBreached } from "@insyte/integrations-better-auth/Breached"
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { Effect, Redacted } from "effect"
import { admitted } from "./BetaGate.ts"
import { AuthSettings } from "./Bindings.ts"

/**
 * better-auth for this request, over this request's connection (`Db`, from `withRequestDb`). The auth routes and the
 * session check (`Sessions.ts`) both build it here, so they cannot disagree about the configuration.
 */
export const requestAuth = Effect.gen(function*() {
  const settings = yield* AuthSettings
  const mailer = yield* Mailer
  const db = yield* Db
  const context = yield* Effect.context<never>()
  const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromiseWith(context)(effect)
  return makeAuth({
    // Without the camelCase transform: better-auth maps its own snake_case columns.
    execute: (text, parameters) =>
      run(db.routing((sql) => sql.withoutTransforms().unsafe<object>(text, [...parameters]))),
    baseURL: settings.consoleOrigin,
    secret: Redacted.value(settings.secret),
    // A lookup that fails refuses: the gate stays shut rather than open when the database does not answer.
    admits: (email) =>
      run(
        admitted(email).pipe(
          Effect.provideService(AuthSettings, settings),
          Effect.provideService(Db, db),
          Effect.orElseSucceed(() => false)
        )
      ),
    isBreached: settings.checkBreachedPasswords ? (password) => isBreached(password) : undefined,
    // better-auth awaits this; a failed send is logged, never a 500 on the visitor's form.
    sendMail: (mail) =>
      run(mailer.send(mail).pipe(Effect.catch((error) => Effect.logWarning(`auth mail not sent: ${error.reason}`))))
  })
})
