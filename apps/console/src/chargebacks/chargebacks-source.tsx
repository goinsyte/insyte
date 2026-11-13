import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ChargebackChange, ChargebackDetail, ChargebackList } from "@insyte/modules/chargebacks/domain/Chargebacks"
import type {
  ChargebackCommands,
  ChargebackDetailSource,
  ChargebacksListSource,
  NewChargebackInput
} from "@insyte/ui/app/chargebacks/source"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import type { Chargeback, Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CHARGEBACK_WRITES, chargebackWrites, nextCaseNumberAtom } from "../data/chargebacks.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"
import { caseOf, chargebackOf, providerName, reasonCodeOf } from "./chargeback-of.ts"

/*
 * The chargeback screens' sources in the console (M13): `Chargebacks.list` and `Chargebacks.get` as the design's, with
 * the server's commands. A file goes up through `PUT /api/chargebacks/:id/evidence` first, then into the pack. What
 * the payment connections bring is left out, not made up: nothing is submitted until Stripe, Klarna or PayPal is
 * connected (M13 step 2), and the screens say so where the design offers it. Insyte gathers a pack on the server
 * (`Chargebacks.assemblePack`, M13 step 4); the case's page follows it as it comes in.
 */

const COPY: RefusalCopy = {
  gone: "Die zaak bestaat niet meer",
  invalid: {
    customer: "Vul de naam van de klant in.",
    amount: "Vul een geldig betwist bedrag in.",
    itemIds: "De volgorde van het bewijs klopte niet meer. Probeer het opnieuw."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "CaseNumberTaken":
        toast.error("Dat zaaknummer bestaat al", {
          description: `${String(tagged["caseNumber"])} hoort bij een andere zaak.`
        })
        return true
      case "CaseClosed":
        toast.error("Deze zaak is al gesloten", { description: "Er kan niets meer bij, en accepteren kan niet meer." })
        return true
      default:
        return false
    }
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

/** What the evidence route answers when a file does not go up. */
const UPLOAD: Record<number, [string, string]> = {
  401: ["Je bent uitgelogd", "Log opnieuw in en probeer het nog eens."],
  403: ["Dat kan je rol niet", "Bewijs toevoegen vraagt Chargebacks · Bewerken."],
  404: ["Die zaak bestaat niet meer", "Iemand anders was je voor."],
  409: ["Deze zaak is al gesloten", "Er kan geen bewijs meer bij."],
  413: ["Dat bestand is te groot", "Bewijs mag tot 10 MB per bestand zijn."],
  415: ["Dit soort bestand kan niet", "Een PDF, een afbeelding, een mail of platte tekst kan wel."]
}

const submitUnavailable = (provider: Chargeback["provider"]) =>
  `Koppel ${providerName(provider)} om bewijs in te dienen. Dat is nog niet beschikbaar.`

function useCommands(
  itemIdsOf: (c: Chargeback) => ReadonlyArray<string>,
  asked: (id: string, ok: boolean) => void = () => undefined
): ChargebackCommands {
  const keys = { reactivityKeys: [...CHARGEBACK_WRITES] }
  const write = {
    createManual: useAtomSet(chargebackWrites.createManual, { mode: "promiseExit" }),
    accept: useAtomSet(chargebackWrites.accept, { mode: "promiseExit" }),
    addEvidence: useAtomSet(chargebackWrites.addEvidence, { mode: "promiseExit" }),
    removeEvidence: useAtomSet(chargebackWrites.removeEvidence, { mode: "promiseExit" }),
    setNote: useAtomSet(chargebackWrites.setNote, { mode: "promiseExit" }),
    assemblePack: useAtomSet(chargebackWrites.assemblePack, { mode: "promiseExit" }),
    undo: useAtomSet(chargebackWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  /** Says what the change did, with its undo. */
  const said = (exit: Exit.Exit<ChargebackChange, unknown>, label: string) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const ticket = exit.value.undo
    if (ticket === null) return void toast.success(label)
    undoable(label, () => undo(ticket.token))
  }

  return {
    create: async (input: NewChargebackInput) => {
      const note = input.notes.trim()
      const exit = await write.createManual({
        payload: {
          ...(input.case_number === "" ? {} : { caseNumber: input.case_number }),
          provider: input.provider,
          customer: { name: input.customer_name },
          amountMinor: Math.round(input.amount * 100),
          reasonCode: reasonCodeOf(input.reason),
          ...(note === "" ? {} : { note })
        },
        ...keys
      })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      const made = exit.value.chargebacks[0]
      said(exit, `Bewijspakket ${made?.caseNumber ?? input.case_number} aangemaakt`)
      return true
    },
    attach: async (c, files) => {
      const fileIds: Array<string> = []
      for (const file of files) {
        const response = await fetch(`/api/chargebacks/${encodeURIComponent(c.id)}/evidence`, {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name)
          },
          body: file
        }).catch(() => null)
        if (response?.status !== 201) {
          const [title, description] = UPLOAD[response?.status ?? 0] ??
            ["Een bestand kwam niet door", "Probeer het zo nog eens."]
          toast.error(title, { description: files.length > 1 ? `${file.name}: ${description}` : description })
          if (fileIds.length === 0) return
          break
        }
        fileIds.push(((await response.json()) as { id: string }).id)
      }
      const exit = await write.addEvidence({ payload: { chargebackId: c.id, fileIds }, ...keys })
      said(exit, `${fileIds.length === 1 ? files[0]?.name : `${fileIds.length} bestanden`} toegevoegd`)
    },
    remove: async (c, index) => {
      const itemId = itemIdsOf(c)[index]
      if (itemId === undefined) return
      const name = c.evidence_files[index]?.name ?? "Bestand"
      said(await write.removeEvidence({ payload: { chargebackId: c.id, itemId }, ...keys }), `${name} verwijderd`)
    },
    note: async (c, note) => {
      const exit = await write.setNote({ payload: { id: c.id, note }, ...keys })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      said(exit, "Notitie opgeslagen")
      return true
    },
    draw: async (id) => {
      asked(id, true)
      const exit = await write.assemblePack({ payload: { ids: [id] }, ...keys })
      if (Exit.isFailure(exit)) {
        asked(id, false)
        refused(failureOf(exit))
      }
    },
    accept: async (cases) => {
      const exit = await write.accept({ payload: { ids: cases.map((c) => c.id) }, ...keys })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      toast.success(
        cases.length === 1
          ? `${cases[0]?.case_number} geaccepteerd als verloren`
          : `${counted(cases.length, "zaak", "zaken")} geaccepteerd als verloren`
      )
    }
  }
}

