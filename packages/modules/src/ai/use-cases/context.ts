import { NotFound } from "@insyte/domain/Errors"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { firstName } from "../domain/Guards.ts"
import type { ReplyContext, ReplyMessage, ReplyOrder } from "../prompts/reply.ts"

/*
 * What a prompt reads of a record (ai.md §6.4): the thread or the ticket, the customer's first name, the facts of
 * their few latest orders. Never their address, phone, email or payment details, and nothing of another customer.
 * Long mail is cut: a reply answers the last messages, not the whole history.
 */

const MESSAGES = 8
const CHARS = 2500

const STATUS: Record<string, string> = {
  placed: "Geplaatst",
  paid: "Betaald",
  at_supplier: "Bij de leverancier",
  shipped: "Verzonden",
  delivered: "Bezorgd",
  cancelled: "Geannuleerd",
  refunded: "Terugbetaald"
}

const TICKET_STATUS: Record<string, string> = {
  intake: "Nieuw",
  in_progress: "Bezig",
  awaiting_reply: "Wacht op antwoord",
  done: "Klaar"
}

const PRIORITY: Record<string, string> = { low: "Laag", medium: "Gemiddeld", high: "Hoog" }

const dayIn = (tz: string) => (d: Date | null) =>
  d === null ? null : new Intl.DateTimeFormat("nl-NL", { timeZone: tz, dateStyle: "long" }).format(d)

/** Rows read newest first, in the order they happened. */
const oldestFirst = <A>(rows: ReadonlyArray<A>): Array<A> => rows.map((_, i) => rows[rows.length - 1 - i]!)

const cut = (text: string) => (text.length > CHARS ? `${text.slice(0, CHARS)} …` : text)

const timezone = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ tz: string | null; name: string }>`select timezone as tz, name from workspaces where id = app_workspace_id()`,
    ([w]) => ({ tz: w?.tz ?? "Europe/Amsterdam", workspace: w?.name ?? "" })
  )

const ordersOf = Effect.fn("Ai.ordersOf")(function*(
  sql: SqlClient.SqlClient,
  ids: { readonly orderId: string | null; readonly customerId: string | null },
  tz: string
) {
  if (ids.orderId === null && ids.customerId === null) return [] as ReadonlyArray<ReplyOrder>
  const rows = yield* sql<{
    number: string
    status: string
    placedAt: Date
    carrier: string | null
    trackingNumber: string | null
    deliveredAt: Date | null
  }>`
    select o.number, o.status, o.placed_at, f.carrier, f.tracking_number, f.delivered_at
    from orders o
    left join lateral (select carrier, tracking_number, delivered_at from fulfilments
                       where order_id = o.id order by shipped_at desc nulls last limit 1) f on true
    where not o.is_draft and (o.id = ${ids.orderId} or o.customer_id = ${ids.customerId})
    order by (o.id = ${ids.orderId}) desc nulls last, o.placed_at desc limit 3`
  const day = dayIn(tz)
  return rows.map((r): ReplyOrder => ({
    number: r.number,
    status: STATUS[r.status] ?? r.status,
    placedOn: day(r.placedAt) ?? "",
    carrier: r.carrier,
    trackingNumber: r.trackingNumber,
    deliveredOn: day(r.deliveredAt)
  }))
})

const brandOf = (sql: SqlClient.SqlClient, customerId: string | null, workspace: string) =>
  customerId === null ? Effect.succeed(workspace) : Effect.map(
    sql<{ name: string }>`select s.name from customers c join stores s on s.id = c.store_id where c.id = ${customerId}`,
    ([s]) => s?.name ?? workspace
  )

export interface ThreadFacts {
  readonly context: Omit<ReplyContext, "rewrite">
  /** The last inbound message's time: a draft older than it answers an earlier question. */
  readonly lastInboundAt: number | null
}

/** A thread as a reply reads it. */
export const threadFacts = Effect.fn("Ai.threadFacts")(function*(sql: SqlClient.SqlClient, threadId: string) {
  const [t] = yield* sql<{ subject: string; customerId: string | null; ticketId: string | null }>`
    select subject, customer_id, ticket_id from email_threads where id = ${threadId} and deleted_at is null`
  if (t === undefined) return yield* new NotFound({ entity: "thread", id: threadId })
  const { tz, workspace } = yield* timezone(sql)
  const day = dayIn(tz)
  const rows = yield* sql<{ direction: string; fromName: string; bodyText: string; sentAt: Date }>`
    select direction, from_name, body_text, sent_at from email_messages
    where thread_id = ${threadId} and (direction = 'inbound' or send_state is distinct from 'failed')
    order by sent_at desc limit ${MESSAGES}`
  const messages = oldestFirst(rows).map((m): ReplyMessage => ({
    from: m.direction === "inbound" ? "klant" : "team",
    on: day(m.sentAt) ?? "",
    text: cut(m.bodyText)
  }))
  const inbound = rows.find((m) => m.direction === "inbound")
  const [c] = t.customerId === null ? [] : yield* sql<{ name: string }>`
    select name from customers where id = ${t.customerId}`
  const name = c?.name || inbound?.fromName || ""
  return {
    context: {
      via: "mail",
      brand: yield* brandOf(sql, t.customerId, workspace),
      firstName: firstName(name),
      subject: t.subject,
      messages,
      orders: yield* ordersOf(sql, { orderId: null, customerId: t.customerId }, tz),
      note: null
    },
    lastInboundAt: inbound === undefined ? null : inbound.sentAt.getTime()
  } satisfies ThreadFacts
})

