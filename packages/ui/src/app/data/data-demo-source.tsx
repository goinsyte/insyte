import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
import { exportCsv } from "../lib/bulk"
import { endpointState, health } from "../lib/developer"
import { undoable } from "../lib/undo"
import { useDeveloper } from "../stores/developer-store"
import { parseCsv, useImports } from "../stores/import-store"
import { useWorkspace } from "../stores/workspace-store"
import { type DataPending, type DataSource, DataSourceProvider, EXPORT_COLUMNS } from "./data-source"

/*
 * The Data hub in the design app: the workspace's demo orders and stores, the files imported in this browser
 * (`stores/import-store.ts`), the developer store's endpoints and keys. Nothing leaves the browser; an export downloads
 * at once and is not kept, so "Recente exports" stays empty here.
 */

const SAMPLE_CSV = `sku,title,stock,price
NW-TEE-001,Heavyweight tee · black,142,29.00
NW-TEE-002,Heavyweight tee · bone,88,29.00
NW-HOOD-010,Loopback hoodie · navy,36,74.00
NW-CAP-004,"Six-panel cap, washed",210,24.00
NW-SOCK-003,Rib socks · 3 pack,4,18.00
`

type Read = { fileName: string; header: string[]; rows: string[][] }

export function DemoDataSource({ children }: { children: ReactNode }) {
  const orders = useWorkspace((s) => s.orders)
  const stores = useWorkspace((s) => s.stores)
  const integrations = useWorkspace((s) => s.integrations)
  const syncIntegration = useWorkspace((s) => s.syncIntegration)
  const batches = useImports((s) => s.batches)
  const addBatch = useImports((s) => s.addBatch)
  const removeBatch = useImports((s) => s.removeBatch)
  const syncs = useImports((s) => s.syncs)
  const syncStore = useImports((s) => s.syncStore)
  const keys = useDeveloper((s) => s.apiKeys)
  const endpoints = useDeveloper((s) => s.webhooks)
  const deliveries = useDeveloper((s) => s.deliveries)
  const [read, setRead] = useState<Read | null>(null)
  const imports = useMemo(
    () => batches.map((b) => ({ id: b.id, fileName: b.fileName, header: b.header, rowCount: b.rows.length, at: b.at })),
    [batches]
  )

  const take = (fileName: string, text: string) => {
    const parsed = parseCsv(text)
    if (parsed.header.length === 0 || parsed.rows.length === 0) {
      toast.error(`${fileName} heeft geen rijen om te importeren`)
      return
    }
    setRead({ fileName, ...parsed })
  }

  const pending: DataPending | null = read === null ? null : {
    state: "ready",
    fileName: read.fileName,
    header: read.header,
    firstRows: read.rows.slice(0, 8),
    rowCount: read.rows.length,
    busy: false
  }

  const source: DataSource = {
    counts: {
      orders: orders.length,
      importedRows: batches.reduce((n, b) => n + b.rows.length, 0),
      imports: batches.length,
      stores: { live: stores.filter((s) => s.status === "connected").length, total: stores.length },
      integrations: {
        connected: integrations.filter((i) => i.status === "connected").length,
        total: integrations.length
      }
    },
    orders,
    imports,
    useImportRows: (id) => (id === null ? undefined : batches.find((b) => b.id === id)?.rows),
    pending,
    take: (file) => {
      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
        toast.error("Hier kun je alleen CSV-bestanden importeren")
        return
      }
      void file.text().then((text) => take(file.name, text))
    },
    sample: () => take("inventory-sample.csv", SAMPLE_CSV),
    cancel: () => setRead(null),
    commit: () => {
      if (read === null) return
      const batch = addBatch(read)
      setRead(null)
      undoable(
        `${batch.rows.length.toLocaleString("nl-NL")} rijen geïmporteerd uit ${batch.fileName}`,
        () => removeBatch(batch.id),
        "Ze staan nu in Tabel."
      )
    },
    remove: (row) => {
      const restore = removeBatch(row.id)
      if (restore) undoable(`${row.fileName} verwijderd`, restore)
    },
    exportFile: (ask) => {
      if (ask.source === "orders") {
        const cols = EXPORT_COLUMNS.filter((c) => ask.columns.includes(c.id))
        exportCsv("orders-export", cols.map((c) => c.label), orders.map((o) => cols.map((c) => c.read(o))))
        return
      }
      const id = ask.source.import
      const batch = batches.find((b) => b.id === id)
      if (batch === undefined) return
      const idx = ask.columns.map(Number)
      exportCsv(
        batch.fileName.replace(/\.csv$/i, "-export"),
        idx.map((i) => batch.header[i] ?? `Kolom ${i + 1}`),
        batch.rows.map((r) => idx.map((i) => r[i] ?? ""))
      )
    },
    exporting: false,
    exports: [],
    integrations: integrations.map((it) => ({
      key: it.key,
      name: it.name,
      description: it.description,
      status: it.status,
      syncedAt: it.syncedAt,
      sync: async () => {
        await syncIntegration(it.key)
        toast.success(`${it.name} gesynchroniseerd`)
      }
    })),
    manageIntegrations: true,
    stores: stores.map((st) => {
      const count = orders.filter((o) => o.store_id === st.id).length
      const sync = syncs[st.id]
      return {
        id: st.id,
        name: st.name,
        domain: st.domain,
        live: st.status === "connected",
        orders: sync?.records ?? count,
        syncedAt: sync?.syncedAt,
        progress: sync?.progress,
        sync: async () => {
          await syncStore(st.id, count)
          toast.success(`${st.name} gesynchroniseerd`, {
            description: `${count} ${count === 1 ? "bestelling" : "bestellingen"} gecontroleerd`
          })
        }
      }
    }),
    endpoints: endpoints.map((w) => {
      const ds = deliveries.filter((d) => d.endpointId === w.id)
      return { id: w.id, url: w.url, events: w.events.length, rate: health(ds).rate, state: endpointState(w, ds) }
    }),
    keys: keys.filter((k) => k.status === "active").map((k) => ({
      id: k.id,
      label: k.label,
      prefix: k.prefix,
      lastUsedAt: k.last_used_at ?? undefined
    }))
  }

  return <DataSourceProvider value={source}>{children}</DataSourceProvider>
}
