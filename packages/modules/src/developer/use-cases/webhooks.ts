import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { isWebhookEvent, WEBHOOK_API_VERSIONS, WEBHOOK_SECRET_OVERLAP_MS } from "@insyte/domain/Webhooks"
import { Effect, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Sealer } from "../../shared/domain/Sealer.ts"
import type { StoreAccess } from "../../shared/domain/Stores.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { HEADER_NAME, HEADER_VALUE, isForbiddenHeader, urlRefusal } from "../domain/Delivery.ts"
import {
  EndpointChange,
  type EndpointInput,
  EndpointWithSecret,
  RotatedSecret,
  stateOf,
  type UpdateEndpoint,
  WebhookEndpointView
} from "../domain/Webhook.ts"
import { reachOf } from "./deliveries.ts"

/*
 * Instellingen → Webhooks (M19.4): the endpoints. Seeing them is `integrations` at Bekijken, changing them Bewerken
 * (widgets/05 §5.3), never through a key (`integrations` is `api: false`). Every change is audited and, but making
 * one, has its Undo: a token whose compensation (`webhooks.restore`) puts the endpoint back as it was. The secret is
 * sealed, shown in full when made, rotated, or asked for ("Tonen", audited), and never logged.
 */

export const RESTORE = "webhooks.restore"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/** `whsec_` and 32 characters from the CSPRNG. */
export const mintSecret = () =>
  `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => ALPHABET[b % ALPHABET.length]).join("")}`

const prefixOf = (secret: string) => secret.slice(0, 10)

interface Row {
  readonly id: string
  readonly url: string
  readonly description: string
  readonly events: ReadonlyArray<string>
  readonly apiVersion: string
  readonly stores: StoreAccess
  readonly secretPrefix: string
  readonly secretRotatedAt: Date | null
  readonly headers: ReadonlyArray<{ readonly key: string; readonly sealed: string }>
  readonly retry: 0 | 3 | 5 | 8
  readonly active: boolean
  readonly autoDisabledAt: Date | null
  readonly consecutiveFailures: number
  readonly createdAt: Date
  readonly createdBy: string
  readonly deliveries: number
  readonly dayCount: number
  readonly dayFailed: number
  readonly dayMs: number | null
}

const toView = (r: Row) =>
  new WebhookEndpointView({
    id: r.id,
    url: r.url,
    description: r.description,
    events: [...r.events],
    apiVersion: r.apiVersion,
    stores: r.stores,
    secretPrefix: r.secretPrefix,
    secretRotatedAt: r.secretRotatedAt?.getTime() ?? null,
    headers: r.headers.map((h) => h.key),
    retry: r.retry,
    active: r.active,
    autoDisabledAt: r.autoDisabledAt?.getTime() ?? null,
    failures: r.consecutiveFailures,
    createdAt: r.createdAt.getTime(),
    createdBy: r.createdBy,
    state: stateOf({
      active: r.active,
      autoDisabledAt: r.autoDisabledAt,
      failures: r.consecutiveFailures,
      deliveries: r.deliveries
    }),
    health: { count: r.dayCount, failed: r.dayFailed, avgMs: r.dayMs === null ? null : Math.round(r.dayMs) },
    deliveries: r.deliveries
  })

/** An attempt made within 24 hours counts toward the health line; a delivery not yet tried does not. */
const SELECT = (sql: SqlClient.SqlClient) =>
  sql`select e.id, e.url, e.description, e.events, e.api_version, e.stores, e.secret_prefix, e.secret_rotated_at,
             e.headers, e.retry, e.active, e.auto_disabled_at, e.consecutive_failures, e.created_at, e.created_by,
             coalesce(d.total, 0)::int as deliveries, coalesce(d.day_count, 0)::int as day_count,
             coalesce(d.day_failed, 0)::int as day_failed, d.day_ms::float8 as day_ms
      from webhook_endpoints e
      left join lateral (
        select count(*) as total,
               count(*) filter (where x.attempted_at > now() - interval '24 hours') as day_count,
               count(*) filter (where x.attempted_at > now() - interval '24 hours'
                                  and (x.status is null or x.status not between 200 and 299)) as day_failed,
               avg(x.ms) filter (where x.attempted_at > now() - interval '24 hours') as day_ms
        from webhook_deliveries x where x.endpoint_id = e.id
      ) d on true`

const readAll = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<Row>`${SELECT(sql)} where e.deleted_at is null order by e.created_at desc`,
    (rows) => rows.map(toView)
  )

