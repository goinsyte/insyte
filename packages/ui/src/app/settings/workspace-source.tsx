import { createContext, type ReactNode, useContext } from "react"
import type { TeamGate } from "../orders/source"

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
  saveAccount: (next: AccountFields) => Promise<boolean>
  setAlerts: (next: AlertFields) => Promise<boolean>
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
