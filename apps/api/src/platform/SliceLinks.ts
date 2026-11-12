import { Conflict, type Forbidden, type NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { restoreAutonomy, restoreBudgets } from "@insyte/modules/agent/Agent"
import type { AgentEffect } from "@insyte/modules/agent/domain/AgentLog"
import { AgentLinks } from "@insyte/modules/agent/Links"
import { ActionFailed, ChatCommands } from "@insyte/modules/chats/Links"
import { restore as restoreChats } from "@insyte/modules/chats/use-cases/commands"
import { KlaviyoSyncs } from "@insyte/modules/customers/domain/Ports"
import { restore as restoreCustomers } from "@insyte/modules/customers/use-cases/commands"
import { forward as forwardLegs, restore as restoreForwarding } from "@insyte/modules/forwarding/use-cases/commands"
import { ensureLegs } from "@insyte/modules/forwarding/use-cases/legs"
import { ThreadTickets } from "@insyte/modules/inbox/domain/Ports"
import { restore as restoreInbox } from "@insyte/modules/inbox/use-cases/commands"
import { lastSyncOf, restore as restoreMarketing } from "@insyte/modules/marketing/use-cases/klaviyo"
import { restore as restoreNotifications } from "@insyte/modules/notifications/use-cases/prefs"
import {
  cancel as cancelOrders,
  restore as restoreOrders,
  setNote,
  tag as tagOrders
} from "@insyte/modules/orders/use-cases/commands"
import { notifyDelay } from "@insyte/modules/orders/use-cases/delay-mail"
import { refund as refundOrder, refundOn } from "@insyte/modules/orders/use-cases/refund"
import { restore as restoreProducts } from "@insyte/modules/products/use-cases/commands"
import type { ProposalAction } from "@insyte/modules/proposals/domain/Proposals"
import { ProposalLinks } from "@insyte/modules/proposals/Links"
import { restore as restoreProposal } from "@insyte/modules/proposals/Proposals"
import { restore as restoreQuality } from "@insyte/modules/quality/Quality"
import { approve as approveCheck } from "@insyte/modules/quality/use-cases/quality"
import { decideIn, refreshIn, reopenRowIn, restore as restoreQueue } from "@insyte/modules/queue/Queue"
import { Labels, Refunder } from "@insyte/modules/returns/domain/Ports"
import type { ResolveInput } from "@insyte/modules/returns/domain/Returns"
import {
  approve as approveReturns,
  resolve as resolveReturn,
  restore as restoreReturns,
  sendLabel as sendReturnLabel
} from "@insyte/modules/returns/use-cases/commands"
import { shopifyReturn } from "@insyte/modules/returns/use-cases/mirror"
import { parcelUpdated } from "@insyte/modules/returns/use-cases/parcels"
import { linkReplacements } from "@insyte/modules/returns/use-cases/shopify"
import type { UndoTicket } from "@insyte/modules/shared/domain/Undo"
import { MirrorFollowers } from "@insyte/modules/stores/domain/Ports"
import { StoreMirror } from "@insyte/modules/stores/Mirror"
import { ShopifyReturns } from "@insyte/modules/stores/ShopifyReturns"
import { restore as restoreSuppliers } from "@insyte/modules/suppliers/use-cases/commands"
import type {
  CreateInput as TicketCreateInput,
  UpdateInput as TicketUpdateInput
} from "@insyte/modules/tickets/domain/Tickets"
import {
  assign as assignTicket,
  create as createTicket,
  fromThread,
  removeFromThread,
  restore as restoreTickets,
  setAside,
  setStatus as setTicketStatus,
  unassign as unassignTicket,
  update as updateTicket
} from "@insyte/modules/tickets/use-cases/commands"
import { comment as commentTicket } from "@insyte/modules/tickets/use-cases/comment"
import { numberOf } from "@insyte/modules/tickets/use-cases/tickets"
import { ReturnParcels } from "@insyte/modules/tracking/Parcels"
import { ensureDeliveries } from "@insyte/modules/tracking/use-cases/tracking"
import { type Compensation, UndoCompensations } from "@insyte/modules/undo/domain/Ports"
import { Effect, Layer } from "effect"
import type { SqlError } from "effect/sql"

/*
 * Where one slice's need meets another slice's use case (architecture.md: a slice never reaches into another's
 * use-cases/). Each port is the asking slice's; its implementation is here, where the app is composed:
 *
 *   stores' mirror  → forwarding's legs and tracking's deliveries, on the page's transaction (M8.2, M8.4), and a
 *                     return's exchange or replacement order linked to it (M9.3)
 *   stores' webhook → a return opened, approved, declined or closed in Shopify, for the returns slice (M9.3)
 *   undo            → each reversible command's compensation, by the name its token carries (ADR-0023); a filed
 *                     plate's undo runs its command's own compensation through the same table
 *   a filed plate   → the command it carries (a return or a quality check approved, the shopper's delay mail put
 *                     in line, a reorder ticket opened), as the person, and the queue brought in line on the same
 *                     transaction (M10.2)
 *   returns' refund → the orders slice's refund, on the return's transaction (M9.1)
 *   a customer      → their newest Klaviyo sync (M7.5)
 *   AfterShip       → a return's parcel, for the returns slice (M9.2)
 *   the inbox       → a ticket made from a thread, and taken away again (M11 step 2)
 *   a chat command  → an order's note or cancellation, a ticket made, assigned or moved (M11.4), and its undo
 */

const MirrorFollowersLive = Layer.succeed(MirrorFollowers, {
  ordersWritten: (sql, storeId, orderShopifyIds, live) =>
    Effect.andThen(ensureLegs(sql, storeId, orderShopifyIds, live), linkReplacements(sql, storeId, orderShopifyIds)),
  fulfilmentsWritten: ensureDeliveries
})

const ShopifyReturnsLive = Layer.succeed(ShopifyReturns, {
  applied: (storeId, topic, body) => shopifyReturn(storeId, topic, body).pipe(Effect.orDie)
})

const threadTickets = ThreadTickets.of({ make: fromThread, remove: removeFromThread, numberOf })

const ThreadTicketsLive = Layer.succeed(ThreadTickets, threadTickets)

const compensations: Record<string, Compensation> = {
  "orders.restore": restoreOrders,
  "products.restore": restoreProducts,
  "customers.restore": restoreCustomers,
  "marketing.restore": restoreMarketing,
  "suppliers.restore": restoreSuppliers,
  "forwarding.restore": restoreForwarding,
  "returns.restore": restoreReturns,
  "tickets.restore": restoreTickets,
  "inbox.restore": (sql, compensation) =>
    restoreInbox(sql, compensation).pipe(Effect.provideService(ThreadTickets, threadTickets)),
  "quality.restore": restoreQuality,
  "queue.restore": restoreQueue,
  "notifications.restore": restoreNotifications,
  // A filed plate's Undo spends the command's own token and runs that command's compensation from this same table.
  "proposals.restore": (sql, compensation) =>
    restoreProposal(sql, compensation, {
      runInner: (command, inner) => {
        const run = compensations[command]
        return run === undefined ? Effect.die(new Error(`no compensation for ${command}`)) : run(sql, inner)
      },
      refreshQueue: refreshIn,
      reopenRow: reopenRowIn
    }),
  // A chat command's undo spends the command's own token (by its hash) and runs that command's compensation.
  "autonomy.restore": restoreAutonomy,
  "ai_budgets.restore": restoreBudgets,
  "chats.restore": (sql, compensation) =>
    restoreChats(sql, compensation, {
      runInner: (command, inner) => {
        const run = compensations[command]
        return run === undefined ? Effect.die(new Error(`no compensation for ${command}`)) : run(sql, inner)
      }
    })
}

const UndoCompensationsLive = Layer.succeed(UndoCompensations, compensations)

const refunder = Refunder.of({
  refund: (sql, input) =>
    Effect.map(
      refundOn(sql, { id: input.orderId, refundId: input.refundId, amountMinor: input.amountMinor, note: input.note }),
      ({ outboxId }) => ({ outboxId })
    )
})

type Status = "intake" | "in_progress" | "awaiting_reply" | "done"

type AgentAsked = Exclude<
  ProposalAction,
  { readonly _tag: "ApproveReturn" | "ApproveQualityCheck" | "NotifyDelayedOrder" | "CreateSupplierTicket" }
>

/** A refused filing: the record moved on (`stale`); anything else the person is told as the command said it. */
const staleOn = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catch((e: E) =>
      e._tag === "Forbidden" || e._tag === "NotFound" || e._tag === "SqlError"
        ? Effect.fail(e as unknown as Forbidden | NotFound | SqlError.SqlError)
        : Effect.succeed("stale" as const)
    )
  )

