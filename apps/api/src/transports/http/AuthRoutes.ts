import { Db } from "@insyte/database/Db"
import { makeAuth } from "@insyte/integrations-better-auth/Auth"
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { Effect, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AuthSettings } from "../../platform/Bindings.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * better-auth's routes (12 §3): sign-up, verification, sign-in, sign-out, reset. Reached through the console's origin
 * only, by service binding, so the session cookie stays first-party and host-only (18 §3). The instance is built per
 * request and runs its statements on the request's own connection (`withRequestDb`): one socket per request, closed
 * with it.
 */
export const AuthRoutes = HttpRouter.add(
  "*",
  "/api/auth/*",
  Effect.gen(function*() {
    const settings = yield* AuthSettings
    const mailer = yield* Mailer
    const db = yield* Db
    const context = yield* Effect.context<never>()
    const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromiseWith(context)(effect)
    const auth = makeAuth({
      // Without the camelCase transform: better-auth maps its own snake_case columns.
      execute: (text, parameters) =>
        run(db.routing((sql) => sql.withoutTransforms().unsafe<object>(text, [...parameters]))),
      baseURL: settings.consoleOrigin,
      secret: Redacted.value(settings.secret),
      // better-auth awaits this; a failed send is logged, never a 500 on the visitor's form.
      sendMail: (mail) =>
        run(mailer.send(mail).pipe(Effect.catch((error) => Effect.logWarning(`auth mail not sent: ${error.reason}`))))
    })
    const request = yield* HttpServerRequest.toWeb(yield* HttpServerRequest.HttpServerRequest)
    const response = yield* Effect.promise(() => auth.handler(request))
    return HttpServerResponse.fromWeb(response)
  }).pipe(withRequestDb, Effect.withSpan("Auth.handler"))
)
