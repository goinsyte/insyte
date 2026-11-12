import { ResendDomains, SendingDomainsUnset } from "@insyte/integrations-resend/ResendDomains"
import { ResendDomainsRecorded } from "@insyte/integrations-resend/ResendDomainsRecorded"
import type { SendingDomains } from "@insyte/modules/settings/domain/SendingDomain"
import { Config, Effect, Layer, Option } from "effect"
import type { HttpClient } from "effect/http"

/*
 * The brand's sending domain (M17 step 20.1c): Resend's domains API where the stage sends its mail through Resend
 * (`MAIL_ADAPTER=resend`) with a key; the recorded twin where the worker tests say `SENDING_DOMAINS_ADAPTER=recorded`;
 * and anywhere else none (`SendingDomainsUnset`), so E-mail en domein says it is not available here. A local run with a
 * key in its `.dev.vars` but capturing its mail makes no domain at Resend: its mail would never go from it.
 */
export const SendingDomainsChoice = Layer.unwrap(
  Effect.gen(function*() {
    const adapter = yield* Config.String("SENDING_DOMAINS_ADAPTER").pipe(Config.withDefault("resend"))
    const mail = yield* Config.String("MAIL_ADAPTER").pipe(Config.withDefault("capture"))
    const key = yield* Config.Redacted("RESEND_API_KEY").pipe(Config.option)
    return (adapter === "recorded"
      ? ResendDomainsRecorded
      : mail === "resend" && Option.isSome(key)
      ? ResendDomains
      : SendingDomainsUnset) as Layer.Layer<SendingDomains, Config.ConfigError, HttpClient.HttpClient>
  })
)
