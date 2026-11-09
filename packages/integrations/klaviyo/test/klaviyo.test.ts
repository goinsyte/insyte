import { Klaviyo } from "@insyte/modules/marketing/domain/Ports"
import { ConfigProvider, Effect, Exit, Layer, Redacted } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { KlaviyoLive } from "../src/Klaviyo.ts"

/*
 * Klaviyo's adapter against a fake transport: what each request carries (the client as HTTP Basic over a form body for
 * tokens, the bearer token and the pinned revision for the API, JSON:API bodies), and how Klaviyo's answers read back.
 */

interface Seen {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

const klaviyo = (answer: (seen: Seen) => Response, seen: Array<Seen> = []) =>
  KlaviyoLive.pipe(
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
    Layer.provide(ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({ KLAVIYO_CLIENT_ID: "client", KLAVIYO_CLIENT_SECRET: "secret" })
    ))
  )

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const run = <A, E>(layer: ReturnType<typeof klaviyo>, f: (k: Klaviyo["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromiseExit(Effect.flatMap(Effect.service(Klaviyo), f).pipe(Effect.provide(layer)))

describe("KlaviyoLive", () => {
  it("asks for approval with PKCE and the scopes, space-separated", async () => {
    const exit = await run(
      klaviyo(() => json({})),
      (k) => Effect.succeed(k.authorizeUrl({ state: "nonce", codeChallenge: "challenge", redirectUri: "https://c/cb" }))
    )
    const url = new URL(Exit.isSuccess(exit) ? exit.value : "")
    expect(url.origin + url.pathname).toBe("https://www.klaviyo.com/oauth/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client",
      redirect_uri: "https://c/cb",
      scope: "accounts:read lists:read lists:write profiles:read profiles:write",
      state: "nonce",
      code_challenge_method: "S256",
      code_challenge: "challenge"
    })
  })

  it("exchanges the code on a.klaviyo.com, the client as Basic, the grant as a form", async () => {
    const seen: Array<Seen> = []
    const answer = () => json({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "lists:read" })
    const exit = await run(
      klaviyo(answer, seen),
      (k) => k.exchange({ code: "c0de", codeVerifier: "v", redirectUri: "https://c/cb" })
    )
    expect(Exit.isSuccess(exit) && Redacted.value(exit.value.accessToken)).toBe("a")
    expect(seen[0]).toMatchObject({ method: "POST", url: "https://a.klaviyo.com/oauth/token" })
    expect(seen[0]!.headers["authorization"]).toBe(`Basic ${btoa("client:secret")}`)
    expect(Object.fromEntries(new URLSearchParams(seen[0]!.body))).toEqual({
      grant_type: "authorization_code",
      code: "c0de",
      code_verifier: "v",
      redirect_uri: "https://c/cb"
    })
  })

  it("reads invalid_grant on a refresh as the app removed", async () => {
    const exit = await run(
      klaviyo(() => json({ error: "invalid_grant" }, 400)),
      (k) => k.refresh(Redacted.make("r"))
    )
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("KlaviyoGrantGone")
  })

  it("imports profiles into a list as one JSON:API job, at the pinned revision", async () => {
    const seen: Array<Seen> = []
    const exit = await run(
      klaviyo(() => json({ data: { id: "job_1", attributes: {} } }, 202), seen),
      (k) =>
        k.importProfiles(Redacted.make("token"), "LIST_1", [{
          email: "anna@example.com",
          firstName: "Anna",
          lastName: "de Vries",
          phone: null,
          country: "NL",
          properties: { insyte_tags: ["vip"] }
        }])
    )
    expect(Exit.isSuccess(exit) && exit.value).toBe("job_1")
    expect(seen[0]).toMatchObject({ method: "POST", url: "https://a.klaviyo.com/api/profile-bulk-import-jobs" })
    expect(seen[0]!.headers).toMatchObject({ authorization: "Bearer token", revision: "2026-10-15" })
    expect(JSON.parse(seen[0]!.body)).toEqual({
      data: {
        type: "profile-bulk-import-job",
        attributes: {
          profiles: {
            data: [{
              type: "profile",
              attributes: {
                email: "anna@example.com",
                first_name: "Anna",
                last_name: "de Vries",
                location: { country: "NL" },
                properties: { insyte_tags: ["vip"] }
              }
            }]
          }
        },
        relationships: { lists: { data: [{ type: "list", id: "LIST_1" }] } }
      }
    })
  })

  it("says Klaviyo's own reason when it refuses", async () => {
    const exit = await run(
      klaviyo(() => json({ errors: [{ detail: "Invalid list" }] }, 400)),
      (k) => k.lists(Redacted.make("token"))
    )
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("Invalid list")
  })
})
