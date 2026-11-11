import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { checkAccount, type SaveAccount } from "../domain/Settings.ts"
import { load } from "./account.ts"

/*
 * "Wijzigingen opslaan" on the Werkruimte card (M3.1; widgets/05 §2.1): the name, the legal entity, the VAT number, the
 * invoice address and the country, written over the row on one transaction and audited with what changed. Instellingen
 * · Bewerken (`settings≥2`). The design keeps no Undo here: the unsaved bar's "Negeren" is the way back before saving.
 * The Stripe customer follows with billing (M13).
 */

const FIELDS = ["name", "legalEntity", "vatNumber", "billingEmail", "country"] as const

export const saveAccount = Effect.fn("Workspaces.saveAccount")(function*(input: SaveAccount) {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const checked = checkAccount(input)
  if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
  const next = checked.ok
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* load(sql, principal.workspaceId)
      const changed = FIELDS.filter((f) => before[f] !== next[f])
      if (changed.length === 0) return before
      yield* sql`update workspaces set name = ${next.name}, legal_entity = ${next.legalEntity || null},
                   vat_number = ${next.vatNumber || null}, billing_email = ${next.billingEmail || null},
                   country = ${next.country}
                 where id = ${principal.workspaceId}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.account_updated",
        subjectType: "workspace",
        subjectId: principal.workspaceId,
        section: "account",
        diff: Object.fromEntries(changed.map((f) => [f, { from: before[f], to: next[f] }]))
      })
      return yield* load(sql, principal.workspaceId)
    })
  )
})
