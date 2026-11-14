import { Db } from "@insyte/database/Db"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { assemblePack } from "@insyte/modules/chargebacks/use-cases/pack"
import { forward as forwardLegs } from "@insyte/modules/forwarding/use-cases/commands"
import { cancel as cancelOrders, setNote, tag as tagOrders } from "@insyte/modules/orders/use-cases/commands"
import { notifyDelay } from "@insyte/modules/orders/use-cases/delay-mail"
import { refund as refundOrder } from "@insyte/modules/orders/use-cases/refund"
import type { ProposalAction } from "@insyte/modules/proposals/domain/Proposals"
import { ProposalLinks } from "@insyte/modules/proposals/Links"
import { approve as approveCheck } from "@insyte/modules/quality/use-cases/quality"
import { decideIn, refreshIn } from "@insyte/modules/queue/Queue"
import { Labels, Refunder } from "@insyte/modules/returns/domain/Ports"
import type { ResolveInput } from "@insyte/modules/returns/domain/Returns"
import {
  approve as approveReturns,
  resolve as resolveReturn,
  sendLabel as sendReturnLabel
} from "@insyte/modules/returns/use-cases/commands"
import type { UndoTicket } from "@insyte/modules/shared/domain/Undo"
import { inScope } from "@insyte/modules/shared/use-cases/StoreScope"
import type {
  CreateInput as TicketCreateInput,
  UpdateInput as TicketUpdateInput
} from "@insyte/modules/tickets/domain/Tickets"
import {
  assign as assignTicket,
  create as createTicket,
  setStatus as setTicketStatus,
  unassign as unassignTicket,
  update as updateTicket
} from "@insyte/modules/tickets/use-cases/commands"
import { comment as commentTicket } from "@insyte/modules/tickets/use-cases/comment"
import { Effect, Layer } from "effect"
import type { SqlError } from "effect/sql"
import { refunder } from "./Refunder.ts"

/*
 * A filed plate → the command it carries (a return or a quality check approved, the shopper's delay mail put in
 * line, a reorder ticket opened), as the person, and the queue brought in line on the same transaction (M10.2).
 */

type Status = "intake" | "in_progress" | "awaiting_reply" | "done"

type AgentAsked = Exclude<
  ProposalAction,
  {
    readonly _tag:
      | "ApproveReturn"
      | "ApproveQualityCheck"
      | "NotifyDelayedOrder"
      | "CreateSupplierTicket"
      | "AssembleEvidencePack"
      | "ReconnectStore"
  }
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

/**
 * "Opnieuw koppelen bij Shopify": only a member with Instellingen · Beheren can approve the app again, in a browser, so
 * filing checks that and that the store still has no link; the console then sends them to Shopify
 * (`Stores.beginConnect`). The row resolves when the store is connected again.
 */
const reconnect = (storeId: string) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    yield* Policy.require("settings", 3)
    if (principal.kind !== "member") {
      return yield* new Forbidden({ permission: "settings", level: 3, roleLabel: principal.role.label })
    }
    const db = yield* Db
    const [store] = yield* db.scoped((sql) =>
      Effect.flatMap(
        inScope(sql, "id"),
        (scope) => sql<{ status: string }>`select status from stores where id = ${storeId} and ${scope}`
      )
    )
    if (store === undefined) return yield* new NotFound({ entity: "store", id: storeId })
    if (store.status !== "disconnected" && store.status !== "action_required") return "stale" as const
    return { undo: null, pending: false, settles: true }
  })

/** A filed plate's command, as the person filing it (and an agent's action run again by the person, M15 step 6). */
export const filed = (labels: Labels["Service"]) => (action: ProposalAction) => {
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
    case "AssembleEvidencePack":
      // The pack is gathered by its workflow; the case still needs the person to submit it, so its row stands.
      return assemblePack({ ids: [action.chargebackId] }).pipe(
        Effect.map(() => ({ undo: null, pending: false, settles: true })),
        Effect.catchTag("CaseClosed", () => Effect.succeed("stale" as const))
      )
    case "ReconnectStore":
      return reconnect(action.storeId)
    default:
      return agentAsked(action, labels)
  }
}

export const ProposalLinksLive = Layer.effect(
  ProposalLinks,
  Effect.map(Effect.service(Labels), (labels) => ({ run: filed(labels), refreshQueue: refreshIn, decideRow: decideIn }))
)
