import { ShopifyAdmin, ShopifyGraphql } from "@insyte/modules/stores/domain/Ports"
import { Cause, ConfigProvider, Effect, Exit, Layer, Redacted } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { SCOPES, ShopifyAdminLive } from "../src/ShopifyAdmin.ts"
import { scopeIn, ShopifyGraphqlLive } from "../src/ShopifyGraphql.ts"
import { ShopifyGraphqlRecorded } from "../src/ShopifyRecorded.ts"

/*
 * The Shopify adapter (M6.2) against a fake Shopify: the approval page's address, the callback's signature, a shop that
 * does not exist, and the code's exchange for expiring offline tokens. Test credentials, never the app's.
 */

const SECRET = "shpss_test_secret"

interface Seen {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

const fakeShopify = (answer: (url: string) => Response, seen: Array<Seen> = []) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.tryPromise({
        try: async () => {
          const raw = (request.body as { body?: Uint8Array }).body
          seen.push({
            url: url.href,
            headers: request.headers,
            body: raw === undefined ? undefined : JSON.parse(new TextDecoder().decode(raw))
          })
          return HttpClientResponse.fromWeb(request, answer(url.href))
        },
        catch: (cause) =>
          new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
      })
    )
  )

const config = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))

const run = <A, E>(
  use: (shopify: ShopifyAdmin["Service"]) => Effect.Effect<A, E>,
  http = fakeShopify(() => new Response(null, { status: 404 })),
  env: Record<string, string> = { SHOPIFY_CLIENT_ID: "client-1", SHOPIFY_CLIENT_SECRET: SECRET }
) =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(ShopifyAdmin), use).pipe(
      Effect.provide(ShopifyAdminLive.pipe(Layer.provide(http), Layer.provide(config(env))))
    )
  )

describe("the Shopify adapter", () => {
  it("is not configured without the app's id and secret", async () => {
    expect(await run((s) => Effect.succeed(s.configured), undefined, {})).toBe(false)
    expect(await run((s) => Effect.succeed(s.configured))).toBe(true)
  })

  it("sends the operator to the shop's approval page with every scope, the state and the way back", async () => {
    const url = new URL(
      await run((s) =>
        Effect.succeed(s.authorizeUrl({ shop: "north.myshopify.com", state: "n1", redirectUri: "https://c/cb" }))
      )
    )
    expect(url.origin + url.pathname).toBe("https://north.myshopify.com/admin/oauth/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-1",
      scope: SCOPES.join(","),
      redirect_uri: "https://c/cb",
      state: "n1"
    })
  })

  it("trusts a callback signed with the app's secret, and nothing else", async () => {
    const query = { code: "abc", shop: "north.myshopify.com", state: "n1", timestamp: "1700000000" }
    const message = Object.keys(query).sort().map((k) => `${k}=${query[k as keyof typeof query]}`).join("&")
    const hmac = createHmac("sha256", SECRET).update(message).digest("hex")
    expect(await run((s) => s.verifyCallback({ ...query, hmac }))).toBe(true)
    expect(await run((s) => s.verifyCallback({ ...query, shop: "evil.myshopify.com", hmac }))).toBe(false)
    expect(await run((s) => s.verifyCallback(query))).toBe(false)
  })

  it("knows a shop that does not exist by Shopify's 404", async () => {
    expect(await run((s) => s.exists("gone.myshopify.com"))).toBe(false)
    expect(await run((s) => s.exists("north.myshopify.com"), fakeShopify(() => new Response(null, { status: 303 }))))
      .toBe(true)
  })

  it("exchanges the code for expiring offline tokens, and reads the shop's facts with the token", async () => {
    const seen: Array<Seen> = []
    const http = fakeShopify((url) =>
      url.endsWith("/admin/oauth/access_token")
        ? Response.json({
          access_token: "shpat_a",
          scope: "read_orders,read_products",
          expires_in: 3600,
          refresh_token: "shprt_r",
          refresh_token_expires_in: 7_776_000
        })
        : Response.json({
          data: {
            shop: {
              name: "Northwind",
              currencyCode: "EUR",
              ianaTimezone: "Europe/Amsterdam",
              plan: { displayName: "Basic" },
              billingAddress: { countryCodeV2: "NL" }
            }
          }
        }), seen)
    const tokens = await run((s) => s.exchange("north.myshopify.com", "abc"), http)
    expect(Redacted.value(tokens.accessToken)).toBe("shpat_a")
    expect(tokens.scopes).toEqual(["read_orders", "read_products"])
    expect(tokens.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 3_500_000)
    expect(seen[0]!.body).toEqual({ client_id: "client-1", client_secret: SECRET, code: "abc", expiring: 1 })

    const facts = await run((s) => s.facts("north.myshopify.com", Redacted.make("shpat_a")), http)
    expect(facts).toEqual({
      name: "Northwind",
      currency: "EUR",
      timezone: "Europe/Amsterdam",
      country: "NL",
      planName: "Basic"
    })
    expect(seen[1]!.url).toBe("https://north.myshopify.com/admin/api/2026-10/graphql.json")
    expect(seen[1]!.headers["x-shopify-access-token"]).toBe("shpat_a")
  })
})

