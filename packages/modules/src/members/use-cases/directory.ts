import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { Teammate } from "../domain/Team.ts"

/*
 * The workspace's people as every member sees them (M5): names, faces and roles, for the top bar, presence and
 * mentions. No permission beyond being a member: Team's details (addresses, invitations, seats) stay behind `team`.
 */
export const directory = Effect.fn("Members.directory")(function*() {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.map(
      sql<{ id: string; name: string; image: string | null; roleLabel: string }>`
        select m.id, u.name, u.image, r.label as role_label
        from members m
        join auth."user" u on u.id = m.user_id
        join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
        where m.deactivated_at is null and m.removed_at is null
        order by u.name`,
      (rows) => rows.map((r) => new Teammate(r))
    )
  )
})
