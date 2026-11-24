import { useState } from "react"
import { AGENTS } from "../fixtures/agents.ts"
import { LOG, LOG_STATUS, logTally, SETTING_LABEL } from "../fixtures/magnus.ts"
import type { LogLine, LogStatus } from "../fixtures/magnus.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../ui/access.tsx"
import { AgentAvatar } from "../ui/avatar.tsx"
import { Status } from "../ui/badge.tsx"
import type { Tone } from "../ui/badge.tsx"
import { Button, ButtonLink } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { Sheet } from "../ui/dialog.tsx"
import { ListToolbar } from "../ui/filters.tsx"
import { History, Sparkles } from "../ui/icons.tsx"
import { SearchField, Select } from "../ui/input.tsx"
import { KeyValue } from "../ui/key-value.tsx"
import { Page, PageHead } from "../ui/page.tsx"
import { Skeleton } from "../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../ui/states.tsx"
import { toast } from "../ui/toast.tsx"
import { dataState, setView, useView } from "../view.ts"

const TONE: Readonly<Record<LogStatus, Tone>> = { gedaan: "good", wacht: "warn", ongedaan: "neutral", mislukt: "bad" }

const STATUS_FILTER: ReadonlyArray<{ readonly value: LogStatus | "alle"; readonly label: string }> = [
  { value: "alle", label: "Elke status" },
  { value: "gedaan", label: LOG_STATUS.gedaan },
  { value: "wacht", label: LOG_STATUS.wacht },
  { value: "ongedaan", label: LOG_STATUS.ongedaan },
  { value: "mislukt", label: LOG_STATUS.mislukt }
]

/**
 * The agents' log: everything they did, across all of them, newest first. Each line says what it
 * did, on which record, under which setting and rule, and where it stands; a line opens what it read,
 * what started it and what it changed. What can still be taken back in Insyte has Ongedaan maken;
 * what reached a customer says so. Start shows the first five; this is "Alles bekijken". The filters
 * live in the address, so a cut of the log can be linked.
 */
