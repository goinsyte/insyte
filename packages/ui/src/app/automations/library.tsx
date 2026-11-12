import { useNavigate } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { toast } from "sonner"
import { ArrowRight, Plus, Sparkles } from "../../icons"
import { EmptyState } from "../common/empty-state"
import { type AutomationTemplate, TEMPLATES, type WorkspaceFacts } from "../lib/automation-templates"
import { formatDateTime } from "../lib/format"
import { cn } from "../lib/utils"
import { DataTable, type Facet, facetFilter } from "../table/data-table"
import { flatNodes, VARIANTS_BY_ID, type WorkflowRun, type WorkflowState } from "./node-types"
import { runLabel } from "./runs"
import { RUN_DOT, seconds } from "./runs-tab"
import { type Recommendation, useAutomationsSource } from "./source"
import { StepTile } from "./step-tile"

/**
 * The automations library and log: templates to start from, the ones the workspace's own records
 * say would have work to do, and every run of every flow. Using a template makes a draft in the
 * builder; nothing turns on by itself.
 */

/** Whether a flow has an AI step anywhere, a lane of a splitsing included. */
export const usesAi = (w: WorkflowState) => flatNodes(w.nodes).some((n) => VARIANTS_BY_ID[n.variantId]?.ai === true)

function useStartFrom() {
  const navigate = useNavigate()
  const { commands } = useAutomationsSource()
  return async (t: AutomationTemplate) => {
    const id = await commands.create({ templateId: t.id })
    if (id === null) return
    navigate({ to: "/automations/$automationId", params: { automationId: id } })
    toast(`Concept opgesteld vanuit “${t.name}”. Het draait zodra je het aanzet.`)
  }
}

function Steps({ steps }: { steps: AutomationTemplate["steps"] }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={`${s.variantId}-${i}`} className="flex items-center gap-1.5">
          {i === 1
            ? <ArrowRight className="size-3 shrink-0 text-ink-3" strokeWidth={2} />
            : i > 1
            ? <span className="text-sm text-ink-3">+</span>
            : null}
          <span
            title={s.summary}
            className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-ink/6 pr-1.5 pl-1 font-medium text-ink-2 text-xs leading-none"
          >
            {VARIANTS_BY_ID[s.variantId] ? <StepTile variant={VARIANTS_BY_ID[s.variantId]} size={16} /> : null}
            {VARIANTS_BY_ID[s.variantId]?.label ?? s.variantId}
          </span>
        </span>
      ))}
    </span>
  )
}

function TemplateRow({
  t,
  note,
  cta,
  primary = false
}: {
  t: AutomationTemplate
  note?: React.ReactNode
  cta: string
  primary?: boolean
}) {
  const start = useStartFrom()
  return (
    <li className="group flex items-start gap-4 px-3 py-3.5 transition-colors hover:bg-ink/3 [&+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-medium text-base text-ink">{t.name}</span>
        <span className="max-w-[72ch] text-sm text-ink-3 leading-[1.5]">{t.description}</span>
        {note}
        <Steps steps={t.steps} />
      </div>
      <button
        type="button"
        onClick={() => void start(t)}
        className={cn(
          "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-sm transition-colors",
          primary ? "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2" : "text-arc-ink hover:bg-arc-tint"
        )}
      >
        <Plus className="size-3.5" strokeWidth={2} />
        {cta}
      </button>
    </li>
  )
}

const CATEGORIES = ["Orders", "Customers", "Support", "Stock", "Disputes"] as const
const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  Orders: "Bestellingen",
  Customers: "Klanten",
  Support: "Klantenservice",
  Stock: "Voorraad",
  Disputes: "Geschillen"
}

