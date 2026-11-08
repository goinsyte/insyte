import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { API_AREAS, type AreaId } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { StoreAccess } from "../../shared/domain/Stores.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import {
  ApiKeyView,
  ApiRequestView,
  type CreateKey,
  type KeyAccess,
  KeyActivity,
  type UpdateKey,
  WithSecret
} from "../domain/ApiKey.ts"
import { KeyHasher } from "../domain/Ports.ts"

/*
 * Instellingen → API-sleutels (M19.1). Seeing the keys is `integrations` at Bekijken; making, rotating and revoking them
 * is Beheren, and never through a key (key management is `api: false`). A token is `ins_live_<lookup>_<secret>`; the
 * secret is returned once and only its HMAC kept. A rotation keeps the previous token working until its grace ends.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const ALPHABET_SECRET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

const random = (length: number, alphabet: string) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => alphabet[b % alphabet.length]).join("")

/** A fresh token: the lookup that finds the key, the secret that proves it, and what the list shows of it. */
export const mintToken = () => {
  const lookup = random(12, ALPHABET)
  const secret = random(32, ALPHABET_SECRET)
  return { lookup, secret, token: `ins_live_${lookup}_${secret}`, prefix: `ins_live_${lookup.slice(0, 4)}` }
}

/** IPv4 with an optional /prefix, or IPv6 in its usual short forms (`lib/developer.ts` `IP`). */
const IP =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/(?:3[0-2]|[12]?\d))?|[0-9a-f:]{2,39}(?:\/\d{1,3})?)$/i

interface Row {
  readonly id: string
  readonly label: string
  readonly prefix: string
  readonly createdAt: Date
  readonly createdBy: string
  readonly lastUsedAt: Date | null
  readonly revokedAt: Date | null
  readonly access: KeyAccess
  readonly stores: StoreAccess
  readonly expiresAt: Date | null
  readonly ips: ReadonlyArray<string>
  readonly previousPrefix: string | null
  readonly graceUntil: Date | null
  readonly agent: boolean
}

const toView = (r: Row) =>
  new ApiKeyView({
    id: r.id,
    label: r.label,
    prefix: r.prefix,
    createdAt: r.createdAt.getTime(),
    createdBy: r.createdBy,
    lastUsedAt: r.lastUsedAt?.getTime() ?? null,
    status: r.revokedAt === null ? "active" : "revoked",
    access: r.access,
    stores: r.stores,
    expiresAt: r.expiresAt?.getTime() ?? null,
    ips: [...r.ips],
    rotated: r.previousPrefix !== null && r.graceUntil !== null && r.graceUntil.getTime() > Date.now()
      ? { previousPrefix: r.previousPrefix, until: r.graceUntil.getTime() }
      : null,
    revokedAt: r.revokedAt?.getTime() ?? null,
    agent: r.agent
  })

const SELECT = (sql: SqlClient.SqlClient) =>
  sql`select id, label, prefix, created_at, created_by, last_used_at, revoked_at, access, stores, expires_at, ips,
             previous_prefix, grace_until, agent from api_keys`

const readKeys = (sql: SqlClient.SqlClient) =>
  Effect.map(sql<Row>`${SELECT(sql)} order by revoked_at is not null, created_at desc`, (rows) => rows.map(toView))

const readKey = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql<Row>`${SELECT(sql)} where id = ${id}`,
    ([row]) => row === undefined ? Effect.fail(new NotFound({ entity: "api_key", id })) : Effect.succeed(toView(row))
  )

const audit = (sql: SqlClient.SqlClient, action: string, subjectId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: "member", id: p.id }, { action, subjectType: "api_key", subjectId, diff })
  )

/** A key's access as the catalogue allows it: a role that exists (not the owner's), or scopes clamped per area. */
const checkAccess = (sql: SqlClient.SqlClient, access: KeyAccess) =>
  Effect.gen(function*() {
    if (access.kind === "role") {
      if (access.roleId === "owner") return yield* new Invalid({ fields: { access: "owner" } })
      const [role] = yield* sql<{ id: string }>`select id from roles where id = ${access.roleId} and deleted_at is null`
      if (role === undefined) return yield* new Invalid({ fields: { access: "unknown_role" } })
      return access
    }
    const scopes = Object.fromEntries(
      API_AREAS.map((a) => [a.id, Math.min(access.scopes[a.id] ?? 0, a.apiMax ?? 2)]).filter(([, v]) => v !== 0)
    ) as Partial<Record<AreaId, 0 | 1 | 2>>
    return { kind: "custom" as const, scopes }
  })

const checkFields = (
  input: { readonly label?: string | undefined; readonly ips?: ReadonlyArray<string> | undefined }
) => {
  const fields: Record<string, string> = {}
  if (input.label !== undefined && (input.label.trim().length === 0 || input.label.trim().length > 80)) {
    fields["label"] = input.label.trim().length === 0 ? "required" : "too_long"
  }
  if (input.ips?.some((ip) => !IP.test(ip.trim()))) fields["ips"] = "format"
  return Object.keys(fields).length > 0 ? Effect.fail(new Invalid({ fields })) : Effect.void
}

export const list = Effect.fn("ApiKeys.list")(function*() {
  yield* Policy.require("integrations", 1)
  const db = yield* Db
  return yield* db.scoped(readKeys)
})