export const readOne = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql<Row>`${SELECT(sql)} where e.id = ${id} and e.deleted_at is null`,
    ([row]) =>
      row === undefined
        ? Effect.fail(new NotFound({ entity: "webhook_endpoint", id }))
        : Effect.succeed(toView(row))
  )

const audit = (sql: SqlClient.SqlClient, action: string, subjectId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "webhook_endpoint",
        subjectId,
        section: "webhooks",
        diff
      })
  )

/** What the form may not hold, field by field (widgets/05 §5.3, Forms). */
const checkInput = (sql: SqlClient.SqlClient, input: EndpointInput) =>
  Effect.gen(function*() {
    const fields: Record<string, string> = {}
    const refusal = urlRefusal(input.url)
    if (refusal !== undefined) fields["url"] = refusal
    if (input.description.trim().length > 200) fields["description"] = "too_long"
    if (input.events.length === 0) fields["events"] = "required"
    else if (input.events.some((e) => !isWebhookEvent(e))) fields["events"] = "unknown"
    if (!(WEBHOOK_API_VERSIONS as ReadonlyArray<string>).includes(input.apiVersion)) fields["apiVersion"] = "unknown"
    const headers = input.headers.filter((h) => h.key.trim() !== "")
    if (headers.length > 10) fields["headers"] = "too_many"
    else if (headers.some((h) => !HEADER_NAME.test(h.key.trim()))) fields["headers"] = "format"
    else if (headers.some((h) => isForbiddenHeader(h.key))) fields["headers"] = "forbidden"
    else if (new Set(headers.map((h) => h.key.trim().toLowerCase())).size !== headers.length) {
      fields["headers"] = "duplicate"
    } else if (headers.some((h) => (h.value ?? "").length > 1000)) fields["headers"] = "too_long"
    else if (headers.some((h) => !HEADER_VALUE.test(h.value ?? ""))) fields["headers"] = "format"
    // An endpoint hears no store beyond the person's own: "all" is for a role that reaches all of them.
    const reach = reachOf(yield* CurrentPrincipal)
    if (input.stores === "all") {
      if (reach !== "all") fields["stores"] = "forbidden"
    } else {
      const known = yield* sql<{ id: string }>`select id from stores where id in ${sql.in([...input.stores, ""])}`
      if (input.stores.length === 0 || known.length !== new Set(input.stores).size) fields["stores"] = "unknown"
      else if (reach !== "all" && input.stores.some((s) => !reach.includes(s))) fields["stores"] = "forbidden"
    }
    if (Object.keys(fields).length > 0) return yield* new Invalid({ fields })
  })

/** The headers to keep, each value sealed: a new value sealed now, a `null` one kept from `before` by its name. */
const sealHeaders = (
  input: EndpointInput["headers"],
  before: ReadonlyArray<{ readonly key: string; readonly sealed: string }>
) =>
  Effect.gen(function*() {
    const sealer = yield* Sealer
    const out: Array<{ key: string; sealed: string }> = []
    for (const h of input) {
      const key = h.key.trim()
      if (key === "") continue
      if (h.value === null) {
        const kept = before.find((b) => b.key.toLowerCase() === key.toLowerCase())
        if (kept !== undefined) out.push({ key, sealed: kept.sealed })
        continue
      }
      out.push({ key, sealed: (yield* sealer.seal(h.value)).sealed })
    }
    return out
  })

export const list = Effect.fn("Webhooks.list")(function*() {
  yield* Policy.require("integrations", 1)
  const db = yield* Db
  return yield* db.scoped(readAll)
})

export const create = Effect.fn("Webhooks.create")(function*(input: EndpointInput) {
  yield* Policy.require("integrations", 2)
  const principal = yield* CurrentPrincipal
  const sealer = yield* Sealer
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* checkInput(sql, input)
      const id = mintId("whe")
      const secret = mintSecret()
      const sealed = yield* sealer.seal(secret)
      const headers = yield* sealHeaders(input.headers, [])
      yield* sql`insert into webhook_endpoints (id, workspace_id, url, description, events, api_version, stores,
                                                 secret_sealed, secret_prefix, headers, retry, active, created_by)
                 values (${id}, ${principal.workspaceId}, ${input.url.trim()}, ${input.description.trim()},
                         ${[...new Set(input.events)]}::text[], ${input.apiVersion},
                         ${JSON.stringify(input.stores)}::jsonb, ${sealed.sealed}, ${prefixOf(secret)},
                         ${JSON.stringify(headers)}::jsonb, ${input.retry}, ${input.active}, ${principal.id})`
      yield* audit(sql, "webhook.created", id, { events: input.events.length, headers: headers.map((h) => h.key) })
      return new EndpointWithSecret({ endpoint: yield* readOne(sql, id), secret })
    })
  )
})