export function TemplatesView() {
  return (
    <div className="flex flex-col gap-6">
      {CATEGORIES.map((c) => {
        const list = TEMPLATES.filter((t) => t.category === c)
        if (list.length === 0) return null
        return (
          <section key={c} className="flex flex-col gap-1">
            <h2 className="flex items-baseline gap-2 px-3 font-medium text-ink text-md">
              {CATEGORY_LABEL[c]}
              <span className="font-normal text-ink-3 text-sm tabular-nums">{list.length}</span>
            </h2>
            <ul className="flex flex-col">
              {list.map((t) => <TemplateRow key={t.id} t={t} cta="Sjabloon gebruiken" />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** A template is recommended when the records say it has work, and no running flow already does it. */
export function recommendations(facts: WorkspaceFacts, workflows: Record<string, WorkflowState>) {
  const flows = Object.values(workflows)
  return TEMPLATES.flatMap((t) => {
    const evidence = t.evidence?.(facts)
    if (!evidence) return []
    const trigger = t.steps[0]?.variantId
    const same = flows.filter((w) => w.nodes[0]?.variantId === trigger)
    if (same.some((w) => w.status === "active")) return []
    const idle = same.find((w) => w.status !== "active")
    return [{ template: t, evidence, idle }]
  }).sort((a, b) => b.evidence.count - a.evidence.count)
}

export function RecommendedView({ items }: { items: ReadonlyArray<Recommendation> }) {
  const navigate = useNavigate()
  if (items.length === 0) {
    return (
      <EmptyState
        kind="automations"
        title="Er is nu niets aan te raden."
        body="Je records vragen nu om geen nieuwe flow."
      />
    )
  }
  return (
    <ul className="flex flex-col">
      {items.map(({ template, evidence, idle }, i) => (
        <TemplateRow
          key={template.id}
          t={template}
          primary={i === 0}
          cta="Instellen"
          note={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-arc-ink">
                <Sparkles className="size-3.5" strokeWidth={1.75} />
                {evidence.line}
              </span>
              {idle ?
                (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/automations/$automationId", params: { automationId: idle.automationId } })}
                    className="cursor-pointer text-ink-3 underline-offset-2 hover:text-ink hover:underline"
                  >
                    Je hebt “{idle.name}” {idle.status === "draft" ? "als concept" : "gepauzeerd"}. Openen
                  </button>
                ) :
                <span className="text-ink-3">Nog geen flow let hierop.</span>}
            </span>
          }
        />
      ))}
    </ul>
  )
}

type RunRow = WorkflowRun & { flowId: string; flow: string }

const RUN_FACETS: ReadonlyArray<Facet> = [
  {
    id: "result",
    label: "Resultaat",
    options: [
      { value: "succeeded", label: "Geslaagd" },
      { value: "failed", label: "Mislukt" },
      { value: "waiting", label: "Wacht" },
      { value: "duplicate", label: "Dubbel" }
    ]
  }
]

export function HistoryView({ workflows }: { workflows: Record<string, WorkflowState> }) {
  const navigate = useNavigate()
  const rows = useMemo<RunRow[]>(
    () =>
      Object.values(workflows)
        .flatMap((w) => w.history.map((r) => ({ ...r, flowId: w.automationId, flow: w.name })))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    [workflows]
  )
  const columns = useMemo<Array<ColumnDef<RunRow, unknown>>>(
    () => [
      {
        id: "at",
        accessorKey: "at",
        header: "Wanneer",
        size: 150,
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.row.original.at)}</span>
      },
      {
        id: "flow",
        accessorKey: "flow",
        header: "Flow",
        size: 260,
        cell: (c) => <span className="font-medium text-ink">{c.row.original.flow}</span>
      },
      {
        id: "cause",
        accessorFn: (r) => r.cause ?? "",
        header: "Event",
        cell: (c) => (
          <span className="block max-w-[320px] truncate">
            {c.row.original.record
              ? `${c.row.original.record.number} · ${c.row.original.record.name}`
              : (c.row.original.cause ?? "De trigger")}
          </span>
        )
      },
      {
        id: "result",
        accessorKey: "status",
        header: "Resultaat",
        size: 300,
        filterFn: facetFilter,
        cell: (c) => {
          const r = c.row.original
          return (
            <span className="flex min-w-0 items-center gap-1.5" title={r.error}>
              <span className={cn("size-1.5 shrink-0 rounded-full", RUN_DOT[r.status])} aria-hidden />
              <span className="truncate">{r.status === "failed" ? (r.error ?? "Mislukt") : runLabel(r)}</span>
            </span>
          )
        }
      },
      {
        id: "steps",
        accessorKey: "steps",
        header: "Stappen",
        size: 72,
        cell: (c) => <span className="tabular-nums">{c.row.original.steps}</span>
      },
      {
        id: "duration",
        accessorKey: "durationMs",
        header: "Duur",
        size: 72,
        cell: (c) => <span className="tabular-nums">{seconds(c.row.original.durationMs)}</span>
      }
    ],
    []
  )
  return (
    <DataTable
      columns={columns}
      data={rows}
      facets={RUN_FACETS}
      noun={["run", "runs"]}
      getRowId={(r) => r.id}
      searchPlaceholder="Zoek op flow of oorzaak"
      initialSorting={[{ id: "at", desc: true }]}
      onRowClick={(r) =>
        navigate({
          to: "/automations/$automationId",
          params: { automationId: r.flowId },
          search: { tab: "runs", run: r.id }
        })}
      empty={
        <EmptyState
          kind="automations"
          title="Nog geen uitvoeringen."
          body="Elke run van een flow komt hier te staan."
        />
      }
    />
  )
}
