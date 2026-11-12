import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import {
  CATALOG,
  CATALOG_BY_ID,
  type CatalogApp,
  COLLECTIONS,
  KEY_SCOPES,
  type KeyRecipe
} from "@insyte/domain/Marketplace"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AppDetail,
  Catalog,
  type FeedbackCategory,
  InstallResult,
  InstallView,
  ScopesChange,
  UninstallResult
} from "../domain/Marketplace.ts"
import { AppKeys, type KeyGrant, type KeyLevel } from "../domain/Ports.ts"

/*
 * The Marketplace (M17 step 3; widgets/05 §6). Browsing the catalogue, what the workspace has installed, the
 * recommendations, opening an app and writing feedback are every member's. Installing, uninstalling and taking scopes
 * back are Koppelingen at Bewerken; a recipe app's key is Koppelingen at Beheren on top, the developer slice's own.
 *
 * A connector app (Klaviyo) is installed when its connection is: connected from the Marketplace or from anywhere else
 * in Insyte, it shows as installed. Its install keeps a row (who started it, when it was last opened) and names the
 * connect flow the console starts; its uninstall comes after the connection is let go, and cannot be undone. A recipe
 * app (Zapier) gets a key of its own, shown once, that reaches no more than its recipe's areas, the acting member's own
 * levels and stores (`grantOf`), and reads only until writing is given back. Its uninstall revokes the key with it, and
 * Undo puts both back; a key revoked by anyone else stays revoked.
 */

export const RESTORE = "marketplace.restore"
export const RESCOPE = "marketplace.rescope"

const MAX_MESSAGE = 4000

interface Row {
  readonly id: string
  readonly appId: string
  readonly installedAt: Date
  readonly installedBy: string | null
  readonly lastOpenedAt: Date | null
  readonly revokedScopes: ReadonlyArray<string>
  readonly apiKeyId: string | null
}

const liveRows = (sql: SqlClient.SqlClient) =>
  sql<Row>`select id, app_id, installed_at, installed_by, last_opened_at, revoked_scopes, api_key_id
           from app_installs where removed_at is null`

const liveRow = (sql: SqlClient.SqlClient, appId: string) =>
  Effect.map(
    sql<Row>`select id, app_id, installed_at, installed_by, last_opened_at, revoked_scopes, api_key_id
             from app_installs where app_id = ${appId} and removed_at is null for update`,
    ([row]) => row
  )

/** The providers the workspace has connected, and since when. */
const connected = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ provider: string; since: Date }>`
      select provider, min(created_at) as since from connections where status = 'connected' group by provider`,
    (rows) => new Map(rows.map((r) => [r.provider, r.since]))
  )

const viewOf = (row: Row, via: "app" | "connection") =>
  new InstallView({
    appId: row.appId,
    installedAt: row.installedAt.getTime(),
    installedBy: row.installedBy,
    lastOpenedAt: row.lastOpenedAt?.getTime() ?? null,
    revokedScopes: [...row.revokedScopes],
    via
  })

/** Every app the workspace has, in the catalogue's order. */
const readInstalls = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const rows = new Map((yield* liveRows(sql)).map((r) => [r.appId, r]))
    const providers = yield* connected(sql)
    return CATALOG.flatMap((app): Array<InstallView> => {
      const row = rows.get(app.id)
      if (app.install.kind === "connect") {
        const since = providers.get(app.install.provider)
        if (since === undefined) return []
        return [
          row === undefined
            ? new InstallView({
              appId: app.id,
              installedAt: since.getTime(),
              installedBy: null,
              lastOpenedAt: null,
              revokedScopes: [],
              via: "connection"
            })
            : viewOf(row, "connection")
        ]
      }
      return app.install.kind === "key" && row !== undefined ? [viewOf(row, "app")] : []
    })
  })

const appOf = (appId: string) => {
  const app = CATALOG_BY_ID[appId]
  return app === undefined ? Effect.fail(new NotFound({ entity: "app", id: appId })) : Effect.succeed(app)
}

const audit = (sql: SqlClient.SqlClient, action: string, appId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "app",
        subjectId: appId,
        diff
      })
  )

