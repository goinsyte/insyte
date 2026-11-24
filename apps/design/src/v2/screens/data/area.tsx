import { useEffect, useRef, useState } from "react"
import type { AreaDef } from "../../areas.ts"
import {
  duplicateGroups,
  EXPORT_COLUMNS,
  EXPORT_LABEL,
  EXPORT_STATUS,
  EXPORTS,
  knownSku,
  parseCsv,
  SAMPLE_CSV,
  SAMPLE_NAME,
  SYNCS
} from "../../fixtures/data.ts"
import type { ExportJob, ExportKind, Parsed } from "../../fixtures/data.ts"
import { CUSTOMERS, ORDERS, PRODUCTS, SUPPLIERS } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { FileDrop, FileRow } from "../../ui/file-drop.tsx"
import { Download, FileText, RefreshCcw, Upload, Users } from "../../ui/icons.tsx"
import { Field, Select } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ProgressBar } from "../../ui/progress.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { Spinner } from "../../ui/spinner.tsx"
import { ErrorState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"

const META = `${
  ORDERS.length.toLocaleString("nl-NL")
} bestellingen · ${PRODUCTS.length} producten · ${CUSTOMERS.length} klantprofielen`

type Tab = "importeren" | "exporteren" | "opschonen" | "synchronisatie"

/* What the demo keeps while it is looked at: finished imports and new exports. */
type Imported = {
  readonly id: string
  readonly name: string
  readonly rows: number
  readonly into: string
  readonly at: string
}
let imported: ReadonlyArray<Imported> = []
let exports: ReadonlyArray<ExportJob> = []
let made = 0

/**
 * Data: import, export, clean up and see what syncs. Rebuilt from `/app/data` (`data-screen.tsx`):
 * a CSV is read in the browser, checked against the products Insyte knows and imported; an export
 * writes the chosen columns from the same records every list shows; duplicates go to the customers'
 * merge review. Seeing it needs Data · bekijken; importing, exporting and syncing need Data · wijzigen.
 */
function DataScreen() {
  const access = useAccess("data")
  const state = dataState(useView())
  const tab = (useQuery("tab") ?? "importeren") as Tab

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title="Data" />
        <Denied area="data" what="de data" />
      </Page>
    )
  }

  return (
    <Page width="record">
      <PageHead
        title="Data"
        meta={state === "empty" ? "Nog niets in Insyte: koppel een winkel of importeer een CSV" : META}
      />
      {!access.edit && state === "ready" && <ReadOnlyNotice area="data" className="mb-4" />}
      {state === "loading"
        ? (
          <div aria-busy="true" aria-label="Data laden" className="flex flex-col gap-4">
            <Skeleton className="h-9 w-96 max-w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )
        : state === "error"
        ? (
          <ErrorState
            title="Data kwam niet binnen"
            detail="GET /v1/data/overview · 503 · verzoek 0f3b7c"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Er is niets weg; dit scherm kon het overzicht alleen niet ophalen.
          </ErrorState>
        )
        : (
          <div className="flex flex-col gap-6">
            <Tabs
              label="Data"
              value={tab}
              onChange={(next) => setQuery({ tab: next === "importeren" ? null : next })}
              tabs={[
                { value: "importeren", label: "Importeren" },
                { value: "exporteren", label: "Exporteren" },
                {
                  value: "opschonen",
                  label: "Opschonen",
                  count: state === "empty"
                    ? 0
                    : duplicateGroups().length + PRODUCTS.filter((p) => p.stock === 0 && p.status === "actief").length
                },
                { value: "synchronisatie", label: "Synchronisatie" }
              ]}
            />
            {tab === "importeren" && <Import canEdit={access.edit} />}
            {tab === "exporteren" && <Export canEdit={access.edit} empty={state === "empty"} />}
            {tab === "opschonen" && <Cleanup empty={state === "empty"} />}
            {tab === "synchronisatie" && <Syncs canEdit={access.edit} />}
          </div>
        )}
    </Page>
  )
}

