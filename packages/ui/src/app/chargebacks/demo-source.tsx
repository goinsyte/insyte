import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { counted } from "../lib/bulk-io"
import type { Chargeback } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { ListClosing, useListStarts } from "../marketing-sections/closings"
import { useWorkspace } from "../stores/workspace-store"
import {
  type ChargebackCommands,
  type ChargebackDetailSource,
  ChargebackDetailSourceProvider,
  type ChargebacksListSource,
  ChargebacksListSourceProvider
} from "./source"

/*
 * The chargeback screens over the design app's workspace store, as they were before the seam (`source.tsx`): its
 * cases, the simulated pack it draws, submitting and accepting, and adding and removing files and the note with Undo.
 */

const PROVIDER_LABEL: Record<Chargeback["provider"], string> = { paypal: "PayPal", klarna: "Klarna", stripe: "Stripe" }

const patch = (id: string, next: (c: Chargeback) => Chargeback) =>
  useWorkspace.setState((s) => ({ chargebacks: s.chargebacks.map((x) => (x.id === id ? next(x) : x)) }))

const commands: ChargebackCommands = {
  create: (input) => {
    const id = `cb_${Date.now()}`
    const opened = new Date().toISOString()
    const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    useWorkspace.setState((s) => ({
      chargebacks: [
        {
          id,
          case_number: input.case_number,
          provider: input.provider,
          customer_id: "cust_new",
          customer_name: input.customer_name,
          amount: input.amount,
          currency: "USD",
          reason: input.reason,
          status: "awaiting_evidence",
          deadline_at: deadline,
          opened_at: opened,
          evidence_files: [],
          timeline: [{ at: opened, actor: "Jij", event: "Zaak handmatig geopend" }],
          ...(input.notes ? { notes: input.notes } : {})
        },
        ...s.chargebacks
      ]
    }))
    toast.success(`Bewijspakket ${input.case_number} aangemaakt`)
    return Promise.resolve(true)
  },
  attach: (c, files) => {
    const before = c
    patch(c.id, (x) => ({
      ...x,
      evidence_files: [...x.evidence_files, ...files.map((f) => ({ name: f.name, size: f.size, kind: "upload" }))]
    }))
    undoable(
      `${files.length === 1 ? files[0]?.name : `${files.length} bestanden`} toegevoegd`,
      () => useWorkspace.getState().restoreChargeback(before)
    )
  },
  remove: (c, index) => {
    const before = c
    const name = c.evidence_files[index]?.name ?? ""
    patch(c.id, (x) => ({ ...x, evidence_files: x.evidence_files.filter((f) => f.name !== name) }))
    undoable(`${name} verwijderd`, () => useWorkspace.getState().restoreChargeback(before))
  },
  accept: (cases) => {
    for (const c of cases) useWorkspace.getState().acceptChargeback(c.id)
    toast(
      cases.length === 1
        ? `${cases[0]?.case_number} geaccepteerd`
        : `${counted(cases.length, "zaak", "zaken")} geaccepteerd als verloren`
    )
  },
  submit: (cases) => {
    for (const c of cases) useWorkspace.getState().submitEvidence(c.id)
    const [first] = cases
    if (cases.length === 1 && first !== undefined) {
      toast.success(`Bewijs ingediend bij ${PROVIDER_LABEL[first.provider]}`, {
        description: `${first.case_number} · uitspraak meestal binnen 30 dagen`
      })
    } else toast.success(`${counted(cases.length, "zaak", "zaken")} ingediend`)
  },
  draw: (id) => useWorkspace.getState().buildEvidence(id),
  note: (c, note) => {
    const before = c
    useWorkspace.getState().setChargebackNote(c.id, note)
    undoable("Notitie opgeslagen", () => useWorkspace.getState().restoreChargeback(before))
    return Promise.resolve(true)
  }
}

function nextCaseNumber(data: ReadonlyArray<Chargeback>) {
  const nums = data
    .map((c) => Number.parseInt(c.case_number.replace(/[^0-9]/g, ""), 10))
    .filter((n) => !Number.isNaN(n))
  const max = nums.length === 0 ? 2200 : Math.max(...nums)
  return `DSP-${max + 1}`
}

const DemoClosing = ({ empty }: { empty: boolean }) => <ListClosing area="chargebacks" empty={empty} />

export function DemoChargebacksSource({ children }: { children: ReactNode }) {
  const data = useWorkspace((s) => s.chargebacks)
  const starts = useListStarts("chargebacks")
  const list = useMemo<ChargebacksListSource>(() => {
    const decided = data.filter((c) => c.status === "won" || c.status === "lost").length
    const won = data.filter((c) => c.status === "won")
    return {
      cases: data,
      standing: {
        open: data.filter((c) => c.status === "open" || c.status === "awaiting_evidence").length,
        wonPct: decided === 0 ? 0 : Math.round((won.length / decided) * 100),
        recovered: won.reduce((s, c) => s + c.amount, 0)
      },
      nextCaseNumber: nextCaseNumber(data),
      currency: "USD",
      commands,
      starts,
      Closing: DemoClosing
    }
  }, [data, starts])
  const detail = useMemo<ChargebackDetailSource>(() => {
    const decided = data.filter((x) => x.status === "won" || x.status === "lost")
    return {
      useCase: useDemoCase,
      record: { won: decided.filter((x) => x.status === "won").length, decided: decided.length },
      commands
    }
  }, [data])
  return (
    <ChargebacksListSourceProvider value={list}>
      <ChargebackDetailSourceProvider value={detail}>{children}</ChargebackDetailSourceProvider>
    </ChargebacksListSourceProvider>
  )
}

function useDemoCase(id: string) {
  return useWorkspace((s) => s.chargebacks.find((x) => x.id === id))
}
