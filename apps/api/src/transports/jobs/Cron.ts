import { fill as fillRates } from "@insyte/modules/fx/Fx"
import { Effect, type ManagedRuntime } from "effect"
import { adSpendSweep } from "../../platform/AdSpend.ts"
import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import { deadlineSweep } from "../../platform/Deadlines.ts"
import type { Env } from "../../platform/Env.ts"
import { exportSweep } from "../../platform/Exports.ts"
import { reconcile, syncRuntime, trackingSweep } from "../../platform/Ingest.ts"
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

/** Every minute (on staging every fifteenth, `infra/app.ts`): the relay's sweep for events a kick missed, the
 * notes quiet hours or a failed try held back (M11.5) and the webhook deliveries whose run never started or died
 * (M19.4); every fifteenth, the stores' reconcile (M6.3), the tracking sweep (M8.4), Start's queue (M10.1), the
 * daily facts (M10.4, at 02:00 UTC their nightly pass), the members' daily digests (M11.5) and the webhook
 * deliveries past 30 days (M19.4); on the hour, the chargeback deadline reminders (M13 step 3); at 03:00 UTC the
 * Prullenbak's sweep (M17), the lapsed exports (M14 step 5) and, on the 1st, the supplier statements' monthly close (M13 step 6); at 04:00 UTC the
 * day's ad spend from every connected ad account (M13 step 5) and the sending domains' re-check (20.1c); at 02:00 UTC the ECB's reference rates into
 * `fx_rates` (§0.4). */
export const scheduled: ExportedHandlerScheduledHandler<Env> = (controller, _env, ctx) => {
  // Each job its own exporter (`Observability.ts`), flushed when it settles: a job that runs into the cron's time
  // limit loses its own spans, not the turn's.
  const turn = <A, E, R, ER>(runtime: ManagedRuntime.ManagedRuntime<R, ER>, effect: Effect.Effect<A, E, R>) =>
    ctx.waitUntil(Telemetry.run(runtime, effect))
  turn(background, withRequestDb(sweep()))
  turn(background, withRequestDb(notifySweep()))
  const at = new Date(controller.scheduledTime)
  turn(background, withRequestDb(webhooksRearm(at)))
  if (at.getUTCMinutes() % 15 === 0) {
    const nightly = at.getUTCHours() === 2 && at.getUTCMinutes() === 0
    turn(background, withRequestDb(factsSweep(nightly)))
    // The rates the conversions read (§0.4): the ECB's last 90 days, so a night it missed fills in on the next.
    if (nightly) turn(background, withRequestDb(ratesFill))
    turn(syncRuntime, reconcile)
    turn(syncRuntime, trackingSweep)
    // Start's queue (M10.1): what no event says, a stock-out or a review coming due.
    turn(background, withRequestDb(queueSweep()))
    turn(background, withRequestDb(digestSweep(at)))
    // On the hour: the chargeback deadline reminders that have come (M13 step 3).
    if (at.getUTCMinutes() === 0) {
      turn(background, withRequestDb(deadlineSweep(at)))
    }
    // The Prullenbak's items past their 30 days, once a day at 03:00 UTC (M17 step 20.1a).
    if (at.getUTCHours() === 3 && at.getUTCMinutes() === 0) {
      turn(background, withRequestDb(trashSweep()))
      // The Data hub's exports past their seven days (M14 step 5).
      turn(background, withRequestDb(exportSweep()))
    }
    if (at.getUTCHours() === 4 && at.getUTCMinutes() === 0) {
      turn(background, withRequestDb(adSpendSweep()))
    }
    // The scheduled workspace exports that are due, once a day at 05:00 UTC (M17 step 5).
    if (at.getUTCHours() === 5 && at.getUTCMinutes() === 0) {
      turn(background, withRequestDb(privacyExportSweep()))
    }
    // The nightly erase of what is past its retention, at 03:00 in each workspace's timezone (M17 step 20.1b).
    turn(background, withRequestDb(retentionSweep(at)))
    // Webhook deliveries older than 30 days (M19.4).
    turn(background, withRequestDb(webhooksSweep()))
    // The supplier statements' monthly close (M13 step 6), `0 3 1 * *`: inside this cron, as an account has few.
    if (at.getUTCDate() === 1 && at.getUTCHours() === 3 && at.getUTCMinutes() === 0) {
      ctx.waitUntil(startMonthlyClose(at))
    }
    // The sending domains' daily re-check, at 04:00 UTC (M17 step 20.1c).
    if (at.getUTCHours() === 4 && at.getUTCMinutes() === 0) {
      turn(background, withRequestDb(sendingDomainSweep()))
    }
  }
}

/** The nightly rates fill; the ECB unreachable is logged, and tomorrow's turn writes the days again. */
const ratesFill = fillRates.pipe(
  Effect.catchTag("RatesError", (e) => Effect.logWarning("fx: the ECB's rates were not read", e.reason)),
  Effect.orDie
)
