import { Invalid } from "@insyte/domain/Errors"
import { mintId, type UserId, type WorkspaceId } from "@insyte/domain/Ids"
import { SYSTEM_DEFAULTS } from "@insyte/domain/Permissions"
import { Effect } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import type { ValidWorkspace } from "../../shared/domain/Workspaces.ts"

/*
 * Founding a workspace (M3.1), on the caller's transaction, which has the new workspace as `app.workspace_id`: so every
 * row here passes the tenant policies it will always pass. The slug is unique across all workspaces, which no tenant
 * may read, so a taken slug is learned from the insert itself (a `UniqueViolation`), as `Invalid { slug: "taken" }`.
 */

const COUNTER_KINDS = ["order", "ticket", "chargeback", "return", "invoice", "automation_run"] as const

// Effect classifies the driver's error: a unique violation names its constraint (`workspaces_slug_key`).
const isSlugTaken = (error: SqlError.SqlError) =>
  error.reason._tag === "UniqueViolation" && error.reason.constraint.includes("slug")

export const found = Effect.fn("Workspaces.found")(
  function*(id: WorkspaceId, workspace: ValidWorkspace, owner: UserId) {
    const sql = yield* SqlClient.SqlClient
    yield* sql`insert into workspaces (id, name, slug, country, team_size)
             values (${id}, ${workspace.name}, ${workspace.slug}, ${workspace.country}, ${workspace.teamSize})`.pipe(
      Effect.catchIf(isSlugTaken, () => Effect.fail(new Invalid({ fields: { slug: "taken" } })))
    )
    for (const role of Object.values(SYSTEM_DEFAULTS)) {
      yield* sql`insert into roles (id, workspace_id, label, kind, levels, specials, refund_limit_minor, stores)
               values (${role.id}, ${id}, ${role.label}, 'system', ${JSON.stringify(role.levels)}::jsonb,
                       ${JSON.stringify(role.specials)}::jsonb,
                       ${role.refundLimit === null ? null : Math.round(role.refundLimit * 100)},
                       ${JSON.stringify(role.stores)}::jsonb)`
    }
    yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${
      mintId("mem")
    }, ${id}, ${owner}, 'owner')`
    for (const kind of COUNTER_KINDS) {
      yield* sql`insert into workspace_counters (workspace_id, kind) values (${id}, ${kind})`
    }
  }
)
