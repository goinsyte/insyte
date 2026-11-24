import { useState } from "react"
import type { Glyph } from "../../fixtures/agents.ts"
import { FLOW_STATUS, RUN_STATUS, STEP_KIND, stepType } from "../../fixtures/automations.ts"
import type { Automation, FlowStatus, Run, Step, StepKind } from "../../fixtures/automations.ts"
import { Link, paths } from "../../router.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { AlertDialog, Sheet } from "../../ui/dialog.tsx"
import { Check, Clock, Filter, Sparkles, X, Zap } from "../../ui/icons.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { addRun } from "./store.ts"

/** The glyph a step's kind draws on the flow's line. */
export const KIND_GLYPH: Readonly<Record<StepKind, Glyph>> = {
  trigger: Zap,
  voorwaarde: Filter,
  wachten: Clock,
  ai: Sparkles,
  actie: Check
}

export function FlowStatusLabel({ status }: { readonly status: FlowStatus }) {
  const s = FLOW_STATUS[status]
  return <Status tone={s.tone}>{s.label}</Status>
}

export function RunStatusLabel({ status }: { readonly status: Run["status"] }) {
  const s = RUN_STATUS[status]
  return <Status tone={s.tone}>{s.label}</Status>
}

/** A flow as a chain of short step names: "Levering vertraagd → Klaviyo-mail sturen → Ticket aanmaken". */
export const chain = (steps: ReadonlyArray<Step>) =>
  steps.length === 0 ? "Nog geen stappen" : steps.map((st) => stepType(st.type)?.label ?? st.summary).join(" → ")

/** "Als de levering vertraagd is, dan …": the sentence a flow is. */
export function sentence(a: Pick<Automation, "steps">): string {
  const [first, ...rest] = a.steps
  if (first === undefined) return "Deze flow heeft nog geen stappen."
  const then = rest.map((st) => st.summary.charAt(0).toLowerCase() + st.summary.slice(1))
  const list = then.length <= 1 ? then.join("") : `${then.slice(0, -1).join(", ")} en ${then.at(-1) ?? ""}`
  return then.length === 0
    ? `Als: ${first.summary.toLowerCase()}.`
    : `Als: ${first.summary.toLowerCase()}. Dan: ${list}.`
}

