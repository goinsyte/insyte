import { Slack, SlackGone, SlackRefused } from "@insyte/modules/notifications/domain/Ports"
import { Effect, Layer, Redacted } from "effect"

/*
 * Slack's recorded twin (integrations.md §1.1): the worker tests connect a Slack workspace and post without Slack. Any
 * code is accepted but `refused`; a token from the code `revoked` no longer works when it is used, as a workspace
 * that removed the app answers. The workspace has two public channels; the channel `C0MISSING` is gone. A member at
 * `noslack.test` has no Slack account.
 */

export const RECORDED_CHANNELS = [{ id: "C0ALGEMEEN", name: "algemeen" }, { id: "C0OPERATIONS", name: "operations" }]

const gone = (token: Redacted.Redacted<string>) => Redacted.value(token).includes("revoked")

export const SlackRecorded = Layer.succeed(Slack)(Slack.of({
  configured: true,
  authorizeUrl: ({ state, redirectUri }) =>
    `https://slack.test/oauth/v2/authorize?${new URLSearchParams({ state, redirect_uri: redirectUri })}`,
  exchange: ({ code }) =>
    code === "refused"
      ? Effect.fail(new SlackRefused({ status: 200, reason: "invalid_code" }))
      : Effect.succeed({
        teamId: "T0RECORDED",
        teamName: "Insyte Test",
        botUserId: "U0INSYTEBOT",
        botToken: Redacted.make(`recorded-slack-bot-${code}`),
        scopes: ["chat:write", "chat:write.public", "channels:read", "users:read", "users:read.email", "im:write"]
      }),
  channels: (token) =>
    gone(token) ? Effect.fail(new SlackGone({ reason: "token_revoked" })) : Effect.succeed(RECORDED_CHANNELS),
  userByEmail: (token, email) =>
    gone(token)
      ? Effect.fail(new SlackGone({ reason: "token_revoked" }))
      : Effect.succeed(email.endsWith("@noslack.test") ? null : "U0MEMBER"),
  post: (token, message) =>
    gone(token)
      ? Effect.fail(new SlackGone({ reason: "token_revoked" }))
      : message.channel === "C0MISSING"
      ? Effect.fail(new SlackRefused({ status: 200, reason: "channel_not_found" }))
      : Effect.void,
  revoke: () => Effect.void
}))
