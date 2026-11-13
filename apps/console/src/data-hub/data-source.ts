import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { DataOverview, ExportList, ExportRow, ImportFile, ImportList } from "@insyte/modules/data/domain/Data"
import type { ApiKeyView } from "@insyte/modules/developer/domain/ApiKey"
import type { WebhookEndpointView } from "@insyte/modules/developer/domain/Webhook"
import type { OrderPage } from "@insyte/modules/orders/domain/Orders"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import type {
  DataExport,
  DataImport,
  DataIntegration,
  DataPending,
  DataSource,
  DataStore,
  ExportAsk,
  IntegrationStatus
} from "@insyte/ui/app/data/data-source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { DATA, dataWrites, importRowsAtom, NO_ROWS } from "../data/data.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"
import { orderOf } from "../orders/orders-source.ts"

/*
 * The Data hub's source in the console (M14 step 5): `Data.overview` for the counts; a CSV goes up through
 * `PUT /api/data/imports`, is read on the jobs Worker, and shows its first rows until it is imported (with Undo) or
 * cancelled; Tabel shows the newest orders and an imported file's first rows; "CSV downloaden" asks the
 * `ExportWorkflow` for the file, which downloads once it is written and stays under "Recente exports" for seven days.
 * Koppelingen are the workspace's stores and connected accounts; Insyte syncs them itself, so "Nu synchroniseren"
 * says when. Webhooks and keys are the developer settings' lists, for a role that may see them.
 */

const iso = (ms: number) => new Date(ms).toISOString()

/** Most a CSV may be (the server's `MAX_IMPORT_BYTES`), checked here first so a large file is never sent. */
const MAX_BYTES = 10 * 1024 * 1024

const SYNCS_ITSELF = { reason: "Insyte haalt de gegevens zelf op, elk kwartier." }

const CATALOG: Record<string, { key: string; name: string; description: string }> = {
  klaviyo: { key: "klaviyo", name: "Klaviyo", description: "E-mail- en sms-campagnes" },
  meta: { key: "meta", name: "Meta Ads", description: "Advertentiekosten en resultaten per campagne" },
  google_ads: { key: "google-ads", name: "Google Ads", description: "Advertentiekosten en resultaten per campagne" }
}

const STATUS: Record<string, IntegrationStatus> = {
  connected: "connected",
  connecting: "connecting",
  token_expired: "action_required",
  scope_missing: "action_required",
  rate_limited: "action_required",
  revoked: "disconnected",
  disconnected: "disconnected"
}

const UPLOAD: Record<number, string> = {
  403: "Je rol kan geen bestanden importeren.",
  411: "Je browser gaf de grootte van het bestand niet mee. Probeer het opnieuw.",
  413: "Een CSV kan hoogstens 10 MB zijn.",
  415: "Hier kun je alleen CSV-bestanden importeren."
}

const READ_ERROR: Record<string, (file: ImportFile) => string> = {
  not_csv: () => "Dit is geen tekstbestand. Sla het op als CSV (UTF-8) en probeer het opnieuw.",
  empty: (f) => `${f.fileName} heeft geen rijen om te importeren.`,
  too_large: () => "Een CSV kan hoogstens 50.000 rijen hebben.",
  parse_failed: (f) =>
    `Op regel ${
      f.errorLine ?? "?"
    } opent een aanhalingsteken dat nergens sluit. Controleer het bestand en probeer het opnieuw.`
}

