import { Link, useSearch } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo, useRef, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/table"
import {
  ChevronRight,
  Database,
  Download,
  Grid2x2,
  Key,
  Link2,
  Loader,
  RefreshCcw,
  Store,
  Upload,
  Webhook,
  Zap
} from "../../icons"
import { Gate } from "../access/gate"
import { ChipGroup } from "../common/form-dialog"
import { formatCurrency, formatDateTime, formatRelative } from "../lib/format"
import type { Order } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import { OrderStatusBadge } from "../orders/order-status-badge"
import { BandedList, BandedRow, SettingCard, StatusPill } from "../settings/setting-card"
import { DataTable } from "../table/data-table"
import type { VIEWS } from "./data-search"
import {
  type DataExport,
  type DataImport,
  EXPORT_COLUMNS,
  FULFILMENT_LABEL,
  type Maybe,
  type OrderColumn,
  PAYMENT_LABEL,
  useDataSource
} from "./data-source"

type View = (typeof VIEWS)[number]

const COPY: Record<View | "overview", { title: string; body: string }> = {
  overview: {
    title: "Data",
    body:
      "Importeren, exporteren, tabelweergave, koppelingen, synchronisatiestatus en webhooks voor alles wat Insyte bewaart."
  },
  sheet: {
    title: "Tabel",
    body: "Elke bestelling als rij. Zoek, sorteer en filter zoals in de lijst, of wissel naar een geïmporteerd bestand."
  },
  import: {
    title: "Importeren",
    body: "Sleep een CSV hierheen, controleer de eerste rijen en importeer."
  },
  export: {
    title: "Exporteren",
    body: "Kies de kolommen die je wilt en download ze als CSV."
  },
  integrations: {
    title: "Koppelingen",
    body: "De diensten waar Insyte uit leest, en wanneer elk voor het laatst is gesynchroniseerd."
  },
  sync: {
    title: "Synchronisatiestatus",
    body: "Wanneer elke winkel voor het laatst zijn bestellingen stuurde, en een manier om ze nu opnieuw op te halen."
  },
  webhooks: {
    title: "Webhooks",
    body: "Waar Insyte events naartoe stuurt, en de sleutels waarmee scripts eruit lezen."
  }
}

/** `/data`, with the view its `?view=` names, over the host's `DataSource`. */
export function DataPage() {
  const { view } = useSearch({ strict: false }) as { view?: View | undefined }
  const copy = COPY[view ?? "overview"]
  return (
    <div className="flex flex-col gap-6 px-5 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="font-medium text-3xl text-ink leading-[1.1] tracking-[-0.8px]">
          {copy.title}
        </h1>
        <p className="font-normal text-base text-ink-2 leading-[1.55]">
          {copy.body}
        </p>
      </div>
      {view === "sheet" ?
        <SheetView /> :
        view === "import" ?
        <ImportView /> :
        view === "export" ?
        <ExportView /> :
        view === "integrations" ?
        <IntegrationsView /> :
        view === "sync" ?
        <SyncView /> :
        view === "webhooks" ?
        <WebhooksView /> :
        <OverviewView />}
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────────────────────── */

function ViewLink({
  view,
  icon: Icon,
  title,
  detail
}: {
  view: View
  icon: typeof Database
  title: string
  detail: string
}) {
  return (
    <li>
      <Link
        to="/data"
        search={{ view }}
        className="group/item flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-ink/3"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-mist text-ink-2">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-base text-ink">
            {title}
          </span>
          <span className="truncate text-sm text-ink-3">{detail}</span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-ink-4 transition-transform group-hover/item:translate-x-0.5"
          strokeWidth={1.75}
        />
      </Link>
    </li>
  )
}

function OverviewView() {
  const { counts } = useDataSource()
  const connected = counts.integrations.connected
  const imported = counts.importedRows
  const liveStores = counts.stores.live

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          ["Bestellingen", counts.orders],
          ["Geïmporteerde rijen", imported],
          ["Winkels die synchroniseren", `${liveStores} van ${counts.stores.total}`],
          ["Koppelingen", `${connected} van ${counts.integrations.total}`]
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-sm text-ink-3">{label}</dt>
            <dd className="font-medium text-2xl text-ink tabular-nums">
              {typeof value === "number" ? value.toLocaleString("nl-NL") : value}
            </dd>
          </div>
        ))}
      </dl>
      <SettingCard title="Beheren" icon={Database}>
        <BandedList>
          <ViewLink
            view="sheet"
            icon={Grid2x2}
            title="Tabel"
            detail={`${counts.orders.toLocaleString("nl-NL")} bestellingen als rijen`}
          />
          <ViewLink
            view="import"
            icon={Upload}
            title="Importeren"
            detail={counts.imports
              ? `${counts.imports} ${counts.imports === 1 ? "bestand" : "bestanden"} geïmporteerd`
              : "Een CSV binnenhalen"}
          />
          <ViewLink
            view="export"
            icon={Download}
            title="Exporteren"
            detail="Kolommen kiezen, CSV downloaden"
          />
        </BandedList>
      </SettingCard>
      <SettingCard title="Verbindingen" icon={Link2}>
        <BandedList>
          <ViewLink
            view="integrations"
            icon={Link2}
            title="Koppelingen"
            detail={`${connected} gekoppeld`}
          />
          <ViewLink
            view="sync"
            icon={Loader}
            title="Synchronisatiestatus"
            detail={`${liveStores} ${liveStores === 1 ? "winkel synchroniseert" : "winkels synchroniseren"}`}
          />
          <ViewLink
            view="webhooks"
            icon={Zap}
            title="Webhooks"
            detail="Endpoints en API-sleutels"
          />
        </BandedList>
      </SettingCard>
    </div>
  )
}

