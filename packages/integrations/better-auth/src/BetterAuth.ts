import { Db } from "@insyte/database/Db"
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { Config, Context, Effect, Layer, Option, Redacted } from "effect"
import { type Auth, makeAuth } from "./Auth.ts"
import type { AuthEvent } from "./Events.ts"
import { PwnedPasswords } from "./PwnedPasswords.ts"

/*
 * better-auth as a service (12 §3): the configuration read once, at layer build, and an instance per request over that
 * request's connection, because a socket cannot outlive the request that opened it on Workers. `authOptions` and
 * `makeAuth` stay plain functions: `scripts/auth-schema.ts` reads the same options without a runtime.
 *
 * What better-auth needs from Insyte it takes from its context: the `Mailer` port, `PwnedPasswords`, and `AuthHooks`,
 * the app's half of the beta gate and the security log, which live with the app's tables.
 */

/**
 * The app's answers to better-auth's questions: may this address have an account; store this event. On the request's
 * connection, as better-auth's own queries are.
 *
 * @effect-expect-leaking Db
 */
export class AuthHooks extends Context.Service<AuthHooks, {
  readonly admits: (email: string) => Effect.Effect<boolean, never, Db>
  readonly record: (event: AuthEvent) => Effect.Effect<void, never, Db>
}>()("integrations/better-auth/AuthHooks") {}

/** Locally a fixed secret stands in, so `wrangler dev` and the worker tests need no `.dev.vars`; never deployed. */
const LOCAL_SECRET = Redacted.make("local-development-secret-never-deployed-0123456789")

/**
 * @effect-expect-leaking Db
 * `forRequest` asks for the request's connection on purpose: the instance lives and dies with that request.
 */
export class BetterAuth extends Context.Service<BetterAuth, {
  /** better-auth for this request, over this request's connection (`Db`, from `withRequestDb`). */
  readonly forRequest: Effect.Effect<Auth, never, Db>
}>()("integrations/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function*() {
      const local = (yield* Config.String("ENVIRONMENT")) === "local"
      // The console's origin: cookies, links in mail and the CSRF check name it (18 §2).
      const baseURL = yield* Config.String("CONSOLE_ORIGIN")
      const secret = yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(
        local ? Config.withDefault(LOCAL_SECRET) : (config) => config
      )
      const googleClientId = yield* Config.String("GOOGLE_CLIENT_ID").pipe(Config.withDefault(""))
      const googleClientSecret = yield* Config.Redacted("GOOGLE_CLIENT_SECRET").pipe(Config.option)
      const google = googleClientId !== "" && Option.isSome(googleClientSecret)
        ? { clientId: googleClientId, clientSecret: Redacted.value(googleClientSecret.value) }
        : undefined

      const mailer = yield* Mailer
      const pwned = yield* PwnedPasswords
      const hooks = yield* AuthHooks

      const forRequest = Effect.gen(function*() {
        const db = yield* Db
        // better-auth calls back with promises; each runs in this request's fiber context, on its connection.
        const context = yield* Effect.context<never>()
        const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
          Effect.runPromiseWith(context)(Effect.provideService(effect, Db, db))
        return makeAuth({
          // Without the camelCase transform: better-auth maps its own snake_case columns.
          execute: (text, parameters) =>
            run(db.routing((sql) => sql.withoutTransforms().unsafe<object>(text, [...parameters]))),
          baseURL,
          secret: Redacted.value(secret),
          google,
          // better-auth awaits this; a failed send is logged, never a 500 on the visitor's form.
          sendMail: (mail) =>
            run(
              mailer.send(mail).pipe(Effect.catch((error) => Effect.logWarning(`auth mail not sent: ${error.reason}`)))
            ),
          isBreached: (password) => run(pwned.isBreached(password)),
          admits: (email) => run(hooks.admits(email)),
          recordEvent: (event) => run(hooks.record(event))
        })
      }).pipe(Effect.withSpan("BetterAuth.forRequest"))

      return { forRequest }
    })
  )
}
