import { Slack } from "@insyte/modules/notifications/domain/Ports"
import { ConfigProvider, Effect, Exit, Layer, Redacted } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { SlackLive } from "../src/Slack.ts"

/*
 * Slack's adapter against a fake transport: the install page's parameters, the code exchanged with the client in a
 * form body, the bot token as a bearer, channels paged by cursor, and Slack's `ok: false` answers read back (a token
 * gone, a channel missing, a member without Slack).
 */

interface Seen {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

const slack = (answer: (seen: Seen) => Response, seen: Array<Seen> = [], env = {
  SLACK_CLIENT_ID: "123.456",
  SLACK_CLIENT_SECRET: "secret"
}) =>
  SlackLive.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        Effect.tryPromise({
          try: async () => {
            const raw = request.body as { body?: Uint8Array }
            const one = {
              method: request.method,
              url: url.href,
              headers: request.headers as Record<string, string>,
              body: raw.body === undefined ? "" : new TextDecoder().decode(raw.body)
            }
            seen.push(one)
            return HttpClientResponse.fromWeb(request, answer(one))
          },
          catch: (cause) =>
            new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
        })
      )
    )),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)))
  )

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const run = <A, E>(layer: ReturnType<typeof slack>, f: (s: Slack["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromiseExit(Effect.flatMap(Effect.service(Slack), f).pipe(Effect.provide(layer)))

const errorOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (exit.cause.reasons[0] as { error?: { _tag: string; reason?: string } })?.error : undefined

const TOKEN = Redacted.make("xoxb-test")

describe("SlackLive", () => {
  it("is not configured without the app's client, and asks for the bot scopes when it is", async () => {
    const off = await run(
      slack(() => json({}), [], { SLACK_CLIENT_ID: "123.456" } as never),
      (s) => Effect.succeed(s.configured)
    )
    expect(Exit.isSuccess(off) && off.value).toBe(false)
    const exit = await run(
      slack(() => json({})),
      (s) => Effect.succeed(s.authorizeUrl({ state: "nonce", redirectUri: "https://c/api/connect/slack/callback" }))
    )
    const url = new URL(Exit.isSuccess(exit) ? exit.value : "")
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123.456",
      scope: "chat:write,chat:write.public,channels:read,users:read,users:read.email,im:write",
      redirect_uri: "https://c/api/connect/slack/callback",
      state: "nonce"
    })
  })

  it("exchanges the code for the bot's token and the workspace", async () => {
    const seen: Array<Seen> = []
    const exit = await run(
      slack(() =>
        json({
          ok: true,
          access_token: "xoxb-1",
          scope: "chat:write,channels:read",
          bot_user_id: "U0BOT",
          team: { id: "T1", name: "Northwind" }
        }), seen),
      (s) => s.exchange({ code: "c0de", redirectUri: "https://c/cb" })
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    const install = Exit.isSuccess(exit) ? exit.value : undefined
    expect(install).toMatchObject({ teamId: "T1", teamName: "Northwind", botUserId: "U0BOT" })
    expect(Redacted.value(install!.botToken)).toBe("xoxb-1")
    expect(install!.scopes).toEqual(["chat:write", "channels:read"])
    expect(seen[0]!.url).toBe("https://slack.com/api/oauth.v2.access")
    expect(Object.fromEntries(new URLSearchParams(seen[0]!.body))).toEqual({
      client_id: "123.456",
      client_secret: "secret",
      code: "c0de",
      redirect_uri: "https://c/cb"
    })
    const bad = await run(
      slack(() => json({ ok: false, error: "invalid_code" })),
      (s) => s.exchange({ code: "x", redirectUri: "https://c/cb" })
    )
    expect(errorOf(bad)).toMatchObject({ _tag: "SlackRefused", reason: "invalid_code" })
  })

  it("lists public channels page by page, by name, with the bot's token", async () => {
    const seen: Array<Seen> = []
    const exit = await run(
      slack(
        (one) =>
          new URL(one.url).searchParams.has("cursor")
            ? json({ ok: true, channels: [{ id: "C2", name: "algemeen" }], response_metadata: { next_cursor: "" } })
            : json({ ok: true, channels: [{ id: "C1", name: "operations" }], response_metadata: { next_cursor: "n" } }),
        seen
      ),
      (s) => s.channels(TOKEN)
    )
    expect(Exit.isSuccess(exit) && exit.value).toEqual([{ id: "C2", name: "algemeen" }, {
      id: "C1",
      name: "operations"
    }])
    expect(seen).toHaveLength(2)
    expect(seen[0]!.headers["authorization"]).toBe("Bearer xoxb-test")
    expect(Object.fromEntries(new URL(seen[0]!.url).searchParams)).toEqual({
      types: "public_channel",
      exclude_archived: "true",
      limit: "200"
    })
    expect(new URL(seen[1]!.url).searchParams.get("cursor")).toBe("n")
  })

  it("posts a message, and reads a token gone, a channel missing and a member without Slack", async () => {
    const seen: Array<Seen> = []
    const posted = await run(
      slack(() => json({ ok: true, ts: "1.2" }), seen),
      (s) => s.post(TOKEN, { channel: "C1", text: "*Hoi*" })
    )
    expect(Exit.isSuccess(posted)).toBe(true)
    expect(seen[0]!.url).toBe("https://slack.com/api/chat.postMessage")
    expect(JSON.parse(seen[0]!.body)).toEqual({ channel: "C1", text: "*Hoi*", unfurl_links: false })

    const gone = await run(
      slack(() => json({ ok: false, error: "token_revoked" })),
      (s) => s.post(TOKEN, { channel: "C1", text: "x" })
    )
    expect(errorOf(gone)).toMatchObject({ _tag: "SlackGone", reason: "token_revoked" })
    const missing = await run(
      slack(() => json({ ok: false, error: "channel_not_found" })),
      (s) => s.post(TOKEN, { channel: "C9", text: "x" })
    )
    expect(errorOf(missing)).toMatchObject({ _tag: "SlackRefused", reason: "channel_not_found" })
    const limited = await run(slack(() => json({}, 429)), (s) => s.post(TOKEN, { channel: "C1", text: "x" }))
    expect(errorOf(limited)).toMatchObject({ _tag: "SlackRefused", reason: "ratelimited" })

    const nobody = await run(
      slack(() => json({ ok: false, error: "users_not_found" })),
      (s) => s.userByEmail(TOKEN, "a@b.test")
    )
    expect(Exit.isSuccess(nobody) && nobody.value).toBeNull()
    const someone = await run(
      slack(() => json({ ok: true, user: { id: "U7" } })),
      (s) => s.userByEmail(TOKEN, "a@b.test")
    )
    expect(Exit.isSuccess(someone) && someone.value).toBe("U7")
  })
})
