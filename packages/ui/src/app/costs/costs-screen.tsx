import { Link } from "@tanstack/react-router"
import { type ReactElement, type ReactNode, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Edit3, MoreHorizontal, Plus, RotateCcw, Sheet as SheetIcon, Trash2 } from "../../icons"
import { Blocked } from "../access/blocked"
import { EmptyPage } from "../common/empty-page"
import { Field, FormDialog, TextField } from "../common/form-dialog"
import { PageGuide } from "../common/page-guide"
import { PageHeader } from "../common/page-header"
import { formatCurrency } from "../lib/format"
import { parseTyped } from "../lib/sheets"
import type { Currency } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import { Segmented } from "../team/bits"
import { type CostKind, type CostMonth, type CostRow, type CostsSource, useCostsSource } from "./costs-source"

const GUIDE = [{
  title: "Van omzet naar nettowinst",
  body: "Vul in wat de winkel per maand kost. Analyse en Rekenbladen rekenen er de nettowinst en de ROAS mee uit.",
  art: "budget"
}] as const

const moneyIn = (currency: string) => (n: number, cents = false) =>
  formatCurrency(n, currency as Currency, {
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  })
const pct = (n: number) => new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 }).format(n)

const ORDER: ReadonlyArray<CostKind> = ["percent", "per_order", "fixed", "ads"]
const GROUP: Record<CostKind, string> = {
  percent: "Deel van de omzet",
  per_order: "Per bestelling",
  fixed: "Vast per maand",
  ads: "Advertenties"
}
const SOURCE_NAME: Record<string, string> = { meta: "Meta Ads", "google-ads": "Google Ads" }

const NO_FIGURES = { revenue: 0, orders: 0, ads: 0, other: 0, costs: 0, net: 0, margin: 0, roas: 0 }

/** A control the role may not use: there, disabled, saying what is missing (as `Gate` does from the design's store). */
const Gated = ({ gate, children }: { gate: CostsSource["edit"]; children: ReactElement }) =>
  gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>

/** "Koppelen", where the host has somewhere to connect: its integrations screen, or its own step. */
function ConnectLink(
  { connect, source, children }: { connect: CostsSource["connect"]; source: CostRow["source"]; children: ReactNode }
) {
  if (connect === undefined) return null
  if ("to" in connect) {
    return (
      <Link to={connect.to} className="text-arc-ink hover:underline">
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => connect.run(source)} className="text-arc-ink hover:underline">
      {children}
    </button>
  )
}

/**
 * Kosten (`/costs`, PLAN 42): what the shop costs per month, against what it took in. Fixed costs
 * and ad spend are typed per month; a connected ad account fills its own row, and a typed amount
 * overrides it with a way back. The foot of the table is the point: revenue, costs, net profit and
 * the margin, the figures Analyse and Rekenbladen read.
 */
