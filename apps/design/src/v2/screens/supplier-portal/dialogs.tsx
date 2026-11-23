import { useState } from "react"
import { BRAND, CARRIERS, ME, PROBLEM_LABEL } from "../../fixtures/supplier-portal.ts"
import type { ProblemKind, SupOrder } from "../../fixtures/supplier-portal.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { Button } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { day, saveFile } from "./parts.tsx"
import { report, ship } from "./store.ts"

/*
 * The two things a supplier tells Northwind about an order: it left (with which carrier and its
 * track & trace), or something is wrong (what, until when, and why). Both work for one order or for
 * the rows picked in the list.
 */

export function ShipDialog({ orders, open, onClose }: {
  readonly orders: ReadonlyArray<SupOrder>
  readonly open: boolean
  readonly onClose: () => void
}) {
  const [carrier, setCarrier] = useState<string>("PostNL")
  const [codes, setCodes] = useState<Readonly<Record<string, string>>>({})
  const [paste, setPaste] = useState("")
  const one = orders.length === 1
  const filled = orders.filter((o) => (codes[o.number] ?? "").trim().length >= 8)
  const close = () => {
    setCodes({})
    setPaste("")
    onClose()
  }
  const submit = () => {
    if (filled.length === 0) return
    ship(
      filled.map((o) => ({
        number: o.number,
        parcel: { carrier, tracking: (codes[o.number] ?? "").trim(), at: DEMO_NOW.date }
      }))
    )
    close()
  }
  /** "6417, 3SNWD123…" per line: the way a warehouse system exports them. */
  const applyPaste = (text: string) => {
    setPaste(text)
    const next: Record<string, string> = { ...codes }
    for (const line of text.split(/\n/)) {
      const [number = "", code = ""] = line.split(/[,;\t]/).map((x) => x.trim().replace(/^#/, ""))
      if (orders.some((o) => o.number === number) && code !== "") next[number] = code
    }
    setCodes(next)
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      size={one ? "sm" : "md"}
      title={one
        ? `#${orders[0]?.number ?? ""} markeren als verzonden`
        : `${orders.length} bestellingen markeren als verzonden`}
      description={`${BRAND} ziet de track & trace meteen bij de bestelling, en de klant krijgt hem doorgestuurd.`}
      footer={
        <>
          <Button onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={filled.length === 0} onClick={submit}>
            {one || filled.length === orders.length
              ? "Markeren als verzonden"
              : `${filled.length} van ${orders.length} markeren`}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Field label="Vervoerder">
          {(c) => (
            <Select {...c} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {[...CARRIERS, "FedEx"].map((x) => <option key={x}>{x}</option>)}
            </Select>
          )}
        </Field>
        {one ?
          (
            <Field label="Trackingnummer" hint="Minstens acht tekens, zoals op het label.">
              {(c) => (
                <Input
                  {...c}
                  value={codes[orders[0]?.number ?? ""] ?? ""}
                  onChange={(e) => setCodes({ [orders[0]?.number ?? ""]: e.target.value })}
                  placeholder="3SXYZ0123456789"
                  autoComplete="off"
                />
              )}
            </Field>
          ) :
          (
            <>
              <Field label="Plakken uit je systeem" optional hint="Eén regel per pakket: bestelnummer, trackingnummer.">
                {(c) => (
                  <Textarea
                    {...c}
                    rows={3}
                    value={paste}
                    onChange={(e) => applyPaste(e.target.value)}
                    placeholder={"6417, 3SNWD0123456789\n6425, 3SNWD0123456790"}
                  />
                )}
              </Field>
              <ul
                className="flex max-h-64 flex-col gap-2 overflow-y-auto pane-scroll"
                aria-label="Trackingnummer per bestelling"
              >
                {orders.map((o) => (
                  <li key={o.number} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3">
                    <label htmlFor={`tt-${o.number}`} className="figure text-sm text-ink">#{o.number}</label>
                    <Input
                      id={`tt-${o.number}`}
                      value={codes[o.number] ?? ""}
                      onChange={(e) =>
                        setCodes({ ...codes, [o.number]: e.target.value })}
                      placeholder="Trackingnummer"
                      autoComplete="off"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
      </form>
    </Dialog>
  )
}

const KINDS: ReadonlyArray<ProblemKind> = ["voorraad", "later", "adres", "beschadigd", "anders"]

export function ProblemDialog({ orders, open, onClose }: {
  readonly orders: ReadonlyArray<SupOrder>
  readonly open: boolean
  readonly onClose: () => void
}) {
  const [kind, setKind] = useState<ProblemKind>("voorraad")
  const [date, setDate] = useState("2026-11-25")
  const [note, setNote] = useState("")
  const dated = kind === "voorraad" || kind === "later"
  const close = () => {
    setKind("voorraad")
    setNote("")
    onClose()
  }
  const submit = () => {
    const [y = 2026, m = 11, d = 25] = date.split("-").map(Number)
    report(orders.map((o) => o.number), {
      kind,
      note: note.trim(),
      at: DEMO_NOW.date,
      ...(dated ? { newDate: new Date(y, m - 1, d, 17) } : {})
    })
    close()
  }
  const valid = note.trim().length > 0 || kind !== "anders"
  return (
    <Dialog
      open={open}
      onClose={close}
      title={orders.length === 1
        ? `Probleem met #${orders[0]?.number ?? ""}`
        : `Probleem met ${orders.length} bestellingen`}
      description={`${BRAND} krijgt er een ticket van, laat de klant weten wat er gebeurt en ziet de bestelling als vertraagd.`}
      footer={
        <>
          <Button onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>Melden aan {BRAND}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <RadioGroup
          label="Wat is er aan de hand"
          value={kind}
          onChange={setKind}
          options={KINDS.map((k) => ({ value: k, label: PROBLEM_LABEL[k] }))}
        />
        {dated && (
          <Field
            label="Nieuwe overdrachtsdatum"
            hint={`Vandaag is het ${
              day(DEMO_NOW.date)
            }. ${BRAND} rekent de nieuwe leverdatum voor de klant hiermee uit.`}
          >
            {(c) => (
              <Input
                {...c}
                type="date"
                min="2026-11-23"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Toelichting" optional={kind !== "anders"}>
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bijvoorbeeld: maat M komt donderdag binnen, de rest ligt klaar."
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/**
 * Packing slips: one page per order with what goes in the box and where it goes, and no prices
 * (Northwind ships as itself). An HTML file the warehouse prints.
 */
export function downloadSlips(orders: ReadonlyArray<SupOrder>) {
  const pages = orders
    .map((o) =>
      `<section style="page-break-after:always"><h1>${BRAND} · pakbon #${o.number}</h1><p>${o.shipTo.name}<br>${o.shipTo.line1}<br>${o.shipTo.postcode} ${o.shipTo.city}<br>${o.shipTo.country}</p><table><tr><th>Artikel</th><th>Maat</th><th>SKU</th><th>Aantal</th></tr>${
        o.lines.map((l) => `<tr><td>${l.title}</td><td>${l.size}</td><td>${l.sku}</td><td>${l.quantity}</td></tr>`)
          .join("")
      }</table>${
        o.note === undefined ? "" : `<p><b>Let op:</b> ${o.note}</p>`
      }<p>Verstuurd namens ${BRAND} door ${ME.name}.</p></section>`
    )
    .join("")
  saveFile(
    orders.length === 1 ? `pakbon-${orders[0]?.number ?? ""}.html` : `pakbonnen-${orders.length}.html`,
    `<!doctype html><meta charset="utf-8"><title>Pakbonnen</title><style>body{font:14px system-ui;margin:40px}td,th{padding:4px 16px 4px 0;text-align:left}</style>${pages}`,
    "text/html"
  )
}
