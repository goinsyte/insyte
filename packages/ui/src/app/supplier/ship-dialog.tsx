import { useEffect, useMemo, useState } from "react"
import { Field, FormDialog, TextAreaField, TextField } from "../common/form-dialog"
import type { SupplierOrderRow } from "../hooks/use-supplier-orders"
import { CARRIERS, ME_SUPPLIER } from "../lib/supplier-work"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useWorkspace } from "../stores/workspace-store"

/**
 * Marking orders shipped: a carrier and a tracking number for each, typed in or pasted from the
 * carrier's export as "bestelnummer, trackingnummer" lines. The brand sees the parcel, the tracking
 * and the status the moment it is saved, and Undo takes all of it back.
 */
export function ShipDialog(
  { rows, open, onOpenChange }: { rows: SupplierOrderRow[]; open: boolean; onOpenChange: (v: boolean) => void }
) {
  const ship = useWorkspace((s) => s.shipSupplierParcel)
  const snapshot = useWorkspace((s) => s.supplierSnapshot)
  const restore = useWorkspace((s) => s.restoreSupplier)
  const [carrier, setCarrier] = useState<string>("PostNL")
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const [paste, setPaste] = useState("")

  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh set of orders starts empty
  useEffect(() => {
    if (open) {
      setTracking({})
      setPaste("")
    }
  }, [open])

  /* Pasted lines fill the fields they name; a line for an order not in this set is ignored. */
  function applyPaste(text: string) {
    setPaste(text)
    const next = { ...tracking }
    for (const line of text.split(/\n/)) {
      const [num, code] = line.split(/[,;\t]/).map((x) => x.trim())
      const row = rows.find((r) => r.number.toLowerCase() === num?.toLowerCase())
      if (row && code) next[row.id] = code
    }
    setTracking(next)
  }

  const ready = useMemo(() => rows.filter((r) => (tracking[r.id] ?? "").trim() !== ""), [rows, tracking])

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rows.length === 1 ? `${rows[0]?.number} verzenden` : `${rows.length} bestellingen verzenden`}
      description="Northwind ziet de track & trace meteen bij de bestelling, en de klant krijgt hem doorgestuurd."
      primaryLabel={ready.length === rows.length
        ? "Markeren als verzonden"
        : `${ready.length} van ${rows.length} markeren als verzonden`}
      disabled={ready.length === 0}
      width={rows.length > 1 ? 560 : 440}
      onSubmit={() => {
        const before = snapshot()
        for (const r of ready) {
          ship(ME_SUPPLIER.id, r.id, {
            carrier,
            tracking: tracking[r.id]!.trim(),
            lines: r.lines.map((l) => l.id)
          })
        }
        onOpenChange(false)
        undoable(
          ready.length === 1
            ? `${ready[0]!.number} gemarkeerd als verzonden`
            : `${ready.length} bestellingen gemarkeerd als verzonden`,
          () => restore(before),
          `${carrier}`
        )
      }}
    >
      <Field label="Vervoerder">
        <div role="radiogroup" aria-label="Vervoerder" className="flex flex-wrap gap-1.5">
          {CARRIERS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={carrier === c}
              onClick={() => setCarrier(c)}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 font-medium text-sm transition-colors",
                carrier === c ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>
      {rows.length === 1 && rows[0] ?
        (
          <Field label="Trackingnummer">
            <TextField
              value={tracking[rows[0].id] ?? ""}
              onChange={(v) => setTracking({ [rows[0]!.id]: v })}
              placeholder="3SXYZ0123456789"
            />
          </Field>
        ) :
        (
          <>
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {rows.map((r) => (
                <label key={r.id} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 text-sm">
                  <span className="font-medium text-ink tabular-nums">{r.number}</span>
                  <input
                    value={tracking[r.id] ?? ""}
                    onChange={(e) =>
                      setTracking((t) => ({ ...t, [r.id]: e.target.value }))}
                    placeholder="Trackingnummer"
                    aria-label={`Trackingnummer voor ${r.number}`}
                    className="field h-8 rounded-md px-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:bg-paper"
                  />
                </label>
              ))}
            </div>
            <Field label="Of plak ze uit de export van de vervoerder">
              <TextAreaField
                value={paste}
                onChange={applyPaste}
                placeholder={"SO-12200, 3SXYZ0123456789\nSO-12212, 3SXYZ0123456790"}
                rows={3}
              />
            </Field>
          </>
        )}
    </FormDialog>
  )
}
