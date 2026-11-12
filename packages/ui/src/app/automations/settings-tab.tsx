import { Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { Checkbox } from "../../components/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/select"
import { Switch } from "../../components/switch"
import { AlertTriangle, ArrowUpRight, Bell, Key, Play, Trash2, Workflow } from "../../icons"
import { PageGuide } from "../common/page-guide"
import { formatDateTime } from "../lib/format"
import { cn } from "../lib/utils"
import type { WorkflowState } from "./node-types"
import { scopeNeeds, SCOPES } from "./scopes"
import { useAutomationsSource } from "./source"

const LIMITS = [
  { value: "0", label: "Geen limiet" },
  { value: "30", label: "30 runs per uur" },
  { value: "60", label: "60 runs per uur" },
  { value: "120", label: "120 runs per uur" },
  { value: "500", label: "500 runs per uur" }
]

const GUIDE = [
  {
    title: "Een eigen account",
    body:
      "De flow werkt als een eigen serviceaccount, nooit als een persoon. Alles wat hij verandert, staat onder die naam in de audit trail.",
    art: "log"
  },
  {
    title: "Rechten",
    body:
      "Wat de flow mag aanraken. Een recht dat geen stap gebruikt, staat uit. Zet je een nodig recht uit, dan mislukt de stap die het gebruikt.",
    art: "keys"
  },
  {
    title: "Aan, uit en limiet",
    body:
      "Uit betekent: de trigger wordt genegeerd, niets wordt ingehaald. Komen er meer events binnen dan de limiet, dan wachten ze op hun beurt.",
    art: "flow"
  },
  { title: "Bij een fout", body: "De gekozen collega krijgt een melding met de run en wat er misging.", art: "notify" },
  {
    title: "Verwijderen",
    body: "De runs blijven in de geschiedenis. Je kunt het zes seconden ongedaan maken.",
    art: "undo"
  }
] as const

/**
 * A flow's settings on one grey sheet, the way Instellingen reads elsewhere: what the flow acts as,
 * the rights it holds (each with the step that needs it), whether it runs, who hears when it fails,
 * how fast it may go, and deleting it, which has Undo.
 */
export function SettingsTab({ workflow, onDelete }: { workflow: WorkflowState; onDelete: () => void }) {
  const id = workflow.automationId
  const s = workflow.settings
  const { commands, people } = useAutomationsSource()
  const needs = useMemo(() => scopeNeeds(workflow.nodes), [workflow.nodes])
  const [audit, setAudit] = useState(false)
  const [allScopes, setAllScopes] = useState(false)
  const relevant = (scope: string) => needs.has(scope) || s.scopesExtra.includes(scope)
  const sorted = [...SCOPES].toSorted((a, b) => Number(relevant(b.id)) - Number(relevant(a.id)))
  const hidden = sorted.filter((x) => !relevant(x.id)).length
  const scopes = allScopes ? sorted : sorted.filter((x) => relevant(x.id))
  const created = workflow.versions.at(-1)?.at

  function toggle(scope: string, on: boolean) {
    const needed = needs.has(scope)
    const said = needed && !on
      ? {
        label: "Recht uitgezet",
        detail: `${needs.get(scope)?.map((n) => n.label).join(", ")} mislukt zonder dit recht.`
      }
      : undefined
    if (needed) {
      void commands.updateSettings(id, {
        scopesOff: on ? s.scopesOff.filter((x) => x !== scope) : [...s.scopesOff, scope]
      }, said)
    } else {void commands.updateSettings(id, {
        scopesExtra: on ? [...s.scopesExtra, scope] : s.scopesExtra.filter((x) => x !== scope)
      })}
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-5 py-6">
      <Section icon={Workflow} title="Workflowaccount">
        <div className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-abyss text-mesh-ink">
            <Workflow className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium text-ink text-sm">Workflow: {workflow.name}</span>
            <span className="truncate text-ink-3 text-xs">
              {workflow.version > 0
                ? `Aangemaakt bij de eerste publicatie${
                  created ? ` op ${formatDateTime(created)}` : ""
                } · eigenaar ${workflow.owner}`
                : `Wordt aangemaakt bij de eerste publicatie · eigenaar ${workflow.owner}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAudit(true)}
            disabled={workflow.version === 0}
            className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 font-medium text-arc-ink text-sm hover:bg-arc-tint disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            Audit trail
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </Section>

      <Section icon={Key} title="Rechten" meta={`${needs.size} nodig voor de stappen`}>
        <ul className="flex flex-col rounded-lg bg-paper px-1 py-1">
          {scopes.map((sc) => {
            const by = needs.get(sc.id)
            const on = by ? !s.scopesOff.includes(sc.id) : s.scopesExtra.includes(sc.id)
            const warn = by !== undefined && !on
            return (
              <li key={sc.id} className={cn("flex flex-col rounded-md", warn && "bg-signal-red-bg")}>
                <label className="flex min-h-9 cursor-pointer items-center gap-3 px-2.5 py-1.5">
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(sc.id, c === true)} aria-label={sc.label} />
                  <span className={cn("text-sm", on ? "text-ink" : "text-ink-2")}>{sc.label}</span>
                  <span className="rounded-sm bg-ink/6 px-1.5 py-0.5 text-ink-2 text-xs">{sc.id}</span>
                  <span className="ml-auto min-w-0 truncate text-right text-ink-3 text-xs">
                    {by ? by.map((n) => n.label).join(", ") : on ? "Geen stap gebruikt dit" : "Niet nodig"}
                  </span>
                </label>
                {warn ?
                  (
                    <span className="flex items-center gap-1.5 px-2.5 pb-2 pl-9 text-signal-red text-xs">
                      <AlertTriangle className="size-3" />
                      {by.map((n) => n.label).join(" en ")} {by.length === 1 ? "mislukt" : "mislukken"}{" "}
                      zonder dit recht.
                    </span>
                  ) :
                  null}
              </li>
            )
          })}
          {hidden > 0 ?
            (
              <li>
                <button
                  type="button"
                  onClick={() => setAllScopes((o) => !o)}
                  className="flex h-9 w-full items-center px-2.5 text-left text-arc-ink text-sm hover:underline"
                >
                  {allScopes ? "Alleen de rechten tonen die de flow gebruikt" : `${hidden} andere rechten tonen`}
                </button>
              </li>
            ) :
            null}
        </ul>
      </Section>

      <Section icon={Play} title="Uitvoeren">
        <Row label="Flow staat aan" hint={workflow.version === 0 ? "Publiceer eerst; dan gaat hij aan." : undefined}>
          <Switch
            checked={workflow.status === "active"}
            disabled={workflow.version === 0}
            onCheckedChange={(c) => {
              void commands.setStatus(id, c ? "active" : "paused", { label: c ? "Flow staat aan" : "Flow gepauzeerd" })
            }}
          />
        </Row>
        <Row label="Limiet">
          <Select
            items={LIMITS}
            value={String(s.rateLimit)}
            onValueChange={(v) => void commands.updateSettings(id, { rateLimit: Number(v) })}
          >
            <SelectTrigger size="sm" className="w-56 bg-paper text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section icon={Bell} title="Bij een fout">
        <Row label="Melding naar">
          <Select
            items={[...people]}
            value={s.notify}
            onValueChange={(v) => void commands.updateSettings(id, { notify: String(v) })}
          >
            <SelectTrigger size="sm" className="w-56 bg-paper text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {people.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section icon={Trash2} title="Verwijderen">
        <Row label="Automatisering verwijderen">
          <button
            type="button"
            onClick={onDelete}
            className="flex h-8 items-center gap-1.5 rounded-md bg-signal-red px-3 font-medium text-paper text-sm hover:opacity-90"
          >
            <Trash2 className="size-3.5" />
            Verwijderen
          </button>
        </Row>
      </Section>

      <Dialog open={audit} onOpenChange={setAudit}>
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle>Audit trail van Workflow: {workflow.name}</DialogTitle>
            <DialogDescription>
              Wat dit serviceaccount veranderde, uit de laatste runs. Wijzigingen door collega's staan bij Beveiliging.
            </DialogDescription>
          </DialogHeader>
          <AuditList workflow={workflow} />
          <Link to="/settings/security" className="self-start text-arc-ink text-sm underline-offset-2 hover:underline">
            Volledige auditlog in Beveiliging
          </Link>
        </DialogContent>
      </Dialog>
      <PageGuide id="automations.settings" title="Instellingen" steps={GUIDE} />
    </div>
  )
}

function AuditList({ workflow }: { workflow: WorkflowState }) {
  const rows = workflow.history
    .flatMap((r) =>
      (r.timeline ?? [])
        .filter((s) =>
          s.status === "ok" && !s.variantId.startsWith("trigger") && !s.variantId.startsWith("delay") &&
          !s.variantId.startsWith("condition")
        )
        .map((s, i) => ({
          key: `${r.id}-${i}`,
          at: r.at,
          what: s.label,
          on: r.record ? `${r.record.number} · ${r.record.name}` : ""
        }))
    )
    .slice(0, 14)
  if (rows.length === 0) {
    return <p className="text-ink-3 text-sm">Nog niets: de flow heeft nog geen record veranderd.</p>
  }
  return (
    <ul className="flex max-h-80 flex-col overflow-y-auto">
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-sm [&+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
        >
          <span className="text-ink-3 tabular-nums">{formatDateTime(r.at)}</span>
          <span className="min-w-0 truncate text-ink-2">
            <span className="font-medium text-ink">{r.what}</span> op {r.on}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Section(
  { icon: Icon, title, meta, children }: {
    icon: typeof Workflow
    title: string
    meta?: string
    children: React.ReactNode
  }
) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-medium text-ink text-md">
        <Icon className="size-4 text-ink-3" />
        {title}
        {meta ? <span className="font-normal text-ink-3 text-sm">{meta}</span> : null}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-lg bg-paper px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-ink text-sm">{label}</span>
        {hint ? <span className="text-ink-3 text-xs leading-[1.5]">{hint}</span> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
