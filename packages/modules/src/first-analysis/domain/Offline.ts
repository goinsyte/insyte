import type { AgentActionId } from "@insyte/domain/AgentActions"
import type { Hours, OfflineLevel, OfflineWindow } from "./FirstAnalysis.ts"

/*
 * The offline plan (M15 step 5; widgets/01 `offline`, ADR-0027): what Insyte does while nobody is online, as levels
 * of the autonomy policy for the routine actions the step lists, and the opening hours the window implies for the
 * customer agent. The step sets only these actions and only to Zelf doen or Eerst vragen; a locked action stays on
 * Eerst vragen, which `Autonomy.set` enforces. Pure, so the rules are tested without a database.
 */

/** What the offline step lists, in its order (`lib/first-analysis.ts` `OFFLINE_ACTIONS`). */
export const OFFLINE_ACTIONS: ReadonlyArray<AgentActionId> = [
  "ForwardOrder",
  "ApplyLabel",
  "SendReply",
  "ApproveReturn",
  "RefundOrder"
]

/** The step's rows for these answers: forwarding only when someone else ships. */
export const offlineActionsFor = (answers: Readonly<Record<string, string>> | null): ReadonlyArray<AgentActionId> =>
  OFFLINE_ACTIONS.filter((id) => id !== "ForwardOrder" || answers?.["fulfilment"] !== "self")

/**
 * The levels to write: the step's own actions only, forwarding dropped when the operator ships themselves. `unknown`
 * names what the step does not list, which the plan refuses rather than drops.
 */
export const offlineLevelsOf = (
  levels: Readonly<Record<string, OfflineLevel>>,
  answers: Readonly<Record<string, string>> | null
): { readonly levels: Partial<Record<AgentActionId, OfflineLevel>>; readonly unknown: ReadonlyArray<string> } => {
  const listed = new Set<string>(OFFLINE_ACTIONS)
  const kept = new Set<string>(offlineActionsFor(answers))
  return {
    levels: Object.fromEntries(Object.entries(levels).filter(([id]) => kept.has(id))),
    unknown: Object.keys(levels).filter((id) => !listed.has(id))
  }
}

const day = (open: boolean, to: string): Hours => ({ open, from: "09:00", to })

/** The customer agent's opening hours for an offline window, Monday first: open is when someone is online. */
export const hoursFor = (w: OfflineWindow): ReadonlyArray<Hours> => {
  if (w === "late") return [...Array.from({ length: 6 }, () => day(true, "22:00")), day(false, "22:00")]
  if (w === "shifts") return Array.from({ length: 7 }, () => day(true, "23:59"))
  return [...Array.from({ length: 5 }, () => day(true, "18:00")), day(false, "18:00"), day(false, "18:00")]
}
