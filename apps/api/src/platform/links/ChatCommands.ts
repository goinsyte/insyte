import { ActionFailed, ChatCommands } from "@insyte/modules/chats/Links"
import { cancel as cancelOrders, setNote } from "@insyte/modules/orders/use-cases/commands"
import {
  assign as assignTicket,
  create as createTicket,
  setStatus as setTicketStatus
} from "@insyte/modules/tickets/use-cases/commands"
import { Effect, Layer } from "effect"

/* A chat command → an order's note or cancellation, a ticket made, assigned or moved (M11.4), and its undo. */

type Status = "intake" | "in_progress" | "awaiting_reply" | "done"

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

export const ChatCommandsLive = Layer.succeed(ChatCommands, {
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
