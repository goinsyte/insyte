import { Db } from "@insyte/database/Db"
import { Conflict } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Redacted, Schema } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { safeReturn } from "../../stores/domain/Stores.ts"
import { MarketingConnectFailed, processorAddress, type SyncInput, SyncResult } from "../domain/Marketing.ts"
import { Klaviyo, type KlaviyoProfile, type KlaviyoRefused, type KlaviyoTokens } from "../domain/Ports.ts"

/*
 * Klaviyo (M7.5). Connecting is `settings` at Beheren, by OAuth with PKCE: `beginConnect` keeps a nonce and its
 * verifier for ten minutes, the callback trusts the state only when it is unused, in time and the same member's, then
 * the code becomes tokens, sealed before they are stored. One Klaviyo account per workspace: connecting another lets go
 * of the first. The access token lasts an hour; it is refreshed when it has five minutes left, and a refresh Klaviyo
 * refuses as `invalid_grant` means the app was removed, so the connection becomes `revoked`.
 *
 * Sending customers to a list is `customers` at Bewerken: only those who said yes to marketing, with an address of
 * their own. The sync is kept, waits out the undo window in the outbox, and is sent once by `send`.
 */

const STATE_MINUTES = 10
const MARGIN_MS = 5 * 60_000
const PER_JOB = 10_000

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")

const Sealed = Schema.Struct({ accessToken: Schema.String, refreshToken: Schema.String, expiresAt: Schema.String })
const decodeSealed = Schema.decodeUnknownEffect(Schema.fromJsonString(Sealed))

const sealTokens = (tokens: KlaviyoTokens) =>
  Effect.flatMap(Effect.service(Sealer), (sealer) =>
    sealer.seal(JSON.stringify({
      accessToken: Redacted.value(tokens.accessToken),
      refreshToken: Redacted.value(tokens.refreshToken),
      expiresAt: tokens.expiresAt.toISOString()
    })))

/** The workspace's connected Klaviyo account, if there is one. */
const connectionOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ id: string; name: string | null }>`
      select id, health ->> 'accountName' as name from connections
      where provider = 'klaviyo' and status = 'connected' order by created_at desc limit 1`,
    ([row]) => row
  )

export const status = Effect.fn("Marketing.status")(function*() {
  yield* Policy.require("customers", 1)
  const klaviyo = yield* Klaviyo
  const db = yield* Db
  const connection = yield* db.scoped(connectionOf)
  return { configured: klaviyo.configured, account: connection === undefined ? null : connection.name ?? "Klaviyo" }
})

export const beginConnect = Effect.fn("Marketing.beginConnect")(function*(returnPath: string, redirectUri: string) {
  yield* Policy.require("settings", 3)
  const klaviyo = yield* Klaviyo
  if (!klaviyo.configured) return yield* new Conflict({ entity: "klaviyo", reason: "not_configured" })
  const { workspaceId, id } = yield* CurrentPrincipal
  const nonce = crypto.randomUUID().replaceAll("-", "")
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64url(
    new Uint8Array(yield* Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
  )
  const db = yield* Db
  yield* db.scoped((sql) =>
    sql`insert into oauth_states (nonce, workspace_id, member_id, provider, return_path, code_verifier, expires_at)
        values (${nonce}, ${workspaceId}, ${id}, 'klaviyo', ${safeReturn(returnPath)}, ${verifier},
                now() + make_interval(mins => ${STATE_MINUTES}))`
  )
  return { authorizeUrl: klaviyo.authorizeUrl({ state: nonce, codeChallenge: challenge, redirectUri }) }
})

/** Klaviyo's way back: the account connected, and where to send the operator. */
export const callback = Effect.fn("Marketing.callback")(function*(
  query: Readonly<Record<string, string>>,
  redirectUri: string
) {
  const principal = yield* CurrentPrincipal
  const klaviyo = yield* Klaviyo
  const db = yield* Db
  const [state] = yield* db.scoped((sql) =>
    sql<{ returnPath: string; codeVerifier: string | null }>`
      update oauth_states set used_at = now()
      where nonce = ${query["state"] ?? ""} and provider = 'klaviyo' and member_id = ${principal.id}
        and used_at is null and expires_at > now()
      returning return_path, code_verifier`
  )
  if (state === undefined || state.codeVerifier === null) return yield* new MarketingConnectFailed({ reason: "state" })
  const returnPath = state.returnPath
  // The operator said no on Klaviyo's page: back where they were, nothing connected.
  if (query["code"] === undefined) return yield* new MarketingConnectFailed({ reason: "exchange", returnPath })
  const failed = () => new MarketingConnectFailed({ reason: "exchange", returnPath })
  const tokens = yield* klaviyo.exchange({ code: query["code"], codeVerifier: state.codeVerifier, redirectUri }).pipe(
    Effect.mapError(failed)
  )
  const account = yield* klaviyo.account(tokens.accessToken).pipe(Effect.mapError(failed))
  const sealed = yield* sealTokens(tokens)
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [connection] = yield* sql<{ id: string }>`
        insert into connections (id, workspace_id, provider, account_ref, status, scopes, health, connected_by)
        values (${mintId("con")}, ${principal.workspaceId}, 'klaviyo', ${account.id}, 'connected',
                ${[...tokens.scopes]}::text[], ${JSON.stringify({ accountName: account.name })}::jsonb, ${principal.id})
        on conflict (workspace_id, provider, account_ref) do update
          set status = 'connected', scopes = excluded.scopes, health = excluded.health,
              connected_by = excluded.connected_by
        returning id`
      yield* sql`insert into connection_credentials (connection_id, workspace_id, sealed, kid, token_expires_at)
                 values (${connection!.id}, ${principal.workspaceId}, ${sealed.sealed}, ${sealed.kid},
                         ${tokens.expiresAt})
                 on conflict (connection_id) do update set sealed = excluded.sealed, kid = excluded.kid,
                   token_expires_at = excluded.token_expires_at, refreshed_at = now()`
      // One account per workspace: another one connected before lets go.
      yield* sql`update connections set status = 'disconnected'
                 where provider = 'klaviyo' and id <> ${connection!.id} and status = 'connected'`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "marketing.connected",
        subjectType: "connection",
        subjectId: connection!.id,
        diff: { provider: "klaviyo", account: account.name }
      })
    })
  )
  return { returnPath, account: account.name }
})

