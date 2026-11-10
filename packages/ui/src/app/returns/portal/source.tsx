import { createContext, type ReactNode, useContext } from "react"
import type { Carrier, Resolution, ReturnKind, ReturnStatus, RuleKind } from "../../lib/returns"
import type { Currency } from "../../lib/types/domain"

/**
 * What the public returns portal reads and does, from whoever hosts it (as `returns/source.tsx` is for the console's
 * returns screens): the design app from its stores, the console from `Portal.*` (M9.3). The markup is the design's.
 * Whether a line may go back is the host's to say, as facts; the screen writes the sentence. Money is in major units,
 * times are ISO strings.
 */

export type PortalReason = { id: string; label: string; claim: boolean; photoRequired: boolean }

/** The store's page before any order. */
export type PortalStoreView = {
  name: string
  on: boolean
  intro: string
  done: string
  returnDays: number
  claimDays: number
  reasons: ReadonlyArray<PortalReason>
  offered: ReadonlyArray<Resolution>
  giftCardBonus: number
  claimSteps: ReadonlyArray<string>
}

/** Why a line cannot go back for a kind. */
export type LineRefusal =
  | { kind: "taken"; number: string; status: ReturnStatus }
  | { kind: "not_delivered" }
  | { kind: "window"; days: number; closesOn: string }
  | { kind: "rule"; note: string }

export type PortalLine = {
  id: string
  title: string
  variantTitle: string
  unitPrice: number
  image?: string | undefined
  return: LineRefusal | null
  claim: LineRefusal | null
  rule: { kind: RuleKind; note: string } | null
  /** What it can be exchanged to. */
  exchange: ReadonlyArray<string>
}

export type PortalOrderView = {
  number: string
  firstName: string
  deliveredAt: string | null
  currency: Currency
  open: { number: string; status: ReturnStatus; labelCarrier: Carrier | null } | null
  lines: ReadonlyArray<PortalLine>
}

export type LookupProblem = "not_found" | "rate_limited" | "human_check" | "failed"

export type PortalPhoto = { id: string; name: string; url: string }

export type PortalRequest = {
  kind: ReturnKind
  lineIds: ReadonlyArray<string>
  reasonId: string
  note: string
  photoIds: ReadonlyArray<string>
  resolution: Resolution
  exchangeTo?: string | undefined
}

export type PortalMade = {
  number: string
  kind: ReturnKind
  requested: Resolution
  exchangeTo: string | null
  /** Whether a confirmation went to the shopper's address. */
  mailed: boolean
}

/** Why a request did not go in; `expired` sends the shopper back to finding their order. */
export type SubmitProblem =
  | { kind: "expired" }
  | { kind: "line"; lineId: string }
  | { kind: "photo" }
  | { kind: "resolution" }
  | { kind: "rate_limited" }
  | { kind: "failed" }

export interface PortalSource {
  /** `null`: no store has this address. */
  store: PortalStoreView | null
  /** "In de demo: …": which orders to try, under the form. The design reference only. */
  hints?: ReactNode
  /** How the store's order numbers look, in the number field. */
  numberPlaceholder?: string | undefined
  lookup: (
    number: string,
    email: string,
    human: string | undefined
  ) => Promise<{ ok: true; order: PortalOrderView } | { ok: false; problem: LookupProblem }>
  /** Photos for the request, kept as they are picked; the ones that did not go up are left out, and why. */
  addPhotos: (
    files: ReadonlyArray<File>
  ) => Promise<{ photos: ReadonlyArray<PortalPhoto>; problem?: "type" | "size" | "failed" | undefined }>
  submit: (request: PortalRequest) => Promise<{ ok: true; made: PortalMade } | { ok: false; problem: SubmitProblem }>
}

const PortalContext = createContext<PortalSource | null>(null)

export const PortalSourceProvider = PortalContext.Provider

export function usePortalSource(): PortalSource {
  const source = useContext(PortalContext)
  if (source === null) throw new Error("The returns portal needs a PortalSourceProvider around it.")
  return source
}
