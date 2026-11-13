import { Conflict } from "@insyte/domain/Errors"
import type { AgentEffect } from "@insyte/modules/agent/domain/AgentLog"
import { AgentLinks } from "@insyte/modules/agent/Links"
import type { ProposalAction } from "@insyte/modules/proposals/domain/Proposals"
import { Labels } from "@insyte/modules/returns/domain/Ports"
import { setAside } from "@insyte/modules/tickets/use-cases/commands"
import { Effect, Layer } from "effect"
import { filed } from "./ProposalLinks.ts"
import { compensations } from "./UndoCompensations.ts"

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

export const AgentLinksLive = Layer.effect(
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
