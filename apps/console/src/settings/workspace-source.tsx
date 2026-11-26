import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { minorDigits } from "@insyte/domain/MinorUnits"
import type { Regional, WorkspaceAccount } from "@insyte/modules/workspaces/domain/Settings"
import type { SaveOutcome } from "@insyte/ui/app/settings/form"
import type {
  AccountFields,
  AccountSource,
  RegionalFields,
  RegionalSource
} from "@insyte/ui/app/settings/workspace-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useState } from "react"
import { ANALYTICS } from "../data/analytics.ts"
import { COSTS } from "../data/costs.ts"
import { FRAME } from "../data/frame.ts"
import { HOME } from "../data/home.ts"
import { LIVE } from "../data/live.ts"
import { storesAtom } from "../data/stores.ts"
import { teamAtom } from "../data/team.ts"
import { WORKSPACE, workspaceWrites } from "../data/workspace.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Account and Regio over `Workspaces.*` (M3.1). The page keeps what the last answer said, so a save shows at once and
 * the unsaved bar goes with it; the route's atom catches up behind. A refusal is said once, in Dutch, from the field the
 * server named; the screen keeps what was typed. The export and deleting the workspace come with M17, so they are left
 * out and the page says they are not there yet.
 */

/** The organisation step's countries, in the design's order, then the two it offers too. */
const COUNTRIES = [
  { value: "NL", label: "Nederland" },
  { value: "BE", label: "België" },
  { value: "DE", label: "Duitsland" },
  { value: "FR", label: "Frankrijk" },
  { value: "GB", label: "Verenigd Koninkrijk" },
  { value: "US", label: "Verenigde Staten" },
  { value: "IT", label: "Italië" },
  { value: "ES", label: "Spanje" }
]

const COPY: RefusalCopy = {
  gone: "Deze werkruimte bestaat niet meer",
  invalid: {
    name: "Geef de werkruimte een naam van hooguit 80 tekens.",
    legalEntity: "De rechtspersoon is hooguit 200 tekens.",
    vatNumber: "Dat btw-nummer klopt niet. Begin met de landcode, zoals NL123456789B01.",
    billingEmail: "Vul een geldig factuur-e-mailadres in.",
    country: "Kies een land uit de lijst.",
    delayHours: "Een late bestelling is 1 tot en met 720 uur oud.",
    disputeAmountMinor: "Een groot geschil begint bij een bedrag van 0 of meer.",
    days: "Kies 30, 90 of 180 dagen.",
    timezone: "Kies een tijdzone uit de lijst.",
    invalid: "Kies een waarde uit de lijst."
  }
}