const COPY: RefusalCopy = {
  gone: "Dat bestand bestaat niet meer",
  other: (tagged) => {
    switch (tagged._tag) {
      case "ImportNotFound":
        toast.error("Dat bestand bestaat niet meer")
        return true
      case "ImportNotReady":
        toast.error("Dat kan nog niet", { description: "Het bestand wordt nog gelezen, of is al geïmporteerd." })
        return true
      case "UploadNotFound":
        toast.error("Het bestand kwam niet door", { description: "Probeer het opnieuw." })
        return true
      case "UnknownColumn":
        toast.error("Die kolom kan niet mee", { description: "Kies de kolommen opnieuw." })
        return true
      default:
        return false
    }
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

const importOf = (f: ImportFile): DataImport => ({
  id: f.id,
  fileName: f.fileName,
  header: f.header,
  rowCount: f.rowCount,
  at: iso(f.committedAt ?? f.createdAt)
})

/** A file through the browser's own download, as the link of the session. */
const download = (url: string) => {
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener"
  a.click()
}

const exportOf = (e: ExportRow): DataExport => ({
  id: e.id,
  fileName: e.fileName,
  state: e.state,
  done: e.rowsWritten,
  total: e.rowsTotal,
  at: iso(e.createdAt),
  expiresAt: e.expiresAt === null ? null : iso(e.expiresAt),
  ...(e.fileUrl === null ? {} : { download: () => download(e.fileUrl!) })
})

/** An imported file's rows, from `Data.imports.rows` (the first thousand). */
function useImportRows(id: string | null): ReadonlyArray<ReadonlyArray<string>> | undefined {
  const result = useAtomValue(id === null ? NO_ROWS : importRowsAtom(id))
  return Option.getOrUndefined(Option.map(AsyncResult.value(result), (r) => r.rows))
}

type Reading = { readonly fileName: string; readonly importId?: string }

export function useConsoleDataSource(input: {
  overview: DataOverview
  imports: ImportList | undefined
  exports: ExportList | undefined
  orders: OrderPage | undefined
  stores: ReadonlyArray<StoreView> | undefined
  endpoints: ReadonlyArray<WebhookEndpointView> | undefined
  keys: ReadonlyArray<ApiKeyView> | undefined
  refresh: () => void
}): DataSource {
  const keys = { reactivityKeys: DATA }
  const write = {
    upload: useAtomSet(dataWrites.upload, { mode: "promiseExit" }),
    preview: useAtomSet(dataWrites.preview, { mode: "promiseExit" }),
    commit: useAtomSet(dataWrites.commit, { mode: "promiseExit" }),
    remove: useAtomSet(dataWrites.remove, { mode: "promiseExit" }),
    request: useAtomSet(dataWrites.request, { mode: "promiseExit" }),
    undo: useAtomSet(dataWrites.undo, { mode: "promiseExit" })
  }
  const [reading, setReading] = useState<Reading | null>(null)
  const [read, setRead] = useState<{ file: ImportFile; firstRows: ReadonlyArray<ReadonlyArray<string>> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  /** The export this tab asked for, downloaded once it is written. */
  const awaited = useRef<string | null>(null)

  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })

  // The uploaded file is read on the jobs Worker: its first rows once they are in, or why it could not be read.
  const importId = reading?.importId
  useEffect(() => {
    if (importId === undefined) return
    let stop = false
    const tick = async (tries: number): Promise<void> => {
      const exit = await write.preview({ payload: { importId } })
      if (stop) return
      if (Exit.isFailure(exit)) {
        setReading(null)
        refused(failureOf(exit))
        return
      }
      const file = exit.value.import
      if (file.state === "parsed") {
        setReading(null)
        setRead({ file, firstRows: exit.value.firstRows })
        return
      }
      if (file.state === "failed") {
        setReading(null)
        toast.error("Dit bestand kan niet worden geïmporteerd", {
          description: READ_ERROR[file.error ?? ""]?.(file) ?? "Probeer het opnieuw."
        })
        void write.remove({ payload: { importId }, ...keys })
        return
      }
      if (tries > 120) {
        setReading(null)
        toast.error("Het lezen duurt te lang", { description: "Probeer het zo nog eens." })
        return
      }
      await new Promise((resolve) => setTimeout(resolve, tries < 10 ? 500 : 1500))
      if (!stop) return tick(tries + 1)
    }
    void tick(0)
    return () => {
      stop = true
    }
    // The run is the import's; the write functions are stable for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId])

  // The export asked for here: downloaded as soon as it is written, said when it could not be.
  const exportRows = input.exports?.rows
  const running = exportRows?.some((e) => e.state === "queued" || e.state === "running") ?? false
  useEffect(() => {
    const id = awaited.current
    if (id === null || exportRows === undefined) return
    const row = exportRows.find((e) => e.id === id)
    if (row === undefined) return
    if (row.state === "ready" && row.fileUrl !== null) {
      awaited.current = null
      download(row.fileUrl)
      toast.success(`${row.fileName} gedownload`, {
        description: `${row.rowsWritten.toLocaleString("nl-NL")} rijen. Hij blijft zeven dagen onder Recente exports.`
      })
    } else if (row.state === "failed") {
      awaited.current = null
      toast.error("De export is mislukt", { description: "Probeer het opnieuw." })
    }
  }, [exportRows])

  // While a file is written, its progress also comes as frames; this asks again for a tab without them.
  const { refresh } = input
  useEffect(() => {
    if (!running) return
    const timer = setInterval(refresh, 3000)
    return () => clearInterval(timer)
  }, [running, refresh])

  const pending: DataPending | null = read !== null
    ? {
      state: "ready",
      fileName: read.file.fileName,
      header: read.file.header,
      firstRows: read.firstRows,
      rowCount: read.file.rowCount,
      busy
    }
    : reading !== null
    ? { state: "reading", fileName: reading.fileName }
    : null

  const take = (file: File) => {
    if (!/\.(csv|tsv|txt)$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("Hier kun je alleen CSV-bestanden importeren")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("Dit bestand is te groot", { description: UPLOAD[413] })
      return
    }
    setRead(null)
    setReading({ fileName: file.name })
    void (async () => {
      const response = await fetch("/api/data/imports", {
        method: "PUT",
        headers: { "content-type": file.type || "text/csv", "x-file-name": encodeURIComponent(file.name) },
        body: file
      }).catch(() => null)
      if (response?.status !== 201) {
        setReading(null)
        toast.error("Het bestand kwam niet door", {
          description: UPLOAD[response?.status ?? 0] ?? "Probeer het zo nog eens."
        })
        return
      }
      const { fileId } = (await response.json()) as { fileId: string }
      const exit = await write.upload({ payload: { fileId }, ...keys })
      if (Exit.isFailure(exit)) {
        setReading(null)
        refused(failureOf(exit))
        return
      }
      setReading({ fileName: file.name, importId: exit.value.id })
    })()
  }

  const orders = useMemo(() => (input.orders?.rows ?? []).map(orderOf), [input.orders])
  const imports = useMemo(() => (input.imports?.rows ?? []).filter((f) => f.state === "done").map(importOf), [
    input.imports
  ])
  const exports = useMemo(() => (exportRows ?? []).map(exportOf), [exportRows])
  const stores = useMemo<Array<DataStore>>(() =>
    (input.stores ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.shopDomain,
      live: s.status === "connected",
      orders: null,
      syncedAt: s.lastSyncedAt === null ? undefined : iso(s.lastSyncedAt),
      sync: SYNCS_ITSELF
    })), [input.stores])
  const integrations = useMemo<Array<DataIntegration>>(() => {
    const shopify = input.stores ?? []
    const latest = shopify.reduce<number | null>(
      (t, s) => (s.lastSyncedAt !== null && (t === null || s.lastSyncedAt > t) ? s.lastSyncedAt : t),
      null
    )
    return [
      ...(shopify.length === 0 ? [] : [{
        key: "shopify",
        name: "Shopify",
        description: "Bestellingen, producten en klanten",
        status: shopify.some((s) => s.status === "connected") ? "connected" as const : "disconnected" as const,
        syncedAt: latest === null ? undefined : iso(latest),
        sync: SYNCS_ITSELF
      }]),
      ...input.overview.connections.flatMap((c) => {
        const known = CATALOG[c.provider]
        return known === undefined ? [] : [{
          ...known,
          status: STATUS[c.status] ?? "disconnected",
          syncedAt: c.lastSyncedAt === null ? undefined : iso(c.lastSyncedAt),
          sync: SYNCS_ITSELF
        }]
      })
    ]
  }, [input.stores, input.overview])

  return {
    counts: {
      orders: input.overview.orders,
      importedRows: input.overview.importedRows,
      imports: input.overview.imports,
      stores: { live: input.overview.stores.connected, total: input.overview.stores.total },
      integrations: {
        connected: integrations.filter((i) => i.status === "connected").length,
        total: integrations.length
      }
    },
    orders,
    imports,
    useImportRows,
    pending,
    take,
    cancel: () => {
      const id = read?.file.id
      setRead(null)
      if (id !== undefined) void write.remove({ payload: { importId: id }, ...keys })
    },
    commit: () => {
      if (read === null) return
      setBusy(true)
      void write.commit({ payload: { importId: read.file.id }, ...keys }).then((exit) => {
        setBusy(false)
        if (Exit.isFailure(exit)) {
          refused(failureOf(exit))
          return
        }
        setRead(null)
        const { import: file, undo: ticket } = exit.value
        const said = `${file.rowCount.toLocaleString("nl-NL")} rijen geïmporteerd uit ${file.fileName}`
        if (ticket === null) toast.success(said, { description: "Ze staan nu in Tabel." })
        else undoable(said, () => undo(ticket.token), "Ze staan nu in Tabel.")
      })
    },
    remove: (row) =>
      void write.remove({ payload: { importId: row.id }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) {
          refused(failureOf(exit))
          return
        }
        const ticket = exit.value.undo
        if (ticket === null) toast.success(`${row.fileName} verwijderd`)
        else undoable(`${row.fileName} verwijderd`, () => undo(ticket.token))
      }),
    exportFile: (ask: ExportAsk) => {
      setAsking(true)
      void write.request({ payload: { source: ask.source, columns: ask.columns }, ...keys }).then((exit) => {
        setAsking(false)
        if (Exit.isFailure(exit)) {
          refused(failureOf(exit))
          return
        }
        awaited.current = exit.value.id
        toast("De export wordt geschreven", {
          description: "Hij downloadt vanzelf zodra hij klaar is. Je krijgt ook een melding."
        })
      })
    },
    exporting: asking || running,
    exports,
    integrations,
    manageIntegrations: false,
    stores,
    endpoints: (input.endpoints ?? []).map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events.length,
      rate: w.health.count === 0 ? null : ((w.health.count - w.health.failed) / w.health.count) * 100,
      state: w.state
    })),
    keys: (input.keys ?? []).filter((k) => k.status === "active").map((k) => ({
      id: k.id,
      label: k.label,
      prefix: k.prefix,
      lastUsedAt: k.lastUsedAt === null ? undefined : iso(k.lastUsedAt)
    }))
  }
}