const filedRan = (undo: UndoTicket | null, pending = false) => ({ undo, pending, settles: false })

/**
 * What an agent asked first (M15 step 6), run as the person who files it: the command the agent's tool would have run,
 * with that person's permissions. A command refused for its record's state is `stale`.
 */
const agentAsked = (action: AgentAsked, labels: Labels["Service"]) => {
  switch (action._tag) {
    case "CancelOrder":
      return staleOn(Effect.map(
        cancelOrders({ ids: [action.orderId], restock: action.restock, notify: action.notify }),
        () => filedRan(null)
      ))
    case "RefundOrder":
      return staleOn(Effect.map(
        refundOrder({
          id: action.orderId,
          refundId: mintId("rfd"),
          amountMinor: action.amountMinor,
          ...(action.note === null ? {} : { note: action.note })
        }),
        () => filedRan(null)
      ))
    case "ResolveReturn":
      return staleOn(
        Effect.map(
          resolveReturn({
            id: action.returnId,
            resolution: action.resolution as typeof ResolveInput.Type["resolution"],
            ...(action.resolution === "refund" ? { refundId: mintId("rfd") } : {})
          }),
          (change) => filedRan(change.undo)
        ).pipe(Effect.provideService(Refunder, refunder), Effect.provideService(Labels, labels))
      )
    case "ForwardOrder":
      return staleOn(Effect.map(
        forwardLegs({ ids: [...action.legIds], ...(action.note === null ? {} : { note: action.note }) }),
        (change) => filedRan(change.undo, true)
      ))
    case "SendReturnLabel":
      return staleOn(Effect.map(sendReturnLabel({ ids: [action.returnId] }), (change) => filedRan(change.undo, true)))
        .pipe(
          Effect.provideService(Labels, labels)
        )
    case "TagOrder":
      return staleOn(Effect.map(
        tagOrders({ ids: [action.orderId], add: [...action.add], remove: [...action.remove] }),
        (change) => filedRan(change.undo)
      ))
    case "SetOrderNote":
      return staleOn(Effect.map(setNote(action.orderId, action.body), () => filedRan(null)))
    case "CreateTicket": {
      const { _tag, ...input } = action
      return staleOn(Effect.map(
        createTicket(input as typeof TicketCreateInput.Type, { source: "insyte" }),
        (change) => filedRan(change.undo)
      ))
    }
    case "UpdateTicket": {
      const { _tag, ticketId, ...fields } = action
      return staleOn(Effect.map(
        updateTicket({ ids: [ticketId], ...fields } as typeof TicketUpdateInput.Type),
        (change) => filedRan(change.undo)
      ))
    }
    case "SetTicketStatus":
      return staleOn(Effect.map(
        setTicketStatus({ ids: [action.ticketId], status: action.status as Status }),
        (change) => filedRan(change.undo)
      ))
    case "AssignTicket":
      return staleOn(Effect.map(
        action.on
          ? assignTicket({ id: action.ticketId, memberId: action.memberId })
          : unassignTicket({ id: action.ticketId, memberId: action.memberId }),
        (change) => filedRan(change.undo)
      ))
    case "CommentTicket":
      return staleOn(Effect.map(
        commentTicket({ id: action.ticketId, body: action.body, mentions: [...action.mentions] }),
        () => filedRan(null)
      ))
  }
}