/** How many decimals the workspace's money has as Insyte stores it (two for the euro, none for the yen), and its sign. */
const moneyOf = (currency: string) => {
  const scale = 10 ** minorDigits(currency)
  try {
    const format = new Intl.NumberFormat("nl-NL", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    return { scale, sign: format.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency }
  } catch {
    return { scale, sign: currency }
  }
}

/** The server's field names as Account names its fields, for a refusal the page marks at the field. */
const PAGE_FIELD: Record<string, string> = {
  name: "workspace",
  legalEntity: "legalEntity",
  vatNumber: "vat",
  billingEmail: "billingEmail",
  country: "country",
  delayHours: "delayHours",
  disputeAmountMinor: "disputeAmount"
}

/** A refusal of the page's own fields, by the page's names; none where the server named something else. */
const pageFields = (error: unknown): Record<string, string> | undefined => {
  const tagged = error as { _tag?: string; fields?: Record<string, string> }
  if (tagged._tag !== "Invalid" || tagged.fields === undefined) return undefined
  const entries = Object.entries(tagged.fields)
  if (entries.length === 0 || entries.some(([field]) => PAGE_FIELD[field] === undefined)) return undefined
  return Object.fromEntries(entries.map(([field, code]) => [PAGE_FIELD[field], code]))
}

const fieldsOf = (doc: WorkspaceAccount): AccountFields => ({
  workspace: doc.name,
  legalEntity: doc.legalEntity,
  vat: doc.vatNumber,
  billingEmail: doc.billingEmail,
  country: doc.country
})

/** The doc the page shows: the last answer, or the route's atom when it has a newer one. */
function useLatest<A>(saved: A): readonly [A, (next: A) => void] {
  const [latest, setLatest] = useState(saved)
  useEffect(() => setLatest(saved), [saved])
  return [latest, setLatest] as const
}

export function useConsoleAccountSource(saved: WorkspaceAccount): AccountSource {
  const [doc, setDoc] = useLatest(saved)
  const manage = useGate("settings", 3)
  const team = Option.getOrUndefined(AsyncResult.value(useAtomValue(teamAtom)))
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom)))
  const write = {
    saveAccount: useAtomSet(workspaceWrites.saveAccount, { mode: "promiseExit" }),
    setAlerts: useAtomSet(workspaceWrites.setAlerts, { mode: "promiseExit" }),
    setRetention: useAtomSet(workspaceWrites.setRetention, { mode: "promiseExit" })
  }
  const money = moneyOf(doc.currency)
  const account = useMemo(() => fieldsOf(doc), [doc])
  const alerts = useMemo(
    () => ({ delayHours: doc.alerts.delayHours, disputeAmount: doc.alerts.disputeAmountMinor / money.scale }),
    [doc, money.scale]
  )
  // A refused field is said under it on the page; anything else once, here.
  const took = (exit: Exit.Exit<WorkspaceAccount, unknown>): SaveOutcome => {
    if (Exit.isFailure(exit)) {
      const error = failureOf(exit)
      const fields = pageFields(error)
      if (fields !== undefined) return { fields }
      sayRefusal(error, COPY)
      return false
    }
    setDoc(exit.value)
    return true
  }
  return {
    account,
    countries: COUNTRIES,
    alerts,
    disputePrefix: money.sign,
    retentionDays: doc.retentionDays,
    members: team === undefined ? null : team.members.length,
    stores: stores === undefined
      ? null
      : { connected: stores.filter((s) => s.status === "connected").length, total: stores.length },
    manage,
    saveAccount: async (next) =>
      took(
        await write.saveAccount({
          payload: {
            name: next.workspace,
            legalEntity: next.legalEntity,
            vatNumber: next.vat,
            billingEmail: next.billingEmail,
            country: next.country
          },
          // The name is in the frame's store selector too.
          reactivityKeys: [...WORKSPACE, ...FRAME]
        })
      ),
    setAlerts: async (next) =>
      took(
        await write.setAlerts({
          payload: {
            delayHours: next.delayHours,
            disputeAmountMinor: Math.round(next.disputeAmount * money.scale)
          },
          reactivityKeys: [...WORKSPACE]
        })
      ),
    setRetention: async (days) =>
      took(await write.setRetention({ payload: { days }, reactivityKeys: [...WORKSPACE] })) === true
  }
}

const regionalFieldsOf = (doc: Regional): RegionalFields => ({
  language: doc.language,
  currency: doc.currencyDisplay,
  dateFormat: doc.dateFormat,
  timeFormat: doc.timeFormat,
  weekStart: doc.weekStart,
  timezone: doc.timezone
})

export function useConsoleRegionalSource(saved: Regional): RegionalSource {
  const [doc, setDoc] = useLatest(saved)
  const write = useAtomSet(workspaceWrites.saveRegional, { mode: "promiseExit" })
  const fields = useMemo(() => regionalFieldsOf(doc), [doc])
  return {
    saved: fields,
    save: async (next) => {
      const exit = await write({
        payload: {
          language: next.language,
          currencyDisplay: next.currency,
          dateFormat: next.dateFormat,
          timeFormat: next.timeFormat,
          weekStart: next.weekStart,
          timezone: next.timezone
        },
        // The frame carries the notation; Start, Analyse, Kosten and Live count in the reporting currency.
        reactivityKeys: [...WORKSPACE, ...FRAME, ...HOME, ...ANALYTICS, ...COSTS, ...LIVE]
      })
      if (Exit.isFailure(exit)) {
        sayRefusal(failureOf(exit), COPY)
        return false
      }
      setDoc(exit.value)
      return true
    }
  }
}
