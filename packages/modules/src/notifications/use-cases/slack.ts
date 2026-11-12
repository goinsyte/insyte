import { Db } from "@insyte/database/Db"
import { Conflict } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { safeReturn } from "../../stores/domain/Stores.ts"
import { SLACK_DM, SlackChannel, SlackConnectFailed } from "../domain/Notifications.ts"
import { Slack } from "../domain/Ports.ts"

/*
 * Slack (M11 step 13.5): one Slack workspace per Insyte workspace, connected by OAuth v2 as a bot. Connecting and
 * letting go are `settings` at Beheren, as every connection (Klaviyo, Shopify); choosing where one's own messages go is
 * every member's. `beginConnect` keeps a nonce for ten minutes; the callback trusts it only unused, in time and the
 * same member's, then the code becomes the bot's token, sealed before it is stored (`connection_credentials`). A
 * token Slack no longer honours makes the connection `revoked`, and the page says Slack is not connected.
 */

const STATE_MINUTES = 10

const Sealed = Schema.Struct({ botToken: Schema.String, botUserId: Schema.String })
const decodeSealed = Schema.decodeUnknownEffect(Schema.fromJsonString(Sealed))

/** The workspace's connected Slack, if there is one: its connection and team name. */
export const connectionOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ id: string; team: string | null }>`
      select id, health ->> 'teamName' as team from connections
      where provider = 'slack' and status = 'connected' order by created_at desc limit 1`,
    ([row]) => row
  )

/** The connected Slack's bot token, opened; `undefined` when there is none. */
export const tokenOf = Effect.fn("Notifications.slackToken")(function*(sql: SqlClient.SqlClient) {
  const sealer = yield* Sealer
  const [row] = yield* sql<{ id: string; sealed: string }>`
    select c.id, cc.sealed from connections c join connection_credentials cc on cc.connection_id = c.id
    where c.provider = 'slack' and c.status = 'connected' order by c.created_at desc limit 1`
  if (row === undefined) return undefined
  const opened = yield* sealer.open(row.sealed).pipe(
    Effect.flatMap((o) => decodeSealed(Redacted.value(o))),
    Effect.orDie
  )
  return { connectionId: row.id, token: Redacted.make(opened.botToken) }
})

/** The token Slack refused for good: the connection is `revoked`, and nothing is sent to it again. */
export const revoked = (sql: SqlClient.SqlClient, connectionId: string) =>
  sql`update connections set status = 'revoked', last_error_at = now() where id = ${connectionId}`

export const beginConnect = Effect.fn("Notifications.beginSlackConnect")(function*(
  returnPath: string,
  redirectUri: string
) {
  yield* Policy.require("settings", 3)
  const slack = yield* Slack
  if (!slack.configured) return yield* new Conflict({ entity: "slack", reason: "not_configured" })
  const { workspaceId, id } = yield* CurrentPrincipal
  const nonce = crypto.randomUUID().replaceAll("-", "")
  const db = yield* Db
  yield* db.scoped((sql) =>
    sql`insert into oauth_states (nonce, workspace_id, member_id, provider, return_path, expires_at)
        values (${nonce}, ${workspaceId}, ${id}, 'slack', ${safeReturn(returnPath)},
                now() + make_interval(mins => ${STATE_MINUTES}))`
  )
  return { authorizeUrl: slack.authorizeUrl({ state: nonce, redirectUri }) }
})

