import { useAtomSet } from "@effect/atom-react"
import type { Inventory, PrivacyRequests } from "@insyte/modules/privacy/domain/Privacy"
import type { DataSource } from "@insyte/ui/app/settings/data-source"
import { Exit } from "effect"
import { toast } from "sonner"
import { PRIVACY, privacyWrites } from "../data/privacy.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Je gegevens over `Privacy.*` and `Workspaces.*` (M17 step 5, PLAN 48). Every write names `PRIVACY`, so the page reads
 * again; an export or a shopper's package that the background finishes arrives as `records.changed` (`gdpr_request`),
 * which names it too. A write that did not take says the server's reason once and answers false.
 */

const COPY: RefusalCopy = {
  gone: "Dat verzoek bestaat niet meer",
  conflicts: {
    deletion_waiting: ["Verwijderen loopt al", "De werkruimte wordt al verwijderd. Je kunt het hieronder stoppen."],
    no_deletion: ["Er loopt geen verwijdering", "De werkruimte wordt niet verwijderd."],
    purging: ["Verwijderen is al begonnen", "De werkruimte wordt nu verwijderd. Dat kan niet meer worden gestopt."]
  },
  invalid: { mismatch: "De naam klopt niet met die van de werkruimte." },
  other: (tagged) => {
    switch (tagged._tag) {
      case "Forbidden":
        if (tagged["permission"] !== "owner") return false
        toast.error("Alleen de eigenaar kan dit", {
          description: "Exporteren, automatisch exporteren en verwijderen zijn van de eigenaar van de werkruimte."
        })
        return true
      case "ShopperNotFound":
        toast.error("Geen klant met dat e-mailadres", {
          description: "Insyte vond het adres in geen van je winkels. Kijk het nog eens na."
        })
        return true
      default:
        return false
    }
  }
}

const keys = { reactivityKeys: PRIVACY }

const href = (fileId: string | null) => (fileId === null ? null : `/api/files/${fileId}`)

/** Whether a write took; when not, the server's reason said once. */
const took = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) return true
  sayRefusal(failureOf(exit), COPY)
  return false
}

export function useConsoleDataSource(inventory: Inventory, requests: PrivacyRequests): DataSource {
  const exporting = useGate("data.export")
  const viewing = useGate("customers", 1)
  const erasing = useGate("customers", 3)
  const write = {
    setSchedule: useAtomSet(privacyWrites.setSchedule, { mode: "promiseExit" }),
    requestAccess: useAtomSet(privacyWrites.requestAccess, { mode: "promiseExit" }),
    requestErasure: useAtomSet(privacyWrites.requestErasure, { mode: "promiseExit" }),
    requestExport: useAtomSet(privacyWrites.requestExport, { mode: "promiseExit" }),
    requestDeletion: useAtomSet(privacyWrites.requestDeletion, { mode: "promiseExit" }),
    cancelDeletion: useAtomSet(privacyWrites.cancelDeletion, { mode: "promiseExit" })
  }
  return {
    workspaceName: requests.workspaceName,
    inventory,
    requests: {
      schedule: requests.schedule,
      exports: requests.exports.map((e) => ({ ...e, href: href(e.fileId) })),
      shoppers: requests.shoppers.map((r) => ({ ...r, href: href(r.fileId) })),
      deletion: requests.deletion,
      shoppersHidden: requests.shoppersHidden
    },
    owner: requests.owner,
    mayRequestAccess: exporting.ok && viewing.ok,
    mayErase: erasing.ok,
    requestExport: () => write.requestExport({ payload: undefined, ...keys }).then(took),
    setSchedule: (schedule) => write.setSchedule({ payload: { schedule }, ...keys }).then(took),
    requestAccess: (by) => write.requestAccess({ payload: by, ...keys }).then(took),
    requestErasure: (email) => write.requestErasure({ payload: { email }, ...keys }).then(took),
    requestDeletion: (confirmName) => write.requestDeletion({ payload: { confirmName }, ...keys }).then(took),
    cancelDeletion: () => write.cancelDeletion({ payload: undefined, ...keys }).then(took)
  }
}
