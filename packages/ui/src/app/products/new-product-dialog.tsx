import { useState } from "react"
import { toast } from "sonner"
import { Field, FormDialog, SelectField, TextAreaField, TextField } from "../common/form-dialog"

const SUPPLIERS = [
  "Allure Fulfillment",
  "DPC Apparel",
  "Yiwu Trading",
  "Linyi Logistics",
  "Skyway Freight"
] as const

const STATUSES = ["active", "draft", "archived"] as const

export type NewProductInput = {
  title: string
  sku: string
  cost: number
  price: number
  supplier: string
  status: (typeof STATUSES)[number]
  description: string
}

export function NewProductDialog({
  open,
  onOpenChange,
  onCreate
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreate: (input: NewProductInput) => void
}) {
  const [title, setTitle] = useState("")
  const [sku, setSku] = useState("")
  const [cost, setCost] = useState("0")
  const [price, setPrice] = useState("0")
  const [supplier, setSupplier] = useState<(typeof SUPPLIERS)[number]>("Allure Fulfillment")
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("draft")
  const [description, setDescription] = useState("")

  function reset() {
    setTitle("")
    setSku("")
    setCost("0")
    setPrice("0")
    setSupplier("Allure Fulfillment")
    setStatus("draft")
    setDescription("")
  }

  const costNum = Number.parseFloat(cost) || 0
  const priceNum = Number.parseFloat(price) || 0
  const margin = priceNum > 0 ? (priceNum - costNum) / priceNum : 0

  function submit() {
    if (!title.trim()) {
      toast.error("Titel is verplicht")
      return
    }
    onCreate({
      title,
      sku,
      cost: costNum,
      price: priceNum,
      supplier,
      status,
      description
    })
    reset()
    onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
      title="Nieuw product"
      description="Maak een product aan of sla het op als concept. Uploaden door leveranciers komt na de lancering."
      primaryLabel={status === "draft" ? "Concept opslaan" : "Product aanmaken"}
      onSubmit={submit}
      disabled={!title.trim()}
    >
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Field label="Producttitel">
          <TextField
            value={title}
            onChange={setTitle}
            placeholder="Aurora fleece met capuchon"
          />
        </Field>
        <Field label="SKU">
          <TextField value={sku} onChange={setSku} placeholder="SKU-XXXX" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Inkoopprijs ($)">
          <TextField value={cost} onChange={setCost} type="number" />
        </Field>
        <Field label="Prijs ($)">
          <TextField value={price} onChange={setPrice} type="number" />
        </Field>
        <Field label="Marge">
          <div className="flex h-9 items-center rounded-md bg-mist px-3 font-medium text-base text-ink">
            {Math.round(margin * 100)}%
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Leverancier">
          <SelectField
            value={supplier}
            onChange={setSupplier}
            options={SUPPLIERS}
          />
        </Field>
        <Field label="Status">
          <SelectField
            value={status}
            onChange={setStatus}
            options={STATUSES}
            renderLabel={(s) => ({ active: "Actief", draft: "Concept", archived: "Gearchiveerd" })[s]}
          />
        </Field>
      </div>
      <Field label="Beschrijving (optioneel)">
        <TextAreaField
          value={description}
          onChange={setDescription}
          placeholder="Korte producttekst, materialen, maatadvies…"
        />
      </Field>
    </FormDialog>
  )
}
