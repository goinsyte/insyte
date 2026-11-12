import { mintId } from "@insyte/domain/Ids"
import { CHANNELS, notificationKind } from "@insyte/domain/Notifications"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OutboxEvent } from "../../shared/domain/Outbox.ts"
import { quietUntil } from "../domain/Quiet.ts"
import { plan as planDelivery } from "./deliveries.ts"
import { connectionOf } from "./slack.ts"

/*
 * The relay's notifications sink (M5.2): a domain event → one row per member who should hear of it, in the event's
 * workspace as `system`. Who hears what:
 *
 * - `member.joined`: whoever sent the invitation (by link: everyone who may manage the team) hears that they joined;
 * - `access.requested`: everyone who may manage the team, but the asker;
 * - `access.decided`: the asker hears the answer;
 * - `order.delayed`: whoever handles orders hears of a stuck parcel;
 * - `return.requested`: whoever handles returns hears of a shopper's request from the portal;
 * - `ticket.assigned`: who was put on a ticket hears of it, once the undo window has passed and if still on it;
 * - `ticket.mentioned`: who a ticket comment names with `@` hears of it;
 * - `chat.mentioned`: who a chat message names with `@` hears of it, if they are in it and did not mute it;
 * - `quality_check.submitted`: who asked for the check, and whoever handles products, hear the supplier answered;
 * - `chargeback.opened`, `chargeback.deadline_near`: whoever may see chargebacks hears of a new case at or above the
 *   workspace's threshold, and that a case's deadline is coming (M13 step 3).
 *
 * A member deactivated or removed hears nothing. Who has "Alleen als het mij betreft" on for the kind hears only of
 * what concerns them directly (they were put on it, named in it, asked for it or sent the invitation). The in-app switch
 * decides the row in the inbox; each other channel that is on and can deliver gets a delivery of its own
 * (`deliveries.ts`), push and Slack held until the member's quiet hours end (M11 step 13.5): push once the member
 * allowed it on a browser, Slack once the workspace connected it and the member chose a channel. Answers who got a row,
 * with their unread count, for the realtime frame.
 */

interface Planned {
  readonly kind: string
  readonly recipients: ReadonlyArray<string>
  readonly subjectType: string
  readonly subjectId: string
  readonly actor: string | null
  readonly data: Record<string, unknown>
  /** Whom it concerns directly, for "Alleen als het mij betreft"; the rest hear of it by their role. */
  readonly direct?: ReadonlyArray<string>
}

/** Active members whose role manages the team (`team` at Beheren). */
const managers = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ id: string }>`
      select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where m.deactivated_at is null and m.removed_at is null
        and (r.id = 'owner' or coalesce((r.levels ->> 'team')::int, 0) >= 3)`,
    (rows) => rows.map((r) => r.id)
  )

