import { createContext, type ReactNode, useContext } from "react"
import type { TeamGate } from "../orders/source"
import type { SaveOutcome } from "./form"

/**
 * What Instellingen → Account and Regio read and do, from whoever hosts them (as `returns/source.tsx` is for the
 * returns screens): the design app from its workspace and settings stores, the console from `Workspaces.*` (M3.1). The
 * markup is the design's. A write answers whether it took; the host says why it did not, and the screen keeps what was
 * typed. What the host cannot do yet is absent, and the screen says so rather than pretending.
 */

/** The Werkruimte card's fields, as the design's workspace store keeps them. */
export interface AccountFields {
  workspace: string
  legalEntity: string
  vat: string
  billingEmail: string
  country: string
}

/** "Late bestelling" after so many hours, "Groot geschil" from this amount, in whole units of the workspace's money. */
export interface AlertFields {
  delayHours: number
  disputeAmount: number
}

export type RetentionDays = 30 | 90 | 180

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i

/**
 * What is wrong with the Werkruimte and Meldingen fields, said under each: the server's rules (`checkAccount`,
 * `checkAlerts`) checked as they are typed, so a save it would refuse does not go out. The thresholds are kept as text
 * while typed (digits only), so an empty one is wrong rather than 0.
 */
export function accountErrors(
  account: Pick<AccountFields, "workspace" | "legalEntity" | "billingEmail">,
  alerts: { delayHours: string; disputeAmount: string }
): Record<string, string> {
  const out: Record<string, string> = {}
  const name = account.workspace.trim()
  if (name === "") out["workspace"] = "Geef de werkruimte een naam."
  else if (name.length > 80) out["workspace"] = `Hoogstens 80 tekens; dit zijn er ${name.length}.`
  const legal = account.legalEntity.trim()
  if (legal.length > 200) out["legalEntity"] = `Hoogstens 200 tekens; dit zijn er ${legal.length}.`
  const email = account.billingEmail.trim()
  if (email !== "" && (email.length > 254 || !EMAIL.test(email))) {
    out["billingEmail"] = "Een e-mailadres als facturen@jouwbedrijf.nl."
  }
  const hours = Number(alerts.delayHours)
  if (alerts.delayHours.trim() === "" || !Number.isInteger(hours) || hours < 1) {
    out["delayHours"] = "Vul een aantal uren in, 1 of meer."
  } else if (hours > 720) out["delayHours"] = "Hoogstens 720 uur, dat is 30 dagen."
  const amount = Number(alerts.disputeAmount)
  if (alerts.disputeAmount.trim() === "" || !(amount >= 0)) out["disputeAmount"] = "Vul een bedrag in, 0 of meer."
  return out
}

export interface AccountSource {
  account: AccountFields
  /** What "Land" offers: the stored value and the name the operator reads. */
  countries: ReadonlyArray<{ value: string; label: string }>
  alerts: AlertFields
  /** The sign before "Groot geschil"'s amount. */
  disputePrefix: string
  retentionDays: RetentionDays
  /** Who is on the team, for "Team en rollen"; `null` where the role cannot see the team. */
  members: number | null
  /** The stores and how many are connected, for "Winkels"; `null` where the role cannot see them. */
  stores: { connected: number; total: number } | null
  /** Instellingen · Beheren: what a closed store keeps. The page's own fields go by the settings sheet's read-only line. */
  manage: TeamGate
  /** Saved, not saved (the host said why), or refused per field, named as the page names its fields. */
  saveAccount: (next: AccountFields) => Promise<SaveOutcome>
  setAlerts: (next: AlertFields) => Promise<SaveOutcome>
  setRetention: (days: RetentionDays) => Promise<boolean>
  /** "Je data downloaden"; absent until the export exists. */
  download?: (() => void) | undefined
  /** "Werkruimte verwijderen", once confirmed, with what the dialog says first; absent until deletion exists. */
  remove?: { note: ReactNode; confirm: () => void } | undefined
}

/** Taal en notatie, as codes (`workspaces.regional`, and the timezone). */
export interface RegionalFields {
  language: string
  currency: string
  dateFormat: string
  timeFormat: string
  weekStart: string
  timezone: string
}

export interface RegionalSource {
  saved: RegionalFields
  save: (next: RegionalFields) => Promise<boolean>
}

const AccountContext = createContext<AccountSource | null>(null)
const RegionalContext = createContext<RegionalSource | null>(null)

export function AccountSourceProvider({ value, children }: { value: AccountSource; children: ReactNode }) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function RegionalSourceProvider({ value, children }: { value: RegionalSource; children: ReactNode }) {
  return <RegionalContext.Provider value={value}>{children}</RegionalContext.Provider>
}

export function useAccountSource(): AccountSource {
  const source = useContext(AccountContext)
  if (source === null) throw new Error("useAccountSource outside an AccountSourceProvider")
  return source
}

export function useRegionalSource(): RegionalSource {
  const source = useContext(RegionalContext)
  if (source === null) throw new Error("useRegionalSource outside a RegionalSourceProvider")
  return source
}