/** Slack's way back: the bot installed, its token sealed, and where to send the operator. */
export const callback = Effect.fn("Notifications.slackCallback")(function*(
  query: Readonly<Record<string, string>>,
  redirectUri: string
) {
  const principal = yield* CurrentPrincipal
  const slack = yield* Slack
  const sealer = yield* Sealer
  const db = yield* Db
  const [state] = yield* db.scoped((sql) =>
    sql<{ returnPath: string }>`
      update oauth_states set used_at = now()
      where nonce = ${query["state"] ?? ""} and provider = 'slack' and member_id = ${principal.id}
        and used_at is null and expires_at > now()
      returning return_path`
  )
  if (state === undefined) return yield* new SlackConnectFailed({ reason: "state" })
  const returnPath = state.returnPath
  // The operator said no on Slack's page: back where they were, nothing connected.
  if (query["code"] === undefined) return yield* new SlackConnectFailed({ reason: "exchange", returnPath })
  const install = yield* slack.exchange({ code: query["code"], redirectUri }).pipe(
    Effect.mapError(() => new SlackConnectFailed({ reason: "exchange", returnPath }))
  )
  const sealed = yield* sealer.seal(
    JSON.stringify({ botToken: Redacted.value(install.botToken), botUserId: install.botUserId })
  )
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [connection] = yield* sql<{ id: string }>`
        insert into connections (id, workspace_id, provider, account_ref, status, scopes, health, connected_by)
        values (${mintId("con")}, ${principal.workspaceId}, 'slack', ${install.teamId}, 'connected',
                ${[...install.scopes]}::text[], ${JSON.stringify({ teamName: install.teamName })}::jsonb,
                ${principal.id})
        on conflict (workspace_id, provider, account_ref) do update
          set status = 'connected', scopes = excluded.scopes, health = excluded.health,
              connected_by = excluded.connected_by
        returning id`
      yield* sql`insert into connection_credentials (connection_id, workspace_id, sealed, kid)
                 values (${connection!.id}, ${principal.workspaceId}, ${sealed.sealed}, ${sealed.kid})
                 on conflict (connection_id) do update set sealed = excluded.sealed, kid = excluded.kid,
                   refreshed_at = now()`
      // One Slack per workspace: another one connected before lets go.
      yield* sql`update connections set status = 'disconnected'
                 where provider = 'slack' and id <> ${connection!.id} and status = 'connected'`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "notifications.slack_connected",
        subjectType: "connection",
        subjectId: connection!.id,
        diff: { provider: "slack", team: install.teamName }
      })
    })
  )
  return { returnPath, team: install.teamName }
})

/**
 * Lets go of Slack: the token revoked there (best effort), the credentials gone here, and every member's channel
 * cleared, so nothing waits for a Slack that is not there. Messages still waiting are skipped.
 */
export const disconnect = Effect.fn("Notifications.disconnectSlack")(function*() {
  yield* Policy.require("settings", 3)
  const principal = yield* CurrentPrincipal
  const slack = yield* Slack
  const db = yield* Db
  const token = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const connection = yield* connectionOf(sql)
      if (connection === undefined) return undefined
      const opened = yield* tokenOf(sql)
      yield* sql`delete from connection_credentials where connection_id = ${connection.id}`
      yield* sql`update connections set status = 'disconnected' where id = ${connection.id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "notifications.slack_disconnected",
        subjectType: "connection",
        subjectId: connection.id
      })
      return opened?.token
    })
  )
  // Every member's channel and the waiting messages, as the workspace: the settings are each member's own.
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`update notification_settings set slack_channel = null where slack_channel is not null`
      yield* sql`update notification_deliveries set state = 'skipped', error = 'disconnected'
                 where channel = 'slack' and state = 'pending'`
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: principal.workspaceId }))
  if (token !== undefined) yield* slack.revoke(token)
})

/** Where the member can have their Slack messages: the public channels, then a direct message. */
export const channels = Effect.fn("Notifications.slackChannels")(function*() {
  const slack = yield* Slack
  const db = yield* Db
  const opened = yield* db.scoped(tokenOf)
  if (opened === undefined) return yield* new Conflict({ entity: "slack", reason: "not_connected" })
  const listed = yield* slack.channels(opened.token).pipe(
    Effect.catchTags({
      SlackGone: () =>
        Effect.flatMap(
          db.scoped((sql) => revoked(sql, opened.connectionId)),
          () => Effect.fail(new Conflict({ entity: "slack", reason: "not_connected" }))
        ),
      SlackRefused: () => Effect.fail(new Conflict({ entity: "slack", reason: "unreachable" }))
    })
  )
  return [
    ...listed.map((c) => new SlackChannel({ id: c.id, name: `#${c.name}` })),
    new SlackChannel({ id: SLACK_DM, name: "Privébericht aan mij" })
  ]
})