/* ── Sheet ─────────────────────────────────────────────────────────────────────────────────── */

const ORDER_COLUMNS: Array<ColumnDef<Order, unknown>> = [
  {
    id: "number",
    accessorKey: "number",
    header: "Bestelling",
    size: 108,
    enableHiding: false,
    cell: (c) => <span className="font-medium text-ink">{c.row.original.number}</span>
  },
  { id: "customer", accessorKey: "customer_name", header: "Klant" },
  { id: "email", accessorKey: "customer_email", header: "E-mail" },
  {
    id: "total",
    accessorKey: "total",
    header: "Totaal",
    size: 104,
    cell: (c) => (
      <span className="font-medium text-ink tabular-nums">
        {formatCurrency(c.row.original.total, c.row.original.currency)}
      </span>
    )
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    size: 124,
    cell: (c) => <OrderStatusBadge status={c.row.original.status} />
  },
  {
    id: "payment",
    accessorKey: "payment_status",
    header: "Betaling",
    size: 104,
    cell: (c) => PAYMENT_LABEL[c.row.original.payment_status]
  },
  {
    id: "fulfillment",
    accessorKey: "fulfillment_status",
    header: "Afhandeling",
    size: 112,
    cell: (c) => FULFILMENT_LABEL[c.row.original.fulfillment_status]
  },
  {
    id: "placed",
    accessorKey: "created_at",
    header: "Geplaatst",
    size: 160,
    cell: (c) => (
      <span className="tabular-nums">
        {formatDateTime(c.row.original.created_at)}
      </span>
    )
  }
]

function importColumns(file: DataImport): Array<ColumnDef<Array<string>, unknown>> {
  return file.header.map((h, i) => ({
    id: `c${i}`,
    accessorFn: (r: Array<string>) => r[i] ?? "",
    header: h || `Kolom ${i + 1}`
  }))
}

function SheetView() {
  const { orders, imports } = useDataSource()
  const rows = useMemo(() => [...orders], [orders])
  const [source, setSource] = useState("orders")
  const file = imports.find((b) => b.id === source)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {imports.length > 0 ?
        (
          <SourceTabs
            value={file ? file.id : "orders"}
            onChange={setSource}
            options={[
              { id: "orders", label: "Bestellingen" },
              ...imports.map((b) => ({ id: b.id, label: b.fileName }))
            ]}
          />
        ) :
        null}
      {file ?
        <ImportTable key={file.id} file={file} /> :
        (
          <DataTable
            columns={ORDER_COLUMNS}
            data={rows}
            searchPlaceholder="Zoek op bestelling, klant, e-mail"
            initialSorting={[{ id: "placed", desc: true }]}
            noun={["sheet row", "sheet rows"]}
            label={["tabelrij", "tabelrijen"]}
          />
        )}
    </div>
  )
}

