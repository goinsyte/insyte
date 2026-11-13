import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import {
  AREA_IDS,
  type AreaId,
  type Level,
  makePermissions,
  SPECIAL_IDS,
  type SpecialId,
  SYSTEM_DEFAULTS,
  SYSTEM_ORDER
} from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { narrowStores, type StoreAccess, withinScope } from "../../shared/domain/Stores.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { Created, RoleHolders, Roles, RoleView, type UpdateRole } from "../domain/Roles.ts"

/*
 * Rollen on the server (M3.2). Reading the roles is `team` at Bekijken; changing them is Beheren. The owner's role is
 * never changed. Every change goes through the catalogue (`makePermissions`: each area clamped to the levels it has,
 * every special named), bumps the role's version so sessions holding it read it again, and is audited. A deleted custom
 * role moves its holders to another first and stays as a row for its undo, which moves exactly them back. Someone held
 * to some stores (`storeScope`) only touches roles inside those stores, and never makes one that reaches further.
 */

interface RoleRow {
  readonly id: string
  readonly label: string
  readonly kind: string
  readonly basedOn: string | null
  readonly levels: Record<string, Level>
  readonly specials: Record<string, boolean>
  readonly refundLimitMinor: string | number | null
  readonly stores: StoreAccess
  readonly version: number
}

const audit = (sql: SqlClient.SqlClient, action: string, subjectId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: "member", id: p.id }, { action, subjectType: "role", subjectId, diff })
  )

export const readRoles = Effect.fn("Roles.read")(function*(sql: SqlClient.SqlClient) {
  const principal = yield* CurrentPrincipal
  const roles = yield* sql<RoleRow>`
    select id, label, kind, based_on, levels, specials, refund_limit_minor, stores, version from roles
    where deleted_at is null
    order by array_position(${SYSTEM_ORDER}::text[], id) nulls last, created_at, id`
  const members = yield* sql<{ id: string; name: string; roleId: string }>`
    select m.id, u.name, m.role_id from members m join auth."user" u on u.id = m.user_id
    where m.removed_at is null order by m.joined_at`
  const invites = yield* sql<{ roleId: string; count: number }>`
    select role_id, count(*)::int as count from invitations
    where kind = 'team' and accepted_at is null and revoked_at is null and declined_at is null and expires_at > now()
    group by role_id`
  const [link] = yield* sql<{ roleId: string; enabled: boolean }>`select role_id, enabled from invite_links`
  return new Roles({
    me: principal.id,
    myRoleId: principal.role.id,
    roles: roles.map((r) =>
      new RoleView({
        id: r.id,
        label: r.label,
        system: r.kind === "system",
        basedOn: r.basedOn,
        levels: r.levels,
        specials: r.specials,
        refundLimit: r.refundLimitMinor === null ? null : Number(r.refundLimitMinor) / 100,
        stores: r.stores,
        version: r.version,
        holders: new RoleHolders({
          members: members.filter((m) => m.roleId === r.id).map((m) => ({ id: m.id, name: m.name })),
          invites: invites.find((i) => i.roleId === r.id)?.count ?? 0,
          link: link?.enabled === true && link.roleId === r.id
        })
      })
    )
  })
})

/** The catalogue's reading of an editor's draft: areas clamped, specials named, the limit in minor units. */
const normalise = (draft: Omit<UpdateRole, "id">) => {
  const levels = Object.fromEntries(
    AREA_IDS.map((a) => [a, (draft.levels[a] ?? 0) as Level])
  ) as Record<AreaId, Level>
  const specials = SPECIAL_IDS.filter((s) => draft.specials[s] === true) as Array<SpecialId>
  const stores = draft.stores === "all" ? "all" : [...draft.stores]
  const p = makePermissions(levels, specials, draft.refundLimit, stores)
  return {
    levels: JSON.stringify(p.levels),
    specials: JSON.stringify(p.specials),
    refundLimitMinor: p.refundLimit === null ? null : Math.round(p.refundLimit * 100),
    stores: JSON.stringify(p.stores)
  }
}

const isLabelTaken = (error: SqlError.SqlError) =>
  error.reason._tag === "UniqueViolation" && error.reason.constraint.includes("label")

