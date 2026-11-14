/*
 * The outbound webhooks' public catalogue (M19.4, api.md §7), the server's half of the design's `EVENT_GROUPS`
 * (`lib/webhooks-core.ts`, which owns the Dutch words): every event an endpoint may subscribe to, by group, and the
 * delivery rules the console and the sender share. A test keeps the two lists the same. Free of imports, like
 * `Permissions.ts`.
 *
 * `live` marks the events Insyte sends today, each from an outbox event of its own slice; the rest are listed (the
 * design offers them) and start sending when their slice writes the fact they name, without a new API version.
 */

export interface WebhookEventDef {
  readonly id: string
  /** Sent today: a slice writes the fact. */
  readonly live: boolean
}

export interface WebhookEventGroup {
  readonly group: string
  readonly events: ReadonlyArray<WebhookEventDef>
}

const e = (id: string, live = false): WebhookEventDef => ({ id, live })

export const WEBHOOK_EVENT_GROUPS: ReadonlyArray<WebhookEventGroup> = [
  {
    group: "orders",
    events: [
      e("order.created", true),
      e("order.paid"),
      e("order.fulfilled", true),
      e("order.delivered"),
      e("order.refunded"),
      e("order.cancelled", true),
      e("order.delayed", true)
    ]
  },
  { group: "refunds", events: [e("refund.created"), e("refund.failed")] },
  {
    group: "customers",
    events: [e("customer.created", true), e("customer.updated", true), e("customer.merged"), e("customer.blocked")]
  },
  { group: "products", events: [e("product.created"), e("product.updated", true), e("product.archived", true)] },
  { group: "inventory", events: [e("inventory.low"), e("inventory.out")] },
  {
    group: "support",
    events: [e("ticket.created"), e("ticket.replied"), e("ticket.assigned", true), e("ticket.closed")]
  },
  {
    group: "chargebacks",
    events: [e("chargeback.opened"), e("chargeback.evidence_due"), e("chargeback.won"), e("chargeback.lost")]
  },
  {
    group: "suppliers",
    events: [e("supplier.delay_reported"), e("supplier.message"), e("supplier.order_accepted")]
  },
  {
    group: "automations",
    events: [e("automation.run.completed"), e("automation.run.failed"), e("automation.published")]
  },
  { group: "affiliates", events: [e("affiliate.applied"), e("affiliate.approved"), e("affiliate.payout.approved")] }
]

export const WEBHOOK_EVENTS: ReadonlyArray<string> = WEBHOOK_EVENT_GROUPS.flatMap((g) => g.events.map((x) => x.id))

export const LIVE_WEBHOOK_EVENTS: ReadonlyArray<string> = WEBHOOK_EVENT_GROUPS.flatMap((g) =>
  g.events.filter((x) => x.live).map((x) => x.id)
)

const KNOWN = new Set(WEBHOOK_EVENTS)
export const isWebhookEvent = (id: string): boolean => KNOWN.has(id)

/** The payload versions an endpoint may pick; the newest first. The same set `Insyte-Version` takes (api.md §6). */
export const WEBHOOK_API_VERSIONS = ["2026-10-01", "2026-07-01", "2026-04-01"] as const
export type WebhookApiVersion = (typeof WEBHOOK_API_VERSIONS)[number]

/** How many attempts a delivery gets in all: `0` is one attempt and no retry. */
export const WEBHOOK_RETRIES = [0, 3, 5, 8] as const
export type WebhookRetry = (typeof WEBHOOK_RETRIES)[number]

/** Minutes to wait after the n-th failed attempt before the next (api.md §7): 1 m, 10 m, 1 h, 3 h, 6 h, 12 h, 24 h, 72 h. */
export const WEBHOOK_BACKOFF_MINUTES = [1, 10, 60, 180, 360, 720, 1440, 4320] as const

/** Failed attempts in a row after which Insyte stops sending to an endpoint (domain.md §12.11). */
export const WEBHOOK_AUTO_DISABLE_AFTER = 5

/** How long an endpoint waits for an answer before the attempt counts as a time-out. */
export const WEBHOOK_TIMEOUT_MS = 10_000

/** How long the previous secret still signs after a rotation, beside the new one (api.md §7). */
export const WEBHOOK_SECRET_OVERLAP_MS = 24 * 3_600_000

/** How old a signature may be before a receiver should refuse it, the replay window the docs advise. */
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300

/** How long a delivery, its body and the endpoint's answer are kept (domain.md §16). */
export const WEBHOOK_RETENTION_DAYS = 30

/** The attempts a delivery gets in all, for the endpoint's policy. */
export const attemptsFor = (retry: number): number => Math.max(1, retry)
