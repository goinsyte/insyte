import { fill as fillRates } from "@insyte/modules/fx/Fx"
import { Effect } from "effect"
import { adSpendSweep } from "../../platform/AdSpend.ts"
import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import { deadlineSweep } from "../../platform/Deadlines.ts"
import type { Env } from "../../platform/Env.ts"
import { reconcile, syncRuntime, trackingSweep } from "../../platform/Ingest.ts"
import { Telemetry } from "../../platform/Observability.ts"
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
 * Prullenbak's sweep (M17) and, on the 1st, the supplier statements' monthly close (M13 step 6); at 04:00 UTC the
 * day's ad spend from every connected ad account (M13 step 5) and the sending domains' re-check (20.1c); at 02:00 UTC the ECB's reference rates into
 * `fx_rates` (§0.4). */
export const scheduled: ExportedHandlerScheduledHandler<Env> = (controller, _env, ctx) => {
  ctx.waitUntil(background.runPromise(withRequestDb(sweep())).finally(() => Telemetry.flush()))
  ctx.waitUntil(background.runPromise(withRequestDb(notifySweep())).finally(() => Telemetry.flush()))
  const at = new Date(controller.scheduledTime)
  ctx.waitUntil(background.runPromise(withRequestDb(webhooksRearm(at))).finally(() => Telemetry.flush()))
  if (at.getUTCMinutes() % 15 === 0) {
    const nightly = at.getUTCHours() === 2 && at.getUTCMinutes() === 0
    ctx.waitUntil(background.runPromise(withRequestDb(factsSweep(nightly))).finally(() => Telemetry.flush()))
    // The rates the conversions read (§0.4): the ECB's last 90 days, so a night it missed fills in on the next.
    if (nightly) ctx.waitUntil(background.runPromise(withRequestDb(ratesFill)).finally(() => Telemetry.flush()))
    ctx.waitUntil(syncRuntime.runPromise(reconcile).finally(() => Telemetry.flush()))
    ctx.waitUntil(syncRuntime.runPromise(trackingSweep).finally(() => Telemetry.flush()))
    // Start's queue (M10.1): what no event says, a stock-out or a review coming due.
    ctx.waitUntil(background.runPromise(withRequestDb(queueSweep())).finally(() => Telemetry.flush()))
    ctx.waitUntil(background.runPromise(withRequestDb(digestSweep(at))).finally(() => Telemetry.flush()))
    // On the hour: the chargeback deadline reminders that have come (M13 step 3).
    if (at.getUTCMinutes() === 0) {
      ctx.waitUntil(background.runPromise(withRequestDb(deadlineSweep(at))).finally(() => Telemetry.flush()))
    }
    // The Prullenbak's items past their 30 days, once a day at 03:00 UTC (M17 step 20.1a).
    if (at.getUTCHours() === 3 && at.getUTCMinutes() === 0) {
      ctx.waitUntil(background.runPromise(withRequestDb(trashSweep())).finally(() => Telemetry.flush()))
    }
    if (at.getUTCHours() === 4 && at.getUTCMinutes() === 0) {
      ctx.waitUntil(background.runPromise(withRequestDb(adSpendSweep())).finally(() => Telemetry.flush()))
    }
    // The nightly erase of what is past its retention, at 03:00 in each workspace's timezone (M17 step 20.1b).
    ctx.waitUntil(background.runPromise(withRequestDb(retentionSweep(at))).finally(() => Telemetry.flush()))
    // Webhook deliveries older than 30 days (M19.4).
    ctx.waitUntil(background.runPromise(withRequestDb(webhooksSweep())).finally(() => Telemetry.flush()))
    // The supplier statements' monthly close (M13 step 6), `0 3 1 * *`: inside this cron, as an account has few.
    if (at.getUTCDate() === 1 && at.getUTCHours() === 3 && at.getUTCMinutes() === 0) {
      ctx.waitUntil(startMonthlyClose(at))
    }
    // The sending domains' daily re-check, at 04:00 UTC (M17 step 20.1c).
    if (at.getUTCHours() === 4 && at.getUTCMinutes() === 0) {
      ctx.waitUntil(background.runPromise(withRequestDb(sendingDomainSweep())).finally(() => Telemetry.flush()))
    }
  }
}

/** The nightly rates fill; the ECB unreachable is logged, and tomorrow's turn writes the days again. */
const ratesFill = fillRates.pipe(
  Effect.catchTag("RatesError", (e) => Effect.logWarning("fx: the ECB's rates were not read", e.reason)),
  Effect.orDie
)