/** A ticket as a reply reads it: its description, the customer, the order it is about; the team's notes stay out. */
export const ticketFacts = Effect.fn("Ai.ticketFacts")(function*(sql: SqlClient.SqlClient, ticketId: string) {
  const [t] = yield* sql<{
    number: string
    title: string
    description: string
    status: string
    priority: string
    orderId: string | null
    customerId: string | null
    orderCustomer: string | null
  }>`
    select t.number, t.title, t.description, t.status, t.priority, t.order_id,
           coalesce(t.customer_id, o.customer_id) as customer_id, o.customer_name as order_customer
    from tickets t left join orders o on o.id = t.order_id
    where t.id = ${ticketId} and t.deleted_at is null`
  if (t === undefined) return yield* new NotFound({ entity: "ticket", id: ticketId })
  const { tz, workspace } = yield* timezone(sql)
  const [c] = t.customerId === null ? [] : yield* sql<{ name: string }>`
    select name from customers where id = ${t.customerId}`
  const day = dayIn(tz)
  const mail = yield* sql<{ direction: string; bodyText: string; sentAt: Date }>`
    select m.direction, m.body_text, m.sent_at from email_messages m
    join email_threads th on th.id = m.thread_id
    where th.ticket_id = ${ticketId} and th.deleted_at is null
    order by m.sent_at desc limit ${MESSAGES}`
  return {
    via: "ticket",
    brand: yield* brandOf(sql, t.customerId, workspace),
    firstName: firstName(c?.name || t.orderCustomer),
    subject: t.title,
    messages: oldestFirst(mail).map((m): ReplyMessage => ({
      from: m.direction === "inbound" ? "klant" : "team",
      on: day(m.sentAt) ?? "",
      text: cut(m.bodyText)
    })),
    orders: yield* ordersOf(sql, { orderId: t.orderId, customerId: t.customerId }, tz),
    note: t.description === "" ? null : cut(t.description)
  } satisfies Omit<ReplyContext, "rewrite">
})

/** A ticket as its summary reads it: everything the team wrote on it too, newest last. */
export const ticketSummaryFacts = Effect.fn("Ai.ticketSummaryFacts")(function*(
  sql: SqlClient.SqlClient,
  ticketId: string
) {
  const [t] = yield* sql<{
    number: string
    title: string
    description: string
    status: string
    priority: string
    related: string | null
  }>`
    select t.number, t.title, t.description, t.status, t.priority,
           coalesce('bestelling ' || o.number, c.name) as related
    from tickets t left join orders o on o.id = t.order_id left join customers c on c.id = t.customer_id
    where t.id = ${ticketId} and t.deleted_at is null`
  if (t === undefined) return yield* new NotFound({ entity: "ticket", id: ticketId })
  const assignees = yield* sql<{ name: string }>`
    select coalesce(u.name, '') as name from ticket_assignees a
    join members m on m.id = a.member_id left join auth."user" u on u.id = m.user_id
    where a.ticket_id = ${ticketId} order by a.assigned_at nulls last`
  const notes = yield* sql<{ kind: string; authorKind: string; name: string | null; body: string }>`
    select k.kind, k.author_kind, u.name, k.body from ticket_comments k
    left join members m on k.author_kind = 'member' and m.id = k.author_id
    left join auth."user" u on u.id = m.user_id
    where k.ticket_id = ${ticketId} and k.deleted_at is null and k.kind in ('comment', 'activity')
    order by k.created_at desc limit 20`
  return {
    number: Number(t.number),
    title: t.title,
    description: cut(t.description),
    status: TICKET_STATUS[t.status] ?? t.status,
    priority: PRIORITY[t.priority] ?? t.priority,
    assignees: assignees.map((a) => firstName(a.name)).filter((n) => n !== ""),
    notes: oldestFirst(notes).map((n) => ({
      by: n.authorKind === "member" ? firstName(n.name) || "Teamlid" : "Insyte",
      text: cut(n.body)
    })),
    related: t.related
  }
})