interface Settings {
  readonly url: string
  readonly description: string
  readonly events: ReadonlyArray<string>
  readonly apiVersion: string
  readonly stores: StoreAccess
  readonly headers: ReadonlyArray<{ readonly key: string; readonly sealed: string }>
  readonly retry: number
  readonly active: boolean
  readonly autoDisabledAt: Date | null
  readonly consecutiveFailures: number
}

const settingsOf = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql<Settings>`select url, description, events, api_version, stores, headers, retry, active, auto_disabled_at,
                         consecutive_failures
                  from webhook_endpoints where id = ${id} and deleted_at is null for update`,
    ([row]) => row === undefined ? Effect.fail(new NotFound({ entity: "webhook_endpoint", id })) : Effect.succeed(row)
  )

const writeSettings = (sql: SqlClient.SqlClient, id: string, s: Settings) =>
  sql`update webhook_endpoints set url = ${s.url}, description = ${s.description}, events = ${[...s.events]}::text[],
        api_version = ${s.apiVersion}, stores = ${JSON.stringify(s.stores)}::jsonb,
        headers = ${JSON.stringify(s.headers)}::jsonb, retry = ${s.retry}, active = ${s.active},
        auto_disabled_at = ${s.autoDisabledAt}, consecutive_failures = ${s.consecutiveFailures}, updated_at = now()
      where id = ${id}`

/** A snapshot for the undo: settings and sealed header values, never a secret in the clear. */
const snapshot = (s: Settings) => ({
  ...s,
  autoDisabledAt: s.autoDisabledAt?.toISOString() ?? null
})

export const update = Effect.fn("Webhooks.update")(function*(input: UpdateEndpoint) {
  yield* Policy.require("integrations", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* settingsOf(sql, input.id)
      yield* checkInput(sql, input)
      const headers = yield* sealHeaders(input.headers, before.headers)
      // Switching an endpoint on from the form clears Insyte's own switch-off, as "Weer aanzetten" does.
      const reopened = input.active && (!before.active || before.autoDisabledAt !== null)
      yield* writeSettings(sql, input.id, {
        url: input.url.trim(),
        description: input.description.trim(),
        events: [...new Set(input.events)],
        apiVersion: input.apiVersion,
        stores: input.stores,
        headers,
        retry: input.retry,
        active: input.active,
        autoDisabledAt: reopened ? null : before.autoDisabledAt,
        consecutiveFailures: reopened && before.autoDisabledAt !== null ? 0 : before.consecutiveFailures
      })
      yield* audit(sql, "webhook.updated", input.id, { url: before.url === input.url.trim() ? undefined : "changed" })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { op: "settings", id: input.id, before: snapshot(before) }
      })
      return new EndpointChange({ endpoint: yield* readOne(sql, input.id), undo })
    })
  )
})

/** The operator's switch; on again after Insyte switched it off starts the count of failures afresh. */
export const setActive = Effect.fn("Webhooks.setActive")(function*(id: string, active: boolean) {
  yield* Policy.require("integrations", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* settingsOf(sql, id)
      yield* sql`update webhook_endpoints set active = ${active}, updated_at = now(),
                   auto_disabled_at = case when ${active} then null else auto_disabled_at end,
                   consecutive_failures = case when ${active} and auto_disabled_at is not null then 0
                                               else consecutive_failures end
                 where id = ${id}`
      yield* audit(sql, active ? "webhook.enabled" : "webhook.paused", id)
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { op: "settings", id, before: snapshot(before) }
      })
      return new EndpointChange({ endpoint: yield* readOne(sql, id), undo })
    })
  )
})

/** Gone from the list; nothing is sent to it from now on, and its Undo brings it back as it was. */
export const remove = Effect.fn("Webhooks.remove")(function*(id: string) {
  yield* Policy.require("integrations", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* settingsOf(sql, id)
      yield* sql`update webhook_endpoints set deleted_at = now() where id = ${id}`
      yield* audit(sql, "webhook.removed", id)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { op: "remove", id } })
      return new EndpointChange({ endpoint: null, undo })
    })
  )
})

