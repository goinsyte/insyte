import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { type ReactElement, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Switch } from "../../components/switch"
import { Edit3, FileText, Mail, MessagesSquare, Pause, Play, Plus, Truck } from "../../icons"
import { Blocked } from "../access/blocked"
import { TextField } from "../common/form-dialog"
import { PageHeader } from "../common/page-header"
import type { Stock } from "../lib/catalog"
import { VIA_LABEL } from "../lib/forwarding"
import { pct } from "../lib/returns"
import type { Supplier } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { StatusPill } from "../settings/setting-card"
import { DataTable } from "../table/data-table"
import { PORTAL_LABEL } from "./portal-label"
import { type ApiState, type PingOutcome, type SupplierRow as Row, type TeamGate, useSuppliersSource } from "./source"
import { SupplierFormDialog } from "./supplier-form-dialog"

/*
 * Suppliers, scored. Each row is computed from the orders that carry the supplier's products: how
 * many are open, how many are past their hand-off date, and the share shipped on time — measured on
 * a bar, with the figure beside it. The stock feed and API columns say how much of their stock the
 * console can actually see. A supplier opens as a modal with their products and late orders, and
 * the three things an operator does about a supplier: message them, ask for a restock of what is
 * running low, and pause new orders while something is sorted out.
 */

const FEED: Record<string, string> = { live: "Live", in_stock_out_of_stock: "Alleen op voorraad of niet", none: "Geen" }

/** A control the role may not use: disabled, with what is missing, from the host's answer. */
function GateBy({ gate, children }: { gate: TeamGate; children: ReactElement }) {
  return gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>
}