export function CostsPage() {
  const source = useCostsSource()
  const { lines, months, connect } = source
  const money = moneyIn(source.currency)
  const fig = (m: CostMonth | undefined) => (m === undefined ? NO_FIGURES : source.figures[m.id] ?? NO_FIGURES)
  const [dialog, setDialog] = useState<CostRow | "new" | null>(null)
  const last = months[months.length - 1]
  const prev = months[months.length - 2] ?? last
  const f = fig(last)

  if (lines.length === 0) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Kosten" crumbs={[{ label: "Analyse", to: "/analytics" }]} />
        <EmptyPage
          kind="analytics"
          count="0 kostenposten"
          title="Nog geen kosten"
          body="Vul in wat de winkel per maand kost: inkoop, betaalkosten, verpakking, het team, advertenties. Dan rekent Insyte de nettowinst uit, in Analyse en in je rekenbladen."
          action={source.edit.ok ? { label: "Eerste kostenpost", onClick: () => setDialog("new") } : undefined}
          starts={connect === undefined ? undefined : [{
            id: "meta",
            label: "Meta Ads koppelen",
            body: "Dan vult de advertentierij zichzelf.",
            ...("to" in connect ? { to: connect.to } : { onClick: () => connect.run("meta") })
          }]}
        />
        <LineDialog value={dialog} onClose={() => setDialog(null)} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Kosten"
        crumbs={[{ label: "Analyse", to: "/analytics" }]}
        meta={`${lines.length} posten · ${source.rangeLabel}`}
        actions={
          <>
            {source.profitSheet === undefined ? null : (
              <Link
                to={"/sheets/$sheetId" as never}
                params={{ sheetId: source.profitSheet } as never}
                className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
              >
                <SheetIcon className="size-3.5" strokeWidth={1.75} />
                Winst per maand
              </Link>
            )}
            <Gated gate={source.edit}>
              <button
                type="button"
                onClick={() => setDialog("new")}
                className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                Kostenpost
              </button>
            </Gated>
          </>
        }
      />
      <div className="flex min-w-0 flex-col gap-6 px-5 pb-12">
        <p className="max-w-[68ch] text-ink text-md leading-[1.5]">
          In {last?.name.toLowerCase()} hield de winkel <span className="font-medium tabular-nums">{money(f.net)}</span>
          {" "}
          over van <span className="tabular-nums">{money(f.revenue)}</span> omzet, {pct(f.margin)}.{" "}
          <span className="text-ink-2">
            {f.margin >= fig(prev).margin ? "Dat is meer" : "Dat is minder"} dan in {prev?.name.toLowerCase()}{" "}
            ({pct(fig(prev).margin)}). Advertenties waren {pct(f.revenue ? f.ads / f.revenue : 0)}{" "}
            van de omzet, een ROAS van {f.roas.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}.
          </span>
        </p>

        <div className="table-scroll rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 w-[260px] bg-mist px-3 py-2 text-left font-medium text-ink-3 text-xs"
                >
                  Post
                </th>
                {months.map((m) => (
                  <th key={m.id} scope="col" className="bg-mist px-3 py-2 text-right font-medium text-ink-3 text-xs">
                    {m.abbr}
                    {m.id === source.running ? " · loopt" : ""}
                  </th>
                ))}
                <th scope="col" className="w-10 bg-mist" />
              </tr>
            </thead>
            <tbody>
              {ORDER.map((kind) => {
                const group = lines.filter((l) => l.kind === kind)
                if (!group.length) return null
                return [
                  <tr key={`h-${kind}`}>
                    <th
                      colSpan={months.length + 2}
                      scope="colgroup"
                      className="px-3 pt-4 pb-1 text-left font-medium text-ink-2 text-xs"
                    >
                      {GROUP[kind]}
                    </th>
                  </tr>,
                  ...group.map((l, i) => (
                    <LineRow
                      key={l.id}
                      l={l}
                      band={i % 2 === 1}
                      onEdit={() => setDialog(l)}
                    />
                  ))
                ]
              })}
            </tbody>
            <tfoot>
              {(
                [
                  ["Omzet", (m: CostMonth) => money(fig(m).revenue), "text-ink-2"],
                  ["Alle kosten", (m: CostMonth) => money(fig(m).costs), "text-ink-2"],
                  ["Nettowinst", (m: CostMonth) => money(fig(m).net), "font-medium text-ink"],
                  ["Marge", (m: CostMonth) => pct(fig(m).margin), "text-ink-2"]
                ] as const
              ).map(([label, value, tone], i) => (
                <tr key={label}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 bg-mist px-3 py-2 text-left font-medium text-sm",
                      i === 0 && "pt-3",
                      tone
                    )}
                  >
                    {label}
                  </th>
                  {months.map((m) => (
                    <td
                      key={m.id}
                      className={cn(
                        "bg-mist px-3 py-2 text-right tabular-nums",
                        i === 0 && "pt-3",
                        tone,
                        label === "Nettowinst" && fig(m).net < 0 && "text-signal-red"
                      )}
                    >
                      {value(m)}
                    </td>
                  ))}
                  <td className="bg-mist" />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        <p className="text-ink-3 text-sm">
          Omzet en bestellingen komen uit de winkelgeschiedenis, net als in Analyse. Typ in een cel om een bedrag te
          veranderen; Enter bewaart, Esc laat het staan.
        </p>
      </div>
      <LineDialog value={dialog} onClose={() => setDialog(null)} />
      <PageGuide id="costs" title="Kosten" steps={GUIDE} />
    </div>
  )
}