const secretOf = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql<{
      secretSealed: string
      secretPrefix: string
      previousSecretSealed: string | null
      previousValidUntil: Date | null
    }>`
      select secret_sealed, secret_prefix, previous_secret_sealed, previous_valid_until
      from webhook_endpoints where id = ${id} and deleted_at is null for update`,
    ([row]) => row === undefined ? Effect.fail(new NotFound({ entity: "webhook_endpoint", id })) : Effect.succeed(row)
  )

/** "Tonen": the secret in full, for whoever may change the endpoint; audited, never logged. */
export const revealSecret = Effect.fn("Webhooks.revealSecret")(function*(id: string) {
  yield* Policy.require("integrations", 2)
  const sealer = yield* Sealer
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* secretOf(sql, id)
      const secret = yield* sealer.open(row.secretSealed).pipe(Effect.orDie)
      yield* audit(sql, "webhook.secret_revealed", id)
      return { secret: Redacted.value(secret) }
    })
  )
})

/**
 * A new secret now; the previous one keeps signing beside it for 24 hours (`v1=…,v1=…`), so the receiver can move
 * over. Its Undo puts the previous secret back.
 */
export const rotateSecret = Effect.fn("Webhooks.rotateSecret")(function*(id: string) {
  yield* Policy.require("integrations", 2)
  const sealer = yield* Sealer
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* secretOf(sql, id)
      const secret = mintSecret()
      const sealed = yield* sealer.seal(secret)
      yield* sql`update webhook_endpoints set previous_secret_sealed = secret_sealed,
                   previous_valid_until = now() + make_interval(secs => ${WEBHOOK_SECRET_OVERLAP_MS / 1000}),
                   secret_sealed = ${sealed.sealed}, secret_prefix = ${prefixOf(secret)}, secret_rotated_at = now()
                 where id = ${id}`
      yield* audit(sql, "webhook.secret_rotated", id)
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: {
          op: "secret",
          id,
          prefix: row.secretPrefix,
          had: row.previousSecretSealed === null
            ? null
            : { sealed: row.previousSecretSealed, until: row.previousValidUntil?.toISOString() ?? null }
        }
      })
      return new RotatedSecret({ endpoint: yield* readOne(sql, id), secret, undo })
    })
  )
})

const Compensation = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("settings"),
    id: Schema.String,
    before: Schema.Struct({
      url: Schema.String,
      description: Schema.String,
      events: Schema.Array(Schema.String),
      apiVersion: Schema.String,
      stores: Schema.Union([Schema.Literal("all"), Schema.Array(Schema.String)]),
      headers: Schema.Array(Schema.Struct({ key: Schema.String, sealed: Schema.String })),
      retry: Schema.Number,
      active: Schema.Boolean,
      autoDisabledAt: Schema.NullOr(Schema.String),
      consecutiveFailures: Schema.Number
    })
  }),
  Schema.Struct({ op: Schema.Literal("remove"), id: Schema.String }),
  Schema.Struct({
    op: Schema.Literal("secret"),
    id: Schema.String,
    prefix: Schema.String,
    had: Schema.NullOr(Schema.Struct({ sealed: Schema.String, until: Schema.NullOr(Schema.String) }))
  })
])

const decodeCompensation = Schema.decodeUnknownEffect(Compensation)

/** `Shared.undo` for `webhooks.restore`: the endpoint as it was before the change, with the change's own permission. */
export const restore = Effect.fn("Webhooks.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("integrations", 2)
  const c = yield* decodeCompensation(compensation).pipe(Effect.orDie)
  switch (c.op) {
    case "settings": {
      yield* settingsOf(sql, c.id)
      yield* writeSettings(sql, c.id, {
        ...c.before,
        autoDisabledAt: c.before.autoDisabledAt === null ? null : new Date(c.before.autoDisabledAt)
      })
      break
    }
    case "remove": {
      const back = yield* sql`update webhook_endpoints set deleted_at = null
                              where id = ${c.id} and deleted_at is not null returning id`
      if (back.length === 0) return yield* new Conflict({ entity: "webhook_endpoint", reason: "not_removed" })
      break
    }
    case "secret": {
      // The new secret goes; the one it replaced signs again, and the overlap it had (if any) with it.
      yield* sql`update webhook_endpoints set secret_sealed = previous_secret_sealed,
                   secret_prefix = ${c.prefix}, previous_secret_sealed = ${c.had?.sealed ?? null},
                   previous_valid_until = ${c.had?.until == null ? null : new Date(c.had.until)}
                 where id = ${c.id} and deleted_at is null and previous_secret_sealed is not null`
      break
    }
  }
  yield* audit(sql, "webhook.restored", c.id, { op: c.op })
})
