import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { API_AREAS, AREA_IDS, type AreaId, type Level, SPECIAL_IDS, type SpecialId } from "@insyte/domain/Permissions"
import { CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { StoreAccess } from "../../shared/domain/Stores.ts"
import { type KeyAccess, KeyRefused } from "../domain/ApiKey.ts"
import { KeyHasher } from "../domain/Ports.ts"

/*
 * A bearer token → the key's principal (M19.2, 07 §3.5): `ins_live_<lookup>_<secret>`; the lookup routes to the key's
 * workspace, the secret's HMAC must match the current hash, or the previous one inside its grace. The principal's role
 * is the key's access as the catalogue allows it through the API: a role's levels clamped per area (`apiMax`), or the
 * key's own scopes; areas the API does not serve, and every special, stay off.
 */

const TOKEN = /^ins_live_([a-z0-9]{12})_([A-Za-z0-9]{32})$/

interface KeyRow {
  readonly id: string
  readonly label: string
  readonly lookup: string
  readonly previousLookup: string | null
  readonly hash: string
  readonly previousHash: string | null
  readonly graceUntil: Date | null
  readonly access: KeyAccess
  readonly stores: StoreAccess
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly ips: ReadonlyArray<string>
}

interface RoleRow {
  readonly id: string
  readonly label: string
  readonly version: number
  readonly levels: Record<AreaId, Level>
  readonly specials: Partial<Record<SpecialId, boolean>>
  readonly refundLimitMinor: string | number | null
}

/**
 * The special actions a key may take through the API (api.md §6): a role-bound key takes them from its role, refunds
 * with the role's limit; a key with its own scopes takes none until it can be given an explicit limit. Approving a
 * return (M9.1) is one, so `POST /returns/{id}/approve` works for a key whose role may.
 */
const API_SPECIALS: ReadonlyArray<SpecialId> = ["refunds.write", "disputes.write", "returns.approve"]

/** Equal hex strings, compared in time that does not depend on where they differ. */
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const ipv4 = (ip: string) => {
  const parts = ip.split(".").map(Number)
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)
    ? parts.reduce((n, p) => n * 256 + p, 0)
    : null
}

/** The caller's address is on the key's list: an exact address, or inside an IPv4 range. */
export const allowedFrom = (ips: ReadonlyArray<string>, ip: string | null) => {
  if (ips.length === 0) return true
  if (ip === null) return false
  return ips.some((entry) => {
    const [base, bits] = entry.split("/")
    if (bits === undefined) return base!.toLowerCase() === ip.toLowerCase()
    const from = ipv4(base!)
    const at = ipv4(ip)
    if (from === null || at === null) return false
    const size = 2 ** (32 - Number(bits))
    return Math.floor(from / size) === Math.floor(at / size)
  })
}

const LEVELS_OFF = Object.fromEntries(AREA_IDS.map((a) => [a, 0])) as Record<AreaId, Level>
const SPECIALS_OFF = Object.fromEntries(SPECIAL_IDS.map((s) => [s, false])) as Record<SpecialId, boolean>

/** The levels a key acts with: only the areas the API serves, each at most its `apiMax`. */
const throughApi = (levels: Partial<Record<AreaId, number>>): Record<AreaId, Level> => ({
  ...LEVELS_OFF,
  ...Object.fromEntries(API_AREAS.map((a) => [a.id, Math.min(levels[a.id] ?? 0, a.apiMax ?? 2) as Level]))
})

/** Who a token is: the key's principal, and what `/v1/me` says of it. */
export interface Authenticated {
  readonly principal: Principal
  readonly label: string
  readonly workspaceName: string
}

export const authenticate = Effect.fn("ApiKeys.authenticate")(function*(token: string, ip: string | null) {
  const match = TOKEN.exec(token)
  if (match === null) return yield* new KeyRefused({ reason: token === "" ? "missing" : "malformed" })
  const [, lookup, secret] = match as unknown as [string, string, string]
  const db = yield* Db
  const hasher = yield* KeyHasher
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId; keyId: string }>`select workspace_id, key_id from api_key_route(${lookup})`
  )
  if (route === undefined) return yield* new KeyRefused({ reason: "unknown" })
  const hash = yield* hasher.hash(secret)

  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [key] = yield* sql<KeyRow>`
        select id, label, lookup, previous_lookup, encode(secret_hash, 'hex') as hash,
               encode(previous_hash, 'hex') as previous_hash, grace_until, access, stores, expires_at, revoked_at, ips
        from api_keys where id = ${route.keyId}`
      if (key === undefined) return yield* new KeyRefused({ reason: "unknown" })
      const current = key.lookup === lookup
      const expected = current
        ? key.hash
        : key.graceUntil !== null && key.graceUntil > new Date()
        ? key.previousHash
        : null
      if (expected === null || !same(expected, hash)) return yield* new KeyRefused({ reason: "unknown" })
      if (key.revokedAt !== null) return yield* new KeyRefused({ reason: "revoked" })
      if (key.expiresAt !== null && key.expiresAt <= new Date()) return yield* new KeyRefused({ reason: "expired" })
      if (!allowedFrom(key.ips, ip)) return yield* new KeyRefused({ reason: "ip" })

      const role = key.access.kind === "role"
        ? yield* Effect.map(
          sql<RoleRow>`select id, label, version, levels, specials, refund_limit_minor from roles
                       where id = ${key.access.roleId} and deleted_at is null`,
          ([r]) => r
        )
        : undefined
      // A key whose role was removed acts with nothing until it is given another.
      const levels = key.access.kind === "role" ? throughApi(role?.levels ?? {}) : throughApi(key.access.scopes)
      yield* sql`update api_keys set last_used_at = now() where id = ${key.id}`
      const [workspace] = yield* sql<{ name: string }>`select name from workspaces where id = ${route.workspaceId}`
      const principal: Principal = {
        kind: "api_key",
        id: key.id,
        userId: null,
        workspaceId: route.workspaceId,
        partnerId: null,
        role: {
          id: role?.id ?? "custom",
          label: role?.label ?? key.label,
          version: role?.version ?? 1,
          levels,
          specials: role === undefined
            ? SPECIALS_OFF
            : { ...SPECIALS_OFF, ...Object.fromEntries(API_SPECIALS.map((s) => [s, role.specials[s] === true])) },
          refundLimit: role?.refundLimitMinor === null || role === undefined
            ? null
            : Number(role.refundLimitMinor) / 100,
          stores: key.stores === "all" ? "all" : [...key.stores]
        },
        storeScope: key.stores === "all" ? null : [...key.stores]
      }
      const authenticated: Authenticated = { principal, label: key.label, workspaceName: workspace?.name ?? "" }
      return authenticated
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: route.workspaceId }))
})

export interface RequestEntry {
  readonly keyId: string
  readonly method: string
  readonly path: string
  readonly status: number
  readonly ms: number
  readonly ip: string | null
}

/** One line of the key's request log, written after the response (the activity the console shows). */
export const logRequest = Effect.fn("ApiKeys.logRequest")(function*(workspaceId: WorkspaceId, entry: RequestEntry) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`insert into api_requests (workspace_id, key_id, method, path, status, ms, ip)
        values (${workspaceId}, ${entry.keyId}, ${entry.method}, ${entry.path}, ${entry.status}, ${entry.ms}, ${entry.ip})`
  ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId }))
})