/** An imported file's rows, once its host has them. */
function ImportTable({ file }: { file: DataImport }) {
  const { useImportRows } = useDataSource()
  const read = useImportRows(file.id)
  const rows = useMemo(() => (read === undefined ? undefined : read.map((r) => [...r])), [read])
  const columns = useMemo(() => importColumns(file), [file])
  if (rows === undefined) {
    return (
      <p className="flex items-center gap-2 text-base text-ink-3">
        <Loader className="size-3.5 animate-spin" /> {file.fileName} laden…
      </p>
    )
  }
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder={`Zoeken in ${file.fileName}`}
      noun={["imported row", "imported rows"]}
    />
  )
}

function SourceTabs({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (id: string) => void
  options: ReadonlyArray<{ id: string; label: string }>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2.5 font-medium text-sm leading-none transition-colors",
            value === o.id
              ? "bg-abyss text-mesh-ink"
              : "bg-paper text-ink-3 hover:bg-mist hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Import ────────────────────────────────────────────────────────────────────────────────── */

function PreviewTable({
  header,
  rows
}: {
  header: ReadonlyArray<string>
  rows: ReadonlyArray<ReadonlyArray<string | number>>
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-paper">
      <Table>
        <TableHeader>
          <TableRow>
            {header.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a CSV header may repeat a name
              <TableHead key={i} className="whitespace-nowrap px-3.5">
                {h || `Kolom ${i + 1}`}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no id of their own
            <TableRow key={ri}>
              {header.map((_, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells follow the header's order
                <TableCell key={ci} className="whitespace-nowrap px-3.5 tabular-nums">
                  {r[ci] ?? ""}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ImportView() {
  const { imports, pending, take, sample, cancel, commit, remove } = useDataSource()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const pick = (file: File | undefined) => {
    if (file) take(file)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {pending?.state === "ready" ?
        (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-base text-ink">
                  {pending.fileName}
                </span>
                <span className="text-sm text-ink-3 tabular-nums">
                  {pending.rowCount.toLocaleString("nl-NL")} rijen · {pending.header.length} kolommen · de eerste{" "}
                  {Math.min(8, pending.rowCount)} getoond
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending.busy}
                  className="flex h-8 items-center rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={pending.busy}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Upload className="size-3.5" strokeWidth={1.75} />
                  {pending.rowCount.toLocaleString("nl-NL")} rijen importeren
                </button>
              </div>
            </div>
            <PreviewTable header={pending.header} rows={pending.firstRows.slice(0, 8)} />
          </div>
        ) :
        pending?.state === "reading" ?
        (
          <div
            role="status"
            className="hatch flex flex-col items-center justify-center gap-3 rounded-xl bg-paper px-10 py-16 text-center"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-mist">
              <Loader className="size-6 animate-spin text-ink-2" strokeWidth={1.75} />
            </span>
            <span className="font-medium text-base text-ink">{pending.fileName} wordt gelezen…</span>
            <span className="max-w-[420px] text-base text-ink-3 leading-[1.6]">
              Zo zie je de eerste rijen.
            </span>
          </div>
        ) :
        (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              pick(e.dataTransfer.files[0])
            }}
            className={cn(
              "hatch flex flex-col items-center justify-center gap-3 rounded-xl px-10 py-16 text-center transition-colors",
              over ? "bg-arc-tint" : "bg-paper hover:bg-mist"
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-mist">
              <Upload className="size-6 text-ink-2" strokeWidth={1.75} />
            </span>
            <span className="font-medium text-base text-ink">
              Sleep een CSV hierheen of klik om er een te kiezen
            </span>
            <span className="max-w-[420px] text-base text-ink-3 leading-[1.6]">
              De eerste rij wordt gelezen als kolomnamen.
            </span>
          </button>
        )}
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {pending || sample === undefined ? null : (
        <button
          type="button"
          onClick={sample}
          className="self-start font-medium text-base text-arc-ink underline underline-offset-2"
        >
          Geen bestand bij de hand? Gebruik een voorbeeld
        </button>
      )}

      {imports.length > 0 ?
        (
          <SettingCard title="Geïmporteerd" icon={Upload}>
            <BandedList>
              {imports.map((b) => (
                <BandedRow
                  key={b.id}
                  title={b.fileName}
                  detail={`${b.rowCount.toLocaleString("nl-NL")} rijen · ${b.header.length} kolommen · ${
                    formatRelative(b.at)
                  }`}
                  trailing={
                    <>
                      <Link
                        to="/data"
                        search={{ view: "sheet" }}
                        className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
                      >
                        Openen in Tabel
                      </Link>
                      <Gate perm="data" arg={2}>
                        <button
                          type="button"
                          onClick={() => remove(b)}
                          className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-signal-red-bg hover:text-signal-red"
                        >
                          Verwijderen
                        </button>
                      </Gate>
                    </>
                  }
                />
              ))}
            </BandedList>
          </SettingCard>
        ) :
        null}
    </div>
  )
}

/* ── Export ────────────────────────────────────────────────────────────────────────────────── */

const toggle = <T extends string>(list: ReadonlyArray<T>, id: T) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

function ExportView() {
  const { orders, imports, counts, useImportRows, exportFile, exporting, exports } = useDataSource()
  const [source, setSource] = useState("orders")
  const file = imports.find((b) => b.id === source)
  const fileRows = useImportRows(file?.id ?? null)
  const [picked, setPicked] = useState<Array<OrderColumn>>([
    "number",
    "customer",
    "total",
    "status",
    "placed"
  ])
  const [pickedImport, setPickedImport] = useState<Record<string, Array<string>>>(
    {}
  )

  // An imported file exports its own columns, all of them until some are turned off.
  const importCols = file
    ? (pickedImport[file.id] ?? file.header.map((_, i) => String(i)))
    : []

  const { header, rows, count } = useMemo(() => {
    if (file) {
      const idx = importCols.map(Number)
      return {
        header: idx.map((i) => file.header[i] ?? `Kolom ${i + 1}`),
        rows: (fileRows ?? []).slice(0, 5).map((r) => idx.map((i) => r[i] ?? "")),
        count: file.rowCount
      }
    }
    const cols = EXPORT_COLUMNS.filter((c) => picked.includes(c.id))
    return {
      header: cols.map((c) => c.label),
      rows: orders.slice(0, 5).map((o) => cols.map((c) => c.read(o))),
      count: counts.orders
    }
  }, [file, fileRows, importCols, picked, orders, counts.orders])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {imports.length > 0 ?
        (
          <SourceTabs
            value={file ? file.id : "orders"}
            onChange={setSource}
            options={[
              { id: "orders", label: "Bestellingen" },
              ...imports.map((b) => ({ id: b.id, label: b.fileName }))
            ]}
          />
        ) :
        null}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm text-ink-3">Kolommen</span>
        {file ?
          (
            <ChipGroup
              value={importCols}
              options={file.header.map((h, i) => ({
                id: String(i),
                label: h || `Kolom ${i + 1}`
              }))}
              onToggle={(id) => setPickedImport((p) => ({ ...p, [file.id]: toggle(importCols, id) }))}
            />
          ) :
          (
            <ChipGroup
              value={picked}
              options={EXPORT_COLUMNS}
              onToggle={(id) => setPicked((p) => toggle(p, id))}
            />
          )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base text-ink-2 tabular-nums">
          {count.toLocaleString("nl-NL")} rijen · {header.length} kolommen
        </span>
        <Gate perm="data.export">
          <button
            type="button"
            disabled={header.length === 0 || count === 0 || exporting}
            onClick={() =>
              exportFile({
                source: file ? { import: file.id } : "orders",
                columns: file ? importCols : picked
              })}
            className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ?
              <Loader className="size-3.5 animate-spin" strokeWidth={1.75} /> :
              <Download className="size-3.5" strokeWidth={1.75} />}
            CSV downloaden
          </button>
        </Gate>
      </div>
      {header.length > 0 ?
        (
          <PreviewTable
            header={header}
            rows={rows.map((r) => r.map(String))}
          />
        ) :
        <p className="text-base text-ink-3">Kies minstens één kolom.</p>}
      {exports.length > 0 ? <RecentExports exports={exports} /> : null}
    </div>
  )
}

const EXPORT_STATE: Record<DataExport["state"], { tone: "success" | "info" | "danger" | "neutral"; label: string }> = {
  queued: { tone: "info", label: "In de wachtrij" },
  running: { tone: "info", label: "Wordt geschreven" },
  ready: { tone: "success", label: "Klaar" },
  failed: { tone: "danger", label: "Mislukt" },
  expired: { tone: "neutral", label: "Verlopen" }
}

/** The member's exports: each file downloads for seven days. */
function RecentExports({ exports }: { exports: ReadonlyArray<DataExport> }) {
  return (
    <SettingCard title="Recente exports" icon={Download}>
      <BandedList>
        {exports.map((e) => (
          <BandedRow
            key={e.id}
            title={e.fileName}
            detail={e.state === "running" || e.state === "queued"
              ? `${e.done.toLocaleString("nl-NL")}${
                e.total === null ? "" : ` van ${e.total.toLocaleString("nl-NL")}`
              } rijen · gevraagd ${formatRelative(e.at)}`
              : e.state === "ready" && e.expiresAt !== null
              ? `${e.done.toLocaleString("nl-NL")} rijen · te downloaden tot ${formatDateTime(e.expiresAt)}`
              : `${e.done.toLocaleString("nl-NL")} rijen · gevraagd ${formatRelative(e.at)}`}
            trailing={
              <>
                <StatusPill tone={EXPORT_STATE[e.state].tone} label={EXPORT_STATE[e.state].label} />
                {e.download === undefined ? null : (
                  <button
                    type="button"
                    onClick={e.download}
                    className="flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
                  >
                    <Download className="size-3.5" strokeWidth={1.75} />
                    Downloaden
                  </button>
                )}
              </>
            }
          />
        ))}
      </BandedList>
    </SettingCard>
  )
}

/* ── Integrations ──────────────────────────────────────────────────────────────────────────── */

/** A host's action as a button: done, or greyed out with why. */
function act(action: Maybe): { onClick?: () => void; disabled?: boolean; title?: string } {
  return typeof action === "function"
    ? { onClick: () => void action() }
    : { disabled: true, title: action.reason }
}

function IntegrationsView() {
  const { integrations, manageIntegrations } = useDataSource()
  return (
    <SettingCard
      title={`Gekoppeld · ${integrations.filter((i) => i.status === "connected").length} van ${integrations.length}`}
      icon={Link2}
      action={manageIntegrations ?
        <SettingsLink to="/settings/integrations">Beheren in instellingen</SettingsLink> :
        undefined}
    >
      <BandedList>
        {integrations.map((it) => (
          <BandedRow
            key={it.key}
            leading={<BrandLogo brand={it.key} name={it.name} size={32} />}
            title={it.name}
            detail={it.status === "connected" && it.syncedAt
              ? `${it.description} · gesynchroniseerd ${formatRelative(it.syncedAt)}`
              : it.description}
            trailing={it.status === "connected" ?
              (
                <>
                  <StatusPill tone="success" label="Gekoppeld" />
                  <button
                    type="button"
                    aria-label={`${it.name} nu synchroniseren`}
                    {...act(it.sync)}
                    className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RefreshCcw className="size-3.5" />
                  </button>
                </>
              ) :
              it.status === "connecting" ?
              (
                <span className="flex items-center gap-1.5 text-sm text-ink-2">
                  <Loader className="size-3.5 animate-spin" /> Synchroniseren…
                </span>
              ) :
              manageIntegrations ?
              (
                <SettingsLink to="/settings/integrations">
                  {it.status === "action_required" ? "Oplossen in instellingen" : "Koppelen"}
                </SettingsLink>
              ) :
              <StatusPill tone="neutral" label="Niet gekoppeld" />}
          />
        ))}
      </BandedList>
    </SettingCard>
  )
}

function SettingsLink({
  to,
  children
}: {
  to: "/settings/integrations" | "/settings/api-keys" | "/settings/webhooks" | "/settings/stores"
  children: React.ReactNode
}) {
  return (
    <Link
      // Instellingen → Koppelingen is the design app's only (`manageIntegrations`).
      to={to as never}
      className="flex h-7 items-center gap-1 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
    >
      {children}
      <ChevronRight className="size-3" strokeWidth={1.75} />
    </Link>
  )
}

/* ── Sync status ───────────────────────────────────────────────────────────────────────────── */

function SyncView() {
  const { stores } = useDataSource()

  return (
    <SettingCard
      title="Winkels"
      icon={Store}
      action={<SettingsLink to="/settings/stores">Winkels beheren</SettingsLink>}
    >
      <BandedList>
        {stores.map((st) => {
          const running = st.progress !== undefined
          return (
            <BandedRow
              key={st.id}
              leading={<BrandLogo brand="shopify" name={st.name} size={32} />}
              title={st.name}
              detail={running ?
                (
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-32 overflow-hidden rounded-full bg-ink/8">
                      <span
                        className="block h-full rounded-full bg-arc transition-[width] duration-150"
                        style={{ width: `${st.progress}%` }}
                      />
                    </span>
                    <span className="tabular-nums">
                      Synchroniseren · {st.progress}%
                    </span>
                  </span>
                ) :
                !st.live ?
                (
                  `${st.domain} · niet gekoppeld`
                ) :
                st.syncedAt ?
                (
                  `${st.domain} · ${st.orders === null ? "" : `${st.orders} bestellingen · `}gesynchroniseerd ${
                    formatRelative(st.syncedAt)
                  }`
                ) :
                (
                  `${st.domain} · nog niet gesynchroniseerd`
                )}
              trailing={st.live ?
                (
                  <>
                    <StatusPill
                      tone={running ? "info" : "success"}
                      label={running ? "Synchroniseren" : "Bijgewerkt"}
                    />
                    <button
                      type="button"
                      {...act(st.sync)}
                      disabled={running || typeof st.sync !== "function"}
                      className="flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                    >
                      <RefreshCcw
                        className={cn("size-3.5", running && "animate-spin")}
                      />
                      Nu synchroniseren
                    </button>
                  </>
                ) :
                <SettingsLink to="/settings/stores">Opnieuw koppelen</SettingsLink>}
            />
          )
        })}
      </BandedList>
    </SettingCard>
  )
}

/* ── Webhooks ──────────────────────────────────────────────────────────────────────────────── */

/* The endpoints Settings → Webhooks lists. They are added and changed there; this is the read. */
function WebhooksView() {
  const { endpoints, keys: active } = useDataSource()
  return (
    <div className="flex flex-col gap-8">
      <SettingCard
        title="Endpoints"
        icon={Webhook}
        action={<SettingsLink to="/settings/webhooks">Webhooks beheren</SettingsLink>}
      >
        <BandedList>
          {endpoints.length === 0 ?
            (
              <BandedRow
                title="Geen endpoints"
                detail="Voeg er een toe onder Instellingen → Webhooks, dan stuurt Insyte er events naartoe."
              />
            ) :
            null}
          {endpoints.map((w) => {
            const { state, rate } = w
            return (
              <BandedRow
                key={w.id}
                leading={
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink/6">
                    <Webhook className="size-4 text-ink-2" />
                  </span>
                }
                title={w.url}
                detail={`${w.events} events · ${
                  rate === null
                    ? "geen leveringen in 24 uur"
                    : `${rate.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}% geslaagd in 24 uur`
                }`}
                trailing={
                  <StatusPill
                    tone={state === "active"
                      ? "success"
                      : state === "failing" || state === "disabled"
                      ? "danger"
                      : state === "paused"
                      ? "neutral"
                      : "info"}
                    label={state === "active"
                      ? "In orde"
                      : state === "failing"
                      ? "Mislukt"
                      : state === "disabled"
                      ? "Uitgezet"
                      : state === "paused"
                      ? "Uit"
                      : "Wacht op eerste event"}
                  />
                }
              />
            )
          })}
        </BandedList>
      </SettingCard>
      <SettingCard
        title={`API-sleutels · ${active.length} actief`}
        icon={Key}
        action={<SettingsLink to="/settings/api-keys">Sleutels beheren</SettingsLink>}
      >
        <BandedList>
          {active.map((k) => (
            <BandedRow
              key={k.id}
              leading={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink/6">
                  <Key className="size-4 text-ink-2" />
                </span>
              }
              title={k.label}
              detail={`${k.prefix}… · ${k.lastUsedAt ? `gebruikt ${formatRelative(k.lastUsedAt)}` : "nooit gebruikt"}`}
            />
          ))}
        </BandedList>
      </SettingCard>
    </div>
  )
}
