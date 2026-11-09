import {
  Klaviyo,
  KLAVIYO_SCOPES,
  KlaviyoGrantGone,
  type KlaviyoList,
  KlaviyoRefused,
  type KlaviyoTokens
} from "@insyte/modules/marketing/domain/Ports"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * Klaviyo's OAuth app and API (M7.5): the authorize page on www.klaviyo.com, the token and revoke endpoints on
 * a.klaviyo.com (Klaviyo blocks token traffic through www since March 2025), client authentication as HTTP Basic over
 * a form body, and the JSON:API endpoints at one pinned revision. Without `KLAVIYO_CLIENT_ID` and its secret the stage
 * has no app, and connecting says so.
 */

const AUTHORIZE = "https://www.klaviyo.com/oauth/authorize"
const API = "https://a.klaviyo.com"
const REVISION = "2026-10-15"

const Token = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Finite,
  scope: Schema.optional(Schema.String)
})

const TokenError = Schema.Struct({ error: Schema.String })

const Lists = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: Schema.String, attributes: Schema.Struct({ name: Schema.String }) })),
  links: Schema.optional(Schema.Struct({ next: Schema.optional(Schema.NullOr(Schema.String)) }))
})

const One = Schema.Struct({ data: Schema.Struct({ id: Schema.String, attributes: Schema.Unknown }) })

const Accounts = Schema.Struct({
  data: Schema.Array(Schema.Struct({
    id: Schema.String,
    attributes: Schema.Struct({
      contact_information: Schema.optional(Schema.Struct({ organization_name: Schema.optional(Schema.String) }))
    })
  }))
})

const refused = (status: number, reason: string) => new KlaviyoRefused({ status, reason })

