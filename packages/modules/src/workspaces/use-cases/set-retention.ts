import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { RETENTION_DAYS, type RetentionDays, type SetRetention } from "../domain/Settings.ts"
import { load } from "./account.ts"

/*
 * "Als een winkel sluit" (M3.1; widgets/05 §2.1): how many days a closed or disconnected store's records stay readable
 * before the archive takes them (the sweep is M17's). It decides what a late chargeback can still be answered with, so
 * it takes Instellingen · Beheren (`settings≥3`), not Bewerken.
 */

export const setRetention = Effect.fn("Workspaces.setRetention")(function*(input: SetRetention) {
  yield* Policy.require("settings", 3)
  const principal = yield* CurrentPrincipal
  if (!(RETENTION_DAYS as ReadonlyArray<number>).includes(input.days)) {
    return yield* new Invalid({ fields: { days: "invalid" } })
  }
  const days = input.days as RetentionDays
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* load(sql, principal.workspaceId)
      if (before.retentionDays === days) return before
      yield* sql`update workspaces set retention_days = ${days} where id = ${principal.workspaceId}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.retention_updated",
        subjectType: "workspace",
        subjectId: principal.workspaceId,
        section: "retention",
        diff: { from: before.retentionDays, to: days }
      })
      return yield* load(sql, principal.workspaceId)
    })
  )
})