const seconds = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} s`

/** The runs of one flow or of all of them: what set it off, when, how long, how it ended. */
export function RunsTable({ runs, flows, onOpen, showFlow = false, label }: {
  readonly runs: ReadonlyArray<Run>
  readonly flows: ReadonlyArray<Automation>
  readonly onOpen: (run: Run) => void
  readonly showFlow?: boolean
  readonly label: string
}) {
  return (
    <Table label={label} minWidth={showFlow ? 760 : 600}>
      <THead>
        <Th>Event</Th>
        {showFlow && <Th>Automatisering</Th>}
        <Th>Gestart</Th>
        <Th align="right">Duur</Th>
        <Th>Status</Th>
        <Th align="right">Versie</Th>
      </THead>
      <TBody>
        {runs.map((run) => (
          <Tr key={run.id} onOpen={() => onOpen(run)}>
            <Td header>
              <button
                type="button"
                onClick={() => onOpen(run)}
                className="flex min-h-8 items-baseline gap-2 rounded-xs text-left hover:underline pointer-coarse:min-h-11"
              >
                <span className="figure font-medium text-ink">{run.record?.label ?? "Volgens schema"}</span>
                {run.record?.who !== undefined && <span className="truncate text-ink-3">{run.record.who}</span>}
              </button>
            </Td>
            {showFlow && (
              <Td>
                <span className="block max-w-[22rem] truncate">
                  {flows.find((a) => a.id === run.automationId)?.name ?? "Verwijderde automatisering"}
                </span>
              </Td>
            )}
            <Td muted>{run.at}</Td>
            <Td figure>{seconds(run.seconds)}</Td>
            <Td>
              <RunStatusLabel status={run.status} />
            </Td>
            <Td figure muted>v{run.version}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

/**
 * One run in a sheet: its facts, the steps it went through and where it stopped, the fix for a
 * failure, and the one thing to do next (again, approve, stop).
 */
export function RunSheet({ run, flow, onClose, canEdit }: {
  readonly run: Run | null
  readonly flow: Automation | undefined
  readonly onClose: () => void
  readonly canEdit: boolean
}) {
  const [stopping, setStopping] = useState(false)
  if (run === null) return null
  const stoppedAt = run.failed === undefined
    ? -1
    : flow?.steps.findIndex((st) => st.summary === run.failed?.step) ?? -1
  const waitingAt = run.status === "wacht" ? Math.max(1, (flow?.steps.length ?? 2) - 2) : -1

  const again = () => {
    addRun({
      ...run,
      id: `${run.id}-opnieuw`,
      at: "zojuist",
      ago: 0,
      status: "geslaagd",
      failed: undefined,
      version: flow?.version ?? run.version
    })
    toast({
      title: "Opnieuw gestart en geslaagd",
      body: "Met dezelfde sleutel, dus wat al gedaan was, gebeurde niet twee keer.",
      tone: "good"
    })
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={run.record?.label ?? "Uitvoering volgens schema"}
        meta={flow?.name}
        footer={canEdit && (run.status === "mislukt" || run.status === "dubbel")
          ? <Button variant="primary" onClick={again}>Opnieuw uitvoeren</Button>
          : canEdit && run.status === "wacht"
          ? <Button onClick={() => setStopping(true)}>Stoppen</Button>
          : undefined}
      >
        <div className="flex flex-col gap-6">
          <KeyValue
            items={[
              { label: "Status", value: <RunStatusLabel status={run.status} /> },
              { label: "Gestart", value: run.at },
              { label: "Duur", value: seconds(run.seconds), figure: true },
              { label: "Versie", value: `v${run.version}`, figure: true },
              {
                label: "Record",
                value: run.record === null
                  ? "Geen: de flow liep volgens schema"
                  : (
                    <Link to={run.record.href} className="text-ink underline-offset-2 hover:underline">
                      {run.record.label}
                      {run.record.who === undefined ? "" : ` · ${run.record.who}`}
                    </Link>
                  )
              }
            ]}
          />
          {run.failed !== undefined && (
            <Notice tone="bad" title={`Gestopt bij ${run.failed.step}`}>
              <p>{run.failed.why}</p>
              <p className="mt-1.5">
                <span className="font-medium text-ink">Zo los je het op:</span> {run.failed.fix}
              </p>
            </Notice>
          )}
          {run.status === "dubbel" && (
            <Notice tone="info" title="Niets twee keer gedaan">
              Dezelfde bestelling zette de flow al eerder in gang. Insyte herkende het event en sloeg de stappen over.
            </Notice>
          )}
          {run.waiting !== undefined && <Notice tone="warn" title="Deze run wacht">{run.waiting}</Notice>}
          {flow !== undefined && flow.steps.length > 0 && (
            <section aria-labelledby={`${run.id}-stappen`} className="flex flex-col gap-2">
              <h3 id={`${run.id}-stappen`} className="text-sm font-semibold text-ink">Stappen</h3>
              <ol className="flex flex-col">
                {flow.steps.map((st, i) => {
                  const failed = i === stoppedAt
                  const skipped = (stoppedAt >= 0 && i > stoppedAt) || run.status === "dubbel" && i > 0
                    || (waitingAt >= 0 && i > waitingAt)
                  const waits = i === waitingAt
                  return (
                    <li key={st.id} className="flex items-start gap-2.5 py-1.5">
                      <span
                        className={failed
                          ? "mt-0.5 text-bad-ink"
                          : skipped
                          ? "mt-0.5 text-ink-4"
                          : waits
                          ? "mt-0.5 text-warn-ink"
                          : "mt-0.5 text-good-ink"}
                        aria-hidden="true"
                      >
                        {failed ? <X size={14} /> : waits ? <Clock size={14} /> : <Check size={14} />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className={skipped ? "text-sm text-ink-3" : "text-sm text-ink"}>{st.summary}</span>
                        <span className="text-xs text-ink-3">
                          {STEP_KIND[stepType(st.type)?.kind ?? "actie"]} ·{" "}
                          {failed ? "mislukt" : skipped ? "niet uitgevoerd" : waits ? "wacht" : "gedaan"}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
          {flow !== undefined && (
            <Link
              to={`${paths.automation(flow.id)}?tab=uitvoeringen`}
              className="self-start text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              Alle uitvoeringen van deze automatisering
            </Link>
          )}
        </div>
      </Sheet>
      <AlertDialog
        open={stopping}
        onCancel={() => setStopping(false)}
        onConfirm={() => {
          setStopping(false)
          onClose()
          toast({ title: "Run gestopt", body: "Wat al gedaan was, blijft gedaan." })
        }}
        title="Deze run stoppen?"
        body="Stappen die al gedaan zijn, blijven gedaan. De rest gebeurt niet meer, en dit kun je niet terugdraaien."
        confirmLabel="Stoppen"
        cancelLabel="Laten lopen"
      />
    </>
  )
}
