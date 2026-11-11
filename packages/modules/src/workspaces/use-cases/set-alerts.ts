import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { checkAlerts, type SetAlerts } from "../domain/Settings.ts"
import { load } from "./account.ts"

/*
 * The Meldingen card's thresholds (M3.1; widgets/05 §2.1): when an unshipped order counts as late, and from which
 * amount a chargeback is a large one. Read by the delay detector and the dispute notification. Instellingen · Bewerken.
 */

export const setAlerts = Effect.fn("Workspaces.setAlerts")(function*(input: SetAlerts) {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const checked = checkAlerts(input)
  if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
  const next = checked.ok
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* load(sql, principal.workspaceId)
      if (
        before.alerts.delayHours === next.delayHours && before.alerts.disputeAmountMinor === next.disputeAmountMinor
      ) return before
      yield* sql`update workspaces
                 set alerts = ${
        JSON.stringify({ delay_hours: next.delayHours, dispute_amount_minor: next.disputeAmountMinor })
      }::jsonb
                 where id = ${principal.workspaceId}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.alerts_updated",
        subjectType: "workspace",
        subjectId: principal.workspaceId,
        section: "alerts",
        diff: { from: before.alerts, to: next }
      })
      return yield* load(sql, principal.workspaceId)
    })
  )
})