const plan = (sql: SqlClient.SqlClient, event: OutboxEvent): Effect.Effect<Planned | undefined, unknown> =>
  Effect.gen(function*() {
    switch (event.type) {
      case "member.joined": {
        const [inviter] = event.via === "invitation"
          ? yield* sql<{ invitedBy: string }>`
              select i.invited_by from invitations i join members m on m.user_id = i.accepted_by_user
              where m.id = ${event.memberId} order by i.accepted_at desc limit 1`
          : []
        const recipients = inviter === undefined ? yield* managers(sql) : [inviter.invitedBy]
        return {
          kind: "team.invite",
          recipients: recipients.filter((r) => r !== event.memberId),
          subjectType: "member",
          subjectId: event.memberId,
          actor: event.memberId,
          data: { via: event.via },
          direct: inviter === undefined ? [] : [inviter.invitedBy]
        }
      }
      case "access.requested":
      case "access.decided": {
        const [request] = yield* sql<{ area: string; level: number; decidedBy: string | null }>`
          select area, level, decided_by from access_requests where id = ${event.requestId}`
        if (request === undefined) return undefined
        return event.type === "access.requested"
          ? {
            kind: "team.access",
            recipients: (yield* managers(sql)).filter((r) => r !== event.memberId),
            subjectType: "access_request",
            subjectId: event.requestId,
            actor: event.memberId,
            data: { area: request.area, level: request.level, state: "open" }
          }
          : {
            kind: "team.access",
            recipients: [event.memberId],
            subjectType: "access_request",
            subjectId: event.requestId,
            actor: request.decidedBy,
            data: { area: request.area, level: request.level, state: event.state },
            direct: [event.memberId]
          }
      }
      case "order.delayed": {
        // Whoever handles orders hears of a stuck parcel (M8.4); the order is the subject.
        const [order] = yield* sql<{ number: string }>`select number from orders where id = ${event.orderIds[0] ?? ""}`
        if (order === undefined) return undefined
        const recipients = yield* sql<{ id: string }>`
          select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
          where m.deactivated_at is null and m.removed_at is null
            and (r.id = 'owner' or coalesce((r.levels ->> 'orders')::int, 0) >= 2)`
        return {
          kind: "order.late",
          recipients: recipients.map((r) => r.id),
          subjectType: "order",
          subjectId: event.orderIds[0] ?? "",
          actor: null,
          data: { number: order.number, reason: event.reason, note: event.note }
        }
      }
      case "return.requested": {
        // A shopper's request from the portal (M9.3): whoever may handle returns hears of it; the return is the subject.
        const [ret] = yield* sql<{ number: string; type: "return" | "claim"; orderNumber: string; customer: string }>`
          select r.number, r.type, o.number as order_number, r.customer_name as customer
          from returns r join orders o on o.id = r.order_id where r.id = ${event.returnIds[0] ?? ""}`
        if (ret === undefined) return undefined
        const items = yield* sql<{ title: string; variantTitle: string | null; qty: number }>`
          select coalesce(p.title, ol.title) as title, ol.variant_title, rl.quantity as qty
          from return_lines rl join order_lines ol on ol.id = rl.order_line_id
          left join products p on p.id = ol.product_id
          where rl.return_id = ${event.returnIds[0] ?? ""} order by ol.id`
        const recipients = yield* sql<{ id: string }>`
          select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
          where m.deactivated_at is null and m.removed_at is null
            and (r.id = 'owner' or coalesce((r.levels ->> 'returns')::int, 0) >= 2)`
        return {
          kind: "return.new",
          recipients: recipients.map((r) => r.id),
          subjectType: "return",
          subjectId: event.returnIds[0] ?? "",
          actor: null,
          data: {
            number: ret.number,
            kind: ret.type,
            orderNumber: ret.orderNumber,
            customer: ret.customer,
            items: items.map((i) => ({ title: i.title, variant: i.variantTitle ?? "", qty: i.qty }))
          }
        }
      }
      case "ticket.assigned":
      case "ticket.mentioned": {
        // A ticket (M11 step 3): the subject, by its number and title; who may not open tickets hears nothing.
        const [ticket] = yield* sql<{ number: string; title: string }>`
          select number, title from tickets where id = ${event.ticketId}`
        if (ticket === undefined) return undefined
        const [actor] = yield* sql<{ id: string }>`select id from members where id = ${event.by}`
        const recipients = yield* sql<{ id: string }>`
          select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
          where m.id in ${sql.in([...event.memberIds, ""])} and m.deactivated_at is null and m.removed_at is null
            and (r.id = 'owner' or coalesce((r.levels ->> 'support')::int, 0) >= 1)
            and ${
          event.type === "ticket.assigned"
            ? sql`exists (select 1 from ticket_assignees a where a.ticket_id = ${event.ticketId} and a.member_id = m.id)`
            : sql`true`
        }`
        const [said] = event.type === "ticket.mentioned"
          ? yield* sql<{ body: string }>`select body from ticket_comments where id = ${event.commentId}`
          : []
        const named = recipients.map((r) => r.id).filter((r) => r !== event.by)
        return {
          kind: event.type === "ticket.assigned" ? "ticket.assigned" : "chat.mention",
          recipients: named,
          direct: named,
          subjectType: "ticket",
          subjectId: event.ticketId,
          actor: actor?.id ?? null,
          data: {
            number: Number(ticket.number),
            title: ticket.title,
            ...(said === undefined ? {} : { comment: said.body.slice(0, 280) })
          }
        }
      }
      case "chat.mentioned": {
        // A chat message named teammates (M11 step 4): who reads chats and is in the conversation (a DM's two, or a
        // channel's readers) hears of it, unless they muted it; the conversation is the subject.
        const [c] = yield* sql<{ kind: string; name: string }>`
          select kind, name from conversations where id = ${event.conversationId} and archived_at is null`
        const [said] = yield* sql<{ body: string }>`
          select body from messages where id = ${event.messageId} and deleted_at is null`
        if (c === undefined || said === undefined) return undefined
        const recipients = yield* sql<{ id: string }>`
          select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
          where m.id in ${sql.in([...event.memberIds, ""])} and m.deactivated_at is null and m.removed_at is null
            and (r.id = 'owner' or coalesce((r.levels ->> 'support')::int, 0) >= 1)
            and (${c.kind} <> 'dm' or exists (select 1 from conversation_members x
                                             where x.conversation_id = ${event.conversationId} and x.principal_id = m.id))
            and not exists (select 1 from conversation_members x where x.conversation_id = ${event.conversationId}
                            and x.principal_id = m.id and x.muted)`
        const named = recipients.map((r) => r.id).filter((r) => r !== event.by)
        return {
          kind: "chat.mention",
          recipients: named,
          direct: named,
          subjectType: "conversation",
          subjectId: event.conversationId,
          actor: event.by,
          data: {
            conversation: c.kind === "dm" ? null : c.name,
            messageId: event.messageId,
            comment: said.body.slice(0, 280)
          }
        }
      }
      case "quality_check.submitted": {
        // A supplier's answer to a quality check (M9.4): who asked, and whoever may handle products, hear of it.
        const [check] = yield* sql<{
          productId: string
          productTitle: string
          requestedBy: string
          submittedBy: string | null
          supplier: string
          batch: string | null
          video: boolean
          photos: number
        }>`
          select q.product_id, p.title as product_title, q.requested_by, q.submitted_by, s.name as supplier, q.batch,
                 q.video,
                 (select count(*)::int from quality_check_media m join files f on f.id = m.file_id
                  where m.check_id = q.id and f.mime like 'image/%') as photos
          from quality_checks q join products p on p.id = q.product_id join suppliers s on s.id = q.supplier_id
          where q.id = ${event.checkIds[0] ?? ""}`
        if (check === undefined) return undefined
        const recipients = yield* sql<{ id: string }>`
          select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
          where m.deactivated_at is null and m.removed_at is null
            and (m.id = ${check.requestedBy} or r.id = 'owner' or coalesce((r.levels ->> 'products')::int, 0) >= 2)`
        return {
          kind: "supplier.message",
          recipients: recipients.map((r) => r.id),
          subjectType: "quality_check",
          subjectId: event.checkIds[0] ?? "",
          actor: null,
          data: {
            productId: check.productId,
            product: check.productTitle,
            by: check.submittedBy ?? check.supplier,
            supplier: check.supplier,
            photos: check.photos,
            batch: check.batch,
            video: check.video
          },
          direct: [check.requestedBy]
        }
      }
      case "chargeback.opened":
      case "chargeback.deadline_near": {
        // A chargeback (M13 step 3): who may see chargebacks hears a new one at or above the workspace's threshold
        // ("Vanaf €100"), and that an open case's deadline is coming; the one who opened it by hand hears nothing of
        // their own. A case taken back, or closed since, says nothing.
        const [c] = yield* sql<{
          caseNumber: string
          provider: string
          customerName: string
          amountMinor: string
          currency: string
          reasonCode: string
          status: string
          deadlineAt: Date
          threshold: string | null
        }>`
          select c.case_number, c.provider, c.customer_name, c.amount_minor, c.currency, c.reason_code, c.status,
                 c.deadline_at, (w.alerts ->> 'dispute_amount_minor') as threshold
          from chargebacks c join workspaces w on w.id = c.workspace_id where c.id = ${event.chargebackId}`
        if (c === undefined) return undefined
        if (event.type === "chargeback.deadline_near" && c.status !== "open" && c.status !== "awaiting_evidence") {
          return undefined
        }
        if (event.type === "chargeback.opened" && Number(c.amountMinor) < Number(c.threshold ?? 0)) return undefined
        const by = event.type === "chargeback.opened" ? event.by : null
        const recipients = yield* sql<{ id: string }>`
          select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
          where m.deactivated_at is null and m.removed_at is null
            and (r.id = 'owner' or coalesce((r.levels ->> 'chargebacks')::int, 0) >= 1)`
        return {
          kind: event.type === "chargeback.opened" ? "chargeback.new" : "chargeback.deadline",
          recipients: recipients.map((r) => r.id).filter((r) => r !== by),
          subjectType: "chargeback",
          subjectId: event.chargebackId,
          actor: by,
          data: {
            caseNumber: c.caseNumber,
            provider: c.provider,
            customer: c.customerName,
            amountMinor: Number(c.amountMinor),
            currency: c.currency.trim(),
            reasonCode: c.reasonCode,
            deadlineAt: c.deadlineAt.getTime(),
            ...(event.type === "chargeback.deadline_near" ? { offset: event.offset } : {})
          }
        }
      }
      default:
        return undefined
    }
  })

