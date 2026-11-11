import { Config, Context, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * One transactional mail through Resend's HTTP API (16 §3). No SDK: one POST is the whole of what Insyte needs, and it
 * keeps the Worker's bundle small. The key travels as a bearer token, which Effect's client redacts in its traces.
 *
 * The idempotency key makes a retried send a no-op at Resend for 24 hours, so a request better-auth repeats, or a queue
 * redelivery later, never sends the same mail twice.
 */

const ENDPOINT = "https://api.resend.com/emails"

export interface Outgoing {
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
  readonly idempotencyKey?: string | undefined
  /** Files with the mail, as Resend takes them: base64 content and a name. */
  readonly attachments?: ReadonlyArray<{ readonly filename: string; readonly content: Uint8Array }> | undefined
  /** Where an answer goes, where it is not `from` (a support mail answered to the mailbox's own address). */
  readonly replyTo?: string | undefined
  /** Threading headers (`Message-ID`, `In-Reply-To`, `References`), for a support mail. */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

const base64 = (bytes: Uint8Array) => {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Why a mail did not go: Resend's own words, or that Resend could not be reached. Never the key. */
export class ResendError extends Schema.TaggedError<ResendError>()("ResendError", {
  reason: Schema.String
}) {}

const Accepted = Schema.Struct({ id: Schema.String })
const Refused = Schema.Struct({ name: Schema.optional(Schema.String), message: Schema.optional(Schema.String) })

export class Resend extends Context.Service<Resend, {
  readonly send: (mail: Outgoing) => Effect.Effect<{ readonly id: string }, ResendError>
}>()("integrations/Resend") {
  /** With the stage's sending key, `RESEND_API_KEY`. */
  static readonly layer = Layer.effect(
    Resend,
    Effect.gen(function*() {
      const apiKey = yield* Config.Redacted("RESEND_API_KEY")
      const client = yield* HttpClient.HttpClient
      const send = Effect.fn("Resend.send")(function*(mail: Outgoing) {
        const request = HttpClientRequest.post(ENDPOINT).pipe(
          HttpClientRequest.bearerToken(Redacted.value(apiKey)),
          mail.idempotencyKey === undefined
            ? (self) => self
            : HttpClientRequest.setHeader("idempotency-key", mail.idempotencyKey),
          HttpClientRequest.bodyJsonUnsafe({
            from: mail.from,
            to: [mail.to],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            ...(mail.replyTo === undefined ? {} : { reply_to: mail.replyTo }),
            ...(mail.headers === undefined ? {} : { headers: mail.headers }),
            ...(mail.attachments === undefined || mail.attachments.length === 0 ? {} : {
              attachments: mail.attachments.map((a) => ({ filename: a.filename, content: base64(a.content) }))
            })
          })
        )
        const response = yield* client.execute(request).pipe(
          Effect.timeout("10 seconds"),
          Effect.mapError((error) => new ResendError({ reason: `resend unreachable: ${String(error)}` }))
        )
        if (response.status >= 200 && response.status < 300) {
          return yield* HttpClientResponse.schemaBodyJson(Accepted)(response).pipe(
            Effect.mapError(() => new ResendError({ reason: `resend ${response.status}: no id in the answer` }))
          )
        }
        const refused = yield* HttpClientResponse.schemaBodyJson(Refused)(response).pipe(
          Effect.orElseSucceed(() => ({ name: undefined, message: undefined }))
        )
        return yield* new ResendError({
          reason: `resend ${response.status}: ${refused.name ?? ""} ${refused.message ?? ""}`.trim()
        })
      })
      return { send }
    })
  )
}