const checkLabel = (label: string) => {
  const trimmed = label.trim()
  return trimmed.length === 0
    ? Effect.fail(new Invalid({ fields: { label: "required" } }))
    : trimmed.length > 60
    ? Effect.fail(new Invalid({ fields: { label: "too_long" } }))
    : Effect.succeed(trimmed)
}

/** A name is taken whatever its case, as the editor says it is ("Er is al een rol met deze naam"). */
const ensureFree = (sql: SqlClient.SqlClient, label: string, except: string | null) =>
  Effect.flatMap(
    sql<{ id: string }>`select id from roles where lower(label) = lower(${label}) and id <> ${except ?? ""}`,
    (rows) => rows.length > 0 ? Effect.fail(new Invalid({ fields: { label: "taken" } })) : Effect.void
  )

/** Refused when these stores reach past the principal's own (`storeScope`). */
const ensureReach = (...stores: ReadonlyArray<StoreAccess>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      stores.every((s) => withinScope(s, p.storeScope))
        ? Effect.void
        : Effect.fail(new Invalid({ fields: { stores: "forbidden" } }))
  )

/** The role, locked for the change, if it is one this change may touch. */
const target = (sql: SqlClient.SqlClient, id: string) =>
  Effect.gen(function*() {
    const [row] = yield* sql<{ kind: string; stores: StoreAccess }>`
      select kind, stores from roles where id = ${id} and deleted_at is null for update`
    if (row === undefined) return yield* new NotFound({ entity: "role", id })
    if (id === "owner") return yield* new Conflict({ entity: "role", reason: "owner" })
    return row
  })

export const list = Effect.fn("Roles.list")(function*() {
  yield* Policy.require("team", 1)
  const db = yield* Db
  return yield* db.scoped(readRoles)
})

export const create = Effect.fn("Roles.create")(
  function*(input: { readonly label: string; readonly from: string | null }) {
    yield* Policy.require("team", 3)
    const principal = yield* CurrentPrincipal
    const label = yield* checkLabel(input.label)
    const db = yield* Db
    return yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const [from] = input.from === null ? [] : yield* sql<RoleRow>`
        select id, label, kind, based_on, levels, specials, refund_limit_minor, stores, version from roles
        where id = ${input.from} and deleted_at is null`
        if (input.from !== null && from === undefined) return yield* new NotFound({ entity: "role", id: input.from })
        yield* ensureFree(sql, label, null)
        const blank = makePermissions({})
        // A copy keeps its stores, narrowed to the maker's own when they are held to some.
        const stores = narrowStores(from?.stores ?? "all", principal.storeScope ?? "all")
        const id = mintId("rol")
        yield* sql`insert into roles (id, workspace_id, label, kind, based_on, levels, specials, refund_limit_minor, stores)
                 values (${id}, ${principal.workspaceId}, ${label}, 'custom',
                         ${from !== undefined && from.id !== "owner" ? from.id : null},
                         ${JSON.stringify(from?.levels ?? blank.levels)}::jsonb,
                         ${JSON.stringify(from?.specials ?? blank.specials)}::jsonb,
                         ${from?.refundLimitMinor ?? null}, ${JSON.stringify(stores)}::jsonb)`.pipe(
          Effect.catchIf(isLabelTaken, () => Effect.fail(new Invalid({ fields: { label: "taken" } })))
        )
        yield* audit(sql, "role.created", id, { label, from: input.from })
        return new Created({ id, roles: yield* readRoles(sql) })
      })
    )
  }
)

export const update = Effect.fn("Roles.update")(function*(input: UpdateRole) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const role = yield* target(sql, input.id)
      yield* ensureReach(role.stores, input.stores)
      const p = normalise(input)
      yield* sql`update roles set levels = ${p.levels}::jsonb, specials = ${p.specials}::jsonb,
                   refund_limit_minor = ${p.refundLimitMinor}, stores = ${p.stores}::jsonb, version = version + 1
                 where id = ${input.id}`
      yield* audit(sql, "role.updated", input.id, { levels: input.levels })
      return yield* readRoles(sql)
    })
  )
})