const NONE: ReadonlyArray<string> = []

export function useConsoleChargebacksListSource(list: ChargebackList): ChargebacksListSource {
  const next = Option.getOrUndefined(AsyncResult.value(useAtomValue(nextCaseNumberAtom)))
  const commands = useCommands(() => NONE)
  const cases = useMemo(() => list.rows.map(chargebackOf), [list])
  const currency = list.stats.currency as Currency
  return {
    cases,
    standing: {
      open: list.stats.open,
      wonPct: list.stats.wonPct,
      recovered: list.stats.recoveredMinor / 100,
      currency
    },
    nextCaseNumber: next?.caseNumber ?? "",
    currency,
    // The number prefilled is the server's to give: left as it was, the next one is taken when the case is made.
    commands: {
      ...commands,
      create: (input) => commands.create(input.case_number === next?.caseNumber ? { ...input, case_number: "" } : input)
    }
  }
}

export function useConsoleChargebackDetailSource(detail: ChargebackDetail): ChargebackDetailSource {
  const c = useMemo(() => caseOf(detail), [detail])
  const itemIds = useMemo(() => detail.evidence.map((e) => e.id), [detail])
  // Asked for, and the case not yet read again: the pack as it was then, so the plate keeps gathering until it is.
  const [askedFrom, setAskedFrom] = useState<number | null>(null)
  const startedAt = detail.pack?.startedAt ?? 0
  const commands = useCommands(() => itemIds, (_id, ok) => setAskedFrom(ok ? startedAt : null))
  const gathering = detail.pack?.state === "assembling" || (askedFrom !== null && startedAt === askedFrom)
  usePackOutcome(detail)
  return {
    useCase: (id) => (id === c.id ? c : undefined),
    record: { won: detail.stats.won, decided: detail.stats.decided },
    commands,
    submitUnavailable: (x) => submitUnavailable(x.provider),
    pack: () => ({ building: gathering, done: detail.pack?.done ?? 0, total: detail.pack?.total ?? 0 }),
    fileHref: (_x, index) => {
      const fileId = detail.evidence[index]?.fileId
      return fileId === null || fileId === undefined ? undefined : `/api/files/${fileId}`
    }
  }
}

/** Says once when a pack this tab watched being gathered could not be made: the plate offers it again. */
function usePackOutcome(detail: ChargebackDetail) {
  const state = detail.pack?.state
  const before = useRef(state)
  useEffect(() => {
    if (before.current === "assembling" && state === "failed") {
      toast.error("Het bewijspakket kon niet worden samengesteld", {
        description: "Probeer het opnieuw. Wat je zelf toevoegde, staat er nog."
      })
    }
    before.current = state
  }, [state])
}
