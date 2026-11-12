import { Slack, SLACK_SCOPES, SlackGone, SlackRefused } from "@insyte/modules/notifications/domain/Ports"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

/*
 * Slack's OAuth v2 and Web API (M11 step 13.5): the install page on slack.com, `oauth.v2.access` with the client as a
 * form body, and the bot token as a bearer for `conversations.list`, `users.lookupByEmail`, `chat.postMessage` and
 * `auth.revoke`. Slack answers 200 with `ok: false` and an error code for most refusals; a token that no longer works
 * (`invalid_auth`, `token_revoked`, `account_inactive`) is `SlackGone`. Without `SLACK_CLIENT_ID` and its secret the
 * stage has no Slack app, and connecting says so.
 */

const AUTHORIZE = "https://slack.com/oauth/v2/authorize"
const API = "https://slack.com/api"

/** Slack's words for a token that will never work again. */
const GONE = new Set(["invalid_auth", "token_revoked", "account_inactive", "token_expired", "not_authed"])

const Answer = Schema.Struct({ ok: Schema.Boolean, error: Schema.optional(Schema.String) })

const Access = Schema.Struct({
  ok: Schema.Literal(true),
  access_token: Schema.String,
  scope: Schema.optional(Schema.String),
  bot_user_id: Schema.String,
  team: Schema.Struct({ id: Schema.String, name: Schema.String })
})

const Channels = Schema.Struct({
  ok: Schema.Literal(true),
  channels: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  response_metadata: Schema.optional(Schema.Struct({ next_cursor: Schema.optional(Schema.String) }))
})

const User = Schema.Struct({ ok: Schema.Literal(true), user: Schema.Struct({ id: Schema.String }) })

const refused = (status: number, reason: string) => new SlackRefused({ status, reason })

const bearer = (token: Redacted.Redacted<string>) =>
  HttpClientRequest.setHeader("authorization", `Bearer ${Redacted.value(token)}`)

export const SlackLive = Layer.effect(
  Slack,
  Effect.gen(function*() {
    const clientId = Option.getOrElse(yield* Config.String("SLACK_CLIENT_ID").pipe(Config.option), () => "")
    const clientSecret = yield* Config.Redacted("SLACK_CLIENT_SECRET").pipe(Config.option)
    const http = yield* HttpClient.HttpClient

    /** One Web API call; its body read with `schema` once Slack says `ok`. */
    const call = <S extends Schema.Top>(request: HttpClientRequest.HttpClientRequest, schema: S) =>
      Effect.gen(function*() {
        const response = yield* http.execute(request).pipe(
          Effect.timeout("15 seconds"),
          Effect.mapError((error) => refused(0, `request failed: ${error._tag}`))
        )
        if (response.status === 429) return yield* refused(429, "ratelimited")
        if (response.status >= 400) return yield* refused(response.status, `slack answered ${response.status}`)
        const json: unknown = yield* response.json.pipe(Effect.mapError(() => refused(response.status, "unreadable")))
        const answer = yield* Schema.decodeUnknownEffect(Answer)(json).pipe(
          Effect.mapError(() => refused(response.status, "unreadable"))
        )
        if (!answer.ok) {
          const reason = answer.error ?? "unknown"
          return yield* (GONE.has(reason) ? new SlackGone({ reason }) : refused(response.status, reason))
        }
        return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
          Effect.mapError(() => refused(response.status, "unreadable"))
        )
      })

    return Slack.of({
      configured: clientId !== "" && Option.isSome(clientSecret),
      authorizeUrl: ({ state, redirectUri }) =>
        `${AUTHORIZE}?${new URLSearchParams({
          client_id: clientId,
          scope: SLACK_SCOPES.join(","),
          redirect_uri: redirectUri,
          state
        })}`,
      exchange: Effect.fn("Slack.exchange")(function*({ code, redirectUri }) {
        const access = yield* call(
          HttpClientRequest.post(`${API}/oauth.v2.access`).pipe(
            HttpClientRequest.bodyUrlParams({
              client_id: clientId,
              client_secret: Option.match(clientSecret, { onNone: () => "", onSome: Redacted.value }),
              code,
              redirect_uri: redirectUri
            })
          ),
          Access
        ).pipe(Effect.catchTag("SlackGone", (e) => Effect.fail(refused(200, e.reason))))
        return {
          teamId: access.team.id,
          teamName: access.team.name,
          botUserId: access.bot_user_id,
          botToken: Redacted.make(access.access_token),
          scopes: (access.scope ?? "").split(",").filter((s) => s !== "")
        }
      }),
      channels: Effect.fn("Slack.channels")(function*(token) {
        const out: Array<{ id: string; name: string }> = []
        let cursor = ""
        // At most five pages of 200: a workspace with more public channels than that lists its first thousand.
        for (let page = 0; page < 5; page++) {
          const params: Record<string, string> = {
            types: "public_channel",
            exclude_archived: "true",
            limit: "200",
            ...(cursor === "" ? {} : { cursor })
          }
          const listed = yield* call(
            HttpClientRequest.get(`${API}/conversations.list`).pipe(
              bearer(token),
              HttpClientRequest.setUrlParams(params)
            ),
            Channels
          )
          out.push(...listed.channels.map((c) => ({ id: c.id, name: c.name })))
          cursor = listed.response_metadata?.next_cursor ?? ""
          if (cursor === "") break
        }
        // The page lists them by name; `out` is this call's own.
        // oxlint-disable-next-line unicorn/no-array-sort
        return out.sort((a, b) => a.name.localeCompare(b.name))
      }),
      userByEmail: Effect.fn("Slack.userByEmail")(function*(token, email) {
        return yield* call(
          HttpClientRequest.get(`${API}/users.lookupByEmail`).pipe(
            bearer(token),
            HttpClientRequest.setUrlParams({ email })
          ),
          User
        ).pipe(
          Effect.map((u) => u.user.id as string | null),
          Effect.catchTag("SlackRefused", (e) => e.reason === "users_not_found" ? Effect.succeed(null) : Effect.fail(e))
        )
      }),
      post: Effect.fn("Slack.post")(function*(token, message) {
        yield* call(
          HttpClientRequest.post(`${API}/chat.postMessage`).pipe(
            bearer(token),
            HttpClientRequest.bodyJsonUnsafe({ channel: message.channel, text: message.text, unfurl_links: false })
          ),
          Answer
        )
      }),
      revoke: (token) =>
        call(HttpClientRequest.post(`${API}/auth.revoke`).pipe(bearer(token)), Answer).pipe(Effect.ignore)
    })
  })
)