export function SuppliersPage() {
  const source = useSuppliersSource()
  const { rows, Empty, Closing } = source
  const [openId, setOpenId] = useState<string | null>(null)
  const [inviting, setInviting] = useState<Supplier | null>(null)
  const [editing, setEditing] = useState<Row | "new" | null>(null)
  const quality = source.qualityOf

  const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
    () => [
      {
        id: "supplier",
        accessorKey: "name",
        header: "Leverancier",
        size: 260,
        enableHiding: false,
        cell: (c) => {
          const r = c.row.original
          return (
            <span className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-mist font-medium text-ink-2 text-xs">
                {r.name.slice(0, 1)}
              </span>
              <span className="truncate font-medium text-ink">{r.name}</span>
              {r.paused
                ? (
                  <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px font-medium text-signal-amber text-xs">
                    Gepauzeerd
                  </span>
                )
                : null}
            </span>
          )
        }
      },
      {
        id: "products",
        accessorKey: "products",
        header: "Producten",
        size: 90,
        cell: (c) => <span className="tabular-nums">{c.row.original.products}</span>
      },
      {
        id: "open",
        accessorKey: "open",
        header: "Open bestellingen",
        size: 110,
        cell: (c) => <span className="tabular-nums">{c.row.original.open}</span>
      },
      {
        id: "delayed",
        accessorKey: "delayed",
        header: "Vertraagd",
        size: 90,
        cell: (c) => (
          <span
            className={cn("tabular-nums", c.row.original.delayed > 0 ? "font-medium text-signal-red" : "text-ink-3")}
          >
            {c.row.original.delayed}
          </span>
        )
      },
      {
        id: "ontime",
        accessorFn: (r) => (r.onTime === null ? -1 : r.onTime),
        header: "Op tijd",
        size: 150,
        cell: (c) => {
          const v = c.row.original.onTime
          if (v === null) return <span className="text-ink-3">Niets verzonden</span>
          return (
            <span className="flex items-center gap-2">
              <span className="relative block h-1 w-16 overflow-hidden rounded-full bg-ink/10">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", v < 0.8 ? "bg-signal-amber" : "bg-arc")}
                  style={{ width: `${v * 100}%` }}
                />
              </span>
              <span className="tabular-nums">{Math.round(v * 100)}%</span>
            </span>
          )
        }
      },
      {
        id: "complaints",
        accessorFn: (r) => quality(r.id)?.rate ?? 0,
        header: "Klachten",
        size: 96,
        cell: (c) => {
          const q = quality(c.row.original.id)
          return q && q.sold > 0
            ? (
              <span
                className={q.over ? "font-medium text-signal-amber tabular-nums" : "tabular-nums"}
                title={`${q.complaints} klachten op ${q.sold} verkocht in 90 dagen`}
              >
                {pct(q.rate)}
              </span>
            )
            : <span className="text-ink-3">—</span>
        }
      },
      {
        id: "checks",
        accessorFn: (r) => quality(r.id)?.passed ?? 0,
        header: "Controles",
        size: 96,
        cell: (c) => {
          const q = quality(c.row.original.id)
          return q && q.judged > 0
            ? <span className="tabular-nums" title="Goedgekeurd van beoordeeld">{q.passed} van {q.judged}</span>
            : <span className="text-ink-3">—</span>
        }
      },
      { id: "feed", accessorFn: (r) => FEED[r.supplier.stock_indicator], header: "Voorraadfeed", size: 120 },
      {
        id: "api",
        accessorFn: (r) => (r.supplier.api_connected ? "Gekoppeld" : "Niet gekoppeld"),
        header: "API",
        size: 120
      },
      {
        id: "portal",
        accessorFn: (r) => PORTAL_LABEL[r.portal].label,
        header: "Portaal",
        size: 140,
        cell: (c) => (
          <StatusPill
            tone={PORTAL_LABEL[c.row.original.portal].tone}
            label={PORTAL_LABEL[c.row.original.portal].label}
          />
        )
      }
    ],
    [quality]
  )

  const open = rows.find((r) => r.id === openId) ?? null
  const save = source.save

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Leveranciers"
        meta={source.standing(rows)}
        actions={save ?
          (
            <GateBy gate={source.canCreate}>
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                Nieuwe leverancier
              </button>
            </GateBy>
          ) :
          undefined}
      />
      <div className="min-w-0 px-5 pb-6">
        {rows.length === 0 ?
          <Empty onCreate={save && source.canCreate.ok ? () => setEditing("new") : undefined} /> :
          (
            <DataTable
              columns={columns}
              data={rows}
              actions={source.actions}
              noun={["supplier", "suppliers"]}
              getRowId={(r) => r.id}
              searchPlaceholder="Leveranciers zoeken"
              initialSorting={[{ id: "delayed", desc: true }]}
              initialVisibility={Object.fromEntries(source.hidden.map((id) => [id, false]))}
              onRowClick={(r) => setOpenId(r.id)}
            />
          )}
      </div>
      {Closing ?
        (
          <Closing
            empty={rows.length === 0}
            onInvite={() => {
              const next = rows.find((r) => r.portal !== "active")
              if (next) setInviting(next.supplier)
            }}
          />
        ) :
        null}
      <SupplierDialog
        row={open}
        onClose={() => setOpenId(null)}
        onInvite={(s) => setInviting(s)}
        onEdit={save
          ? (r) => setEditing(r)
          : undefined}
      />
      {source.portal ? <source.portal.InviteDialog supplier={inviting} onClose={() => setInviting(null)} /> : null}
      {save ?
        (
          <SupplierFormDialog
            open={editing !== null}
            onOpenChange={(v) => !v && setEditing(null)}
            initial={editing !== null && editing !== "new" ? source.inputOf?.(editing) : undefined}
            onSave={(input) => save(input, editing !== null && editing !== "new" ? editing : undefined)}
          />
        ) :
        null}
    </div>
  )
}

const STOCK_TONE: Record<Stock, string> = {
  available: "text-ink-3",
  low: "font-medium text-signal-amber",
  out: "font-medium text-signal-red"
}