const ready = (id: string) => CATALOG_BY_ID[id]?.install.kind !== "soon"

/** A recipe app's key, by what is left of its scopes: reading and writing, reading only, or nothing. */
const levelOf = (revoked: ReadonlyArray<string>): KeyLevel =>
  revoked.includes(KEY_SCOPES.read) ? 0 : revoked.includes(KEY_SCOPES.write) ? 1 : 2

/**
 * What a recipe app's key may reach, least first: its recipe's areas only, each at what is left of its scopes and never
 * above the acting member's own level there (Bekijken reads, Bewerken and up writes), in the member's own stores.
 */
const grantOf = (recipe: KeyRecipe, revoked: ReadonlyArray<string>, principal: Principal): KeyGrant => {
  const level = levelOf(revoked)
  return {
    scopes: Object.fromEntries(
      recipe.areas.map((area) => [area, Math.min(level, principal.role.levels[area], 2) as KeyLevel])
    ),
    stores: principal.storeScope === null ? "all" : [...principal.storeScope]
  }
}

/** The scopes a new key starts without: writing, unless its recipe writes. */
const startsRevoked = (recipe: KeyRecipe): ReadonlyArray<string> => recipe.write ? [] : [KEY_SCOPES.write]

export const catalog = Effect.fn("Marketplace.catalog")(() =>
  Effect.succeed(
    new Catalog({
      apps: CATALOG,
      collections: { featured: COLLECTIONS.featured, trending: COLLECTIONS.trending, editors: COLLECTIONS.editors }
    })
  )
)

export const installs = Effect.fn("Marketplace.installs")(function*() {
  const db = yield* Db
  return yield* db.scoped(readInstalls)
})

export const get = Effect.fn("Marketplace.get")(function*(appId: string) {
  const app = yield* appOf(appId)
  const db = yield* Db
  const all = yield* db.scoped(readInstalls)
  return new AppDetail({ app, install: all.find((i) => i.appId === appId) ?? null })
})

/**
 * "Aanbevolen voor jou": by rules over what the workspace has and uses, never a guess. Customers to write to suggest
 * Klaviyo; returns, a returns portal; tickets, a help desk to move from; orders, tracking, fraud screening and a way to
 * connect other tools; a key in use, the same. Installed apps drop out; installable ones go first. Four at most; with
 * no signal yet, the editors' featured shelf.
 */
export const recommended = Effect.fn("Marketplace.recommended")(function*() {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [signals] = yield* sql<{
        customers: boolean
        orders: boolean
        returns: boolean
        tickets: boolean
        keys: boolean
      }>`
        select exists (select 1 from customers) as customers, exists (select 1 from orders) as orders,
               exists (select 1 from returns) as returns, exists (select 1 from tickets) as tickets,
               exists (select 1 from api_keys where revoked_at is null) as keys`
      const s = signals!
      const rules: ReadonlyArray<readonly [string, boolean]> = [
        ["ext_klaviyo", s.customers],
        ["ext_zapier", s.keys || s.orders],
        ["ext_loop", s.returns],
        ["ext_gorgias", s.tickets],
        ["ext_aftership", s.orders],
        ["ext_signifyd", s.orders]
      ]
      const have = new Set((yield* readInstalls(sql)).map((i) => i.appId))
      const hits = rules.filter(([, on]) => on).map(([id]) => id)
      const pool = (hits.length > 0 ? hits : [...COLLECTIONS.featured]).filter((id) => !have.has(id))
      return [...pool.filter(ready), ...pool.filter((id) => !ready(id))].slice(0, 4)
    })
  )
})

