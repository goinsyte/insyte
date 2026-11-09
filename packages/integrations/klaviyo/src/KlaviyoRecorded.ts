import { Klaviyo, KlaviyoGrantGone, KlaviyoRefused, type KlaviyoTokens } from "@insyte/modules/marketing/domain/Ports"
import { Effect, Layer, Redacted } from "effect"

/*
 * Klaviyo's recorded twin (integrations.md §1.1): the worker tests and local runs without the app connect an account
 * through it. Any code is accepted but `refused`; a refresh token from the code `revoked` is gone, as an account that
 * removed the app answers. The account has two lists; a new one takes an id from its name. An import answers a job
 * named by its size, and a profile whose email is at `refuse.test` makes Klaviyo refuse the whole job.
 */

const issued = (code: string): KlaviyoTokens => ({
  accessToken: Redacted.make(`recorded-klaviyo-access-${code}`),
  refreshToken: Redacted.make(`recorded-klaviyo-refresh-${code}`),
  expiresAt: new Date(Date.now() + 3_600_000),
  scopes: ["accounts:read", "lists:read", "lists:write", "profiles:read", "profiles:write"]
})

export const RECORDED_LISTS = [{ id: "LIST_NEWS", name: "Nieuwsbrief" }, { id: "LIST_VIP", name: "VIP" }] as const

export const KlaviyoRecorded = Layer.succeed(Klaviyo)(Klaviyo.of({
  configured: true,
  authorizeUrl: ({ state, codeChallenge, redirectUri }) =>
    `https://www.klaviyo.test/oauth/authorize?${new URLSearchParams({
      state,
      code_challenge: codeChallenge,
      redirect_uri: redirectUri
    })}`,
  exchange: ({ code }) =>
    code === "refused"
      ? Effect.fail(new KlaviyoRefused({ status: 400, reason: "invalid_grant" }))
      : Effect.succeed(issued(code)),
  refresh: (refreshToken) =>
    Redacted.value(refreshToken).includes("revoked")
      ? Effect.fail(new KlaviyoGrantGone())
      : Effect.succeed(issued("refreshed")),
  revoke: () => Effect.void,
  account: () => Effect.succeed({ id: "KLV_RECORDED", name: "Insyte MVP Test" }),
  lists: () => Effect.succeed(RECORDED_LISTS),
  createList: (_token, name) =>
    Effect.succeed({ id: `LIST_${name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_")}`, name }),
  importProfiles: (_token, listId, profiles) =>
    profiles.some((p) => p.email.endsWith("@refuse.test"))
      ? Effect.fail(new KlaviyoRefused({ status: 400, reason: "Invalid email" }))
      : Effect.succeed(`JOB_${listId}_${profiles.length}`)
}))