/** Lets go of Klaviyo: the refresh token revoked there (best effort), the credentials gone here. */
export const disconnect = Effect.fn("Marketing.disconnect")(function*() {
  yield* Policy.require("settings", 3)
  const principal = yield* CurrentPrincipal
  const klaviyo = yield* Klaviyo
  const sealer = yield* Sealer
  const db = yield* Db
  const sealed = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const connection = yield* connectionOf(sql)
      if (connection === undefined) return undefined
      const [credentials] = yield* sql<{ sealed: string }>`
        delete from connection_credentials where connection_id = ${connection.id} returning sealed`
      yield* sql`update connections set status = 'disconnected' where id = ${connection.id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "marketing.disconnected",
        subjectType: "connection",
        subjectId: connection.id
      })
      return credentials?.sealed
    })
  )
  if (sealed === undefined) return
  const opened = yield* sealer.open(sealed).pipe(Effect.flatMap((o) => decodeSealed(Redacted.value(o))), Effect.option)
  if (opened._tag === "Some") yield* klaviyo.revoke(Redacted.make(opened.value.refreshToken))
})

/**
 * A valid access token for the workspace's Klaviyo account, refreshed when it has five minutes left. No account, or a
 * grant Klaviyo no longer honours, is `Conflict{ not_connected }`. Runs as the principal (a request) or the workspace
 * (a Workflow step), whichever the caller is.
 */
const tokenOf = Effect.fn("Marketing.token")(function*(sql: SqlClient.SqlClient) {
  const klaviyo = yield* Klaviyo
  const sealer = yield* Sealer
  const [row] = yield* sql<{ id: string; sealed: string }>`
    select c.id, cc.sealed from connections c join connection_credentials cc on cc.connection_id = c.id
    where c.provider = 'klaviyo' and c.status = 'connected' order by c.created_at desc limit 1`
  if (row === undefined) return yield* new Conflict({ entity: "klaviyo", reason: "not_connected" })
  const current = yield* sealer.open(row.sealed).pipe(
    Effect.flatMap((o) => decodeSealed(Redacted.value(o))),
    Effect.orDie
  )
  if (Date.parse(current.expiresAt) - Date.now() > MARGIN_MS) {
    return { connectionId: row.id, token: Redacted.make(current.accessToken) }
  }
  const fresh = yield* klaviyo.refresh(Redacted.make(current.refreshToken)).pipe(
    Effect.catchTags({
      KlaviyoGrantGone: () =>
        Effect.flatMap(
          sql`update connections set status = 'revoked', last_error_at = now() where id = ${row.id}`,
          () => Effect.fail(new Conflict({ entity: "klaviyo", reason: "not_connected" }))
        ),
      KlaviyoRefused: (e) => Effect.die(e)
    })
  )
  const sealed = yield* sealTokens(fresh)
  yield* sql`update connection_credentials set sealed = ${sealed.sealed}, kid = ${sealed.kid},
               token_expires_at = ${fresh.expiresAt}, refreshed_at = now()
             where connection_id = ${row.id}`
  return { connectionId: row.id, token: fresh.accessToken }
})

/** The account's lists, for the sync dialog. */
export const lists = Effect.fn("Marketing.lists")(function*() {
  yield* Policy.require("customers", 2)
  const klaviyo = yield* Klaviyo
  const db = yield* Db
  const { token } = yield* db.scoped(tokenOf)
  return yield* klaviyo.lists(token).pipe(
    Effect.catchTag("KlaviyoRefused", () => Effect.fail(new Conflict({ entity: "klaviyo", reason: "unreachable" })))
  )
})

interface Candidate {
  readonly id: string
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly country: string | null
  readonly tags: ReadonlyArray<string>
  readonly consent: boolean
}

/** Who may go: an address of their own, and a yes to marketing. */
const sortOut = (customers: ReadonlyArray<Candidate>) => {
  const noEmail = customers.filter((c) => c.email === null || c.email === "" || processorAddress(c.email))
  const rest = customers.filter((c) => !noEmail.includes(c))
  return { sendable: rest.filter((c) => c.consent), noConsent: rest.filter((c) => !c.consent), noEmail }
}

const candidates = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>, scope: Statement.Fragment) =>
  sql<Candidate>`
    select c.id, c.name, c.email, c.phone, c.country, c.tags, c.marketing_consent as consent from customers c
    where c.id in ${sql.in([...new Set(ids)])} and c.deleted_at is null and c.merged_into is null and ${scope}`

/**
 * "Synchroniseren naar Klaviyo": counts who may go, and (unless a dry run) keeps the sync, held back by the undo
 * window, with an undo token that can still stop it.
 */
export const sync = Effect.fn("Marketing.sync")(function*(input: typeof SyncInput.Type) {
  yield* Policy.require("customers", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { result, outboxId: held } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const connection = yield* connectionOf(sql)
      if (connection === undefined) return yield* new Conflict({ entity: "klaviyo", reason: "not_connected" })
      const scope = yield* inScope(sql, "c.store_id")
      const { sendable, noConsent, noEmail } = sortOut(yield* candidates(sql, input.ids, scope))
      const counts = { consent: noConsent.length, email: noEmail.length }
      if (input.dryRun || sendable.length === 0) {
        return {
          result: new SyncResult({ syncId: null, sendable: sendable.length, skipped: counts, undo: null }),
          outboxId: null
        }
      }
      const syncId = mintId("mks")
      yield* sql`insert into marketing_syncs (id, workspace_id, connection_id, provider, list_id, list_name, customer_ids,
                                              with_tags, counts, created_by)
                 values (${syncId}, ${principal.workspaceId}, ${connection.id}, 'klaviyo', ${input.listId},
                         ${input.listName.trim()}, ${sendable.map((c) => c.id)}::text[], ${input.withTags},
                         ${JSON.stringify({ sendable: sendable.length, skipped: counts })}::jsonb, ${principal.id})`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "marketing.sync_requested",
        subjectType: "marketing_sync",
        subjectId: syncId,
        diff: { list: input.listName.trim(), customers: sendable.length }
      })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "marketing.sync_requested",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        syncId
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: "marketing.restore",
        compensation: { syncId },
        outboxIds: [outboxId]
      })
      return { result: new SyncResult({ syncId, sendable: sendable.length, skipped: counts, undo }), outboxId }
    })
  )
  if (held !== null) yield* relay.kick([held], { afterSeconds: UNDO_SECONDS })
  return result
})

/** `Shared.undo` of a sync inside its window: it never goes. */
export const restore = Effect.fn("Marketing.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("customers", 2)
  const { syncId } = yield* Schema.decodeUnknownEffect(Schema.Struct({ syncId: Schema.String }))(compensation).pipe(
    Effect.orDie
  )
  yield* sql`update marketing_syncs set state = 'undone' where id = ${syncId} and state = 'waiting'`
})

/** Klaviyo's answer about the request (a 4xx) as a value; anything else fails, so the step retries. */
const refusedOr = <A>(effect: Effect.Effect<A, KlaviyoRefused>) =>
  effect.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catchTag(
      "KlaviyoRefused",
      (e) =>
        e.status >= 400 && e.status < 500 ? Effect.succeed({ ok: false as const, reason: e.reason }) : Effect.fail(e)
    )
  )

/**
 * Sends a sync once its window has passed (a `MarketingSyncWorkflow` step, as the workspace): the list made if it was a
 * new one, then the customers who may still go (read now: a consent withdrawn since is respected), ten thousand per
 * import job. Klaviyo refusing is final (`failed`, with its word); unreachable, the step retries.
 */
export const send = Effect.fn("Marketing.send")(function*(syncId: string) {
  const klaviyo = yield* Klaviyo
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<
        { listId: string | null; listName: string; customerIds: ReadonlyArray<string>; withTags: boolean }
      >`
        select list_id, list_name, customer_ids, with_tags from marketing_syncs
        where id = ${syncId} and state = 'waiting' for update`
      if (row === undefined) return { syncId, outcome: "skipped" as const, reason: "not waiting" }
      const fail = (reason: string) =>
        Effect.as(
          sql`update marketing_syncs set state = 'failed', error = ${reason.slice(0, 300)} where id = ${syncId}`,
          { syncId, outcome: "failed" as const, reason }
        )
      const token = yield* tokenOf(sql).pipe(Effect.option)
      if (token._tag === "None") return yield* fail("disconnected")
      let listId = row.listId
      if (listId === null) {
        const existing = yield* refusedOr(klaviyo.lists(token.value.token))
        if (!existing.ok) return yield* fail(existing.reason)
        const same = existing.value.find((l) => l.name.toLowerCase() === row.listName.toLowerCase())
        if (same !== undefined) listId = same.id
        else {
          const made = yield* refusedOr(klaviyo.createList(token.value.token, row.listName))
          if (!made.ok) return yield* fail(made.reason)
          listId = made.value.id
        }
      }
      const scope = sql`true`
      const { sendable } = sortOut(yield* candidates(sql, row.customerIds, scope))
      const profiles: Array<KlaviyoProfile> = sendable.map((c) => {
        const [first, ...rest] = c.name.trim().split(/\s+/)
        return {
          email: c.email!,
          firstName: first || null,
          lastName: rest.join(" ") || null,
          phone: c.phone,
          country: c.country,
          properties: row.withTags ? { insyte_tags: [...c.tags] } : {}
        }
      })
      const jobs: Array<string> = []
      for (let at = 0; at < profiles.length; at += PER_JOB) {
        const job = yield* refusedOr(
          klaviyo.importProfiles(token.value.token, listId, profiles.slice(at, at + PER_JOB))
        )
        if (!job.ok) return yield* fail(job.reason)
        jobs.push(job.value)
      }
      yield* sql`update marketing_syncs set state = 'sent', sent_at = now(), list_id = ${listId},
                   job_id = ${jobs.join(",") || null},
                   counts = counts || ${JSON.stringify({ sent: profiles.length })}::jsonb
                 where id = ${syncId}`
      return {
        syncId,
        outcome: "sent" as const,
        reason: null,
        sent: profiles.length,
        customerIds: sendable.map((c) => c.id)
      }
    })
  )
})

/** A send Klaviyo never answered, through every retry: the sync says it failed, rather than waiting forever. */
export const abandon = Effect.fn("Marketing.abandon")(function*(syncId: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update marketing_syncs set state = 'failed', error = 'unreachable' where id = ${syncId} and state = 'waiting'`
  )
})

