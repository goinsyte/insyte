import { type ComponentType, createContext, useContext } from "react"
import type {
  Carrier,
  ReasonDef,
  Resolution,
  ReturnItem,
  ReturnRecord,
  ReturnSettings,
  RuleKind,
  WindowCheck
} from "../lib/returns"
import type { TeamGate } from "../orders/source"

/**
 * What the returns screens read and do, from whoever hosts them (as `suppliers/source.tsx` is for the suppliers page):
 * the design app from its returns store, the console from `Returns.*` (M9.1). The markup is the design's; what the host
 * cannot do yet is absent and left out (labels until they are made, the portal until it is public, the agents' plate),
 * never made up. Money is in major units, times are ISO strings, as `lib/returns.ts` has them.
 */

export type { TeamGate }

/** What a change said, with its Undo where it has one. */
export type Said = { label: string; detail?: string | undefined }

/** The gates the screens grey their controls out by. */
export interface ReturnGates {
  /** Retouren · Bewerken: labels, receiving, checking, assigning, settling. */
  work: TeamGate
  /** Retouren goedkeuren: approving, rejecting, reopening. */
  approve: TeamGate
  /** Retouren · Beheren: the settings. */
  manage: TeamGate
}

/** Every change to a return, as the screens ask for them; the host says what it did. */
export interface ReturnCommands {
  approve: (ids: ReadonlyArray<string>, said: Said, keepItem?: boolean) => void
  reject: (ids: ReadonlyArray<string>, reason: string, said: Said) => void
  reopen: (id: string, said: Said) => void
  receive: (id: string, said: Said) => void
  /** "Gecontroleerd, in orde". */
  inspect: (id: string, said: Said) => void
  /** `null` takes the assignment away. */
  assign: (ids: ReadonlyArray<string>, memberId: string | null, said: Said) => void
  /** "Label versturen"; absent, there are no labels yet. */
  sendLabel?: ((ids: ReadonlyArray<string>, said: Said) => void) | undefined
  /** "Tracking invullen" ("zelf versturen"): the carrier and tracking number the shopper sent their parcel with. */
  addTracking?: ((id: string, parcel: { carrier: Carrier; tracking: string }, said: Said) => void) | undefined
  /** A carrier's scan, simulated; only the design app has one. */
  scan?: ((r: ReturnRecord, said: Said) => void) | undefined
  /** Afhandelen with anything but a refund: the host says what it made. */
  settle: (r: ReturnRecord, kind: Resolution, amount: number) => void
  /** The refund, once confirmed: it cannot be taken back. */
  refund: (r: ReturnRecord, amount: number) => void
}

/** The order a return is started for. */
export type StartOrder = { id: string; number: string; customer_name: string }

/** One of its lines, as "Retour starten" offers it. */
export type StartLine = { id: string; label: string; title: string; image?: string | undefined }

/** "Retour starten": the lines picked, why, and what the shopper wants. */
export type StartDraft = { orderId: string; lines: ReadonlyArray<string>; reason: string; want: Resolution; note: string }

export interface ReturnsListSource {
  /** The queue, in the stores the role reaches. */
  records: Array<ReturnRecord>
  /** Not one return yet: the first day's page. */
  none: boolean
  reasons: ReadonlyArray<ReasonDef>
  portal: { on: boolean; handle: string }
  /** The public portal's address; absent while there is none to open. */
  portalHref?: ((handle: string) => string) | undefined
  members: ReadonlyArray<{ id: string; name: string }>
  /** The viewer's member id: "Aan mij toewijzen". */
  meId: string
  /** The Winkel facet. */
  stores: ReadonlyArray<{ value: string; label: string }>
  commands: ReturnCommands
  gates: ReturnGates
  /** "Retour starten" from the list: the order first, then the dialog. */
  Pick: ComponentType<{ open: boolean; onClose: () => void; onPick: (o: StartOrder) => void }>
  Start: ComponentType<{ order: StartOrder; open: boolean; onClose: () => void }>
}

/** One return as its page shows it: the record and what the rules say about it. */
export type ReturnView = {
  record: ReturnRecord
  reasonLabel: string
  photoRequired: boolean
  window: WindowCheck
  rule: { kind: RuleKind; note: string } | undefined
  /** What it may be settled with. */
  offered: ReadonlyArray<Resolution>
  /** The shopper's other returns. */
  earlier: number
  address: { address: string; carrier: Carrier } | undefined
  assignee: { id: string; name: string } | undefined
  imageOf: (item: ReturnItem) => string | undefined
  /** Where the label's PDF can be opened; absent where there is none to download. */
  labelHref?: string | undefined
  /**
   * True while the host is still reading it (opened from the list, the header is the row it already has); absent where
   * the body arrives at the reference's simulated pace (the design app).
   */
  arriving?: boolean | undefined
}

export interface ReturnDetailSource {
  /** The return, or `undefined` when there is none by that id. */
  useView: (id: string | undefined) => ReturnView | undefined
  commands: ReturnCommands
  gates: ReturnGates
  meId: string
  /** The viewer's role, for the refund's confirmation. */
  role: { label: string; refundLimit: number | null }
  /** Whether the role may refund this much. */
  useRefundGate: (amount: number) => TeamGate
  /** What the resolution picker prices with. */
  money: Pick<ReturnSettings, "giftCardBonus" | "exchangeFee">
  /** The agents' proposal on top and their rows in the history; absent where there are no agents yet. */
  agents?: { Proposal: ComponentType<{ view: ReturnView }>; Rows: ComponentType<{ id: string }> } | undefined
}

export interface ReturnSettingsSource {
  saved: ReturnSettings
  save: (next: ReturnSettings, said: Said) => void
  gate: TeamGate
  /** What a product rule can name. */
  products: ReadonlyArray<{ id: string; title: string }>
  portalHref?: ((handle: string) => string) | undefined
}

const ListContext = createContext<ReturnsListSource | null>(null)
const DetailContext = createContext<ReturnDetailSource | null>(null)
const SettingsContext = createContext<ReturnSettingsSource | null>(null)

export const ReturnsListSourceProvider = ListContext.Provider
export const ReturnDetailSourceProvider = DetailContext.Provider
export const ReturnSettingsSourceProvider = SettingsContext.Provider

export function useReturnsListSource(): ReturnsListSource {
  const source = useContext(ListContext)
  if (source === null) throw new Error("The returns list needs a ReturnsListSourceProvider around it.")
  return source
}

export function useReturnDetailSource(): ReturnDetailSource {
  const source = useContext(DetailContext)
  if (source === null) throw new Error("A return's page needs a ReturnDetailSourceProvider around it.")
  return source
}

export function useReturnSettingsSource(): ReturnSettingsSource {
  const source = useContext(SettingsContext)
  if (source === null) throw new Error("The returns settings need a ReturnSettingsSourceProvider around it.")
  return source
}
