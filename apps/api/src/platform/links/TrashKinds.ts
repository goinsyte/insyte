import { NotFound } from "@insyte/domain/Errors"
import {
  purgeIn as purgeAutomations,
  restoreRemoved as restoreAutomation
} from "@insyte/modules/automations/use-cases/commands"
import { purgeIn as purgeCostLines, putBack as putBackCostLines } from "@insyte/modules/costs/use-cases/commands"
import { purgeIn as purgeCourses, restore as restoreCourses } from "@insyte/modules/courses/use-cases/commands"
import { purgeIn as purgeWebhooks, putBack as putBackWebhooks } from "@insyte/modules/developer/use-cases/webhooks"
import { purgeIn as purgeSheets, restoreSheets } from "@insyte/modules/sheets/use-cases/commands"
import { purgeIn as purgeSuppliers, putBack as putBackSuppliers } from "@insyte/modules/suppliers/use-cases/commands"
import { purgeIn as purgeTickets, putBack as putBackTickets } from "@insyte/modules/tickets/use-cases/commands"
import { TrashKinds } from "@insyte/modules/trash/TrashKinds"
import { Effect, Layer } from "effect"

/*
 * The Prullenbak → each kind's own put-back and purge (M17 step 20.1a; W11.4). A kind's put-back answers the undo
 * tokens it issued, which the page's Ongedaan maken spends to put the items in the trash again.
 */

/** A put-back's one undo, or none where nothing changed. */
const tokens = <A extends { readonly undo: unknown }>(change: A) =>
  change.undo === null ? [] : [change.undo as NonNullable<A["undo"]>]

/** The Prullenbak's kinds, also for the daily sweep (`TrashSweep.ts`). */
export const TrashKindsLive = Layer.succeed(TrashKinds, {
  ticket: {
    restore: (ids) => Effect.map(putBackTickets({ ids }), tokens),
    purge: purgeTickets
  },
  automation: {
    // One flow at a time, each with its own undo, as the automations page puts one back.
    restore: (ids) =>
      Effect.forEach(ids, (id) => Effect.map(restoreAutomation(id), tokens)).pipe(Effect.map((t) => t.flat())),
    purge: purgeAutomations
  },
  sheet: {
    // The trash lists a sheet to its owner only, so another's (or one gone meanwhile) is simply not there.
    restore: (ids) =>
      restoreSheets({ ids }).pipe(
        Effect.map(tokens),
        Effect.catchTags({
          SheetNotFound: (e) => Effect.fail(new NotFound({ entity: "trash_item", id: e.id })),
          NotSheetOwner: (e) => Effect.fail(new NotFound({ entity: "trash_item", id: e.id }))
        })
      ),
    purge: purgeSheets
  },
  course: {
    restore: (ids) => Effect.map(restoreCourses({ ids }), tokens),
    purge: purgeCourses
  },
  webhook: {
    restore: (ids) => putBackWebhooks({ ids }),
    purge: purgeWebhooks
  },
  cost_line: {
    restore: (ids) => putBackCostLines({ ids }),
    purge: purgeCostLines
  },
  supplier: {
    restore: (ids) => putBackSuppliers({ ids }),
    purge: purgeSuppliers
  }
})
