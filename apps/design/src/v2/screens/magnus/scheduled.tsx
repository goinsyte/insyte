import { useState } from "react"
import { AGENTS, SCHEDULED } from "../../fixtures/agents.ts"
import { SCHEDULE_DETAIL } from "../../fixtures/magnus.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { AgentAvatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Clock, Pause, Play, Plus } from "../../ui/icons.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { LoadError, LoadingRows } from "./states.tsx"

type Run = (typeof SCHEDULED)[number]

/** A copy of the set with `id` in or out. */
const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

/**
 * Gepland: what the agents will do later on their own clock, so nothing they do arrives as a
 * surprise. Today's one-off first, then what recurs, then what is paused. A run can be started now,
 * skipped, paused or resumed; each change says so and can be taken back.
 */
export function ScheduledPage() {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("automations")
  const [paused, setPaused] = useState<ReadonlySet<string>>(
    () => new Set(SCHEDULED.filter((run) => run.at === "gepauzeerd").map((run) => run.id))
  )
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [ran, setRan] = useState<ReadonlySet<string>>(new Set())

  const pause = (run: Run, on: boolean) => {
    setPaused((p) => toggle(p, run.id, on))
    toast({
      title: on ? "Gepauzeerd" : "Hervat",
      body: run.text,
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => setPaused((p) => toggle(p, run.id, !on)) }
    })
  }
  const skip = (run: Run) => {
    setSkipped((s) => toggle(s, run.id, true))
    toast({
      title: "Overgeslagen",
      body: run.text,
      action: { label: "Ongedaan maken", onClick: () => setSkipped((s) => toggle(s, run.id, false)) }
    })
  }
  const runNow = (run: Run) => {
    setRan((r) => toggle(r, run.id, true))
    const agent = AGENTS.find((a) => a.id === run.agentId)
    toast({
      title: `${agent?.name ?? "De agent"} is begonnen`,
      body: "Wat hij doet, komt in het logboek.",
      tone: "good"
    })
  }

  const live = SCHEDULED.filter((run) => !skipped.has(run.id))
  const groups = [
    {
      id: "vandaag",
      title: "Eenmalig",
      runs: live.filter((r) => SCHEDULE_DETAIL[r.id]?.kind === "eenmalig" && !paused.has(r.id))
    },
    {
      id: "terugkerend",
      title: "Terugkerend",
      runs: live.filter((r) => SCHEDULE_DETAIL[r.id]?.kind === "terugkerend" && !paused.has(r.id))
    },
    { id: "gepauzeerd", title: "Gepauzeerd", runs: live.filter((r) => paused.has(r.id)) }
  ].filter((g) => g.runs.length > 0)

  const head = (
    <PageHead
      title="Gepland"
      meta={state === "ready"
        ? (
          <>
            <span className="figure">{live.filter((r) => !paused.has(r.id)).length}</span>{" "}
            uitvoeringen gepland · wat je agents later zelf gaan doen
          </>
        )
        : "Wat je agents later zelf gaan doen"}
      actions={access.edit && (
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => navigate(paths.newChat("Nieuwe geplande taak"))}
        >
          Taak plannen
        </Button>
      )}
    />
  )

  if (!access.view) {
    return (
      <Page width="text">
        {head}
        <Denied area="automations" what="wat de agents gepland hebben" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="text">
        {head}
        <LoadingRows rows={4} label="Planning laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="text">
        {head}
        <LoadError what="De planning" detail="GET /agents/schedules · 503 · req_c0d2e1" />
      </Page>
    )
  }
  if (state === "empty" || groups.length === 0) {
    return (
      <Page width="text">
        {head}
        <EmptyState
          glyph={Clock}
          title="Niets gepland"
          action={<Button onClick={() => navigate(paths.newChat("Nieuwe geplande taak"))}>Taak plannen</Button>}
        >
          Vraag Magnus om iets op een vast moment te doen, elke maandag het weekrapport of elke nacht de voorraad, en
          het staat hier tot het gebeurt.
        </EmptyState>
      </Page>
    )
  }

  return (
    <Page width="text">
      {head}
      {!access.edit && <ReadOnlyNotice area="automations" />}
      {groups.map((group) => (
        <PageSection key={group.id} id={`gepland-${group.id}`} title={group.title}>
          <ul className="flex flex-col gap-5">
            {group.runs.map((run) => {
              const agent = AGENTS.find((a) => a.id === run.agentId)
              const detail = SCHEDULE_DETAIL[run.id]
              const isPaused = paused.has(run.id)
              return (
                <li key={run.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-2">
                  {agent !== undefined ? <AgentAvatar glyph={agent.glyph} size={28} /> : <span />}
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
                      <p className="text-sm font-semibold text-pretty text-ink">{run.text}</p>
                      {detail !== undefined && <p className="text-sm text-pretty text-ink-2">{detail.does}</p>}
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                        {agent !== undefined && (
                          <Link to={paths.agent(agent.id)} className="text-ink-2 hover:text-ink hover:underline">
                            {agent.name}
                          </Link>
                        )}
                        <span aria-hidden="true">·</span>
                        {isPaused
                          ? <Status tone="neutral">gepauzeerd</Status>
                          : ran.has(run.id)
                          ? <Status tone="good">loopt nu</Status>
                          : (
                            <span>
                              volgende keer <span className="figure text-ink-2">{detail?.next ?? run.at}</span>
                            </span>
                          )}
                      </p>
                    </div>
                    {access.edit && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isPaused && (
                          <Button size="sm" disabled={ran.has(run.id)} onClick={() => runNow(run)}>Nu uitvoeren</Button>
                        )}
                        {detail?.kind === "eenmalig" && !isPaused
                          ? <Button size="sm" variant="ghost" onClick={() => skip(run)}>Overslaan</Button>
                          : (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={isPaused ? <Play /> : <Pause />}
                              onClick={() => pause(run, !isPaused)}
                            >
                              {isPaused ? "Hervatten" : "Pauzeren"}
                            </Button>
                          )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </PageSection>
      ))}
    </Page>
  )
}
