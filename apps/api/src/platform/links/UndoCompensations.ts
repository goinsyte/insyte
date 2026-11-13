import { restoreAutonomy, restoreBudgets } from "@insyte/modules/agent/Agent"
import { restore as restoreAutomations } from "@insyte/modules/automations/use-cases/commands"
import { restore as restoreChargebacks } from "@insyte/modules/chargebacks/Chargebacks"
import { restore as restoreChats } from "@insyte/modules/chats/use-cases/commands"
import { restore as restoreCosts } from "@insyte/modules/costs/use-cases/commands"
import { restore as restoreCourses } from "@insyte/modules/courses/Courses"
import { restore as restoreCustomers } from "@insyte/modules/customers/use-cases/commands"
import { restore as restoreData } from "@insyte/modules/data/Data"
import { restore as restoreWebhooks } from "@insyte/modules/developer/use-cases/webhooks"
import { restore as restoreForwarding } from "@insyte/modules/forwarding/use-cases/commands"
import { ThreadTickets } from "@insyte/modules/inbox/domain/Ports"
import { restore as restoreInbox } from "@insyte/modules/inbox/use-cases/commands"
import { restore as restoreMarketing } from "@insyte/modules/marketing/use-cases/klaviyo"
import { AppKeys } from "@insyte/modules/marketplace/domain/Ports"
import { rescope as rescopeApp, restore as restoreApp } from "@insyte/modules/marketplace/use-cases/marketplace"
import { restore as restoreNotifications } from "@insyte/modules/notifications/use-cases/prefs"
import { restore as restoreOrders } from "@insyte/modules/orders/use-cases/commands"
import { restore as restoreProducts } from "@insyte/modules/products/use-cases/commands"
import { restore as restoreProposal } from "@insyte/modules/proposals/Proposals"
import { restore as restoreQuality } from "@insyte/modules/quality/Quality"
import { refreshIn, reopenRowIn, restore as restoreQueue } from "@insyte/modules/queue/Queue"
import { restore as restoreReturns } from "@insyte/modules/returns/use-cases/commands"
import { restoreErasing } from "@insyte/modules/settings/use-cases/retention"
import { restore as restoreSettings } from "@insyte/modules/settings/use-cases/sections"
import { restore as restoreSheets } from "@insyte/modules/sheets/use-cases/commands"
import { restore as restoreSuppliers } from "@insyte/modules/suppliers/use-cases/commands"
import { restore as restoreTickets } from "@insyte/modules/tickets/use-cases/commands"
import { type Compensation, UndoCompensations } from "@insyte/modules/undo/domain/Ports"
import { Effect, Layer } from "effect"
import { undoKeys } from "./AppKeys.ts"
import { threadTickets } from "./ThreadTickets.ts"

/**
 * Undo → each reversible command's compensation, by the name its token carries (ADR-0023); a filed plate's undo runs
 * its command's own compensation through the same table.
 */
export const compensations: Record<string, Compensation> = {
  "orders.restore": restoreOrders,
  "products.restore": restoreProducts,
  "customers.restore": restoreCustomers,
  "marketing.restore": restoreMarketing,
  "suppliers.restore": restoreSuppliers,
  "forwarding.restore": restoreForwarding,
  "returns.restore": restoreReturns,
  "tickets.restore": restoreTickets,
  "automations.restore": restoreAutomations,
  "chargebacks.restore": restoreChargebacks,
  "inbox.restore": (sql, compensation) =>
    restoreInbox(sql, compensation).pipe(Effect.provideService(ThreadTickets, threadTickets)),
  "quality.restore": restoreQuality,
  "queue.restore": restoreQueue,
  "notifications.restore": restoreNotifications,
  "costs.restore": restoreCosts,
  "settings.restore": restoreSettings,
  "retention.restore": restoreErasing,
  "webhooks.restore": restoreWebhooks,
  "sheets.restore": restoreSheets,
  "data.restore": restoreData,
  "courses.restore": restoreCourses,
  "marketplace.restore": (sql, compensation) =>
    restoreApp(sql, compensation).pipe(Effect.provideService(AppKeys, undoKeys)),
  "marketplace.rescope": (sql, compensation) =>
    rescopeApp(sql, compensation).pipe(Effect.provideService(AppKeys, undoKeys)),
  // A filed plate's Undo spends the command's own token and runs that command's compensation from this same table.
  "proposals.restore": (sql, compensation) =>
    restoreProposal(sql, compensation, {
      runInner: (command, inner) => {
        const run = compensations[command]
        return run === undefined ? Effect.die(new Error(`no compensation for ${command}`)) : run(sql, inner)
      },
      refreshQueue: refreshIn,
      reopenRow: reopenRowIn
    }),
  // A chat command's undo spends the command's own token (by its hash) and runs that command's compensation.
  "autonomy.restore": restoreAutonomy,
  "ai_budgets.restore": restoreBudgets,
  "chats.restore": (sql, compensation) =>
    restoreChats(sql, compensation, {
      runInner: (command, inner) => {
        const run = compensations[command]
        return run === undefined ? Effect.die(new Error(`no compensation for ${command}`)) : run(sql, inner)
      }
    })
}

export const UndoCompensationsLive = Layer.succeed(UndoCompensations, compensations)
