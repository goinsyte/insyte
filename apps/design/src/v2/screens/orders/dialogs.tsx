import { useState } from "react"
import {
  addEvent,
  changeDesk,
  createConcept,
  KNOWN_TAGS,
  money,
  ownTags,
  PAYMENTS,
  restoreDesk
} from "../../fixtures/order-desk.ts"
import type { Address } from "../../fixtures/order-desk.ts"
import { customer, CUSTOMERS, product, PRODUCTS } from "../../fixtures/records.ts"
import type { Order, OrderLine, Payment } from "../../fixtures/records.ts"
import { REASON_LABEL, RESOLUTION_LABEL, sizeUp, startReturn } from "../../fixtures/returns.ts"
import type { Reason, Resolution } from "../../fixtures/returns.ts"
import { ME, STORES } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { Checkbox, RadioGroup } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Plus, Trash } from "../../ui/icons.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { Notice } from "../../ui/notice.tsx"
import { toast } from "../../ui/toast.tsx"
import { undoable } from "./parts.tsx"

/* ── Nieuwe bestelling ─────────────────────────────────────────────────────────────────────────── */

type DraftLine = { readonly productId: string; readonly size: string; readonly quantity: string }

const firstProduct = PRODUCTS.find((p) => p.status === "actief" && p.stock > 0) ?? PRODUCTS[0]
const emptyLine = (): DraftLine => ({
  productId: firstProduct?.id ?? "",
  size: firstProduct?.sizes[0] ?? "",
  quantity: "1"
})

/**
 * A concept order the team makes by hand (a customer who phoned, a replacement): who, which store, how
 * they pay, the lines. It becomes a real order once it is paid; until then it says "Concept".
 */
