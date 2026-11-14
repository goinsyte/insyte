import { useEffect, useState } from "react"
import { Field, FormDialog, TextAreaField } from "../common/form-dialog"
import { PROBLEM_LABEL, type ProblemKind } from "../lib/supplier-work"
import { cn } from "../lib/utils"
import { type SupplierOrderRow, useSupplierPortal } from "./source"

/**
 * Telling the brand something is wrong before the customer finds out: what it is, a line about it,
 * and — when it is only late — the new hand-off date. The brand gets a ticket with all of it and the
 * order is marked Vertraagd on their side.
 */
const KINDS: ProblemKind[] = ["stock", "delay", "address", "damaged", "other"]

export function ProblemDialog(
  { row, open, onOpenChange }: { row: SupplierOrderRow | null; open: boolean; onOpenChange: (v: boolean) => void }
) {
  const { brand, report } = useSupplierPortal()
  const [kind, setKind] = useState<ProblemKind>("delay")
  const [note, setNote] = useState("")
  const [date, setDate] = useState("")

  useEffect(() => {
    if (open) {
      setKind("delay")
      setNote("")
      setDate("")
    }
  }, [open])

  const needsDate = kind === "delay" || kind === "stock"
  return (
    <FormDialog
      open={open && row !== null}
      onOpenChange={onOpenChange}
      title={`Probleem melden bij ${row?.number ?? ""}`}
      description={`${brand} krijgt hier een ticket van en ziet de bestelling als vertraagd.`}
      primaryLabel={`Melden aan ${brand}`}
      disabled={note.trim() === "" || (needsDate && date === "")}
      width={480}
      onSubmit={() => {
        if (!row) return
        onOpenChange(false)
        report(row, { kind, note: note.trim(), ...(needsDate && date ? { newDate: date } : {}) }, {
          message: `Probleem gemeld bij ${row.number}`
        })
      }}
    >
      <Field label="Wat is er">
        <div role="radiogroup" aria-label="Wat is er" className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 font-medium text-sm transition-colors",
                kind === k ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink"
              )}
            >
              {PROBLEM_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>
      {needsDate ?
        (
          <Field label="Nieuwe overdrachtsdatum">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field h-9 rounded-md px-3 text-base text-ink outline-none focus-visible:bg-paper"
            />
          </Field>
        ) :
        null}
      <Field label="Toelichting">
        <TextAreaField
          value={note}
          onChange={setNote}
          placeholder="Bijvoorbeeld: maat M komt donderdag binnen, de rest ligt klaar."
          rows={3}
        />
      </Field>
    </FormDialog>
  )
}
