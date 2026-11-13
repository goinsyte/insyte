import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { ProductAnalytics, type ProductEvent } from "@insyte/modules/shared/domain/ProductAnalytics"
import { Effect } from "effect"
import { type EventOf, type EventType, onEvery, subscriber } from "../Subscriber.ts"

/** The product event an outbox event is, if it is one. */
type ProductEventOf<T extends EventType> = Of<EventOf<T>>

type Of<E> = (id: string, event: E) => ProductEvent | undefined

/** Not a product event. */
const none = (): undefined => undefined

/** Handling an order in Insyte is an activation moment (M7): counted by what was done and to how many. */
const orderHandled: Of<EventOf<"order.updated" | "order.cancelled" | "refund.requested">> = (id, event) =>
  // A supplier's own parcel (M8.3) is not a person handling an order.
  event.userId.startsWith("supplier:") ? undefined : {
    outboxId: id,
    event: "order_handled",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId },
    properties: {
      action: event.type === "order.cancelled"
        ? "cancel"
        : event.type === "refund.requested"
        ? "refund"
        : event.change,
      count: event.orderIds.length
    }
  }

/**
 * Product analytics (17 §5): the events the PostHog project knows, by the person's id, grouped by workspace. Every
 * event type has its line, so a new one is a type error until it is counted or `none`.
 */
const PRODUCT_EVENTS: { readonly [T in EventType]: ProductEventOf<T> } = {
  "workspace.created": (id, event) => ({
    outboxId: id,
    event: "workspace_created",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId }
  }),
  "onboarding.step_completed": (id, event) => ({
    outboxId: id,
    event: "onboarding_step_completed",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId },
    properties: { step: event.step }
  }),
  "member.invited": (id, event) =>
    // A resend is the same invitation again: counted once, when first sent.
    event.round > 0 ? undefined : {
      outboxId: id,
      event: "member_invited",
      distinctId: event.userId,
      groups: { workspace: event.workspaceId }
    },
  "member.joined": (id, event) => ({
    outboxId: id,
    event: "invitation_accepted",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId },
    properties: { via: event.via }
  }),
  // Notifications are their business (M5); the product events do not count them.
  "access.requested": none,
  "access.decided": none,
  "webhook.disabled": none,
  "connection.incident": none,

  "store.synced": none,
  "store.connected": (id, event) => ({
    outboxId: id,
    event: "store_connected",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId },
    properties: { platform: "shopify" }
  }),
  "marketing.sync_requested": (id, event) => ({
    outboxId: id,
    event: "marketing_synced",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId }
  }),
  "order.delayed": none,
  "forwarding.send_requested": (id, event) =>
    // A supplier's standing instruction is not a person handling an order.
    event.userId === "system" ? undefined : {
      outboxId: id,
      event: "order_handled",
      distinctId: event.userId,
      groups: { workspace: event.workspaceId },
      properties: { action: "forward", count: event.legIds.length }
    },
  "records.changed": none,
  "product.updated": none,
  "customer.updated": none,
  "customer.created": none,
  // A return's mails and its Shopify side are not a person's moment; starting and settling one are counted elsewhere.
  "return.started": none,
  "return.approved": none,
  "return.rejected": none,
  "return.label_issued": none,
  "return.resolution_requested": none,
  "return.resolved": none,
  "return.requested": none,
  "return.label_requested": none,
  "quality_check.submitted": none,
  // A chargeback's note to the team (M13 step 3) is the notifications' business.
  "chargeback.opened": none,
  "chargeback.deadline_near": none,
  // Gathering a pack is Insyte's work, not a person's moment.
  "chargeback.pack_requested": none,
  // The monthly close (M13 step 6) is Insyte's, not a person's moment.
  "statements.closed": none,
  // The delay mail is counted as the filing that put it in line.
  "order.delay_mail": none,
  // Filing a plate (M10.2): the mechanism the product rests on, counted by the command it carried.
  "proposal.filed": (id, event) => ({
    outboxId: id,
    event: "proposal_filed",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId },
    properties: { action: event.action }
  }),
  // A run's note to a teammate (M12 step 3) is the notifications' business.
  "automation.notify": none,
  // Publishing a flow (M12 step 1): the moment an operator hands work to Insyte, by its trigger and size.
  "automation.published": (id, event) => ({
    outboxId: id,
    event: "automation_published",
    distinctId: event.userId,
    groups: { workspace: event.workspaceId },
    properties: { version: event.version, trigger: event.trigger, steps: event.steps }
  }),
  "order.updated": orderHandled,
  "order.cancelled": orderHandled,
  "refund.requested": orderHandled,
  // Tickets, chats, courses, the inbox's queued mail and sheets: not product events.
  "ticket.assigned": none,
  "ticket.mentioned": none,
  "chat.posted": none,
  "chat.mentioned": none,
  "course.assigned": none,
  "course.question": none,
  "course.answered": none,
  "thread.message_queued": none,
  "sheet.changed": none
}

const productEventOf = (id: string, event: OutboxEvent): ProductEvent | undefined =>
  (PRODUCT_EVENTS[event.type] as ProductEventOf<EventType>)(id, event)

export const Analytics = subscriber(
  "posthog",
  onEvery((id, event) => {
    const product = productEventOf(id, event)
    return product === undefined
      ? undefined
      : Effect.flatMap(Effect.service(ProductAnalytics), (a) => a.capture(product))
  })
)