export const install = Effect.fn("Marketplace.install")(function*(appId: string) {
  const app = yield* appOf(appId)
  yield* Policy.require("integrations", 2)
  const how = app.install
  if (how.kind === "soon") return yield* new Conflict({ entity: "app", reason: "soon" })
  const principal = yield* CurrentPrincipal
  const keys = yield* AppKeys
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const existing = yield* liveRow(sql, app.id)
      if (how.kind === "connect") {
        if (existing === undefined) {
          yield* sql`insert into app_installs (id, workspace_id, app_id, installed_by)
                     values (${mintId("app")}, ${principal.workspaceId}, ${app.id}, ${principal.id})`
          yield* audit(sql, "app.installed", app.id, { via: "connection", provider: how.provider })
        }
        const now = (yield* readInstalls(sql)).find((i) => i.appId === app.id) ?? null
        return new InstallResult({ install: now, key: null, connect: now === null ? how.provider : null })
      }
      if (existing !== undefined) return yield* new Conflict({ entity: "app", reason: "installed" })
      const revoked = startsRevoked(how)
      const key = yield* keys.create(sql, {
        label: app.name,
        grant: grantOf(how, revoked, principal),
        expiresInDays: how.expiresInDays
      })
      const id = mintId("app")
      yield* sql`insert into app_installs (id, workspace_id, app_id, installed_by, api_key_id, revoked_scopes)
                 values (${id}, ${principal.workspaceId}, ${app.id}, ${principal.id}, ${key.keyId},
                         ${[...revoked]}::text[])`
      yield* audit(sql, "app.installed", app.id, { via: "key", key: key.keyId })
      const row = yield* liveRow(sql, app.id)
      return new InstallResult({
        install: viewOf(row!, "app"),
        key: { secret: key.secret, prefix: key.prefix },
        connect: null
      })
    })
  )
})

export const uninstall = Effect.fn("Marketplace.uninstall")(function*(appId: string) {
  const app = yield* appOf(appId)
  yield* Policy.require("integrations", 2)
  const principal = yield* CurrentPrincipal
  const keys = yield* AppKeys
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* liveRow(sql, app.id)
      if (app.install.kind === "connect") {
        // The connection is let go by its own flow first; the app follows it, for good.
        const providers = yield* connected(sql)
        if (providers.has(app.install.provider)) return yield* new Conflict({ entity: "app", reason: "connected" })
        if (row !== undefined) {
          yield* sql`update app_installs set removed_at = now(), removed_by = ${principal.id} where id = ${row.id}`
          yield* audit(sql, "app.uninstalled", app.id, { via: "connection" })
        }
        return new UninstallResult({ undo: null })
      }
      if (row === undefined) return yield* new NotFound({ entity: "app_install", id: app.id })
      // Only a revocation made here is this undo's to take back: a key already revoked stays so.
      const revokedAt = row.apiKeyId === null ? null : yield* keys.revoke(sql, row.apiKeyId)
      yield* sql`update app_installs set removed_at = now(), removed_by = ${principal.id} where id = ${row.id}`
      yield* audit(sql, "app.uninstalled", app.id, { via: "key", key: row.apiKeyId })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: {
          installId: row.id,
          keyId: revokedAt === null ? null : row.apiKeyId,
          revokedAt: revokedAt?.toISOString() ?? null
        }
      })
      return new UninstallResult({ undo })
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(
  Schema.Struct({
    installId: Schema.String,
    keyId: Schema.NullOr(Schema.String),
    revokedAt: Schema.NullOr(Schema.String)
  })
)

/**
 * `Shared.undo` for `marketplace.restore`: the app back as it was, and its key working again if the uninstall revoked
 * it and nobody has revoked it since.
 */
export const restore = Effect.fn("Marketplace.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("integrations", 2)
  const { installId, keyId, revokedAt } = yield* decodeRestore(compensation).pipe(Effect.orDie)
  const keys = yield* AppKeys
  const [row] = yield* sql<{ appId: string }>`select app_id from app_installs where id = ${installId}`
  if (row === undefined) return yield* new NotFound({ entity: "app_install", id: installId })
  // Installed again in the meantime: that install stands.
  if ((yield* liveRow(sql, row.appId)) !== undefined) return yield* new Conflict({ entity: "app", reason: "installed" })
  yield* sql`update app_installs set removed_at = null, removed_by = null where id = ${installId}`
  if (keyId !== null && revokedAt !== null) yield* keys.restore(sql, keyId, new Date(revokedAt))
  yield* audit(sql, "app.restored", row.appId)
})

