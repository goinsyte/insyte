/*
 * The notification catalogue (M5.2), the server's half of `lib/notifications.ts`: every kind a member can hear about,
 * whether it lands in Primair, and its default channels. The console owns the words (label, detail, the sentence a row
 * shows); a test keeps the two lists the same. Free of imports, like `Permissions.ts`.
 */

export const CHANNELS = ["app", "email", "push", "slack"] as const
export type Channel = (typeof CHANNELS)[number]

export interface NotificationKind {
  readonly key: string
  /** Lands in Primair: it asks something of the member. The rest is Overig. */
  readonly primary: boolean
  readonly defaults: Readonly<Record<Channel, boolean>>
}

const ch = (app: boolean, email: boolean, push: boolean, slack: boolean) => ({ app, email, push, slack })

export const NOTIFICATION_KINDS = [
  { key: "order.late", primary: true, defaults: ch(true, true, false, false) },
  { key: "order.refund", primary: false, defaults: ch(true, false, false, false) },
  { key: "order.note", primary: false, defaults: ch(true, false, false, false) },
  { key: "return.new", primary: true, defaults: ch(true, false, false, false) },
  { key: "return.received", primary: false, defaults: ch(true, false, false, false) },
  { key: "ticket.assigned", primary: true, defaults: ch(true, true, true, false) },
  { key: "ticket.reply", primary: false, defaults: ch(true, false, false, false) },
  { key: "ticket.sla", primary: true, defaults: ch(true, false, true, false) },
  { key: "chargeback.new", primary: true, defaults: ch(true, true, false, false) },
  { key: "chargeback.deadline", primary: true, defaults: ch(true, true, true, false) },
  { key: "chargeback.result", primary: false, defaults: ch(true, true, false, false) },
  { key: "supplier.delay", primary: true, defaults: ch(true, true, false, false) },
  { key: "supplier.message", primary: false, defaults: ch(true, false, false, true) },
  { key: "supplier.stock", primary: false, defaults: ch(true, false, false, false) },
  { key: "automation.failed", primary: true, defaults: ch(true, true, false, true) },
  { key: "automation.done", primary: false, defaults: ch(true, false, false, false) },
  { key: "chat.mention", primary: true, defaults: ch(true, false, true, true) },
  { key: "team.invite", primary: false, defaults: ch(true, true, false, false) },
  { key: "team.access", primary: true, defaults: ch(true, false, false, false) },
  { key: "course.assigned", primary: true, defaults: ch(true, true, false, false) },
  { key: "course.question", primary: true, defaults: ch(true, false, false, false) },
  { key: "course.answered", primary: false, defaults: ch(true, false, false, false) },
  { key: "integration.disconnected", primary: true, defaults: ch(true, true, false, false) },
  { key: "integration.sync", primary: false, defaults: ch(true, false, false, false) },
  { key: "insyte.proposal", primary: true, defaults: ch(true, false, true, false) },
  { key: "insyte.draft", primary: false, defaults: ch(true, false, false, false) },
  { key: "insyte.report", primary: false, defaults: ch(true, true, false, false) },
  { key: "insyte.action", primary: true, defaults: ch(true, false, false, false) },
  { key: "insyte.budget", primary: true, defaults: ch(true, true, false, false) }
] as const satisfies ReadonlyArray<NotificationKind>

export type NotificationKey = (typeof NOTIFICATION_KINDS)[number]["key"]

export const NOTIFICATION_KEYS = NOTIFICATION_KINDS.map((k) => k.key) as ReadonlyArray<NotificationKey>

const BY_KEY = new Map<string, NotificationKind>(NOTIFICATION_KINDS.map((k) => [k.key, k]))
export const notificationKind = (key: string): NotificationKind | undefined => BY_KEY.get(key)