function SupplierDialog(
  { row, onClose, onInvite, onEdit }: {
    row: Row | null
    onClose: () => void
    onInvite: (s: Supplier) => void
    onEdit?: ((row: Row) => void) | undefined
  }
) {
  const source = useSuppliersSource()
  const { products: theirs, late } = source.useDetail(row)
  const low = theirs.filter((p) => p.stock !== undefined && p.stock !== "available")

  return (
    <Dialog open={row !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        {row ?
          (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-mist font-medium text-ink-2 text-md">
                    {row.name.slice(0, 1)}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <DialogTitle className="flex items-center gap-2">
                      {row.name}
                      {row.paused
                        ? (
                          <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px font-medium text-signal-amber text-xs">
                            Gepauzeerd
                          </span>
                        )
                        : null}
                    </DialogTitle>
                    <DialogDescription>
                      {row.supplier.contact_email}
                      {row.supplier.contact_phone ? ` · ${row.supplier.contact_phone}` : ""}
                    </DialogDescription>
                  </div>
                  {onEdit ?
                    (
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        className="mr-7 ml-auto flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
                      >
                        <Edit3 className="size-3.5" strokeWidth={1.75} />
                        Bewerken
                      </button>
                    ) :
                    null}
                </div>
              </DialogHeader>

              <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-mist">
                {[
                  ["Op tijd", row.onTime === null ? "—" : `${Math.round(row.onTime * 100)}%`],
                  ["Open bestellingen", String(row.open)],
                  ["Vertraagd", String(row.delayed)],
                  ["Voorraadfeed", FEED[row.supplier.stock_indicator] ?? "Geen"]
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
                    <dt className="text-xs text-ink-3">{k}</dt>
                    <dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <section className="flex flex-col gap-1">
                <h3 className="font-medium text-ink-3 text-xs">Hun producten · {theirs.length}</h3>
                <ul className="flex max-h-44 flex-col overflow-y-auto">
                  {theirs.map((p, i) => {
                    const st = p.stock
                    return (
                      <li key={p.id}>
                        <Link
                          to="/products/$productId"
                          params={{ productId: p.id }}
                          onClick={onClose}
                          className={cn(
                            "flex h-9 items-center gap-3 rounded-md px-2.5 text-base transition-colors hover:bg-ink/6",
                            i % 2 === 0 && "bg-mist"
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-ink">{p.title}</span>
                          {p.units === undefined
                            ? null
                            : <span className="text-sm text-ink-3 tabular-nums">{p.units} stuks</span>}
                          {st === undefined
                            ? null
                            : (
                              <span className={cn("w-20 text-right text-sm", STOCK_TONE[st])}>
                                {st === "out" ? "Uitverkocht" : st === "low" ? "Laag" : "Op voorraad"}
                              </span>
                            )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {late.length > 0 ?
                (
                  <section className="flex flex-col gap-1">
                    <h3 className="font-medium text-ink-3 text-xs">Vertraagde bestellingen · {late.length}</h3>
                    <div className="flex flex-wrap gap-1">
                      {late.slice(0, 8).map((o) => (
                        <Link
                          key={o.id}
                          to="/orders/$orderId"
                          params={{ orderId: o.id }}
                          onClick={onClose}
                          className="rounded-sm bg-signal-red-bg px-1.5 py-0.5 font-medium text-signal-red text-xs tabular-nums hover:opacity-85"
                        >
                          {o.number}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) :
                null}

              <ForwardPrefsSection row={row} />

              {source.statementsOf ?
                (
                  <section className="flex flex-col gap-2">
                    <h3 className="font-medium text-ink-3 text-xs">Afrekeningen</h3>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-ink-2 text-sm">Per maand, regel voor regel, met een factuur.</p>
                      <Link
                        to={source.statementsOf(row)}
                        onClick={onClose}
                        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
                      >
                        <FileText className="size-3.5" strokeWidth={1.75} />
                        Afrekeningen bekijken
                      </Link>
                    </div>
                  </section>
                ) :
                null}

              {source.portal
                ? (
                  <source.portal.Section
                    supplier={row.supplier}
                    onInvite={() => onInvite(row.supplier)}
                    onClose={onClose}
                  />
                )
                : null}

              <DialogFooter className="sm:justify-between">
                <button
                  type="button"
                  onClick={() => source.pauseOrResume([row])}
                  className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  {row.paused
                    ? <Play className="size-3.5" strokeWidth={1.75} />
                    : <Pause className="size-3.5" strokeWidth={1.75} />}
                  {row.paused ? "Nieuwe bestellingen hervatten" : "Nieuwe bestellingen pauzeren"}
                </button>
                <div className="flex gap-2">
                  {source.restock ?
                    (
                      <button
                        type="button"
                        disabled={low.length === 0}
                        onClick={() => source.restock?.(row, low)}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4"
                      >
                        <Truck className="size-3.5" strokeWidth={1.75} />
                        {low.length === 0 ? "Niets bij te bestellen" : `${low.length} bijbestellen`}
                      </button>
                    ) :
                    null}
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      const chat = source.chatOf(row)
                      if (chat && source.openChat) source.openChat(chat)
                      else window.location.href = `mailto:${row.supplier.contact_email}`
                    }}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
                  >
                    {source.chatOf(row)
                      ? <MessagesSquare className="size-3.5" strokeWidth={1.75} />
                      : <Mail className="size-3.5" strokeWidth={1.75} />}
                    Bericht aan {row.name.split(" ")[0]}
                  </button>
                </div>
              </DialogFooter>
            </>
          ) :
          null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Doorsturen (PLAN 24): how this supplier takes its orders — its portal, an e-mail or its API — and
 * whether a paid order goes to it at once. Each change applies with Undo.
 */
function ForwardPrefsSection({ row }: { row: Row }) {
  const source = useSuppliersSource()
  const pref = source.prefOf(row.id)
  const gate = source.forwardGate
  const name = row.name
  const set = (patch: Partial<typeof pref>, said: string) => source.setPref(row, patch, said)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium text-ink-3 text-xs">Doorsturen</h3>
      <div className="flex flex-wrap items-center gap-2">
        <span
          role="radiogroup"
          aria-label={`Hoe bestellingen naar ${name} gaan`}
          className="inline-flex h-8 items-center gap-0.5 rounded-md bg-ink/5 p-0.5"
        >
          {(["portal", "email", "api"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={pref.via === v}
              disabled={!gate.ok}
              title={gate.ok ? undefined : gate.reason}
              onClick={() => set({ via: v }, `${name} krijgt bestellingen via ${VIA_LABEL[v].toLowerCase()}`)}
              className={cn(
                "h-7 rounded-[5px] px-2.5 font-medium text-sm transition-colors disabled:cursor-not-allowed",
                pref.via === v
                  ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
                  : "text-ink-2 enabled:hover:text-ink"
              )}
            >
              {VIA_LABEL[v]}
            </button>
          ))}
        </span>
        <label className="flex items-center gap-2 text-ink-2 text-sm">
          <Switch
            checked={pref.auto}
            disabled={!gate.ok}
            onCheckedChange={(auto) =>
              set(
                { auto },
                auto
                  ? `Betaalde bestellingen gaan meteen naar ${name}`
                  : `Bestellingen voor ${name} wachten weer op doorsturen`
              )}
            aria-label="Betaalde bestellingen meteen doorsturen"
          />
          Betaalde bestellingen meteen doorsturen
        </label>
      </div>
      {pref.via === "api" ? <ApiSection row={row} /> : null}
    </section>
  )
}

const pingLabel = (state: NonNullable<ApiState>) =>
  state.lastPing === null
    ? "Nog niet getest"
    : state.lastPing.ok
    ? `Bereikbaar · ${state.lastPing.ms ?? 0} ms`
    : "Niet bereikbaar bij de laatste test"

/**
 * Their own API (M8.2): the address Insyte posts orders to, signed with a secret it makes for them, shown once; where
 * they report back; and a test that sends a signed ping.
 */
function ApiSection({ row }: { row: Row }) {
  const source = useSuppliersSource()
  const api = source.api
  const gate = source.forwardGate
  const state = api?.stateOf(row.id) ?? null
  const [url, setUrl] = useState("")
  const [relinking, setRelinking] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tested, setTested] = useState<PingOutcome | null>(null)
  if (!api) return null
  const btn =
    "flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-sm transition-colors disabled:cursor-not-allowed disabled:text-ink-4"
  const link = async () => {
    setBusy(true)
    const made = await api.connect(row, url.trim())
    setBusy(false)
    if (made === undefined) return
    setSecret(made)
    setRelinking(false)
    setTested(null)
    setUrl("")
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-mist px-3 py-2.5">
      {state && !relinking ?
        (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-ink text-sm">{state.url}</span>
              <span
                className={cn(
                  "text-xs",
                  tested
                    ? (tested.ok ? "text-ink-3" : "text-signal-red")
                    : state.lastPing && !state.lastPing.ok
                    ? "text-signal-red"
                    : "text-ink-3"
                )}
              >
                {tested
                  ? (tested.ok ? `Bereikbaar · ${tested.ms ?? 0} ms` : tested.reason ?? "Niet bereikbaar")
                  : pingLabel(state)}
              </span>
            </span>
            <button
              type="button"
              disabled={!gate.ok || busy}
              title={gate.ok ? undefined : gate.reason}
              onClick={async () => {
                setBusy(true)
                setTested(await api.test(row))
                setBusy(false)
              }}
              className={cn(btn, "field text-ink enabled:hover:field-hover")}
            >
              {busy ? "Bezig…" : "Verbinding testen"}
            </button>
            <button
              type="button"
              disabled={!gate.ok}
              onClick={() => setRelinking(true)}
              className={cn(btn, "text-ink-2 enabled:hover:bg-ink/6 enabled:hover:text-ink")}
            >
              Opnieuw koppelen
            </button>
            <button
              type="button"
              disabled={!gate.ok}
              onClick={() => api.disconnect(row)}
              className={cn(btn, "text-signal-red enabled:hover:bg-signal-red-bg")}
            >
              Ontkoppelen
            </button>
          </div>
        ) :
        (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void link()
            }}
          >
            <span className="min-w-0 flex-1">
              <TextField
                value={url}
                onChange={setUrl}
                placeholder={`https://${row.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.nl/insyte/orders`}
              />
            </span>
            <button
              type="submit"
              disabled={!gate.ok || busy || !url.trim().startsWith("https://")}
              title={gate.ok ? undefined : gate.reason}
              className="flex h-9 cursor-pointer items-center rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {state ? "Opnieuw koppelen" : "Koppelen"}
            </button>
          </form>
        )}
      {secret ?
        (
          <div className="flex flex-col gap-1.5">
            <p className="text-ink-2 text-sm">
              Geef {row.name}{" "}
              deze sleutel. Insyte ondertekent er elke bestelling mee, en zij ondertekenen er wat ze terugmelden mee. Je
              ziet hem maar één keer.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-paper px-2.5 py-1.5 font-mono text-ink text-sm">
                {secret}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(secret)}
                className={cn(btn, "field text-ink hover:field-hover")}
              >
                Kopiëren
              </button>
            </div>
          </div>
        ) :
        null}
      <p className="text-ink-3 text-xs">
        Bestellingen gaan als JSON naar dit adres. {row.name}{" "}
        meldt acceptatie, problemen, track & trace en voorraad terug op {api.hookOf(row.id)}.
      </p>
    </div>
  )
}
