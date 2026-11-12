import { SlackLive } from "@insyte/integrations-slack/Slack"
import { SlackRecorded } from "@insyte/integrations-slack/SlackRecorded"
import { WebPushLive } from "@insyte/integrations-webpush/WebPush"
import { WebPushRecorded } from "@insyte/integrations-webpush/WebPushRecorded"
import { NoteReplies, type Slack, type WebPush } from "@insyte/modules/notifications/domain/Ports"
import { commentFromMail } from "@insyte/modules/tickets/use-cases/comment"
import { Config, Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"

/*
 * Notifications beyond the app (M11 step 13.5): web push and Slack, each its recorded twin where the stage says
 * `PUSH_ADAPTER=recorded` / `SLACK_ADAPTER=recorded` (the worker tests), else the real one with the stage's VAPID keys
 * and Slack app (absent: push and Slack say they are not available yet). And where an answer to a notification mail
 * becomes a comment: the ticket's own slice writes it.
 */

export const WebPushChoice = Layer.unwrap(
  Effect.map(
    Config.String("PUSH_ADAPTER").pipe(Config.withDefault("webpush")),
    (adapter): Layer.Layer<WebPush, Config.ConfigError, HttpClient.HttpClient> =>
      adapter === "recorded" ? WebPushRecorded : WebPushLive
  )
)

export const SlackChoice = Layer.unwrap(
  Effect.map(
    Config.String("SLACK_ADAPTER").pipe(Config.withDefault("slack")),
    (adapter): Layer.Layer<Slack, Config.ConfigError, HttpClient.HttpClient> =>
      adapter === "recorded" ? SlackRecorded : SlackLive
  )
)

export const NoteRepliesLive = Layer.succeed(NoteReplies, {
  comment: (sql, input) =>
    input.subjectType === "ticket"
      ? commentFromMail(sql, {
        workspaceId: input.workspaceId,
        ticketId: input.subjectId,
        memberId: input.memberId,
        body: input.body
      })
      : Effect.succeed(false)
})