/** A filed plate's command, as the person filing it (and an agent's action run again by the person, M15 step 6). */
const filed = (labels: Labels["Service"]) => (action: ProposalAction) => {
  switch (action._tag) {
    case "ApproveReturn":
      return approveReturns({
        ids: [action.returnId],
        ...(action.keepItem === undefined ? {} : { keepItem: action.keepItem })
      }).pipe(
        Effect.map((change) => ({ undo: change.undo, pending: false, settles: true })),
        Effect.catchTag("IllegalReturnMove", () => Effect.succeed("stale" as const))
      )
    case "ApproveQualityCheck":
      return approveCheck(action.checkId).pipe(
        Effect.map((change) => ({ undo: change.undo, pending: false, settles: true })),
        Effect.catchTag("IllegalCheckMove", () => Effect.succeed("stale" as const))
      )
    case "NotifyDelayedOrder":
      // The mail leaves after the undo window; the relay says whether it went (`Proposals.settleSent`).
      return notifyDelay({ orderId: action.orderId, subject: action.subject, paragraphs: action.paragraphs }).pipe(
        Effect.map(({ undo }) => ({ undo, pending: true, settles: false })),
        Effect.catchTag("DelayMailRefused", () => Effect.succeed("stale" as const))
      )
    case "CreateSupplierTicket":
      // On the filer, where a member files it; a key's ticket has no one on it yet.
      return Effect.flatMap(Effect.service(CurrentPrincipal), (principal) =>
        createTicket({
          title: action.title,
          description: action.description,
          priority: "high",
          labels: ["Leveringsketen"],
          assigneeIds: principal.kind === "member" ? [principal.id] : []
        }, { source: "insyte" })).pipe(
          Effect.map((change) => ({ undo: change.undo, pending: false, settles: false })),
          Effect.catchTags({ Invalid: Effect.die, MemberNotActive: Effect.die })
        )
    default:
      return agentAsked(action, labels)
  }
}

const ProposalLinksLive = Layer.effect(
  ProposalLinks,
  Effect.map(Effect.service(Labels), (labels) => ({ run: filed(labels), refreshQueue: refreshIn, decideRow: decideIn }))
)

