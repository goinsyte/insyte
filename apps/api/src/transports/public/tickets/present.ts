import type { TicketComment, TicketDetail, TicketList, TicketRow } from "@insyte/modules/tickets/domain/Tickets"
import { iso } from "../shared/time.ts"

/* Tickets in the public shape (M11): a ticket, a comment, the board's page, and one ticket with its comments. */

export const ticketV1 = (t: TicketRow) => ({
  id: t.id,
  number: t.number,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  source: t.source,
  labels: [...t.labels],
  assignees: t.assignees.map((a) => ({ id: a.id, name: a.name })),
  related: t.related === null ? null : { type: t.related.type, id: t.related.id, label: t.related.label },
  topic: t.topic,
  due_at: iso(t.dueAt),
  resolved_at: iso(t.resolvedAt),
  snoozed_until: iso(t.snoozedUntil),
  archived_at: iso(t.archivedAt),
  spam_at: iso(t.spamAt),
  deleted_at: iso(t.deletedAt),
  comment_count: t.commentCount,
  created_at: iso(t.createdAt)!,
  updated_at: iso(t.updatedAt)!
})

export const commentV1 = (c: TicketComment) => ({
  id: c.id,
  author: { kind: c.author.kind, id: c.author.id, name: c.author.name },
  body: c.body,
  mentions: c.mentions.map((m) => ({ id: m.id, name: m.name })),
  created_at: iso(c.createdAt)!
})

export const ticketPageV1 = (list: TicketList) => ({
  data: list.rows.map(ticketV1),
  counts: {
    all: list.counts.all,
    open: list.counts.open,
    unassigned: list.counts.unassigned,
    snoozed: list.counts.snoozed,
    done: list.counts.done,
    archived: list.counts.archived,
    spam: list.counts.spam,
    trash: list.counts.trash
  }
})

export const ticketDetailV1 = (d: TicketDetail) => ({ ...ticketV1(d.ticket), comments: d.comments.map(commentV1) })