export const rename = Effect.fn("Roles.rename")(function*(id: string, label: string) {
  yield* Policy.require("team", 3)
  const trimmed = yield* checkLabel(label)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const role = yield* target(sql, id)
      if (role.kind !== "custom") return yield* new Conflict({ entity: "role", reason: "system" })
      yield* ensureFree(sql, trimmed, id)
      yield* sql`update roles set label = ${trimmed}, version = version + 1 where id = ${id}`.pipe(
        Effect.catchIf(isLabelTaken, () => Effect.fail(new Invalid({ fields: { label: "taken" } })))
      )
      yield* audit(sql, "role.renamed", id, { label: trimmed })
      return yield* readRoles(sql)
    })
  )
})

/** "Standaard herstellen": a system role as it comes out of the box. */
export const reset = Effect.fn("Roles.reset")(function*(id: string) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const role = yield* target(sql, id)
      const defaults = SYSTEM_DEFAULTS[id]
      if (role.kind !== "system" || defaults === undefined) {
        return yield* new Conflict({ entity: "role", reason: "custom" })
      }
      yield* ensureReach(role.stores, defaults.stores)
      const p = normalise({ ...defaults, specials: defaults.specials, stores: defaults.stores })
      yield* sql`update roles set levels = ${p.levels}::jsonb, specials = ${p.specials}::jsonb,
                   refund_limit_minor = ${p.refundLimitMinor}, stores = ${p.stores}::jsonb, version = version + 1
                 where id = ${id}`
      yield* audit(sql, "role.reset", id)
      return yield* readRoles(sql)
    })
  )
})

/** Deleting a custom role: its holders go to `to` first; the row stays, with who moved, for the undo. */
export const remove = Effect.fn("Roles.remove")(function*(id: string, to: string) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const role = yield* target(sql, id)
      if (role.kind !== "custom") return yield* new Conflict({ entity: "role", reason: "system" })
      if (to === id || to === "owner") return yield* new Invalid({ fields: { to: "invalid" } })
      const [dest] = yield* sql<{ id: string; stores: StoreAccess }>`
        select id, stores from roles where id = ${to} and deleted_at is null`
      if (dest === undefined) return yield* new NotFound({ entity: "role", id: to })
      yield* ensureReach(role.stores, dest.stores)
      const members = yield* sql<{ id: string }>`update members set role_id = ${to} where role_id = ${id} returning id`
      const invitations = yield* sql<{ id: string }>`
        update invitations set role_id = ${to}
        where role_id = ${id} and accepted_at is null and revoked_at is null and declined_at is null returning id`
      const link = yield* sql<{ workspaceId: string }>`
        update invite_links set role_id = ${to} where role_id = ${id} returning workspace_id`
      const moved = {
        to,
        members: members.map((m) => m.id),
        invitations: invitations.map((i) => i.id),
        link: link.length > 0
      }
      yield* sql`update roles set deleted_at = now(), moved = ${JSON.stringify(moved)}::jsonb where id = ${id}`
      yield* audit(sql, "role.deleted", id, moved)
      return yield* readRoles(sql)
    })
  )
})

/** Undo of a delete: the role again, and those it moved back on it (where they still are where they went). */
export const restore = Effect.fn("Roles.restore")(function*(id: string) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<
        {
          moved: { to: string; members: Array<string>; invitations: Array<string>; link: boolean } | null
          stores: StoreAccess
        }
      >`
        select moved, stores from roles where id = ${id} and kind = 'custom' and deleted_at is not null for update`
      if (row === undefined) return yield* new NotFound({ entity: "role", id })
      yield* ensureReach(row.stores)
      yield* sql`update roles set deleted_at = null, moved = null where id = ${id}`
      const moved = row.moved
      if (moved !== null) {
        if (moved.members.length > 0) {
          yield* sql`update members set role_id = ${id} where id in ${sql.in(moved.members)} and role_id = ${moved.to}`
        }
        if (moved.invitations.length > 0) {
          yield* sql`update invitations set role_id = ${id}
                     where id in ${sql.in(moved.invitations)} and role_id = ${moved.to}`
        }
        if (moved.link) yield* sql`update invite_links set role_id = ${id} where role_id = ${moved.to}`
      }
      yield* audit(sql, "role.restored", id)
      return yield* readRoles(sql)
    })
  )
})