export function LogScreen() {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("automations")
  const agentId = useQuery("agent") ?? "alle"
  const status = useQuery("status") ?? "alle"
  const setting = useQuery("instelling") ?? "alle"
  const openId = useQuery("regel")
  const [query, setSearch] = useState("")
  const [changed, setChanged] = useState<Readonly<Record<string, LogStatus>>>({})

  const lines = LOG.map((line) => ({ ...line, status: changed[line.id] ?? line.status }))
  const tally = logTally(lines)
  const q = query.trim().toLowerCase()
  const shown = lines.filter((line) =>
    (agentId === "alle" || line.agentId === agentId) && (status === "alle" || line.status === status) &&
    (setting === "alle" || line.setting === setting) &&
    (q === "" || `${line.text} ${line.record} ${line.rule}`.toLowerCase().includes(q))
  )
  const groups = [
    { id: "vandaag", title: "Vandaag", lines: shown.filter((l) => !l.at.startsWith("vannacht")) },
    { id: "vannacht", title: "Vannacht", lines: shown.filter((l) => l.at.startsWith("vannacht")) }
  ].filter((group) => group.lines.length > 0)
  const open = lines.find((l) => l.id === openId)
  const filtered = agentId !== "alle" || status !== "alle" || setting !== "alle" || q !== ""

  const setStatus = (line: LogLine, next: LogStatus, title: string, back: LogStatus) => {
    setChanged((c) => ({ ...c, [line.id]: next }))
    toast({
      title,
      body: line.text,
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => setChanged((c) => ({ ...c, [line.id]: back })) }
    })
  }
  const undo = (line: LogLine) => setStatus(line, "ongedaan", "Ongedaan gemaakt", line.status)
  const retry = (line: LogLine) => setStatus(line, "gedaan", "Opnieuw gedaan", line.status)

  const head = (
    <PageHead
      title="Logboek"
      meta={state === "ready"
        ? (
          <>
            <span className="figure">{tally.total}</span> acties vannacht en vandaag ·{" "}
            <span className="figure">{tally.undone}</span> ongedaan gemaakt ·{" "}
            <span className="figure">{tally.failed}</span> mislukt
          </>
        )
        : "Wat je agents deden, met de regel waaronder het gebeurde"}
      actions={
        <Button size="sm" icon={<Sparkles />} onClick={() => navigate(paths.settings("ai/zelfstandigheid"))}>
          Zelfstandigheid
        </Button>
      }
    />
  )

  if (!access.view) {
    return (
      <Page width="record">
        {head}
        <Denied area="automations" what="wat de agents deden" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record">
        {head}
        <div aria-busy="true" aria-label="Logboek laden" className="flex flex-col gap-5">
          <Skeleton className="h-9 w-full max-w-xl rounded-sm" />
          {Array.from(
            { length: 6 },
            (_, i) => (
              <span key={i} className="grid grid-cols-[3rem_28px_minmax(0,1fr)] gap-x-3">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="size-7 rounded-full" />
                <span className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-2.5 w-4/5" />
                </span>
              </span>
            )
          )}
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        {head}
        <ErrorState
          title="Het logboek laden lukte niet"
          detail="GET /agents/actions · 503 · req_5d1a3b"
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          De verbinding met de server viel weg. Je agents werken gewoon door; wat ze doen, komt hier zodra het weer
          laadt.
        </ErrorState>
      </Page>
    )
  }
  if (state === "empty") {
    return (
      <Page width="record">
        {head}
        <EmptyState
          glyph={History}
          title="Je agents hebben nog niets zelf gedaan"
          action={
            <>
              <Button variant="primary" onClick={() => navigate(paths.settings("ai/zelfstandigheid"))}>
                Zelfstandigheid instellen
              </Button>
              <ButtonLink to={paths.gallery}>Naar de agentgalerij</ButtonLink>
            </>
          }
        >
          Zet een actie op Zelf doen en ze verschijnt hier, met wat de agent las, onder welke regel en of je het nog
          kunt terugdraaien.
        </EmptyState>
      </Page>
    )
  }

  return (
    <Page width="record">
      {head}
      {!access.edit && <ReadOnlyNotice area="automations" />}
      <ListToolbar
        start={
          <>
            <SearchField
              label="Acties zoeken"
              placeholder="Acties zoeken"
              value={query}
              onChange={setSearch}
              className="w-full sm:w-56"
            />
            <Select
              aria-label="Agent"
              value={agentId}
              onChange={(event) => setQuery({ agent: event.target.value === "alle" ? null : event.target.value })}
              className="min-w-0 flex-1 sm:w-48 sm:flex-none"
            >
              <option value="alle">Alle agents</option>
              {AGENTS.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </Select>
            <Select
              aria-label="Status"
              value={status}
              onChange={(event) => setQuery({ status: event.target.value === "alle" ? null : event.target.value })}
              className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            >
              {STATUS_FILTER.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Select
              aria-label="Instelling"
              value={setting}
              onChange={(event) => setQuery({ instelling: event.target.value === "alle" ? null : event.target.value })}
              className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            >
              <option value="alle">Elke instelling</option>
              <option value="zelf">{SETTING_LABEL.zelf}</option>
              <option value="vragen">{SETTING_LABEL.vragen}</option>
            </Select>
          </>
        }
      />

      {groups.length === 0 && (
        <EmptyState
          glyph={History}
          size="sm"
          title="Geen acties voor deze filters"
          action={filtered && (
            <Button
              size="sm"
              onClick={() => {
                setSearch("")
                setQuery({ agent: null, status: null, instelling: null })
              }}
            >
              Filters wissen
            </Button>
          )}
        >
          Pas de filters aan, of bekijk alles wat de agents vannacht en vandaag deden.
        </EmptyState>
      )}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`log-${group.id}`} className="flex flex-col gap-3">
          <h2 id={`log-${group.id}`} className="text-sm font-semibold text-ink">{group.title}</h2>
          <ol className="flex flex-col gap-1">
            {group.lines.map((line) => (
              <Line
                key={line.id}
                line={line}
                canAct={access.edit}
                onOpen={() => setQuery({ regel: line.id })}
                onUndo={() =>
                  undo(line)}
                onRetry={() =>
                  retry(line)}
              />
            ))}
          </ol>
        </section>
      ))}

      <Sheet
        open={open !== undefined}
        onClose={() => setQuery({ regel: null })}
        title={open?.text ?? ""}
        meta={open !== undefined && (
          <span>
            {AGENTS.find((a) => a.id === open.agentId)?.name} · <span className="figure">{open.at}</span>
          </span>
        )}
        footer={open !== undefined && <SheetFoot line={open} canAct={access.edit} onUndo={undo} onRetry={retry} />}
      >
        {open !== undefined && <Detail line={open} />}
      </Sheet>
    </Page>
  )
}

