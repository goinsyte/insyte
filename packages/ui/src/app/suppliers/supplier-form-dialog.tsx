import { useEffect, useState } from "react"
import { Field, FormDialog, TextAreaField, TextField } from "../common/form-dialog"
import type { SupplierInput } from "./source"

/**
 * "Nieuwe leverancier" and "Bewerken" (M8.1): a supplier's name and how to reach them, what they supply and how long
 * they usually take to hand an order over. Suppliers also arrive from Shopify, one per vendor; this is the way to add
 * one Shopify does not know, or to fill in the contact details a vendor name does not carry.
 */

const EMPTY: SupplierInput = { name: "", contactEmail: "", contactPhone: "", description: "", leadDays: 2 }

export function SupplierFormDialog({
  open,
  onOpenChange,
  initial,
  onSave
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The supplier being edited; absent, a new one. */
  initial?: SupplierInput | undefined
  onSave: (input: SupplierInput) => void
}) {
  const [draft, setDraft] = useState<SupplierInput>(initial ?? EMPTY)
  const [days, setDays] = useState(String((initial ?? EMPTY).leadDays))
  useEffect(() => {
    if (!open) return
    setDraft(initial ?? EMPTY)
    setDays(String((initial ?? EMPTY).leadDays))
  }, [open, initial])

  const set = (key: keyof SupplierInput) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const leadDays = Number.parseInt(days, 10)
  const valid = draft.name.trim() !== "" && Number.isInteger(leadDays) && leadDays >= 0 && leadDays <= 30

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? `${initial.name} bewerken` : "Nieuwe leverancier"}
      description={initial ?
        "Wat je hier wijzigt, geldt voor de volgende bestelling die naar hen gaat." :
        "Leveranciers uit Shopify staan er al, één per vendor. Voeg hier een leverancier toe die Shopify niet kent."}
      primaryLabel={initial ? "Opslaan" : "Leverancier toevoegen"}
      disabled={!valid}
      onSubmit={() => {
        if (!valid) return
        onSave({ ...draft, name: draft.name.trim(), leadDays })
        onOpenChange(false)
      }}
    >
      <Field label="Naam">
        <TextField value={draft.name} onChange={set("name")} placeholder="Atelier Noord" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="E-mailadres voor bestellingen">
          <TextField value={draft.contactEmail} onChange={set("contactEmail")} placeholder="orders@leverancier.nl" />
        </Field>
        <Field label="Telefoon (optioneel)">
          <TextField value={draft.contactPhone} onChange={set("contactPhone")} placeholder="+31 20 123 4567" />
        </Field>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Field label="Wat ze leveren (optioneel)">
          <TextAreaField value={draft.description} onChange={set("description")} placeholder="Linnen en katoen" />
        </Field>
        <Field label="Levertijd in dagen">
          <TextField value={days} onChange={setDays} type="number" />
        </Field>
      </div>
    </FormDialog>
  )
}
