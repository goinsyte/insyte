import { LOCAL_SECRET } from "@insyte/integrations-better-auth/BetterAuth"
import { InvitationLinks, type Minted } from "@insyte/modules/members/domain/Ports"
import { Config, Effect, Layer, Redacted } from "effect"

/*
 * The invitation links (M3.4) over the auth secret and the console's origin. A link's secret is an HMAC of what it is
 * for and its round, under a key derived for links alone, so it never equals anything better-auth signs; the table
 * keeps its SHA-256.
 */

const encoder = new TextEncoder()

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

export const InvitationLinksLive = Layer.effect(
  InvitationLinks,
  Effect.gen(function*() {
    const local = (yield* Config.String("ENVIRONMENT")) === "local"
    const origin = yield* Config.String("CONSOLE_ORIGIN")
    const secret = yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(
      local ? Config.withDefault(LOCAL_SECRET) : (config) => config
    )
    const key = yield* Effect.promise(async () => {
      const root = await crypto.subtle.importKey(
        "raw",
        encoder.encode(Redacted.value(secret)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      )
      const derived = await crypto.subtle.sign("HMAC", root, encoder.encode("insyte/invitation-links/v1"))
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    })
    const mint = (subject: string, length: number) =>
      Effect.promise(async () => {
        const token = base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(subject))).slice(0, length)
        return { token, tokenHash: hex(await crypto.subtle.digest("SHA-256", encoder.encode(token))) }
      })
    return InvitationLinks.of({
      invitation: (invitationId, round) =>
        Effect.map(mint(`invitation|${invitationId}|${round}`, 32), ({ token, tokenHash }): Minted => ({
          url: `${origin}/invitations/${invitationId}?k=${token}`,
          token,
          tokenHash
        })),
      shareable: (workspaceId, round) =>
        Effect.map(mint(`link|${workspaceId}|${round}`, 16), ({ token, tokenHash }): Minted => ({
          url: `${origin}/invitations/link_${token}`,
          token,
          tokenHash
        }))
    })
  })
)
