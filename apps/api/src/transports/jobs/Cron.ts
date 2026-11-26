import { fill as fillRates } from "@insyte/modules/fx/Fx"
import { supplierLateSweep } from "@insyte/modules/orders/Orders"
import { Effect, type ManagedRuntime } from "effect"
import { adSpendSweep } from "../../platform/AdSpend.ts"
import { scheduleSweep } from "../../platform/AutomationSchedule.ts"
import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import { deadlineSweep } from "../../platform/Deadlines.ts"
import type { Env } from "../../platform/Env.ts"
import { exportSweep } from "../../platform/Exports.ts"
import { healthCheck, reconcile, syncRuntime, trackingSweep } from "../../platform/Ingest.ts"
import { Telemetry } from "../../platform/Observability.ts"
import { privacyExportSweep } from "../../platform/PrivacySweep.ts"
import { sweep } from "../../platform/Relay.ts"
import { factsSweep } from "../../platform/relay/subscribers/facts.ts"
import { digestSweep, notifySweep } from "../../platform/relay/subscribers/notifications.ts"
import { queueSweep } from "../../platform/relay/subscribers/queue.ts"
import { webhooksRearm, webhooksSweep } from "../../platform/relay/subscribers/webhooks.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { retentionSweep } from "../../platform/Retention.ts"
import { sendingDomainSweep } from "../../platform/SendingDomains.ts"
import { trashSweep } from "../../platform/TrashSweep.ts"
import { startMonthlyClose } from "../../workflows/MonthlyClose.ts"
import { type Job, jobsAt, nightly } from "./Schedule.ts"

/** The cron's turn: the jobs due at its scheduled time (`jobsAt` in `Schedule.ts`, which says when each runs). */
export const scheduled: ExportedHandlerScheduledHandler<Env> = (controller, _env, ctx) => {
  // Each job its own exporter (`Observability.ts`), flushed when it settles: a job that runs into the cron's time
  // limit loses its own spans, not the turn's.
  const turn = <A, E, R, ER>(runtime: ManagedRuntime.ManagedRuntime<R, ER>, effect: Effect.Effect<A, E, R>) =>
    ctx.waitUntil(Telemetry.run(runtime, effect))
  const at = new Date(controller.scheduledTime)
  const start: Record<Job, () => void> = {
    relay: () => turn(background, withRequestDb(sweep())),
    notify: () => turn(background, withRequestDb(notifySweep())),
    webhooksRearm: () => turn(background, withRequestDb(webhooksRearm(at))),
    // The agent's, the topics' and the chapters' tasks whose message was lost (W13.6), sent again; one query when none
    // is due. Loaded here, not when the Worker starts.
    pendingTasks: () =>
      turn(background, withRequestDb(Effect.flatMap(Effect.promise(loadPendingTasks), (m) => m.pendingSweep()))),
    facts: () => turn(background, withRequestDb(factsSweep(nightly(at)))),
    // The rates the conversions read (§0.4): the ECB's last 90 days, so a night it missed fills in on the next.
    rates: () => turn(background, withRequestDb(ratesFill)),
    reconcile: () => turn(syncRuntime, reconcile),
    // Sync health (M17 step 6), beside the sweep: it reads what earlier sweeps wrote, so a long one cannot hold it up.
    syncHealth: () => turn(syncRuntime, healthCheck),
    tracking: () => turn(syncRuntime, trackingSweep),
    // Start's queue (M10.1): what no event says, a stock-out or a review coming due.
    queue: () => turn(background, withRequestDb(queueSweep())),
    digest: () => turn(background, withRequestDb(digestSweep(at))),
    deadlines: () => turn(background, withRequestDb(deadlineSweep(at))),
    // The suppliers past the hand-off they promised: their orders delayed, the team told (M8.3).
    supplierLate: () => turn(background, withRequestDb(supplierLateSweep)),
    // The flows "Op een vast moment" due at this hour in their workspace's timezone (M12 step 3).
    schedules: () => turn(background, withRequestDb(scheduleSweep(at))),
    // Shopify's erasures that did not finish, tried again until done or past their 30 days (0106). Loaded here, not
    // when the Worker starts.
    redact: () =>
      turn(background, withRequestDb(Effect.flatMap(Effect.promise(loadRedactSweep), (m) => m.redactSweep()))),
    // The Prullenbak's items past their 30 days (M17 step 20.1a).
    trash: () => turn(background, withRequestDb(trashSweep())),
    // The affiliates' conversions past their return window approved, and the rest followed (M16 step 4).
    affiliates: () => turn(background, withRequestDb(affiliateSweep(at))),
    // The Data hub's exports past their seven days (M14 step 5).
    exports: () => turn(background, withRequestDb(exportSweep())),
    adSpend: () => turn(background, withRequestDb(adSpendSweep())),
    privacyExports: () => turn(background, withRequestDb(privacyExportSweep())),
    // The nightly erase of what is past its retention, at 03:00 in each workspace's timezone (M17 step 20.1b).
    retention: () => turn(background, withRequestDb(retentionSweep(at))),
    webhooksSweep: () => turn(background, withRequestDb(webhooksSweep())),
    // `0 3 1 * *`, inside this cron: an account has few statements.
    monthlyClose: () => ctx.waitUntil(startMonthlyClose(at)),
    sendingDomains: () => turn(background, withRequestDb(sendingDomainSweep()))
  }
  for (const job of jobsAt(at)) start[job]()
}

const loadRedactSweep = () => import("../../platform/RedactSweep.ts")

const loadPendingTasks = () => import("../../platform/PendingTasks.ts")

/** The affiliates' daily approval; the slice loads with it, not with the Worker (ADR-0041 §3). */
const affiliateSweep = (at: Date) =>
  Effect.flatMap(Effect.promise(() => import("@insyte/modules/affiliates/use-cases/close")), (m) => m.settleSweep(at))
    .pipe(Effect.orDie)

/** The nightly rates fill; the ECB unreachable is logged, and tomorrow's turn writes the days again. */
const ratesFill = fillRates.pipe(
  Effect.catchTag("RatesError", (e) => Effect.logWarning("fx: the ECB's rates were not read", e.reason)),
  Effect.orDie
)