/** Scopes taken back from a recipe app (or given back), its key narrowed to match, with Undo. */
export const setScopes = Effect.fn("Marketplace.setScopes")(function*(input: {
  readonly appId: string
  readonly revoked: ReadonlyArray<string>
}) {
  const app = yield* appOf(input.appId)
  yield* Policy.require("integrations", 2)
  // A connector app's rights are the provider's grant, set at its own approval page; Insyte cannot narrow them.
  if (app.install.kind !== "key") return yield* new Conflict({ entity: "app", reason: "not_scoped" })
  const known = new Set(app.scopes.map((s) => s.id))
  if (input.revoked.some((id) => !known.has(id))) return yield* new Invalid({ fields: { revoked: "unknown" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* liveRow(sql, app.id)
      if (row === undefined) return yield* new NotFound({ entity: "app_install", id: app.id })
      const before = [...row.revokedScopes]
      yield* write(sql, app, row, [...new Set(input.revoked)])
      const undo = yield* Undo.issue(sql, { command: RESCOPE, compensation: { appId: app.id, before } })
      return new ScopesChange({ install: viewOf((yield* liveRow(sql, app.id))!, "app"), undo })
    })
  )
})

const write = (sql: SqlClient.SqlClient, app: CatalogApp, row: Row, revoked: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const keys = yield* AppKeys
    const principal = yield* CurrentPrincipal
    yield* sql`update app_installs set revoked_scopes = ${[...revoked]}::text[] where id = ${row.id}`
    if (row.apiKeyId !== null && app.install.kind === "key") {
      yield* keys.rescope(sql, row.apiKeyId, grantOf(app.install, revoked, principal))
    }
    yield* audit(sql, "app.scopes_changed", app.id, { before: row.revokedScopes, after: revoked })
  })

const decodeRescope = Schema.decodeUnknownEffect(
  Schema.Struct({ appId: Schema.String, before: Schema.Array(Schema.String) })
)

/** `Shared.undo` for `marketplace.rescope`: the scopes as they were, the key with them. */
export const rescope = Effect.fn("Marketplace.rescopeBack")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("integrations", 2)
  const { appId, before } = yield* decodeRescope(compensation).pipe(Effect.orDie)
  const app = yield* appOf(appId)
  const row = yield* liveRow(sql, appId)
  if (row === undefined) return yield* new NotFound({ entity: "app_install", id: appId })
  yield* write(sql, app, row, before)
})

/** "Openen": when an installed app was last opened. A connector app connected elsewhere gets its row now. */
export const open = Effect.fn("Marketplace.open")(function*(appId: string) {
  const app = yield* appOf(appId)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const installed = (yield* readInstalls(sql)).find((i) => i.appId === app.id)
      if (installed === undefined) return yield* new NotFound({ entity: "app_install", id: app.id })
      yield* sql`insert into app_installs (id, workspace_id, app_id, installed_at, last_opened_at)
                 values (${mintId("app")}, ${principal.workspaceId}, ${app.id}, ${new Date(installed.installedAt)},
                         now())
                 on conflict (workspace_id, app_id) where removed_at is null do update set last_opened_at = now()`
      return (yield* readInstalls(sql)).find((i) => i.appId === app.id)!
    })
  )
})

/** "Feedback sturen": kept for the Marketplace team. */
export const feedback = Effect.fn("Marketplace.feedback")(function*(input: {
  readonly category: FeedbackCategory
  readonly message: string
}) {
  const message = input.message.trim()
  if (message.length === 0 || message.length > MAX_MESSAGE) {
    return yield* new Invalid({ fields: { message: message.length === 0 ? "required" : "too_long" } })
  }
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const id = mintId("fb")
      yield* sql`insert into app_feedback (id, workspace_id, member_id, category, message)
                 values (${id}, ${principal.workspaceId}, ${principal.id}, ${input.category}, ${message})`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "marketplace.feedback",
        subjectType: "app_feedback",
        subjectId: id,
        diff: { category: input.category }
      })
    })
  )
})