export const KlaviyoLive = Layer.effect(
  Klaviyo,
  Effect.gen(function*() {
    const clientId = Option.getOrElse(yield* Config.String("KLAVIYO_CLIENT_ID").pipe(Config.option), () => "")
    const clientSecret = yield* Config.Redacted("KLAVIYO_CLIENT_SECRET").pipe(Config.option)
    const http = yield* HttpClient.HttpClient
    const basic = Option.match(clientSecret, {
      onNone: () => "",
      onSome: (secret) => `Basic ${btoa(`${clientId}:${Redacted.value(secret)}`)}`
    })

    /** The token endpoint for a grant; `invalid_grant` on a refresh is the app removed. */
    const tokens = Effect.fn("Klaviyo.tokens")(function*(grant: Record<string, string>) {
      const response = yield* http.execute(
        HttpClientRequest.post(`${API}/oauth/token`).pipe(
          HttpClientRequest.setHeader("authorization", basic),
          HttpClientRequest.bodyUrlParams(grant)
        )
      ).pipe(
        Effect.timeout("15 seconds"),
        Effect.mapError((error) => refused(0, `token request failed: ${error._tag}`))
      )
      if (response.status >= 400) {
        const body = yield* HttpClientResponse.schemaBodyJson(TokenError)(response).pipe(Effect.option)
        if (Option.isSome(body) && body.value.error === "invalid_grant") return yield* new KlaviyoGrantGone()
        return yield* refused(
          response.status,
          Option.match(body, { onNone: () => "token refused", onSome: (b) => b.error })
        )
      }
      const body = yield* HttpClientResponse.schemaBodyJson(Token)(response).pipe(
        Effect.mapError(() => refused(response.status, "token answer unreadable"))
      )
      return {
        accessToken: Redacted.make(body.access_token),
        refreshToken: Redacted.make(body.refresh_token),
        expiresAt: new Date(Date.now() + body.expires_in * 1000),
        scopes: (body.scope ?? "").split(" ").filter((s) => s !== "")
      } satisfies KlaviyoTokens
    })

    /** One API call with the access token; Klaviyo's errors say why in `errors[].detail`. */
    const call = Effect.fn("Klaviyo.call")(function*(
      token: Redacted.Redacted<string>,
      request: HttpClientRequest.HttpClientRequest
    ) {
      const response = yield* http.execute(
        request.pipe(
          HttpClientRequest.setHeaders({
            authorization: `Bearer ${Redacted.value(token)}`,
            revision: REVISION,
            accept: "application/vnd.api+json"
          })
        )
      ).pipe(
        Effect.timeout("20 seconds"),
        Effect.mapError((error) => refused(0, `request failed: ${error._tag}`))
      )
      if (response.status >= 400) {
        const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
        const detail = /"detail"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? `answered ${response.status}`
        return yield* refused(response.status, detail)
      }
      return response
    })

    const read = <S extends Schema.Top>(schema: S, response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError(() => refused(response.status, "answer unreadable"))
      )

    return Klaviyo.of({
      configured: clientId !== "" && Option.isSome(clientSecret),
      authorizeUrl: ({ state, codeChallenge, redirectUri }) =>
        `${AUTHORIZE}?${new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: KLAVIYO_SCOPES.join(" "),
          state,
          code_challenge_method: "S256",
          code_challenge: codeChallenge
        })}`,
      exchange: ({ code, codeVerifier, redirectUri }) =>
        tokens({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri }).pipe(
          // A code is only ever refused, never a removed grant.
          Effect.catchTag("KlaviyoGrantGone", () => Effect.fail(refused(400, "invalid_grant")))
        ),
      refresh: (refreshToken) => tokens({ grant_type: "refresh_token", refresh_token: Redacted.value(refreshToken) }),
      revoke: (refreshToken) =>
        http.execute(
          HttpClientRequest.post(`${API}/oauth/revoke`).pipe(
            HttpClientRequest.setHeader("authorization", basic),
            HttpClientRequest.bodyUrlParams({ token_type_hint: "refresh_token", token: Redacted.value(refreshToken) })
          )
        ).pipe(Effect.timeout("10 seconds"), Effect.ignore),
      account: Effect.fn("Klaviyo.account")(function*(token) {
        const accounts = yield* read(Accounts, yield* call(token, HttpClientRequest.get(`${API}/api/accounts`)))
        const first = accounts.data[0]
        if (first === undefined) return yield* refused(200, "no account")
        return { id: first.id, name: first.attributes.contact_information?.organization_name ?? "Klaviyo" }
      }),
      lists: Effect.fn("Klaviyo.lists")(function*(token) {
        const all: Array<KlaviyoList> = []
        let next: string | null = `${API}/api/lists?fields[list]=name`
        // A few pages at most: an account with more lists than this is shown the first five hundred.
        for (let page = 0; next !== null && page < 50; page++) {
          const body: typeof Lists.Type = yield* read(Lists, yield* call(token, HttpClientRequest.get(next)))
          for (const l of body.data) all.push({ id: l.id, name: l.attributes.name })
          next = body.links?.next ?? null
        }
        return all
      }),
      createList: Effect.fn("Klaviyo.createList")(function*(token, name) {
        const body = yield* read(
          One,
          yield* call(
            token,
            HttpClientRequest.post(`${API}/api/lists`).pipe(
              HttpClientRequest.bodyJsonUnsafe({ data: { type: "list", attributes: { name } } })
            )
          )
        )
        return { id: body.data.id, name }
      }),
      importProfiles: Effect.fn("Klaviyo.importProfiles")(function*(token, listId, profiles) {
        const data = profiles.map((p) => ({
          type: "profile",
          attributes: {
            email: p.email,
            ...(p.firstName === null ? {} : { first_name: p.firstName }),
            ...(p.lastName === null ? {} : { last_name: p.lastName }),
            ...(p.phone === null ? {} : { phone_number: p.phone }),
            ...(p.country === null ? {} : { location: { country: p.country } }),
            properties: p.properties
          }
        }))
        const body = yield* read(
          One,
          yield* call(
            token,
            HttpClientRequest.post(`${API}/api/profile-bulk-import-jobs`).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                data: {
                  type: "profile-bulk-import-job",
                  attributes: { profiles: { data } },
                  relationships: { lists: { data: [{ type: "list", id: listId }] } }
                }
              })
            )
          )
        )
        return body.data.id
      })
    })
  })
)
