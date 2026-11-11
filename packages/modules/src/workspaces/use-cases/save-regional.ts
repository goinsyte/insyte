import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { checkRegional, type SaveRegional } from "../domain/Settings.ts"
import { loadRegional } from "./regional.ts"

/*
 * "Wijzigingen opslaan" on Taal en notatie (M3.1; widgets/05 §2.2): the notation into `workspaces.regional`, the zone
 * into `workspaces.timezone`, on one transaction, audited with what changed. A new zone re-buckets the days counted
 * from now on; the facts already made keep theirs. Instellingen · Bewerken.
 */

const FIELDS = ["language", "currencyDisplay", "dateFormat", "timeFormat", "weekStart", "timezone"] as const

export const saveRegional = Effect.fn("Workspaces.saveRegional")(function*(input: SaveRegional) {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const checked = checkRegional(input)
  if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
  const next = checked.ok
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* loadRegional(sql, principal.workspaceId)
      const changed = FIELDS.filter((f) => before[f] !== next[f])
      if (changed.length === 0) return before
      const regional = {
        language: next.language,
        currency_display: next.currencyDisplay,
        date_format: next.dateFormat,
        time_format: next.timeFormat,
        week_start: next.weekStart
      }
      yield* sql`update workspaces set regional = ${JSON.stringify(regional)}::jsonb, timezone = ${next.timezone}
                 where id = ${principal.workspaceId}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.regional_updated",
        subjectType: "workspace",
        subjectId: principal.workspaceId,
        section: "regional",
        diff: Object.fromEntries(changed.map((f) => [f, { from: before[f], to: next[f] }]))
      })
      return yield* loadRegional(sql, principal.workspaceId)
    })
  )
})
