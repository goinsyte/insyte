/*
 * Sends the three account mails through Resend for real, through the same `ResendMailer` the Worker uses, to look at
 * them in an inbox. Run it yourself; the key never needs to be pasted anywhere:
 *
 *   RESEND_API_KEY=$(grep '^RESEND_API_KEY=' ~/vantion/insyte/.env.local | cut -d= -f2-) bun run mail:smoke [to] [from]
 *
 * Until `mail.goinsyte.com` is verified, Resend sends only from its test sender (the default here) and only to the
 * account's own address or its test inboxes (`delivered@resend.dev`, the default recipient).
 */
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { ConfigProvider, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { ResendMailer } from "../packages/integrations/resend/src/ResendMailer.ts"

const to = process.argv[2] ?? "delivered@resend.dev"
const from = process.argv[3] ?? "Insyte <onboarding@resend.dev>"
const key = process.env["RESEND_API_KEY"]
if (key === undefined || key === "") {
  console.error("mail:smoke: set RESEND_API_KEY for this command (see the header).")
  process.exit(1)
}

// The links point at staging's console; `CONSOLE_ORIGIN` overrides it, as it does in the Worker.
const origin = process.env["CONSOLE_ORIGIN"] ?? "https://insyte-console-staging.ishak-73d.workers.dev"
const link = `${origin}/onboarding?step=2`

const program = Effect.gen(function*() {
  const mailer = yield* Mailer
  for (const kind of ["auth.verify", "auth.reset", "auth.signup_existing"] as const) {
    yield* mailer.send({ kind, to, url: kind === "auth.signup_existing" ? undefined : link })
    console.log(`mail:smoke: ${kind} sent to ${to}`)
  }
})

await Effect.runPromise(program.pipe(
  Effect.provide(ResendMailer.pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnvRecord({ RESEND_API_KEY: key, MAIL_FROM: from, CONSOLE_ORIGIN: origin })
      )
    )
  ))
)).catch((error) => {
  console.error(`mail:smoke: ${String(error)}`)
  process.exit(1)
})
