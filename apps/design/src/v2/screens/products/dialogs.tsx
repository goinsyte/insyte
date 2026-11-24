import { useEffect, useState } from "react"
import { CHECK_KIND, getProductState, marginOf, percent, setProductState } from "../../fixtures/products.ts"
import type { CheckKind, ProductRow, ProductState } from "../../fixtures/products.ts"
import { euro, SUPPLIERS } from "../../fixtures/records.ts"
import type { Product } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Button } from "../../ui/button.tsx"
import { Checkbox, RadioGroup } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { FileDrop, FileRow } from "../../ui/file-drop.tsx"
import type { FileState } from "../../ui/file-drop.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"

/** Change the demo's catalogue and offer the way back in the toast. */
export function withUndo(title: string, body: string | undefined, change: (s: ProductState) => ProductState) {
  const before = getProductState()
  setProductState(change)
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    tone: "good",
    action: { label: "Ongedaan maken", onClick: () => setProductState(() => before) }
  })
}

/* ── a new product ─────────────────────────────────────────────────────────────────────────────── */

export function NewProductDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setTitle("")
      setTried(false)
    }
  }, [open])
  const save = (asDraft: boolean) => {
    setTried(true)
    if (title.trim() === "") return
    toast({
      title: asDraft ? `${title.trim()} opgeslagen als concept` : `${title.trim()} aangemaakt`,
      body: "Het gaat bij de volgende synchronisatie naar Shopify.",
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => toast({ title: "Product weer verwijderd" }) }
    })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuw product"
      description="Maak een product aan of sla het op als concept. Uploaden door leveranciers komt na de lancering."
      footer={
        <>
          <Button variant="ghost" onClick={() => save(true)}>Concept opslaan</Button>
          <Button variant="primary" onClick={() => save(false)}>Product aanmaken</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Producttitel" error={tried && title.trim() === "" ? "Titel is verplicht" : undefined}>
          {(control) => (
            <Input
              {...control}
              value={title}
              placeholder="Aurora fleece met capuchon"
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prijs">{(control) => <Input {...control} prefix="€" inputMode="decimal" />}</Field>
          <Field label="Inkoopprijs" optional>
            {(control) => <Input {...control} prefix="€" inputMode="decimal" />}
          </Field>
        </div>
        <Field label="Leverancier">
          {(control) => (
            <Select {...control} defaultValue={SUPPLIERS[0]?.id}>
              {SUPPLIERS.filter((s) => s.status !== "uitgenodigd").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Beschrijving" optional>
          {(control) => <Textarea {...control} rows={3} placeholder="Korte producttekst, materialen, maatadvies…" />}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── importing ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Producten importeren: Shopify is the system of record, so the first way in is a sync from it; a
 * CSV is for a catalogue that lives elsewhere (a supplier's price list). Nothing is overwritten
 * without the count of what changes.
 */
export function ImportDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [source, setSource] = useState<"shopify" | "csv">("shopify")
  const [file, setFile] = useState<{ readonly name: string; readonly bytes: number; state: FileState } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setSource("shopify")
      setFile(null)
      setBusy(false)
    }
  }, [open])
  const pick = (files: ReadonlyArray<File>) => {
    const f = files[0]
    if (f === undefined) return
    setFile({ name: f.name, bytes: f.size, state: { kind: "uploading", progress: 0.4 } })
    window.setTimeout(() => setFile({ name: f.name, bytes: f.size, state: { kind: "done" } }), 700)
  }
  const run = () => {
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      onClose()
      toast({
        title: source === "shopify" ? "Gesynchroniseerd vanuit Shopify" : `${file?.name ?? "Bestand"} geïmporteerd`,
        body: source === "shopify"
          ? "18 producten bijgewerkt, geen nieuwe. Prijzen en voorraad staan gelijk met Northwind EU."
          : "Nieuwe producten staan als concept klaar; bestaande SKU's kregen hun nieuwe inkoopprijs.",
        tone: "good"
      })
    }, 900)
  }
  return (
    <Dialog
      open={open}
      onClose={() => busy || onClose()}
      title="Producten importeren"
      description="Shopify blijft de bron. Een CSV gebruik je voor een prijslijst van een leverancier of een catalogus van buiten Shopify."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuleren</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={source === "csv" && file?.state.kind !== "done"}
            onClick={run}
          >
            {source === "shopify" ? "Nu synchroniseren" : "Importeren"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Segmented
          label="Waarvandaan"
          value={source}
          onChange={setSource}
          options={[{ value: "shopify", label: "Shopify" }, { value: "csv", label: "CSV-bestand" }]}
        />
        {source === "shopify"
          ? (
            <p className="text-sm text-pretty text-ink-2">
              Haalt titels, varianten, prijzen en voorraad op uit Northwind EU en Northwind US. Wat je hier aan
              inkoopprijs en leverancier invulde, blijft staan. De laatste synchronisatie was vandaag om{" "}
              <span className="figure">14:02</span>.
            </p>
          )
          : (
            <div className="flex flex-col gap-2">
              {file === null
                ? (
                  <FileDrop
                    onFiles={pick}
                    accept=".csv"
                    hint="CSV met kolommen titel, sku, prijs, inkoopprijs, leverancier"
                  />
                )
                : <FileRow name={file.name} bytes={file.bytes} state={file.state} onRemove={() => setFile(null)} />}
              <p className="text-xs text-ink-3">Bestaande SKU's worden bijgewerkt, nieuwe komen binnen als concept.</p>
            </div>
          )}
      </div>
    </Dialog>
  )
}

/* ── margins ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Marges herberekenen: price the picked products so each keeps a target margin over what it costs.
 * Every row shows price and margin now and after, so the change is read before it is made. Prices
 * round to whole euros, the way the store already prices.
 */
export function MarginDialog({ open, onClose, picked }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly picked: ReadonlyArray<ProductRow>
}) {
  const [target, setTarget] = useState("60")
  useEffect(() => {
    if (open) setTarget("60")
  }, [open])
  const t = Math.min(90, Math.max(5, Number(target.replace(",", ".")) || 0)) / 100
  const rows = picked.map((p) => {
    const next = Math.max(1, Math.round(p.cost / (1 - t)))
    return { p, next, before: p.margin, after: marginOf(next, p.cost) }
  })
  const changed = rows.filter((r) => r.next !== r.p.price)
  const apply = () => {
    withUndo(
      `${changed.length} ${changed.length === 1 ? "prijs" : "prijzen"} aangepast naar ${percent(t)} marge`,
      "Shopify krijgt de nieuwe prijzen bij de volgende synchronisatie.",
      (s) => ({
        ...s,
        edits: {
          ...s.edits,
          ...Object.fromEntries(changed.map((r) => [r.p.id, { ...s.edits[r.p.id], price: r.next }]))
        }
      })
    )
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Marges herberekenen"
      description="Elke prijs wordt zo gezet dat het product de doelmarge haalt op zijn inkoopprijs, afgerond op hele euro's."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={changed.length === 0} onClick={apply}>
            {changed.length === 0 ? "Geen prijswijzigingen" : `${changed.length} prijzen aanpassen`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Doelmarge in procent" className="max-w-40">
          {(control) => (
            <Input
              {...control}
              value={target}
              suffix="%"
              inputMode="numeric"
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </Field>
        <Table label="Prijzen voor en na" minWidth={520}>
          <THead>
            <Th>Product</Th>
            <Th align="right">Inkoop</Th>
            <Th align="right">Nu</Th>
            <Th align="right">Straks</Th>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.p.id}>
                <Td header className="max-w-[14rem] truncate">{r.p.name}</Td>
                <Td figure align="right" muted>{euro(r.p.cost)}</Td>
                <Td figure align="right" muted>
                  {euro(r.p.price)} · {percent(r.before)}
                </Td>
                <Td figure align="right">
                  {euro(r.next)} · {percent(r.after)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Dialog>
  )
}

/* ── a quality check ───────────────────────────────────────────────────────────────────────────── */

const DELIVER = [
  { id: "foto", label: "Foto's" },
  { id: "maten", label: "Maten en afmetingen" },
  { id: "batch", label: "Batchnummer" },
  { id: "video", label: "Video" }
] as const

const flip = (
  list: ReadonlyArray<string>,
  v: string
) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Controle aanvragen: what the supplier must send, for which sizes, by when. They answer via their link. */
export function CheckDialog({ open, onClose, product, supplierName, initialKind = "batch" }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly product: Product
  readonly supplierName: string
  /** Controle aanvragen opens on Batchfoto's, Monster bestellen on Monster. */
  readonly initialKind?: CheckKind
}) {
  const [kind, setKind] = useState<CheckKind>("batch")
  const [sizes, setSizes] = useState<ReadonlyArray<string>>([])
  const [deliver, setDeliver] = useState<ReadonlyArray<string>>(["foto", "batch"])
  const [due, setDue] = useState("week")
  const [note, setNote] = useState("")
  useEffect(() => {
    if (open) {
      setKind(initialKind)
      setSizes([])
      setDeliver(["foto", "batch"])
      setDue("week")
      setNote("")
    }
  }, [open, initialKind])
  const request = () => {
    const id = `qc-${310 + getProductState().checks.length}`
    withUndo(
      `Controle aangevraagd bij ${supplierName}`,
      "Ze zien het verzoek in hun portaal en antwoorden via hun link.",
      (s) => ({
        ...s,
        checks: [
          {
            id,
            productId: product.id,
            kind,
            sizes,
            deliver: DELIVER.filter((d) => deliver.includes(d.id)).map((d) => d.id),
            status: "aangevraagd",
            requestedBy: ME.name,
            requestedAt: "vandaag",
            due: due === "week" ? "ma 30 nov" : "ma 7 dec",
            note: note.trim() === "" ? `${CHECK_KIND[kind]} van ${product.name}.` : note.trim()
          },
          ...s.checks
        ]
      })
    )
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "monster" ? "Monster bestellen" : "Controle aanvragen"}
      description={`${supplierName} krijgt een link en ziet het verzoek in het portaal.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={request} disabled={deliver.length === 0}>Controle aanvragen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        <Segmented
          label="Soort controle"
          value={kind}
          onChange={setKind}
          options={[
            { value: "batch", label: "Batchfoto's" },
            { value: "monster", label: "Monster bestellen" },
            { value: "testbestelling", label: "Testbestelling" }
          ]}
        />
        {product.sizes.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-ink">Maten (geen keuze is alle maten)</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {product.sizes.map((size) => (
                <Checkbox
                  key={size}
                  checked={sizes.includes(size)}
                  onChange={() => setSizes((all) => flip(all, size))}
                  label={size}
                />
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-ink">Wat de leverancier aanlevert</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DELIVER.map((d) => (
              <Checkbox
                key={d.id}
                checked={deliver.includes(d.id)}
                onChange={() => setDeliver((all) => flip(all, d.id))}
                label={d.label}
              />
            ))}
          </div>
        </fieldset>
        <RadioGroup
          label="Uiterlijk"
          value={due}
          onChange={setDue}
          options={[{ value: "week", label: "Over een week" }, { value: "twee", label: "Over twee weken" }]}
        />
        <Field label="Voor de leverancier" optional>
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              value={note}
              placeholder="Bijvoorbeeld: zes foto's van de nieuwe batch, binnen en buiten, en het batchnummer"
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