function Line({ line, canAct, onOpen, onUndo, onRetry }: {
  readonly line: LogLine
  readonly canAct: boolean
  readonly onOpen: () => void
  readonly onUndo: () => void
  readonly onRetry: () => void
}) {
  const agent = AGENTS.find((a) => a.id === line.agentId)
  const undone = line.status === "ongedaan"
  return (
    <li className="grid grid-cols-[3rem_28px_minmax(0,1fr)] gap-x-3 rounded-md py-2 transition-colors hover:bg-hover sm:px-2">
      <span className="figure pt-1 text-xs text-ink-3">{line.at.replace("vannacht ", "")}</span>
      {agent !== undefined ? <AgentAvatar glyph={agent.glyph} size={28} /> : <span />}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
          <button
            type="button"
            onClick={onOpen}
            className={cx(
              "self-start rounded-xs text-left text-sm text-pretty hover:underline",
              undone ? "text-ink-3 line-through decoration-ink-4" : "text-ink"
            )}
          >
            {line.text}
          </button>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-pretty text-ink-3">
            {agent !== undefined && (
              <Link to={paths.agent(agent.id)} className="text-ink-2 hover:text-ink hover:underline">
                {agent.name}
              </Link>
            )}
            <span>· {line.record} · {SETTING_LABEL[line.setting]}: {line.rule}</span>
            {line.status !== "gedaan" && (
              <>
                <span aria-hidden="true">·</span>
                <Status tone={TONE[line.status]}>{LOG_STATUS[line.status]}</Status>
              </>
            )}
          </p>
        </div>
        {canAct && line.status === "gedaan" && line.undo === "kan" && (
          <Button size="sm" variant="ghost" onClick={onUndo}>Ongedaan maken</Button>
        )}
        {canAct && line.status === "mislukt" && <Button size="sm" onClick={onRetry}>Opnieuw proberen</Button>}
      </div>
    </li>
  )
}

function Detail({ line }: { readonly line: LogLine }) {
  return (
    <div className="flex flex-col gap-6">
      <KeyValue
        items={[
          { label: "Status", value: <Status tone={TONE[line.status]}>{LOG_STATUS[line.status]}</Status> },
          { label: "Instelling", value: `${SETTING_LABEL[line.setting]}: ${line.rule}` },
          { label: "Aanleiding", value: line.trigger },
          {
            label: "Record",
            value: <Link to={line.href} className="text-ink underline-offset-2 hover:underline">{line.record}</Link>
          }
        ]}
      />
      {line.after !== undefined && <p className="rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">{line.after}</p>}
      {line.change !== undefined && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-ink-3">Wat veranderde</h3>
          <p className="text-sm text-ink">
            {line.change.field}: <span className="text-ink-3 line-through decoration-ink-4">{line.change.before}</span>
            {" → "}
            {line.change.after}
          </p>
        </section>
      )}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-ink-3">Wat de agent las</h3>
        <ul className="flex flex-col gap-1">
          {line.read.map((source) => <li key={source} className="text-sm text-ink">{source}</li>)}
        </ul>
      </section>
      <p className="text-xs text-pretty text-ink-3">
        De regel staat op de pagina van de agent. Wijzig je hem, dan geldt dat vanaf de volgende keer; wat al gedaan is,
        blijft hier staan.
      </p>
    </div>
  )
}

function SheetFoot({ line, canAct, onUndo, onRetry }: {
  readonly line: LogLine
  readonly canAct: boolean
  readonly onUndo: (line: LogLine) => void
  readonly onRetry: (line: LogLine) => void
}) {
  return (
    <>
      {line.status === "gedaan" && line.undo === "verstuurd" && (
        <p className="mr-auto text-xs text-ink-3">Verstuurd: dit is buiten Insyte en haal je niet terug.</p>
      )}
      <ButtonLink to={paths.agent(line.agentId)} size="sm" variant="ghost">Regel wijzigen</ButtonLink>
      {canAct && line.status === "gedaan" && line.undo === "kan" && (
        <Button size="sm" onClick={() => onUndo(line)}>Ongedaan maken</Button>
      )}
      {canAct && line.status === "mislukt" && <Button size="sm" onClick={() => onRetry(line)}>Opnieuw proberen</Button>}
      {line.status === "wacht" && <ButtonLink to={line.href} size="sm" variant="primary">Bekijken</ButtonLink>}
    </>
  )
}