function LineRow({ l, band, onEdit }: { l: CostRow; band: boolean; onEdit: () => void }) {
  const source = useCostsSource()
  const money = moneyIn(source.currency)
  const { months } = source
  const canEdit = source.edit.ok
  const reads = l.reads
  const editable = canEdit && (l.kind === "fixed" || l.kind === "ads")
  const rule = l.kind === "percent"
    ? `${l.rate.toLocaleString("nl-NL")}% van de omzet`
    : l.kind === "per_order"
    ? `${money(l.rate, true)} per bestelling`
    : l.kind === "ads"
    ? (reads
      ? `Uit ${SOURCE_NAME[l.source]}`
      : l.source !== "manual"
      ? `${SOURCE_NAME[l.source]} is niet gekoppeld; getypt`
      : "Getypt")
    : ""
  const ground = band ? "bg-mist/50" : "bg-paper"
  return (
    <tr className="group/row">
      <th scope="row" className={cn("sticky left-0 z-10 px-3 py-1.5 text-left font-normal", ground)}>
        <span className="flex items-center gap-2.5">
          {l.source !== "manual"
            ? <BrandLogo brand={l.source} name={SOURCE_NAME[l.source] ?? l.name} size={22} />
            : null}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ink">{l.name}</span>
            <span className={cn("truncate text-ink-3 text-xs", !rule && "hidden")}>
              {rule}
              {l.kind === "ads" && l.source === "google-ads" && !reads && source.connect !== undefined ?
                (
                  <>
                    {" · "}
                    <ConnectLink connect={source.connect} source={l.source}>Koppelen</ConnectLink>
                  </>
                ) :
                null}
            </span>
          </span>
        </span>
      </th>
      {months.map((m) => (
        <td key={m.id} className={cn("px-1.5 py-1.5 text-right", ground)}>
          {editable
            ? <AmountCell l={l} m={m} />
            : <span className="px-1.5 text-ink-2 tabular-nums">{money(l.cells[m.id]?.amount ?? 0)}</span>}
        </td>
      ))}
      <td className={cn("px-1 py-1.5", ground)}>
        {canEdit ?
          (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Opties voor ${l.name}`}
                  className="flex size-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100"
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit3 className="size-3.5" strokeWidth={1.75} />
                  Bewerken
                </DropdownMenuItem>
                {reads && l.hasTyped ?
                  (
                    <DropdownMenuItem
                      onClick={() =>
                        source.readFromSource(l, { label: `${l.name} leest weer uit ${SOURCE_NAME[l.source]}` })}
                    >
                      <RotateCcw className="size-3.5" strokeWidth={1.75} />
                      Weer uit {SOURCE_NAME[l.source]} lezen
                    </DropdownMenuItem>
                  ) :
                  null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    source.remove(l, {
                      label: `${l.name} verwijderd`,
                      detail: "De nettowinst rekent nu zonder deze post."
                    })}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) :
          null}
      </td>
    </tr>
  )
}

/** One month's amount, typed in place. A read amount shows its source until someone types over it. */
function AmountCell({ l, m }: { l: CostRow; m: CostMonth }) {
  const source = useCostsSource()
  const money = moneyIn(source.currency)
  const cell = l.cells[m.id]
  const value = cell?.amount ?? 0
  const own = cell?.typed ?? false
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const t = draft.trim()
    setDraft(null)
    if (t === "") {
      if (!own) return
      return source.setAmount(l, m.id, null, { label: `${l.name}, ${m.abbr} gewist` })
    }
    const n = parseTyped(t).value
    if (typeof n !== "number" || n < 0) return
    if (own && value === n) return
    source.setAmount(l, m.id, n, { label: `${l.name}, ${m.abbr}: ${money(n)}` })
  }
  return (
    <input
      value={draft ?? (value ? money(value) : "")}
      onFocus={(e) => {
        setDraft(value ? String(value).replace(".", ",") : "")
        // `select()` focuses the field again: if it was left (Enter) before the frame, that would reopen it with the
        // amount from before the save, and that draft would stay over the saved one.
        const field = e.target
        requestAnimationFrame(() => {
          if (document.activeElement === field) field.select()
        })
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") {
          setDraft(null)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      inputMode="decimal"
      aria-label={`${l.name}, ${m.name}`}
      placeholder="0"
      title={l.kind === "ads" && !own && value ? `Uit ${SOURCE_NAME[l.source] ?? "het account"}` : undefined}
      className={cn(
        "h-8 w-full rounded-md bg-transparent px-1.5 text-right tabular-nums outline-none transition-colors hover:bg-ink/5 focus:bg-paper focus:shadow-[inset_0_0_0_1px_var(--arc)]",
        l.kind === "ads" && !own && value ? "text-ink-2" : "text-ink"
      )}
    />
  )
}

const num = (s: string) => {
  const v = parseTyped(s).value
  return typeof v === "number" ? v : null
}

function LineDialog({ value, onClose }: { value: CostRow | "new" | null; onClose: () => void }) {
  const source = useCostsSource()
  const editing = value && value !== "new" ? value : null
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<CostKind>("fixed")
  const [rate, setRate] = useState("")
  const [amount, setAmount] = useState("")
  const [key, setKey] = useState<string | null>(null)
  const open = value !== null
  const id = editing?.id ?? "new"
  if (open && key !== id) {
    setKey(id)
    setName(editing?.name ?? "")
    setKind(editing?.kind ?? "fixed")
    setRate(
      editing && (editing.kind === "percent" || editing.kind === "per_order")
        ? String(editing.rate).replace(".", ",")
        : ""
    )
    setAmount("")
  }
  if (!open && key !== null) setKey(null)
  const needsRate = kind === "percent" || kind === "per_order"
  const valid = name.trim() && (needsRate ? num(rate) !== null : true)
  // A change that did not take keeps the dialog open with what was typed; the host has said why.
  const settle = (done: Promise<boolean>) => {
    setSaving(true)
    void done.then((ok) => {
      setSaving(false)
      if (ok) onClose()
    })
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? `${editing.name} bewerken` : "Kostenpost toevoegen"}
      description={editing ? undefined : "Een post per soort kosten. Het bedrag per maand typ je daarna in de tabel."}
      primaryLabel={editing ? "Opslaan" : "Toevoegen"}
      disabled={!valid || saving}
      width={500}
      onSubmit={() => {
        const r = needsRate ? (num(rate) ?? 0) * (kind === "percent" && rate.includes("%") ? 100 : 1) : 0
        if (editing) {
          return settle(
            source.update(editing, { name: name.trim(), kind, rate: r }, { label: `${name.trim()} opgeslagen` })
          )
        }
        const a = num(amount)
        settle(
          source.add({ name: name.trim(), kind, rate: r, amountPerMonth: needsRate ? null : a }, {
            label: `${name.trim()} toegevoegd`,
            detail: "De nettowinst rekent er vanaf nu mee."
          })
        )
      }}
    >
      <Field label="Naam">
        <TextField value={name} onChange={setName} placeholder="Bijvoorbeeld: Klantenservice-software" />
      </Field>
      <Field label="Soort">
        <Segmented
          label="Soort"
          value={kind}
          onChange={setKind}
          options={ORDER.map((k) => ({ id: k, label: GROUP[k] }))}
        />
      </Field>
      {needsRate ?
        (
          <Field label={kind === "percent" ? "Percentage van de omzet" : "Bedrag per bestelling"}>
            <TextField value={rate} onChange={setRate} placeholder={kind === "percent" ? "2,9" : "1,40"} />
          </Field>
        ) :
        !editing ?
        (
          <Field label="Bedrag per maand" hint="Voor elke maand hetzelfde; je past ze daarna per maand aan.">
            <TextField value={amount} onChange={setAmount} placeholder="0" />
          </Field>
        ) :
        null}
    </FormDialog>
  )
}