type Step =
  | { readonly kind: "idle" }
  | {
    readonly kind: "reading"
    readonly name: string
    readonly bytes: number
    readonly progress: number
    readonly text: string
  }
  | { readonly kind: "failed"; readonly name: string; readonly bytes: number; readonly reason: string }
  | { readonly kind: "ready"; readonly name: string; readonly bytes: number; readonly parsed: Parsed }
  | {
    readonly kind: "importing"
    readonly name: string
    readonly bytes: number
    readonly parsed: Parsed
    readonly done: number
  }

function Import({ canEdit }: { readonly canEdit: boolean }) {
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const [into, setInto] = useState("producten")
  const [history, setHistory] = useState(imported)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current)
  }, [])

  const read = (name: string, bytes: number, text: string) => {
    if (!/\.csv$/i.test(name)) {
      setStep({
        kind: "failed",
        name,
        bytes,
        reason: "Dit is geen CSV. Exporteer het bestand als CSV en kies het opnieuw."
      })
      return
    }
    setStep({ kind: "reading", name, bytes, progress: 0, text })
    let p = 0
    timer.current = window.setInterval(() => {
      p += 0.25
      if (p < 1) {
        setStep({ kind: "reading", name, bytes, progress: p, text })
        return
      }
      if (timer.current !== null) window.clearInterval(timer.current)
      const parsed = parseCsv(text)
      if (parsed.header.length === 0 || parsed.rows.length === 0) {
        setStep({ kind: "failed", name, bytes, reason: "Het bestand heeft geen rijen om te importeren." })
        return
      }
      setStep({ kind: "ready", name, bytes, parsed })
    }, 220)
  }

  const commit = (s: Extract<Step, { kind: "ready" }>) => {
    const total = s.parsed.rows.length
    let done = 0
    setStep({ ...s, kind: "importing", done })
    timer.current = window.setInterval(() => {
      done = Math.min(total, done + Math.max(1, Math.ceil(total / 5)))
      setStep({ ...s, kind: "importing", done })
      if (done < total) return
      if (timer.current !== null) window.clearInterval(timer.current)
      made += 1
      const label = into === "producten"
        ? "Producten (voorraad en inkoopprijs)"
        : into === "klanten"
        ? "Klanten"
        : "Bestellingen"
      imported = [{ id: `imp-${made}`, name: s.name, rows: total, into: label, at: "zojuist" }, ...imported]
      setHistory(imported)
      setStep({ kind: "idle" })
      toast({ title: `${total} rijen geïmporteerd`, body: `${s.name} → ${label}.`, tone: "good" })
    }, 300)
  }

  const header = step.kind === "ready" || step.kind === "importing" ? step.parsed.header : []
  const skuAt = header.findIndex((h) => h.toLowerCase() === "sku")
  const unknown = step.kind === "ready" && skuAt >= 0
    ? step.parsed.rows.filter((r) => !knownSku(r[skuAt] ?? "")).length
    : 0

  return (
    <div className="flex flex-col gap-8">
      <PageSection id="bestand" title="Een CSV binnenhalen">
        <div className="flex flex-col gap-4">
          {step.kind === "idle" && (
            canEdit
              ? (
                <>
                  <FileDrop
                    accept=".csv,text/csv"
                    label="Sleep een CSV hierheen of kies er een"
                    hint="Het bestand wordt in je browser gelezen. Je ziet eerst de eerste rijen."
                    onFiles={(files) => {
                      const f = files[0]
                      if (f === undefined) return
                      void f.text().then((text) => read(f.name, f.size, text))
                    }}
                  />
                  <div>
                    <Button
                      variant="ghost"
                      icon={<FileText />}
                      onClick={() => read(SAMPLE_NAME, SAMPLE_CSV.length, SAMPLE_CSV)}
                    >
                      Voorbeeld gebruiken: de voorraadlijst van Allure
                    </Button>
                  </div>
                </>
              )
              : <Denied area="data" need={2} size="section" what="importeren" />
          )}
          {step.kind === "reading" && (
            <FileRow name={step.name} bytes={step.bytes} state={{ kind: "uploading", progress: step.progress }} />
          )}
          {step.kind === "failed" && (
            <FileRow
              name={step.name}
              bytes={step.bytes}
              state={{ kind: "failed", reason: step.reason }}
              onRetry={() => setStep({ kind: "idle" })}
              onRemove={() => setStep({ kind: "idle" })}
            />
          )}
          {(step.kind === "ready" || step.kind === "importing") && (
            <>
              <FileRow
                name={step.name}
                bytes={step.bytes}
                state={{ kind: "done" }}
                onRemove={step.kind === "ready"
                  ? () => setStep({ kind: "idle" })
                  : undefined}
              />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Field label="Importeren als" className="w-full sm:w-96">
                  {(control) => (
                    <Select
                      {...control}
                      value={into}
                      disabled={step.kind === "importing"}
                      onChange={(event) => setInto(event.target.value)}
                    >
                      <option value="producten">Producten: voorraad en inkoopprijs bijwerken</option>
                      <option value="klanten">Klanten</option>
                      <option value="bestellingen">Bestellingen</option>
                    </Select>
                  )}
                </Field>
                {step.kind === "ready" && (
                  <div className="flex gap-2">
                    <Button onClick={() => setStep({ kind: "idle" })}>Annuleren</Button>
                    <Button variant="primary" icon={<Upload />} onClick={() => commit(step)}>
                      {step.parsed.rows.length} rijen importeren
                    </Button>
                  </div>
                )}
              </div>
              {step.kind === "importing" && (
                <ProgressBar
                  value={step.done}
                  max={step.parsed.rows.length}
                  label="Importeren"
                  detail={`${step.done} van ${step.parsed.rows.length} rijen`}
                />
              )}
              {into === "producten" && unknown > 0 && (
                <Notice
                  tone="info"
                  title={`${unknown} ${unknown === 1 ? "rij heeft" : "rijen hebben"} een SKU die Insyte niet kent`}
                >
                  Die wordt een concept-product, dat je bij Producten nog nakijkt voor het live gaat.
                </Notice>
              )}
              <p className="text-xs text-ink-3">
                {step.parsed.rows.length} rijen · {header.length} kolommen · de eerste{" "}
                {Math.min(8, step.parsed.rows.length)}
              </p>
              <Table label="Eerste rijen" minWidth={Math.max(480, header.length * 140)}>
                <THead>{header.map((h) => <Th key={h}>{h}</Th>)}</THead>
                <TBody>
                  {step.parsed.rows.slice(0, 8).map((r, i) => (
                    <Tr key={i}>
                      {header.map((h, c) => (
                        <Td key={h} figure={/^[\d.,]+$/.test(r[c] ?? "")} muted={c === skuAt && !knownSku(r[c] ?? "")}>
                          {r[c] ?? ""}
                          {c === skuAt && !knownSku(r[c] ?? "") && (
                            <span className="pl-2 text-xs text-ink-3">nieuw</span>
                          )}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </>
          )}
        </div>
      </PageSection>
      <PageSection id="geimporteerd" title="Geïmporteerd">
        {history.length === 0
          ? (
            <p className="text-sm text-ink-2">
              Nog niets geïmporteerd in deze sessie. Wat je importeert, blijft hier staan.
            </p>
          )
          : (
            <List label="Geïmporteerd" divided>
              {history.map((h) => (
                <ListRow
                  key={h.id}
                  lead={
                    <GlyphTile>
                      <FileText size={15} />
                    </GlyphTile>
                  }
                  title={h.name}
                  meta={`${h.rows} rijen → ${h.into}`}
                  trail={h.at}
                />
              ))}
            </List>
          )}
      </PageSection>
    </div>
  )
}

const csvCell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s)

const nl = (n: number) => n.toFixed(2).replace(".", ",")

/** The rows of an export, from the same records every list shows. */
function rowsOf(kind: ExportKind, cols: ReadonlyArray<string>, period: string): ReadonlyArray<ReadonlyArray<string>> {
  if (kind === "klanten") {
    return CUSTOMERS.map((c) => {
      const v: Record<string, string> = {
        naam: c.name,
        email: c.email,
        land: c.country,
        bestellingen: String(c.ordersCount),
        waarde: nl(c.lifetimeValue)
      }
      return cols.map((k) => v[k] ?? "")
    })
  }
  if (kind === "producten") {
    return PRODUCTS.map((p) => {
      const v: Record<string, string> = {
        sku: p.sku,
        naam: p.name,
        voorraad: String(p.stock),
        prijs: nl(p.price),
        inkoopprijs: nl(p.cost),
        leverancier: SUPPLIERS.find((s) => s.id === p.supplierId)?.name ?? ""
      }
      return cols.map((k) => v[k] ?? "")
    })
  }
  const from = period === "vandaag" ? new Date(2026, 10, 23).getTime() : new Date(2026, 10, 16).getTime()
  const to = period === "week" ? new Date(2026, 10, 23).getTime() : Number.POSITIVE_INFINITY
  return ORDERS.filter((o) => o.placedAt.getTime() >= from && o.placedAt.getTime() < to).map((o) => {
    const c = CUSTOMERS.find((x) => x.id === o.customerId)
    const p = PRODUCTS.find((x) => x.id === o.lines[0]?.productId)
    const v: Record<string, string> = {
      nummer: o.number,
      datum: o.placedAt.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      klant: c?.name ?? "",
      email: c?.email ?? "",
      status: o.status,
      totaal: nl(o.total),
      betaling: o.payment,
      leverancier: SUPPLIERS.find((s) => s.id === p?.supplierId)?.name ?? ""
    }
    return cols.map((k) => v[k] ?? "")
  })
}

const PERIODS = [
  { value: "week", label: "16–22 nov" },
  { value: "vandaag", label: "Vandaag tot 14:30" },
  { value: "alles", label: "16 nov tot nu" }
]

function Export({ canEdit, empty }: { readonly canEdit: boolean; readonly empty: boolean }) {
  const [kind, setKind] = useState<ExportKind>("bestellingen")
  const [period, setPeriod] = useState("week")
  const [cols, setCols] = useState<ReadonlyArray<string>>(EXPORT_COLUMNS.bestellingen.map((c) => c.id))
  const [jobs, setJobs] = useState<ReadonlyArray<ExportJob>>(() => [...exports, ...(empty ? [] : EXPORTS)])

  const put = (job: ExportJob) => {
    exports = [job, ...exports.filter((j) => j.id !== job.id)]
    setJobs((all) => [job, ...all.filter((j) => j.id !== job.id)])
  }
  const download = (job: ExportJob, columns: ReadonlyArray<string>) => {
    const labels = columns.map((id) => EXPORT_COLUMNS[job.kind].find((c) => c.id === id)?.label ?? id)
    const text = [
      labels,
      ...rowsOf(job.kind, columns, job.period === "16–22 nov" ? "week" : job.period === "vandaag" ? "vandaag" : "alles")
    ]
      .map((r) => r.map(csvCell).join(";"))
      .join("\n")
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${EXPORT_LABEL[job.kind].toLowerCase()}-${job.period.replace(/\s/g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const start = () => {
    made += 1
    const id = `exp-nieuw-${made}`
    const label = PERIODS.find((p) => p.value === period)?.label ?? period
    const rows = rowsOf(kind, cols, period).length
    const columns = cols
    const base: ExportJob = {
      id,
      kind,
      period: kind === "bestellingen" ? (period === "week" ? "16–22 nov" : period) : "alles",
      rows,
      status: "wachtrij",
      by: "elena",
      at: "zojuist"
    }
    put(base)
    window.setTimeout(() => put({ ...base, status: "schrijven" }), 600)
    window.setTimeout(() => {
      put({ ...base, status: "klaar" })
      toast({
        title: `${EXPORT_LABEL[kind]} geëxporteerd`,
        body: `${rows.toLocaleString("nl-NL")} rijen, ${label}.`,
        tone: "good",
        action: { label: "Downloaden", onClick: () => download(base, columns) }
      })
    }, 1600)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageSection id="nieuwe-export" title="Kolommen kiezen, CSV downloaden">
        {canEdit
          ? (
            <div className="flex flex-col gap-5">
              <Segmented
                label="Wat"
                value={kind}
                onChange={(next) => {
                  setKind(next)
                  setCols(EXPORT_COLUMNS[next].map((c) => c.id))
                }}
                options={(Object.keys(EXPORT_LABEL) as Array<ExportKind>).map((k) => ({
                  value: k,
                  label: EXPORT_LABEL[k]
                }))}
              />
              {kind === "bestellingen" && (
                <Field label="Periode" className="w-full sm:w-64">
                  {(control) => (
                    <Select {...control} value={period} onChange={(event) => setPeriod(event.target.value)}>
                      {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </Select>
                  )}
                </Field>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="pb-2 text-sm font-medium text-ink">Kolommen</legend>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {EXPORT_COLUMNS[kind].map((c) => (
                    <Checkbox
                      key={c.id}
                      label={c.label}
                      checked={cols.includes(c.id)}
                      onChange={(on) =>
                        setCols(
                          on
                            ? EXPORT_COLUMNS[kind].map((x) => x.id).filter((x) => x === c.id || cols.includes(x))
                            : cols.filter((x) => x !== c.id)
                        )}
                    />
                  ))}
                </div>
                {cols.length === 0 && <p className="text-sm text-bad-ink">Kies minstens één kolom.</p>}
              </fieldset>
              <div>
                <Button variant="primary" icon={<Download />} disabled={cols.length === 0} onClick={start}>
                  {rowsOf(kind, cols, period).length.toLocaleString("nl-NL")} rijen exporteren
                </Button>
              </div>
            </div>
          )
          : <Denied area="data" need={2} size="section" what="exporteren" />}
      </PageSection>
      <PageSection id="recente-exports" title="Recente exports" meta="Een export blijft 7 dagen staan">
        {jobs.length === 0
          ? <p className="text-sm text-ink-2">Nog geen exports.</p>
          : (
            <ul className="flex flex-col divide-y divide-line">
              {jobs.map((j) => {
                const s = EXPORT_STATUS[j.status]
                return (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm text-ink">{EXPORT_LABEL[j.kind]}, {j.period}</span>
                      <span className="text-xs text-ink-3">
                        {j.rows > 0 ? `${j.rows.toLocaleString("nl-NL")} rijen · ` : ""}
                        {PEOPLE[j.by].name} · {j.at}
                        {j.why === undefined ? "" : ` · ${j.why}`}
                      </span>
                    </div>
                    <span className="flex items-center gap-2">
                      {j.status === "schrijven" && <Spinner size={14} />}
                      <Status tone={s.tone}>{s.label}</Status>
                    </span>
                    {j.status === "klaar" && (
                      <Button
                        size="sm"
                        icon={<Download />}
                        onClick={() => download(j, EXPORT_COLUMNS[j.kind].map((c) => c.id))}
                      >
                        Downloaden
                      </Button>
                    )}
                    {(j.status === "mislukt" || j.status === "verlopen") && canEdit && (
                      <Button
                        size="sm"
                        icon={<RefreshCcw />}
                        onClick={() => {
                          setKind(j.kind)
                          setCols(
                            EXPORT_COLUMNS[j.kind].map((c) => c.id).slice(0, j.status === "mislukt" ? 3 : undefined)
                          )
                          toast({
                            title: "Export klaargezet",
                            body: j.status === "mislukt"
                              ? "Met minder kolommen. Kies Exporteren als het zo goed is."
                              : "Kies Exporteren om hem opnieuw te maken."
                          })
                        }}
                      >
                        {j.status === "mislukt" ? "Opnieuw" : "Opnieuw maken"}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
      </PageSection>
    </div>
  )
}

function Cleanup({ empty }: { readonly empty: boolean }) {
  const groups = empty ? [] : duplicateGroups()
  const soldOut = empty ? [] : PRODUCTS.filter((p) => p.stock === 0 && p.status === "actief")
  if (groups.length === 0 && soldOut.length === 0) {
    return <p className="text-sm text-ink-2">Niets op te schonen. Insyte kijkt elke nacht opnieuw.</p>
  }
  return (
    <div className="flex flex-col gap-8">
      <PageSection
        id="dubbele-klanten"
        title="Dubbele klantprofielen"
        meta={`${groups.length} ${groups.length === 1 ? "groep" : "groepen"}`}
        actions={groups.length > 0 && (
          <ButtonLink to={`${paths.customers}?samenvoegen=1`} icon={<Users />}>Nakijken en samenvoegen</ButtonLink>
        )}
      >
        <p className="max-w-[64ch] pb-3 text-sm text-pretty text-ink-2">
          Insyte zoekt eerst op hetzelfde e-mailadres, dan op dezelfde naam en hetzelfde land, dan op dezelfde naam.
          Samenvoegen doe je bij Klanten, waar je per groep kiest welk profiel blijft.
        </p>
        <List label="Dubbele klantprofielen" divided>
          {groups.map((g) => (
            <ListRow
              key={g.keep.id}
              lead={
                <GlyphTile>
                  <Users size={15} />
                </GlyphTile>
              }
              href={paths.customer(g.keep.id)}
              title={`${g.keep.name} · ${g.copies.length + 1} profielen`}
              meta={[g.keep, ...g.copies].map((c) => `${c.email}, ${c.city}`).join("  ·  ")}
              trail={g.reason}
            />
          ))}
        </List>
      </PageSection>
      {soldOut.length > 0 && (
        <PageSection id="uitverkocht" title="Actief maar uitverkocht" meta={`${soldOut.length}`}>
          <List label="Actief maar uitverkocht" divided>
            {soldOut.map((p) => (
              <ListRow
                key={p.id}
                href={paths.product(p.id)}
                title={p.name}
                meta={`${p.sku} · staat live in de winkel met 0 op voorraad`}
                trail={SUPPLIERS.find((s) => s.id === p.supplierId)?.name}
              />
            ))}
          </List>
        </PageSection>
      )}
    </div>
  )
}

function Syncs({ canEdit }: { readonly canEdit: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [fresh, setFresh] = useState<ReadonlyArray<string>>([])
  return (
    <ul className="flex flex-col divide-y divide-line" aria-label="Synchronisatie">
      {SYNCS.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          {s.service === undefined
            ? <GlyphTile>{s.name[0]}</GlyphTile>
            : <ServiceLogo service={s.service} name={s.name} size={32} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-ink">{s.name}</span>
            <span className="text-xs text-ink-3">{s.reads} · {fresh.includes(s.id) ? "zojuist" : s.last}</span>
            {s.note !== undefined && <span className="pt-0.5 text-xs text-pretty text-ink-2">{s.note}</span>}
          </div>
          <Status tone={s.status === "ok" || fresh.includes(s.id) ? "good" : s.status === "achter" ? "warn" : "bad"}>
            {s.status === "ok" || fresh.includes(s.id)
              ? "Bijgewerkt"
              : s.status === "achter"
              ? "Eén keer per dag"
              : "Ontkoppeld"}
          </Status>
          {s.status === "ontkoppeld"
            ? <ButtonLink size="sm" to={paths.settings("koppelingen")}>Opnieuw koppelen</ButtonLink>
            : canEdit && (
              <Button
                size="sm"
                icon={<RefreshCcw />}
                loading={busy === s.id}
                disabled={busy !== null && busy !== s.id}
                onClick={() => {
                  setBusy(s.id)
                  window.setTimeout(() => {
                    setBusy(null)
                    setFresh((f) => [...f, s.id])
                    toast({
                      title: `${s.name} gesynchroniseerd`,
                      body: s.id === "meta"
                        ? "Er waren geen nieuwe kosten; die van vandaag komen morgen."
                        : "Alles is binnen."
                    })
                  }, 1400)
                }}
              >
                Nu synchroniseren
              </Button>
            )}
        </li>
      ))}
    </ul>
  )
}

function thread() {
  const groups = duplicateGroups()
  return {
    items: [
      { kind: "page" as const, label: "Data" },
      ...groups.slice(0, 2).map((g) => ({
        kind: "customer" as const,
        label: g.keep.name,
        href: paths.customer(g.keep.id),
        meta: `${g.copies.length + 1} profielen · ${g.reason.toLowerCase()}`
      })),
      {
        kind: "setting" as const,
        label: "Koppelingen",
        href: paths.settings("koppelingen"),
        meta: "Northwind UK ontkoppeld"
      }
    ],
    ask: "Data"
  }
}

/** Data: the area's entry for the shell (`areas.ts`). In the lead's "Meer" menu, so no Menu. */
export const area: AreaDef = { Screen: DataScreen, thread }