/** One Admin GraphQL call against a fake Shopify that answers `answer`. */
const graphql = (answer: unknown) =>
  Effect.runPromiseExit(
    Effect.flatMap(
      Effect.service(ShopifyGraphql),
      (g) => g.query("shop-1.myshopify.com", Redacted.make("token"), "mutation { giftCardCreate(input: {}) { x } }", {})
    ).pipe(
      Effect.provide(
        ShopifyGraphqlLive.pipe(
          Layer.provide(fakeShopify(() => Response.json(answer))),
          Layer.provide(config({}))
        )
      )
    )
  )

/** One call against the recorded twin. */
const ask = (shop: string, query: string, variables: Record<string, unknown>) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(ShopifyGraphql), (g) => g.query(shop, Redacted.make("t"), query, variables)).pipe(
      Effect.provide(ShopifyGraphqlRecorded)
    )
  )

describe("the Admin GraphQL adapter", () => {
  it("answers a call the store's token may not make as a 403 naming the scope it needs (M9.3)", async () => {
    const exit = await graphql({
      errors: [{
        message: "Access denied for giftCardCreate field. Required access: `write_gift_cards` access scope.",
        extensions: { code: "ACCESS_DENIED", requiredAccess: "`write_gift_cards` access scope." }
      }]
    })
    expect(Exit.isFailure(exit)).toBe(true)
    const error = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined
    expect(error?._tag === "Some" ? error.value : undefined).toMatchObject({
      _tag: "ShopifyRefused",
      status: 403,
      scope: "write_gift_cards"
    })
  })

  it("reads the scope out of Shopify's sentence", () => {
    expect(scopeIn("Required access: `write_returns` access scope.")).toBe("write_returns")
    expect(scopeIn("Access denied for giftCardCreate field.")).toBeUndefined()
  })
})

describe("the recorded twin's return writes (M9.3)", () => {
  it("makes a gift card once under its code, and denies it to a shop that lacks the scope", async () => {
    const query = "mutation($input: GiftCardCreateInput!) { giftCardCreate(input: $input) { giftCard { id } } }"
    const first = await ask("shop-1.myshopify.com", query, { input: { code: "TWINCODE12345678" } })
    expect(Exit.isSuccess(first) && first.value.data).toMatchObject({
      giftCardCreate: { giftCardCode: "TWINCODE12345678", userErrors: [] }
    })
    const again = await ask("shop-1.myshopify.com", query, { input: { code: "TWINCODE12345678" } })
    expect(Exit.isSuccess(again) && again.value.data).toMatchObject({
      giftCardCreate: { userErrors: [{ code: "TAKEN" }] }
    })
    const denied = await ask("noscope-1.myshopify.com", query, { input: { code: "OTHER1234567890" } })
    expect(Exit.isFailure(denied) && JSON.stringify(denied.cause)).toContain("write_gift_cards")
  })

  it("completes a draft order into one order, the same one when completed again", async () => {
    const created = await ask("shop-1.myshopify.com", "mutation { draftOrderCreate(input: $input) { x } }", {})
    const id = Exit.isSuccess(created)
      ? (created.value.data as { draftOrderCreate: { draftOrder: { id: string } } }).draftOrderCreate.draftOrder.id
      : ""
    const complete = "mutation { draftOrderComplete(id: $id) { x } }"
    const once = await ask("shop-1.myshopify.com", complete, { id })
    const twice = await ask("shop-1.myshopify.com", complete, { id })
    expect(Exit.isSuccess(once) && once.value.data).toEqual(Exit.isSuccess(twice) && twice.value.data)
    expect(Exit.isSuccess(once) && once.value.data).toMatchObject({
      draftOrderComplete: { draftOrder: { order: { name: expect.stringMatching(/^#19\d\d$/) } } }
    })
  })
})
