import type { MailboxView, MessageView, ThreadRow } from "@insyte/modules/inbox/domain/Inbox"
import type { InboxMailbox, InboxThread, LetterEntry, Place } from "@insyte/ui/app/inbox/source"

/*
 * The inbox's rows as the design's screen reads them (M11 step 2): epoch milliseconds as ISO strings, the server's
 * set-aside stamps as the folder a thread is in, the customer's side of the participants, and the times in Insyte's
 * zone, so the server's render and the browser's agree.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const CLOCK = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

/** A time of day, as the list and the letter print it. */
export const timeOf = (at: string) => CLOCK.format(new Date(at))

/** Where the thread is, as `Threads.list`'s folders put it: the Prullenbak first, then spam, the archive, a snooze. */
const placeOf = (r: ThreadRow, now: number): Place =>
  r.deletedAt !== null
    ? "trash"
    : r.spamAt !== null
    ? "spam"
    : r.archivedAt !== null
    ? "archive"
    : r.snoozedUntil !== null && r.snoozedUntil > now
    ? "snoozed"
    : "inbox"

/** A name to show: the one the mail carried, or the address. */
const named = (a: { name: string; email: string }) =>
  a.name.trim() === "" ? { name: a.email, email: "" } : { name: a.name, email: a.email }

export const threadOf = (r: ThreadRow, now: number): InboxThread => {
  const other = r.participants.find((p) => !p.team) ?? r.participants[0] ?? { name: "", email: "" }
  return {
    id: r.id,
    subject: r.subject.trim() === "" ? "(geen onderwerp)" : r.subject,
    mailbox: r.mailboxId,
    other: named(other),
    last_message_at: iso(r.lastMessageAt),
    last_message_preview: r.preview,
    unread: r.unread,
    starred: r.starred,
    labels: r.labels,
    assignee: r.assigneeId ?? undefined,
    ticket_id: r.ticketId ?? undefined,
    place: placeOf(r, now),
    hasAttachments: r.hasAttachments,
    hasInbound: r.hasInbound
  }
}

/** A forward carries the whole thread below its note; the letter shows the note, as the design did. */
const FORWARDED = "---------- Doorgestuurd bericht ----------"

export const entryOf = (
  m: MessageView,
  who: (memberId: string) => string | undefined
): LetterEntry => {
  const body = m.kind === "forward" ? (m.bodyText.split(FORWARDED)[0] ?? "").trim() : m.bodyText
  return {
    id: m.id,
    direction: m.direction,
    kind: m.kind,
    from: named(m.from),
    ...(m.kind === "forward" && m.to[0] !== undefined ? { to: m.to[0].email } : {}),
    at: iso(m.sentAt),
    body,
    ...(m.direction === "outbound" ? { by: (m.sentBy === null ? undefined : who(m.sentBy)) ?? m.from.name } : {}),
    ...(m.sendState === null ? {} : { state: m.sendState }),
    ...(m.sendError === null ? {} : { error: m.sendError })
  }
}

const PROVIDER = {
  forward: { brand: "email", name: "E-mail", label: "de mailbox", reconnect: "Opnieuw koppelen" },
  gmail: { brand: "gmail", name: "Gmail", label: "Gmail", reconnect: "Gmail opnieuw koppelen" },
  outlook: { brand: "outlook", name: "Outlook", label: "Outlook", reconnect: "Outlook opnieuw koppelen" }
} as const

/** How long ago, as the mailbox's band says it. */
const ago = (ms: number, now: number) => {
  const min = Math.max(0, Math.round((now - ms) / 60_000))
  if (min < 1) return "zojuist"
  if (min < 60) return `${min} min geleden`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} uur geleden`
  return new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" }).format(
    new Date(ms)
  )
}

export const mailboxOf = (m: MailboxView, now: number): InboxMailbox => {
  const p = PROVIDER[m.provider]
  const live = m.status === "connected"
  return {
    id: m.id,
    address: m.address,
    label: m.label,
    logo: { brand: p.brand, name: p.name },
    status: {
      live,
      line: !live
        ? `${p.name} ontkoppeld`
        : m.lastSyncedAt === null
        ? "Wacht op de eerste mail"
        : `Laatste mail ${ago(m.lastSyncedAt, now)}`
    },
    providerLabel: p.label,
    reconnectLabel: p.reconnect
  }
}