/** The key's own requests (written by the public API and the MCP server): the last hundred, and 14 days of counts. */
export const activity = Effect.fn("ApiKeys.activity")(function*(id: string) {
  yield* Policy.require("integrations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const requests = yield* sql<
        { id: string; method: string; path: string; status: number; ms: number; at: Date; ip: string | null }
      >`
        select id::text, method, path, status, ms, at, ip from api_requests where key_id = ${id}
        order by at desc limit 100`
      const usage = yield* sql<{ day: Date; count: number; errors: number }>`
        select d.day, count(r.id)::int as count, (count(r.id) filter (where r.status >= 400))::int as errors
        from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day')
          as d(day)
        left join api_requests r on r.key_id = ${id} and date_trunc('day', r.at) = d.day
        group by d.day order by d.day`
      return new KeyActivity({
        requests: requests.map((r) => new ApiRequestView({ ...r, at: r.at.getTime() })),
        usage: usage.map((u) => ({ day: u.day.getTime(), count: u.count, errors: u.errors }))
      })
    })
  )
})

export const create = Effect.fn("ApiKeys.create")(function*(input: CreateKey) {
  yield* Policy.require("integrations", 3)
  yield* checkFields(input)
  const principal = yield* CurrentPrincipal
  const hasher = yield* KeyHasher
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const access = yield* checkAccess(sql, input.access)
      const id = mintId("key")
      const token = mintToken()
      const hash = yield* hasher.hash(token.secret)
      yield* sql`insert into api_keys (id, workspace_id, label, lookup, prefix, secret_hash, access, stores, expires_at, ips,
                                       agent, created_by)
                 values (${id}, ${principal.workspaceId}, ${input.label.trim()}, ${token.lookup}, ${token.prefix},
                         decode(${hash}, 'hex'), ${JSON.stringify(access)}::jsonb, ${
        JSON.stringify(input.stores)
      }::jsonb,
                         ${
        input.expiresInDays === null ? null : sql`now() + make_interval(days => ${input.expiresInDays})`
      },
                         ${input.ips.map((ip) => ip.trim())}::text[], ${input.agent}, ${principal.id})`
      yield* audit(sql, "api_key.created", id, { access: access.kind, agent: input.agent })
      return new WithSecret({ key: yield* readKey(sql, id), secret: token.token })
    })
  )
})

export const update = Effect.fn("ApiKeys.update")(function*(input: UpdateKey) {
  yield* Policy.require("integrations", 3)
  yield* checkFields(input)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* readKey(sql, input.id)
      yield* sql`update api_keys set label = coalesce(${input.label?.trim() ?? null}, label),
                   ips = coalesce(${input.ips === undefined ? null : input.ips.map((ip) => ip.trim())}::text[], ips)
                 where id = ${input.id}`
      yield* audit(sql, "api_key.updated", input.id)
      return yield* readKeys(sql)
    })
  )
})

/** A new token now; the previous one keeps working for `graceMs`, so whatever uses it can move over. */
export const rotate = Effect.fn("ApiKeys.rotate")(function*(id: string, graceMs: number) {
  yield* Policy.require("integrations", 3)
  const hasher = yield* KeyHasher
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const key = yield* readKey(sql, id)
      if (key.status === "revoked") return yield* new Conflict({ entity: "api_key", reason: "revoked" })
      const token = mintToken()
      const hash = yield* hasher.hash(token.secret)
      yield* sql`update api_keys set previous_lookup = lookup, previous_prefix = prefix, previous_hash = secret_hash,
                   grace_until = now() + make_interval(secs => ${Math.max(0, graceMs) / 1000}),
                   lookup = ${token.lookup}, prefix = ${token.prefix}, secret_hash = decode(${hash}, 'hex')
                 where id = ${id}`
      yield* audit(sql, "api_key.rotated", id, { graceMs })
      return new WithSecret({ key: yield* readKey(sql, id), secret: token.token })
    })
  )
})

/** "Oude nu stoppen": the previous token stops before its grace is over. */
export const endGrace = Effect.fn("ApiKeys.endGrace")(function*(id: string) {
  yield* Policy.require("integrations", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* readKey(sql, id)
      yield* sql`update api_keys set previous_lookup = null, previous_hash = null, previous_prefix = null,
                   grace_until = null where id = ${id}`
      yield* audit(sql, "api_key.grace_ended", id)
      return yield* readKeys(sql)
    })
  )
})

/** Revoked: refused at once; the row stays, greyed, and its undo puts it back as it was. */
export const revoke = Effect.fn("ApiKeys.revoke")(function*(id: string) {
  yield* Policy.require("integrations", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* readKey(sql, id)
      yield* sql`update api_keys set revoked_at = now(), revoked_by = ${principal.id}
                 where id = ${id} and revoked_at is null`
      yield* audit(sql, "api_key.revoked", id)
      return yield* readKeys(sql)
    })
  )
})

export const restore = Effect.fn("ApiKeys.restore")(function*(id: string) {
  yield* Policy.require("integrations", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* readKey(sql, id)
      yield* sql`update api_keys set revoked_at = null, revoked_by = null where id = ${id}`
      yield* audit(sql, "api_key.restored", id)
      return yield* readKeys(sql)
    })
  )
})
