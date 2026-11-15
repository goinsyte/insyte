import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { WorkspaceSummary } from "../domain/Choice.ts"
import { memberships } from "./memberships.ts"

/*
 * `Workspaces.list` (M3.1): every workspace the person is in, the active one first, as the switcher shows them. The
 * memberships are read as the person; each workspace's own figures (its people, its plan, whether a subscription pays
 * for it) inside that workspace, as the person (`asUserIn`), since they are a member of each. A person is in a handful,
 * so one short read each.
 */

interface Figures {
  readonly plan: string
  readonly members: string | number
  readonly paid: boolean
}

export const list = Effect.fn("Workspaces.list")(function*() {
  const db = yield* Db
  const mine = yield* memberships()
  const active = mine[0]?.workspaceId
  return yield* Effect.forEach(mine, (m) =>
    Effect.map(
      db.asUserIn(m.workspaceId)((sql) =>
        sql<Figures>`
          select w.plan,
                 (select count(*) from members x where x.workspace_id = w.id and x.deactivated_at is null and x.removed_at is null)
                 as members,
                 exists (select 1 from subscriptions s where s.workspace_id = w.id and s.status in ('active', 'trialing', 'past_due'))
                 as paid
          from workspaces w where w.id = ${m.workspaceId}`
      ).pipe(
        // Left or removed between the two reads: shown with the defaults; the next list leaves it out.
        Effect.catchTag("NotFound", () => Effect.succeed([] as Array<Figures>))
      ),
      ([row]) =>
        new WorkspaceSummary({
          id: m.workspaceId,
          name: m.workspaceName,
          memberId: m.memberId,
          role: m.principal.role.label,
          own: m.principal.role.id === "owner",
          members: Number(row?.members ?? 1),
          plan: row?.plan ?? "trial",
          paid: row?.paid ?? false,
          onboarded: m.onboarded,
          active: m.workspaceId === active
        })
    ), { concurrency: 1 })
})
