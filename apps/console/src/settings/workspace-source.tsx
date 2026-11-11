import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Regional, WorkspaceAccount } from "@insyte/modules/workspaces/domain/Settings"
import type {
  AccountFields,
  AccountSource,
  RegionalFields,
  RegionalSource
} from "@insyte/ui/app/settings/workspace-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useState } from "react"
import { FRAME } from "../data/frame.ts"
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

/** How many decimals the workspace's money has (two for the euro, none for the yen), and its sign. */
const moneyOf = (currency: string) => {
  try {
    const format = new Intl.NumberFormat("nl-NL", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    const sign = format.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency
    return { scale: 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2), sign }
  } catch {
    return { scale: 100, sign: currency }
  }
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
  const took = (exit: Exit.Exit<WorkspaceAccount, unknown>) => {
    if (Exit.isFailure(exit)) {
      sayRefusal(failureOf(exit), COPY)
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
    setRetention: async (days) => took(await write.setRetention({ payload: { days }, reactivityKeys: [...WORKSPACE] }))
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
        reactivityKeys: [...WORKSPACE]
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