interface Heard {
  readonly id: string
  readonly channels: ReadonlyArray<string> | null
  readonly onlyMine: boolean | null
  readonly quietOn: boolean | null
  readonly quietFrom: string | null
  readonly quietTo: string | null
  readonly quietWeekend: boolean | null
  readonly timezone: string
  readonly devices: number
  readonly slackChannel: string | null
}

export const fanOut = Effect.fn("Notifications.fanOut")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  event: OutboxEvent
) {
  const planned = yield* plan(sql, event)
  if (planned === undefined || planned.recipients.length === 0) return []
  const defaults = notificationKind(planned.kind)?.defaults
  const members = yield* sql<Heard>`
    select m.id, p.channels, p.only_mine, s.quiet_on, s.quiet_from, s.quiet_to, s.quiet_weekend, w.timezone,
           s.slack_channel, (select count(*)::int from push_subscriptions ps where ps.recipient_id = m.id) as devices
    from members m
    join workspaces w on w.id = m.workspace_id
    left join notification_prefs p on p.recipient_id = m.id and p.kind = ${planned.kind}
    left join notification_settings s on s.recipient_id = m.id
    where m.id in ${sql.in([...planned.recipients])} and m.deactivated_at is null and m.removed_at is null`
  const slack = yield* connectionOf(sql)
  const now = new Date()
  const out: Array<{ readonly recipientId: string; readonly unread: number }> = []
  for (const member of members) {
    if (member.onlyMine === true && !(planned.direct ?? []).includes(member.id)) continue
    const on = new Set(member.channels ?? CHANNELS.filter((c) => defaults?.[c] ?? c === "app"))
    let noteId: string | null = null
    if (on.has("app")) {
      noteId = mintId("note")
      yield* sql`insert into notifications (id, workspace_id, recipient_kind, recipient_id, kind, subject_type,
                                            subject_id, actor_kind, actor_id, data)
                 values (${noteId}, ${workspaceId}, 'member', ${member.id}, ${planned.kind}, ${planned.subjectType},
                         ${planned.subjectId}, ${planned.actor === null ? null : "member"}, ${planned.actor},
                         ${JSON.stringify(planned.data)}::jsonb)`
    }
    // E-mail goes now; push (to a browser the member allowed it on) and Slack (connected, a channel chosen) wait out
    // the member's quiet hours.
    const can = {
      email: true,
      push: member.devices > 0,
      slack: slack !== undefined && member.slackChannel !== null
    }
    const quiet = {
      on: member.quietOn ?? true,
      from: member.quietFrom ?? "22:00",
      to: member.quietTo ?? "07:00",
      weekend: member.quietWeekend ?? false
    }
    for (const channel of ["email", "push", "slack"] as const) {
      if (!on.has(channel) || !can[channel]) continue
      yield* planDelivery(sql, {
        workspaceId,
        recipientId: member.id,
        notificationId: noteId,
        channel,
        kind: planned.kind,
        subjectType: planned.subjectType,
        subjectId: planned.subjectId,
        actor: planned.actor,
        data: planned.data,
        notBefore: channel === "email" ? null : quietUntil(now, quiet, member.timezone)
      })
    }
    if (noteId === null) continue
    const [count] = yield* sql<{ unread: number }>`
      select count(*)::int as unread from notifications
      where recipient_kind = 'member' and recipient_id = ${member.id} and read_at is null and archived_at is null
        and (snoozed_until is null or snoozed_until <= now())`
    out.push({ recipientId: member.id, unread: count?.unread ?? 0 })
  }
  return out
})
