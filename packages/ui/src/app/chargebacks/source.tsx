import { type ComponentType, createContext, useContext } from "react"
import type { Chargeback, Currency } from "../lib/types/domain"
import type { IndexItem } from "../marketing-sections/link-index"

/**
 * What the chargeback screens read and do, from whoever hosts them (as `returns/source.tsx` is for returns): the design
 * app from its workspace store, the console from `Chargebacks.*` (M13). The markup is the design's. What the host
 * cannot do yet is absent and the screen says so, never made up: submitting a pack waits for the payment connections. Money is in major units, times are ISO strings, as `lib/types/domain.ts` has them.
 */

/** "Nieuw bewijspakket", as the dialog has it: the reason is one of `REASONS`, by its Dutch label. */
export type NewChargebackInput = {
  case_number: string
  customer_name: string
  provider: Chargeback["provider"]
  amount: number
  reason: string
  notes: string
}

/** Every change to a case, as the screens ask for them; the host says what it did. */
export interface ChargebackCommands {
  /** "Zaak aanmaken": true once it is made, so the dialog closes; false keeps what was typed. */
  create: (input: NewChargebackInput) => Promise<boolean>
  /** "Bewijs toevoegen": the files into the case's pack, with Undo. */
  attach: (c: Chargeback, files: ReadonlyArray<File>) => void
  /** The pack's file at `index` out, with Undo. */
  remove: (c: Chargeback, index: number) => void
  /** Accepting as lost, once confirmed: it cannot be taken back. */
  accept: (cases: ReadonlyArray<Chargeback>) => void
  /** "Indienen bij {aanbieder}"; absent where no payment connection takes it yet. */
  submit?: ((cases: ReadonlyArray<Chargeback>) => void) | undefined
  /** "Bewijspakket samenstellen"; absent where Insyte cannot gather the evidence yet. */
  draw?: ((id: string) => Promise<void>) | undefined
  /** "Notities": the case's note for the team; true once it is kept, false keeps what was typed. */
  note: (c: Chargeback, note: string) => Promise<boolean>
}

/** A pack being gathered where the host does it out of sight: how far it got. */
export type PackProgress = { building: boolean; done: number; total: number }

export interface ChargebacksListSource {
  cases: Array<Chargeback>
  /** The header's standing, counted from the cases on file. */
  standing: { open: number; wonPct: number; recovered: number; currency?: Currency | undefined }
  /** The number "Nieuw bewijspakket" prefills. */
  nextCaseNumber: string
  /** What a case opened by hand is in. */
  currency: Currency
  commands: ChargebackCommands
  /** The first day's places to start; absent, the empty page lists none. */
  starts?: Array<IndexItem> | undefined
  /** The list's foot; absent where the host has none. */
  Closing?: ComponentType<{ empty: boolean }> | undefined
}

export interface ChargebackDetailSource {
  /** The case, or `undefined` when there is none by that id. */
  useCase: (id: string) => Chargeback | undefined
  /** The record the pack plate shows: won out of decided. */
  record: { won: number; decided: number }
  commands: ChargebackCommands
  /** Why "Indienen" cannot go yet, where `submit` is absent. */
  submitUnavailable?: ((c: Chargeback) => string) | undefined
  /** The case's pack as the host gathers it; absent where the screen's own wait is all there is. */
  pack?: ((c: Chargeback) => PackProgress | undefined) | undefined
  /** Where the pack's file at `index` opens; absent where there is nothing to open. */
  fileHref?: ((c: Chargeback, index: number) => string | undefined) | undefined
}

const ListContext = createContext<ChargebacksListSource | null>(null)
const DetailContext = createContext<ChargebackDetailSource | null>(null)

export const ChargebacksListSourceProvider = ListContext.Provider
export const ChargebackDetailSourceProvider = DetailContext.Provider

export function useChargebacksListSource(): ChargebacksListSource {
  const source = useContext(ListContext)
  if (source === null) throw new Error("The chargebacks list needs a ChargebacksListSourceProvider around it.")
  return source
}

export function useChargebackDetailSource(): ChargebackDetailSource {
  const source = useContext(DetailContext)
  if (source === null) throw new Error("A chargeback's page needs a ChargebackDetailSourceProvider around it.")
  return source
}

/** The reasons "Nieuw bewijspakket" offers, in the design's order and words. */
export const REASONS = [
  "Niet-geautoriseerde transactie",
  "Niet ontvangen",
  "Verkeerd artikel verzonden",
  "Product niet zoals beschreven",
  "Terugbetaling aangevraagd",
  "Service niet naar tevredenheid",
  "Betalingsgeschil"
] as const
