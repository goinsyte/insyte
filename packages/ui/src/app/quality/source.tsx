import { type ComponentType, createContext, useContext } from "react"
import type { CheckKind, Complaint, Deliverable, Phase, QualityCheck } from "../lib/quality"
import type { Product } from "../lib/types/domain"
import type { TeamGate } from "../orders/source"

/**
 * What a product's Kwaliteit tab reads and does, from whoever hosts it (as `returns/source.tsx` is for the returns
 * screens): the design app from its quality store, the console from `Quality.*` (M9.4). The markup is the design's;
 * what the host cannot do yet is absent and left out (a ticket with the supplier until tickets exist, the agents'
 * plate, files shared by the supplier). Times are ISO strings, as `lib/quality.ts` has them.
 */

export type { TeamGate }

/** What a change said, with its Undo where it has one. */
export type Said = { label: string; detail?: string | undefined }

export type QualityPicture = {
  checks: ReadonlyArray<QualityCheck>
  complaints: ReadonlyArray<Complaint>
  phase: Phase
  /** Units sold in the last 90 days, and the complaints among them as a fraction. */
  sold: number
  rate: number
  threshold: number
  supplier: { id: string; name: string } | null
  /** The sizes to ask about and filter by. */
  sizes: ReadonlyArray<string>
  /** Files the supplier shared on the product (the partner portal's). */
  media: ReadonlyArray<{ at: string; name: string; by: string }>
}

export type CheckDraft = {
  kind: CheckKind
  variants: ReadonlyArray<string>
  deliver: ReadonlyArray<Deliverable>
  due: string
  note: string
}

export interface QualityCommands {
  request: (productId: string, draft: CheckDraft, said: Said) => void
  approve: (id: string, said: Said) => void
  /** With a reason; `watch` puts the product under watch, `ticket` opens one with the supplier where the host can. */
  reject: (id: string, input: { reason: string; watch: boolean; ticket: boolean }, said: Said) => void
  setPhase: (productId: string, phase: Phase, said: Said) => void
}

export interface QualitySource {
  /** The product's picture; `undefined` while it is read. */
  usePicture: (productId: string) => QualityPicture | undefined
  commands: QualityCommands
  gates: { request: TeamGate; judge: TeamGate; phase: TeamGate }
  /** Whether a rejection can open a ticket with the supplier. */
  tickets: boolean
  /** How the supplier hears of a check, for the request dialog and the drawer. */
  reach: "portal" | "link"
  /** The supplier's link to a check, copied for them; absent where the supplier answers in its portal. */
  copyLink?: ((id: string) => void) | undefined
  /** The agents' plate under the figures; absent where there are no agents yet. */
  Agents?: ComponentType<{ product: Product; picture: QualityPicture }> | undefined
}

const QualityContext = createContext<QualitySource | null>(null)

export const QualitySourceProvider = QualityContext.Provider

export function useQualitySource(): QualitySource {
  const source = useContext(QualityContext)
  if (source === null) throw new Error("The Kwaliteit tab needs a QualitySourceProvider around it.")
  return source
}