export function NewOrderDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [customerId, setCustomer] = useState("")
  const [storeId, setStore] = useState<Order["storeId"]>("store_eu")
  const [payment, setPayment] = useState<Payment>("iDEAL")
  const [lines, setLines] = useState<ReadonlyArray<DraftLine>>([emptyLine()])
  const [note, setNote] = useState("")
  const [tried, setTried] = useState(false)

  const valid: ReadonlyArray<OrderLine> = lines.flatMap((l) => {
    const p = product(l.productId)
    const qty = Number(l.quantity)
    return p === undefined || !Number.isInteger(qty) || qty < 1
      ? []
      : [{ productId: p.id, size: l.size, quantity: qty, price: p.price }]
  })
  const total = valid.reduce((s, l) => s + l.price * l.quantity, 0)
  const reset = () => {
    setCustomer("")
    setStore("store_eu")
    setPayment("iDEAL")
    setLines([emptyLine()])
    setNote("")
    setTried(false)
  }
  const close = () => {
    reset()
    onClose()
  }
  const create = () => {
    setTried(true)
    if (customerId === "" || valid.length === 0) return
    const order = createConcept({ customerId, storeId, payment, lines: valid, note })
    const name = customer(customerId)?.name ?? "de klant"
    reset()
    onClose()
    navigate(paths.order(order.number))
    undoable(`Conceptbestelling #${order.number} aangemaakt`, () => {
      changeDesk((d) => ({ ...d, created: d.created.filter((o) => o.number !== order.number) }))
      navigate(paths.orders)
    }, `Voor ${name}, ${money(total)}. Hij wordt een echte bestelling zodra hij betaald is.`)
  }
  const set = (i: number, next: Partial<DraftLine>) =>
    setLines((all) => all.map((l, at) => (at === i ? { ...l, ...next } : l)))

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Nieuwe bestelling"
      description="Voor een klant die belt of mailt. Hij staat als concept tot hij betaald is, en gaat dan naar de leverancier."
      footer={
        <>
          <p className="mr-auto text-sm text-ink-2">
            Totaal <span className="figure font-medium text-ink">{money(total)}</span>
          </p>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button variant="primary" onClick={create}>Conceptbestelling aanmaken</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Klant"
            className="sm:col-span-2"
            error={tried && customerId === "" ? "Kies voor wie de bestelling is" : undefined}
          >
            {(c) => (
              <Select {...c} value={customerId} onChange={(e) => setCustomer(e.target.value)}>
                <option value="">Kies een klant</option>
                {CUSTOMERS.filter((x) => x.duplicateOf === undefined).map((x) => (
                  <option key={x.id} value={x.id}>{x.name} · {x.email}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Winkel">
            {(c) => (
              <Select {...c} value={storeId} onChange={(e) => setStore(e.target.value as Order["storeId"])}>
                {STORES.filter((s) => s.connected).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Betaalmethode">
            {(c) => (
              <Select {...c} value={payment} onChange={(e) => setPayment(e.target.value as Payment)}>
                {PAYMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-ink">Artikelen</legend>
          {lines.map((line, i) => {
            const p = product(line.productId)
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_4rem_auto] items-center gap-2">
                <Select
                  aria-label={`Product, regel ${i + 1}`}
                  value={line.productId}
                  onChange={(e) => set(i, { productId: e.target.value, size: product(e.target.value)?.sizes[0] ?? "" })}
                >
                  {PRODUCTS.filter((x) => x.status === "actief").map((x) => (
                    <option key={x.id} value={x.id} disabled={x.stock === 0}>
                      {x.name} · € {x.price}
                      {x.stock === 0 ? " · uitverkocht" : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label={`Maat, regel ${i + 1}`}
                  value={line.size}
                  onChange={(e) => set(i, { size: e.target.value })}
                >
                  {(p?.sizes ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input
                  aria-label={`Aantal, regel ${i + 1}`}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, "") })}
                />
                <IconButton
                  label={`Regel ${i + 1} weghalen`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((all) => all.filter((_, at) => at !== i))}
                >
                  <Trash />
                </IconButton>
              </div>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            icon={<Plus />}
            onClick={() => setLines((all) => [...all, emptyLine()])}
          >
            Artikel toevoegen
          </Button>
          {tried && valid.length === 0 && (
            <p className="text-xs text-bad-ink">Voeg minstens één artikel met een aantal toe.</p>
          )}
        </fieldset>

        <Field label="Interne notitie" optional hint="Alleen je team ziet dit.">
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Klant wil het als cadeau ingepakt"
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── Labels ────────────────────────────────────────────────────────────────────────────────────── */

/** Labels on one or more orders: the team's own words, to sort and filter on. */
export function TagDialog(
  { orders, onClose }: { readonly orders: ReadonlyArray<Order> | null; readonly onClose: () => void }
) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [own, setOwn] = useState("")
  const known = [...new Set([...KNOWN_TAGS, ...(orders ?? []).flatMap(ownTags)])]
  const chosen = [...picked, ...(own.trim() === "" ? [] : [own.trim().toLowerCase()])]
  const close = () => {
    setPicked(new Set())
    setOwn("")
    onClose()
  }
  const apply = () => {
    const list = orders ?? []
    const before = changeDesk((d) => ({
      ...d,
      tags: {
        ...d.tags,
        ...Object.fromEntries(list.map((o) => [o.number, [...new Set([...(d.tags[o.number] ?? o.tags), ...chosen])]]))
      }
    }))
    undoable(
      `${chosen.length === 1 ? `Label ‘${chosen[0]}’` : `${chosen.length} labels`} toegevoegd aan ${
        list.length === 1 ? `#${list[0]?.number ?? ""}` : `${list.length} bestellingen`
      }`,
      () => restoreDesk(before)
    )
    close()
  }
  const count = orders?.length ?? 0
  return (
    <Dialog
      open={orders !== null}
      onClose={close}
      size="sm"
      title={count === 1 ? "Label toevoegen" : `Label toevoegen aan ${count} bestellingen`}
      description="Labels zijn van jou, om op te sorteren en te filteren. Vertraagd zet Insyte zelf."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={chosen.length === 0} onClick={apply}>Toevoegen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-2.5">
          {known.map((t) => (
            <Checkbox
              key={t}
              label={t}
              checked={picked.has(t)}
              onChange={(on) =>
                setPicked((s) => {
                  const next = new Set(s)
                  if (on) next.add(t)
                  else next.delete(t)
                  return next
                })}
            />
          ))}
        </div>
        <Field label="Nieuw label" optional>
          {(c) => (
            <Input
              {...c}
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              placeholder="Bijvoorbeeld: terugbellen"
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── Interne notitie ───────────────────────────────────────────────────────────────────────────── */

export function NoteDialog(
  { order, open, onClose }: { readonly order: Order; readonly open: boolean; readonly onClose: () => void }
) {
  const [text, setText] = useState("")
  const close = () => {
    setText("")
    onClose()
  }
  const save = () => {
    const note = { id: `n${Date.now()}`, at: Date.now(), by: ME.name, text: text.trim() }
    const before = changeDesk((d) => ({
      ...d,
      notes: {
        ...d.notes,
        [order.number]: [
          { ...note, at: new Date(2026, 10, 23, 14, 30).getTime() + 60_000 },
          ...(d.notes[order.number] ?? [])
        ]
      }
    }))
    undoable("Notitie opgeslagen", () => restoreDesk(before), "Alleen je team ziet hem, bij de bestelling.")
    close()
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Interne notitie toevoegen"
      description="Alleen je team ziet dit. Het blijft bij de bestelling."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={text.trim() === ""} onClick={save}>Opslaan</Button>
        </>
      }
    >
      <Field label="Notitie" className="pb-2">
        {(c) => <Textarea {...c} rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />}
      </Field>
    </Dialog>
  )
}

/* ── Verzendadres ──────────────────────────────────────────────────────────────────────────────── */

export function AddressDialog({ order, address, open, onClose }: {
  readonly order: Order
  readonly address: Address
  readonly open: boolean
  readonly onClose: () => void
}) {
  const [draft, setDraft] = useState(address)
  const name = customer(order.customerId)?.name ?? "de klant"
  const save = () => {
    const before = changeDesk((d) =>
      addEvent(
        { ...d, address: { ...d.address, [order.number]: draft } },
        order.number,
        `Verzendadres gewijzigd door ${ME.name}`
      )
    )
    undoable(
      "Verzendadres bijgewerkt",
      () => restoreDesk(before),
      "De leverancier krijgt het bij de volgende synchronisatie."
    )
    onClose()
  }
  const field = (key: keyof Address, label: string) => (
    <Field label={label}>
      {(c) => <Input {...c} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />}
    </Field>
  )
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Verzenden naar ${name}`}
      description="Wijzigingen gaan bij de volgende synchronisatie naar de leverancier. Een pakket dat al is overgedragen houdt zijn oude label."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={draft.street.trim() === "" || draft.city.trim() === ""} onClick={save}>
            Opslaan
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <div className="sm:col-span-2">{field("street", "Straat en huisnummer")}</div>
        {field("postcode", "Postcode")}
        {field("city", "Plaats")}
        {field("country", "Landcode")}
      </div>
    </Dialog>
  )
}

/* ── Retour starten ────────────────────────────────────────────────────────────────────────────── */

const REASONS: ReadonlyArray<Reason> = [
  "te-klein",
  "te-groot",
  "niet-zoals-foto",
  "beschadigd",
  "verkeerd-artikel",
  "anders"
]
const WISHES: ReadonlyArray<Resolution> = ["terugbetalen", "ruilen", "cadeaubon", "nieuw-artikel"]

/** A return started for a customer who phoned or mailed: it lands in Retouren under Te beoordelen. */
export function StartReturnDialog(
  { order, open, onClose }: { readonly order: Order; readonly open: boolean; readonly onClose: () => void }
) {
  const [line, setLine] = useState(0)
  const [reason, setReason] = useState<Reason>("te-klein")
  const [wish, setWish] = useState<Resolution>("terugbetalen")
  const [note, setNote] = useState("")
  const chosen = order.lines[line] ?? order.lines[0]
  const start = () => {
    if (chosen === undefined) return
    const record = startReturn({
      order,
      productId: chosen.productId,
      size: chosen.size,
      price: chosen.price,
      reason,
      requested: wish,
      note: note.trim(),
      by: ME.name
    })
    toast({
      title: `Retour ${record.number} gestart`,
      body: "Hij staat in Retouren bij Te beoordelen.",
      tone: "good",
      action: { label: "Openen", onClick: () => navigate(paths.return(record.id)) }
    })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Retour starten voor #${order.number}`}
      description="Als een klant belt of mailt. Hij komt bij Te beoordelen, net als een aanvraag uit het retourportaal."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={start}>Retour starten</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {order.lines.length > 1 && (
          <RadioGroup
            label="Artikel"
            value={String(line)}
            onChange={(v) => setLine(Number(v))}
            options={order.lines.map((l, i) => ({
              value: String(i),
              label: `${product(l.productId)?.name ?? l.productId} · ${l.size}`
            }))}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reden">
            {(c) => (
              <Select {...c} value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
                {REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
              </Select>
            )}
          </Field>
          <Field
            label="Wat de klant wil"
            hint={wish === "ruilen" && chosen !== undefined
              ? `Ruilen naar ${sizeUp(chosen.productId, chosen.size)}`
              : undefined}
          >
            {(c) => (
              <Select {...c} value={wish} onChange={(e) => setWish(e.target.value as Resolution)}>
                {WISHES.map((w) => <option key={w} value={w}>{RESOLUTION_LABEL[w]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Wat de klant zei" optional>
          {(c) => <Textarea {...c} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── Terugbetalen ──────────────────────────────────────────────────────────────────────────────── */

/**
 * A refund: how much (all of it or part), and what it does. The money leaves the building, so the
 * confirm names the amount and the role's limit; the send window (ADR-0023) keeps an undo for 30 s.
 */
export function RefundDialog({ order, open, onClose, limit, rol, onRefund }: {
  readonly order: Order
  readonly open: boolean
  readonly onClose: () => void
  readonly limit: number | null
  readonly rol: string
  readonly onRefund: (amount: number) => void
}) {
  const [raw, setRaw] = useState(String(order.total).replace(".", ","))
  const amount = Number(raw.replace(/\./g, "").replace(",", "."))
  const valid = Number.isFinite(amount) && amount > 0 && amount <= order.total
  const over = limit !== null && amount > limit
  const name = customer(order.customerId)?.name ?? "de klant"
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Terugbetalen aan ${name}`}
      description={`Het geld gaat terug via ${order.payment}, meestal binnen vijf werkdagen. Na de verzendtijd van 30 seconden kun je het niet meer terughalen.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={!valid || over} onClick={() => onRefund(amount)}>
            {valid ? `${money(amount)} terugbetalen` : "Terugbetalen"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field
          label="Bedrag"
          hint={`Hoogstens ${money(order.total)}, het totaal van #${order.number}.`}
          error={raw !== "" && !valid ? `Kies een bedrag tussen € 0,01 en ${money(order.total)}` : undefined}
        >
          {(c) => <Input {...c} prefix="€" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />}
        </Field>
        {over && (
          <Notice tone="warn" title={`Je rol ${rol} mag tot ${money(limit)} per bestelling terugbetalen`}>
            Vraag Elena Hart of iemand van Financiën om dit bedrag terug te betalen, of kies een lager bedrag.
          </Notice>
        )}
      </div>
    </Dialog>
  )
}
