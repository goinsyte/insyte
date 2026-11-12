import type { AreaId } from "./Permissions.ts"

/*
 * The agent's action catalogue (ADR-0027, domain.md §9.6, widgets/04 §G): the eighteen things an agent may ever do,
 * each with the level a workspace starts at (every one at Eerst vragen), whether it may be set to Zelf doen, the area a
 * person needs to take it back, and the compensation a person runs by hand once the undo window is over. A policy can
 * only name what is here; what is not here (deleting records; roles, members, keys, billing, integrations; the
 * autonomy settings themselves) no setting reaches.
 *
 * Pure data, no imports beyond the area ids: the server's `Autonomy.decide` (the `autonomy_decide` function, which
 * holds the same locked list) and the console's matrix read the same entries.
 */

export const AGENT_ACTION_IDS = [
  "SetTicketStatus",
  "SetPriority",
  "AssignTicket",
  "AddNote",
  "ApplyLabel",
  "CreateTicket",
  "SnoozeThread",
  "SendReply",
  "ForwardOrder",
  "CancelOrder",
  "ApproveReturn",
  "SendReturnLabel",
  "MessageSupplier",
  "RequestQualityCheck",
  "PostChatMessage",
  "RefundOrder",
  "SubmitEvidence",
  "AcceptDispute"
] as const
export type AgentActionId = (typeof AGENT_ACTION_IDS)[number]

/** Zelf doen, Eerst vragen, Nooit. */
export const AUTONOMY_LEVELS = ["auto", "ask", "never"] as const
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number]

export interface AgentActionEntry {
  readonly id: AgentActionId
  /** The area whose Bewerken a person needs to take the action back or run its compensation. */
  readonly area: AreaId
  /** Never Zelf doen: the other side cannot take it back (domain.md §9.6). Only `ask` or `never`. */
  readonly locked: boolean
  /** What a person can still do by hand once the window is over, in Dutch; absent where nothing can. */
  readonly compensation?: string
}

export const AGENT_ACTIONS: ReadonlyArray<AgentActionEntry> = [
  { id: "SetTicketStatus", area: "support", locked: false, compensation: "Status terugzetten" },
  { id: "SetPriority", area: "support", locked: false, compensation: "Prioriteit terugzetten" },
  { id: "AssignTicket", area: "support", locked: false, compensation: "Toewijzing weghalen" },
  { id: "AddNote", area: "support", locked: false, compensation: "Notitie verwijderen" },
  { id: "ApplyLabel", area: "support", locked: false, compensation: "Label weghalen" },
  { id: "CreateTicket", area: "support", locked: false, compensation: "Ticket weghalen" },
  { id: "SnoozeThread", area: "support", locked: false, compensation: "Weer tonen" },
  { id: "SendReply", area: "support", locked: false },
  { id: "ForwardOrder", area: "orders", locked: false },
  { id: "CancelOrder", area: "orders", locked: true },
  { id: "ApproveReturn", area: "returns", locked: false },
  { id: "SendReturnLabel", area: "returns", locked: false },
  { id: "MessageSupplier", area: "suppliers", locked: false },
  { id: "RequestQualityCheck", area: "suppliers", locked: false },
  { id: "PostChatMessage", area: "support", locked: false },
  { id: "RefundOrder", area: "orders", locked: true },
  { id: "SubmitEvidence", area: "chargebacks", locked: true },
  { id: "AcceptDispute", area: "chargebacks", locked: true }
]

export const AGENT_ACTION: Record<AgentActionId, AgentActionEntry> = Object.fromEntries(
  AGENT_ACTIONS.map((e) => [e.id, e])
) as Record<AgentActionId, AgentActionEntry>

export const isAgentActionId = (id: string): id is AgentActionId =>
  (AGENT_ACTION_IDS as ReadonlyArray<string>).includes(id)

export type AutonomyLevels = Record<AgentActionId, AutonomyLevel>

/** Every workspace starts here: everything asks first until the operator says otherwise (ADR-0027). */
export const DEFAULT_LEVELS: AutonomyLevels = Object.fromEntries(
  AGENT_ACTION_IDS.map((id) => [id, "ask"])
) as AutonomyLevels

/** A stored policy as a whole one: every entry present, a missing or unknown value at the default. */
export const levelsOf = (stored: Readonly<Record<string, unknown>>): AutonomyLevels =>
  Object.fromEntries(AGENT_ACTION_IDS.map((id) => {
    const v = stored[id]
    return [id, v === "auto" || v === "ask" || v === "never" ? v : DEFAULT_LEVELS[id]]
  })) as AutonomyLevels

/**
 * What Zelf doen may do before it asks after all (ADR-0027 "within limits"): at most so many runs of the action a day,
 * and no more than an amount (minor units) where the action moves one. Past a limit the action becomes a proposal.
 */
export interface ActionLimit {
  readonly perDay?: number | undefined
  readonly maxAmountMinor?: number | undefined
}

/** How long a person can take an agent's action back from the log (ADR-0023): five minutes. */
export const AGENT_UNDO_SECONDS = 5 * 60

/** How long "Toch laten staan" can put an undone action back. */
export const AGENT_REDO_SECONDS = 60
