import { Context, type Effect, type Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * What notifications need outside Insyte (M11 step 13.5): web push to a member's browsers, Slack for a workspace, and
 * the record slice that takes an answer to a notification mail as a comment. Ports, so the slice never names a
 * vendor's HTTP; the adapters are `@insyte/integrations-webpush` and `@insyte/integrations-slack`, each with a
 * recorded twin for the worker tests.
 */

/** A browser's push subscription: where to send, and the keys the message is encrypted to (RFC 8291). */
export interface PushTarget {
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
}

/** What the service worker shows: the sentence, its detail, where a click leads, and a tag that replaces an older one. */
export interface PushMessage {
  readonly title: string
  readonly body: string
  readonly url: string
  readonly tag: string
}

/** The push service no longer knows the subscription (404, 410): the browser unsubscribed, or it lapsed. */
export class PushGone extends Schema.TaggedError<PushGone>()("PushGone", { status: Schema.Int }) {}

/** The push service refused, or could not be reached; `reason` is its status line, never a key. */
export class PushRefused extends Schema.TaggedError<PushRefused>()("PushRefused", {
  status: Schema.Int,
  reason: Schema.String
}) {}

export class WebPush extends Context.Service<WebPush, {
  /** The VAPID public key (base64url, uncompressed P-256) a browser subscribes with; `null` without the stage's keys. */
  readonly publicKey: string | null
  readonly send: (target: PushTarget, message: PushMessage) => Effect.Effect<void, PushGone | PushRefused>
}>()("notifications/WebPush") {}

/** What Slack's OAuth gives for a bot install: the workspace, and the bot's token (it does not expire). */
export interface SlackInstall {
  readonly teamId: string
  readonly teamName: string
  readonly botUserId: string
  readonly botToken: Redacted.Redacted<string>
  readonly scopes: ReadonlyArray<string>
}

/** Slack said no (`ok: false`) or could not be reached; `reason` is Slack's own error code, never a token. */
export class SlackRefused extends Schema.TaggedError<SlackRefused>()("SlackRefused", {
  status: Schema.Int,
  reason: Schema.String
}) {}

/** The token no longer works: the app was removed from the Slack workspace, or the token revoked. */
export class SlackGone extends Schema.TaggedError<SlackGone>()("SlackGone", { reason: Schema.String }) {}

/** The scopes Insyte asks for (02 §2, A16): post anywhere public, list channels, find a member by address, DM them. */
export const SLACK_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "users:read",
  "users:read.email",
  "im:write"
] as const

export class Slack extends Context.Service<Slack, {
  /** Whether this stage has the Slack app (`SLACK_CLIENT_ID` and its secret). */
  readonly configured: boolean
  readonly authorizeUrl: (input: { state: string; redirectUri: string }) => string
  readonly exchange: (input: { code: string; redirectUri: string }) => Effect.Effect<SlackInstall, SlackRefused>
  /** The public channels, by name. */
  readonly channels: (
    token: Redacted.Redacted<string>
  ) => Effect.Effect<ReadonlyArray<{ readonly id: string; readonly name: string }>, SlackRefused | SlackGone>
  /** The Slack member with this address, if there is one (for a direct message). */
  readonly userByEmail: (
    token: Redacted.Redacted<string>,
    email: string
  ) => Effect.Effect<string | null, SlackRefused | SlackGone>
  readonly post: (
    token: Redacted.Redacted<string>,
    message: { readonly channel: string; readonly text: string }
  ) => Effect.Effect<void, SlackRefused | SlackGone>
  /** Best effort, when the workspace disconnects: Slack forgets the token. */
  readonly revoke: (token: Redacted.Redacted<string>) => Effect.Effect<void>
}>()("notifications/Slack") {}

/**
 * An answer to a notification mail, as a comment on the record it was about (the record's own slice writes it). On the
 * caller's transaction, in the record's workspace; `false` when that kind of record takes no comments this way.
 */
export class NoteReplies extends Context.Service<NoteReplies, {
  readonly comment: (sql: SqlClient.SqlClient, input: {
    readonly workspaceId: string
    readonly memberId: string
    readonly subjectType: string
    readonly subjectId: string
    readonly body: string
  }) => Effect.Effect<boolean, unknown>
}>()("notifications/NoteReplies") {}

/** The records a notification mail can be answered about: they take a comment. */
export const REPLYABLE = new Set(["ticket"])
