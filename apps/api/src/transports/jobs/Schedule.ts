/** A job the cron (`Cron.ts`) starts; which are due at a turn is `jobsAt`'s. */
export type Job =
  | "relay"
  | "notify"
  | "webhooksRearm"
  | "pendingTasks"
  | "facts"
  | "rates"
  | "reconcile"
  | "syncHealth"
  | "tracking"
  | "queue"
  | "digest"
  | "deadlines"
  | "supplierLate"
  | "schedules"
  | "redact"
  | "trash"
  | "affiliates"
  | "exports"
  | "adSpend"
  | "privacyExports"
  | "retention"
  | "webhooksSweep"
  | "monthlyClose"
  | "sendingDomains"

/** Every turn's, whatever the minute. */
const EVERY_MINUTE: ReadonlyArray<Job> = ["relay", "notify", "webhooksRearm", "pendingTasks"]

/** 02:00 UTC: the daily facts' nightly pass, and the ECB's rates. */
export const nightly = (at: Date) => at.getUTCHours() === 2 && at.getUTCMinutes() === 0

/** A daily job's UTC hour, on the hour. */
const daily = (at: Date, hour: number) => at.getUTCHours() === hour && at.getUTCMinutes() === 0

/**
 * The jobs due at a cron turn, in the order they start, from the turn's scheduled time alone (UTC). Every minute (on
 * staging every fifteenth, `infra/app.ts`): the relay's sweep for events a kick missed, the notes quiet hours or a
 * failed try held back (M11.5), the webhook deliveries whose run never started or died (M19.4) and the agent's lost
 * tasks (W13.6). Every fifteenth (:00, :15, :30, :45): the stores' reconcile (M6.3) and their sync health (M17 step
 * 6), the tracking sweep (M8.4), Start's queue (M10.1), the daily facts (M10.4), the members' daily digests (M11.5),
 * the nightly retention erase (M17 step 20.1b) and the webhook deliveries past 30 days (M19.4). On the hour: the
 * chargeback deadline reminders (M13 step 3), the supplier late check (M8.3), the scheduled automations (M12 step 3)
 * and Shopify's unfinished erasures. At 02:00 the ECB's reference rates (§0.4); at 03:00 the Prullenbak's sweep (M17),
 * the affiliates' approvals (M16 step 4), the lapsed exports (M14 step 5) and, on the 1st, the supplier statements'
 * monthly close (M13 step 6); at 04:00 the day's ad spend (M13 step 5) and the sending domains' re-check (20.1c); at
 * 05:00 the scheduled workspace exports (M17 step 5).
 */
export const jobsAt = (at: Date): ReadonlyArray<Job> => {
  if (at.getUTCMinutes() % 15 !== 0) return EVERY_MINUTE
  return [
    ...EVERY_MINUTE,
    "facts",
    ...(nightly(at) ? ["rates" as const] : []),
    "reconcile",
    "syncHealth",
    "tracking",
    "queue",
    "digest",
    ...(at.getUTCMinutes() === 0 ? ["deadlines", "supplierLate", "schedules", "redact"] as const : []),
    ...(daily(at, 3) ? ["trash", "affiliates", "exports"] as const : []),
    ...(daily(at, 4) ? ["adSpend"] as const : []),
    ...(daily(at, 5) ? ["privacyExports"] as const : []),
    "retention",
    "webhooksSweep",
    ...(at.getUTCDate() === 1 && daily(at, 3) ? ["monthlyClose" as const] : []),
    ...(daily(at, 4) ? ["sendingDomains" as const] : [])
  ]
}
