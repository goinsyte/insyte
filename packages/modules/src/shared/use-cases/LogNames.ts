import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { StoreAccess } from "../domain/Stores.ts"

/*
 * What the Logboek calls the subject of a change, read when the change is written (`Audit.LogNote`): a line keeps
 * saying who and what it was about after the role is renamed, the member leaves or the webhook is gone.
 */

/** A member by their name, or their address while they have none. */
export const memberName = Effect.fn("LogNames.member")(function*(sql: SqlClient.SqlClient, id: string) {
  const [row] = yield* sql<{ name: string | null; email: string | null }>`
    select u.name, u.email from members m left join auth."user" u on u.id = m.user_id where m.id = ${id}`
  return row?.name !== undefined && row.name !== null && row.name !== "" ? row.name : row?.email ?? undefined
})

/** Roles by their names, as Rollen shows them; one deleted since keeps its row and so its name. */
export const roleLabels = Effect.fn("LogNames.roles")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return new Map<string, string>()
  const rows = yield* sql<{ id: string; label: string }>`
    select id, label from roles where id in ${sql.in([...new Set(ids)])}`
  return new Map(rows.map((r) => [r.id, r.label]))
})

/** A role by its name, or its id where the workspace has no such role. */
export const roleLabel = (sql: SqlClient.SqlClient, id: string) =>
  Effect.map(roleLabels(sql, [id]), (labels) => labels.get(id) ?? id)

/** Stores as the team page says them: "Alle winkels", or their names. */
export const storesSaid = Effect.fn("LogNames.stores")(function*(sql: SqlClient.SqlClient, stores: StoreAccess) {
  if (stores === "all") return "Alle winkels"
  if (stores.length === 0) return ""
  const rows = yield* sql<{ id: string; name: string }>`select id, name from stores where id in ${sql.in([...stores])}`
  const names = new Map(rows.map((r) => [r.id, r.name]))
  return stores.map((s) => names.get(s) ?? s).join(", ")
})