/** What the agent log's way back runs (M15 step 6): each as the person, with their permissions. */
const opposite = (effect: AgentEffect): ProposalAction | null => {
  switch (effect.kind) {
    case "ticket.status":
      return { _tag: "SetTicketStatus", ticketId: effect.ticketId, status: effect.from }
    case "ticket.priority":
      return { _tag: "UpdateTicket", ticketId: effect.ticketId, priority: effect.from }
    case "ticket.assign":
      return { _tag: "AssignTicket", ticketId: effect.ticketId, memberId: effect.memberId, on: !effect.on }
    case "order.tags":
      return { _tag: "TagOrder", orderId: effect.orderId, add: effect.remove, remove: effect.add }
    case "order.note":
      return { _tag: "SetOrderNote", orderId: effect.orderId, body: effect.before }
    case "ticket.create":
    case "token":
      return null
  }
}

const AgentLinksLive = Layer.effect(
  AgentLinks,
  Effect.map(Effect.service(Labels), (labels) => {
    const run = (action: ProposalAction) =>
      Effect.flatMap(
        filed(labels)(action),
        (r) => r === "stale" ? Effect.fail(new Conflict({ entity: "agent_action", reason: "stale" })) : Effect.void
      )
    return AgentLinks.of({
      takeBack: (sql, command, compensation) => {
        const compensate = compensations[command]
        return compensate === undefined
          ? Effect.die(new Error(`no compensation for ${command}`))
          : compensate(sql, compensation)
      },
      compensate: (effect) => {
        if (effect.kind === "ticket.create") {
          // "Ticket weghalen": to the trash, as the person's own command (Klantenservice · Beheren).
          return Effect.asVoid(setAside({ ids: [effect.ticketId], as: "trash" }))
        }
        const action = opposite(effect)
        return action === null
          ? Effect.fail(new Conflict({ entity: "agent_action", reason: "irreversible" }))
          : run(action)
      },
      rerun: run
    })
  })
)

/** What the card's footer says when its command did not run (widgets/04 §C), from the use case's own refusal. */
const said = (error: { readonly _tag: string; readonly reason?: unknown }) =>
  new ActionFailed({
    message: error._tag === "Forbidden"
      ? "Daar heb je de rechten niet voor."
      : error._tag === "NotFound"
      ? "Dit record bestaat niet meer."
      : error._tag === "MemberNotActive"
      ? "Die collega zit niet (meer) in het team."
      : error._tag === "Conflict" && error.reason === "fulfilled"
      ? "Deze bestelling is al (deels) verzonden."
      : error._tag === "Conflict"
      ? "Deze bestelling is al afgesloten."
      : "Dat lukte niet."
  })

const ChatCommandsLive = Layer.succeed(ChatCommands, {
  // A refund from a chat, evidence and accepting a dispute come with M13.
  available: new Set(["note", "ticket", "assign", "status", "cancel"] as const),
  run: ({ command, target, arg, messageId }) => {
    const text = arg?.trim() ?? ""
    const id = target?.id ?? ""
    const ran = command === "note"
      ? Effect.as(setNote(id, text), { undo: null })
      : command === "cancel"
      // As the order page's cancel: the stock goes back; the customer hears it from the store, not from Shopify.
      ? Effect.as(cancelOrders({ ids: [id], restock: true, notify: false }), { undo: null })
      : command === "assign"
      ? Effect.map(assignTicket({ id, memberId: text }), (change) => ({ undo: change.undo }))
      : command === "status"
      ? Effect.map(setTicketStatus({ ids: [id], status: text as Status }), (change) => ({ undo: change.undo }))
      : command === "ticket"
      ? Effect.map(
        createTicket({
          title: text || "Uit de chat",
          ...(target !== null && (target.kind === "order" || target.kind === "customer")
            ? { related: { type: target.kind, id: target.id } }
            : {})
        }, { source: "chat", sourceRef: messageId }),
        (change) => ({
          undo: change.undo,
          made: change.tickets[0] === undefined ? undefined : { kind: "ticket" as const, id: change.tickets[0].id }
        })
      )
      : Effect.fail({ _tag: "Unavailable" })
    return Effect.mapError(ran, said)
  }
})

const RefunderLive = Layer.succeed(Refunder, refunder)

const KlaviyoSyncsLive = Layer.succeed(KlaviyoSyncs, { lastSyncOf })

const ReturnParcelsLive = Layer.succeed(ReturnParcels, {
  updated: (returnId, snapshot) => parcelUpdated(returnId, snapshot).pipe(Effect.orDie)
})

/** Every link between slices, and the mirror other slices write through. */
export const SliceLinks = StoreMirror.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MirrorFollowersLive,
      UndoCompensationsLive,
      ProposalLinksLive,
      AgentLinksLive,
      ChatCommandsLive,
      RefunderLive,
      KlaviyoSyncsLive,
      ReturnParcelsLive,
      ShopifyReturnsLive,
      ThreadTicketsLive
    )
  )
)