/** The newest sync that sent this customer: the profile's Klaviyo line. */
export const lastSyncOf = (sql: SqlClient.SqlClient, customerId: string) =>
  Effect.map(
    sql<{ listName: string; sentAt: Date }>`
      select list_name, sent_at from marketing_syncs
      where state = 'sent' and ${customerId} = any(customer_ids) order by sent_at desc limit 1`,
    ([row]) => (row === undefined ? null : { list: row.listName, at: row.sentAt.getTime() })
  )

/**
 * A workspace being deleted (M17 step 5): the refresh token given back to Klaviyo, before Insyte forgets it. As the
 * workspace; best effort, as `disconnect`.
 */
export const releaseKlaviyo = Effect.fn("Marketing.releaseKlaviyo")(function*() {
  const db = yield* Db
  const klaviyo = yield* Klaviyo
  const sealer = yield* Sealer
  const rows = yield* db.scopedFor((sql) =>
    sql<{ sealed: string }>`
      select cc.sealed from connections c join connection_credentials cc on cc.connection_id = c.id
      where c.provider = 'klaviyo'`
  )
  for (const row of rows) {
    const opened = yield* sealer.open(row.sealed).pipe(
      Effect.flatMap((o) => decodeSealed(Redacted.value(o))),
      Effect.option
    )
    if (opened._tag === "Some") yield* klaviyo.revoke(Redacted.make(opened.value.refreshToken))
  }
  return rows.length
})
