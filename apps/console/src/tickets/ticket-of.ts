import type { TicketComment, TicketRow } from "@insyte/modules/tickets/domain/Tickets"
import type { Ticket } from "@insyte/ui/app/lib/types/domain"
import type { ActivityLine } from "@insyte/ui/app/tickets/source"

/*
 * The server's tickets in the design's shape (M11 step 3): `#n` as the number, member ids as the assignees, ISO times;
 * the card's deadline and the activity's "2 uur geleden" in Dutch, from the viewer's clock.
 */

const iso = (ms: number) => new Date(ms).toISOString()

export const ticketOf = (r: TicketRow): Ticket => ({
  id: r.id,
  number: `#${r.number}`,
  title: r.title,
  description: r.description,
  status: r.status,
  priority: r.priority,
  tags: [...r.labels],
  assignee_ids: r.assignees.map((a) => a.id),
  ...(r.related === null ? {} : { related_entity: { type: r.related.type, id: r.related.id, label: r.related.label } }),
  ...(r.template === null ? {} : { template: r.template }),
  ...(r.dueAt === null ? {} : { due_at: iso(r.dueAt) }),
  source: r.source,
  ...(r.snoozedUntil === null ? {} : { snoozed_until: iso(r.snoozedUntil) }),
  ...(r.archivedAt === null ? {} : { archived_at: iso(r.archivedAt) }),
  ...(r.deletedAt === null ? {} : { deleted_at: iso(r.deletedAt) }),
  ...(r.spamAt === null ? {} : { spam_at: iso(r.spamAt) }),
  created_at: iso(r.createdAt),
  updated_at: iso(r.updatedAt)
})

/** A teammate's disc: the first letter of their name. */
export const initialOfName = (name: string) => name.trim().charAt(0).toUpperCase() || "?"

const DAY = 86_400_000
const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const WEEKDAY = new Intl.DateTimeFormat("nl-NL", { weekday: "long" })
const SHORT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })

/** The card's deadline in the design's words: Vandaag, Morgen, Gisteren, a weekday, Volgende week, or the date. */
export const dueLabelOf = (due: string | undefined, now: number): string | undefined => {
  if (due === undefined) return undefined
  const ms = Date.parse(due)
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / DAY)
  if (days === 0) return "Vandaag"
  if (days === 1) return "Morgen"
  if (days === -1) return "Gisteren"
  if (days < -1) return `${-days} dagen geleden`
  if (days < 7) {
    const day = WEEKDAY.format(ms)
    return day.charAt(0).toUpperCase() + day.slice(1)
  }
  if (days < 14) return "Volgende week"
  return SHORT.format(ms)
}

/** When something was written, as the activity says it. */
const agoOf = (ms: number, now: number) => {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return "zojuist"
  if (minutes < 60) return `${minutes} min geleden`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && startOfDay(ms) === startOfDay(now)) return `${hours} uur geleden`
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY)
  if (days <= 1) return "gisteren"
  if (days < 7) return `${days} dagen geleden`
  return SHORT.format(ms)
}

/** A comment as the activity draws it; one an agent wrote is Insyte's. */
export const lineOf = (c: TicketComment, now: number): ActivityLine => ({
  id: c.id,
  authorId: c.author.id,
  name: c.author.name,
  initial: initialOfName(c.author.name),
  // What Insyte did or wrote on the ticket: an agent's line, a summary, the mail "Klant informeren" sent.
  insyte: c.author.kind === "agent" || c.kind === "ai_summary" || c.kind === "email_sent",
  body: c.body,
  at: agoOf(c.createdAt, now)
})
