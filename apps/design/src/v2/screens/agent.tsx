import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ASSISTANT } from "../assistant.ts"
import { formatValue } from "../charts/format.ts"
import { useDemo } from "../demo.ts"
import { ACTIVITY, AGENTS, hoursSaved, MORE_SKILLS, usageOf, versionsOf } from "../fixtures/agents.ts"
import type { Agent, Autonomy, InstructionVersion, LogEntry, Permission } from "../fixtures/agents.ts"
import { APPROVALS } from "../fixtures/home.ts"
import { DEMO_NOW, ME, WORKSPACE } from "../fixtures/workspace.ts"
import { Link, paths } from "../router.tsx"
import { ModelButton, Thinking } from "../ui/assistant.tsx"
import { AgentAvatar, Avatar } from "../ui/avatar.tsx"
import { Tag } from "../ui/badge.tsx"
import { Button, IconButton } from "../ui/button.tsx"
import { CardHead } from "../ui/card.tsx"
import { Composer } from "../ui/composer.tsx"
import { cx } from "../ui/cx.ts"
import { DropdownItem, DropdownMenu } from "../ui/dropdown.tsx"
import {
  ArrowLeft,
  BarChart3,
  Check,
  History,
  Lock,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Share,
  Users
} from "../ui/icons.tsx"
import { Message } from "../ui/message.tsx"
import { Popover } from "../ui/popover.tsx"
import { Meter } from "../ui/progress.tsx"
import { Rich } from "../ui/rich.tsx"
import { SharePanel } from "../ui/share.tsx"
import { Stat } from "../ui/stat.tsx"
import { Tabs } from "../ui/tabs.tsx"
import { toast } from "../ui/toast.tsx"
import { Segmented, ToggleRow } from "../ui/toggle.tsx"
import { SoonScreen } from "./soon.tsx"
import { WaitingProposal } from "./waiting-proposal.tsx"

const AUTONOMY: ReadonlyArray<{ value: Autonomy; label: string }> = [
  { value: "zelf", label: "Zelf doen" },
  { value: "vragen", label: "Eerst vragen" },
  { value: "nooit", label: "Nooit" }
]

/** The setting a log line ran under, in the setting's own words, so the tag and the rule read alike. */
const AUTONOMY_LABEL: Record<Autonomy, string> = { zelf: "Zelf doen", vragen: "Eerst vragen", nooit: "Nooit" }

/**
 * An agent's page, from the owner's screen: talk to the agent on the left, its job on the right
 * (figures, instructions, skills, triggers). Added: what waits on you from this agent, what it may do
 * on its own, per action, and what it did last, with undo, because an agent that acts must show its
 * rules and its record (PRODUCT.md). The chat on the left is with this agent only, never Magnus.
 * Below 1024px the two halves become tabs.
 */
export function AgentScreen({ agentId }: { readonly agentId: string }) {
  const agent = AGENTS.find((a) => a.id === agentId)
  const [pane, setPane] = useState<"chat" | "job">("job")
  if (agent === undefined) return <SoonScreen section="magnus" page={agentId} />

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Tabs
        label="Weergave"
        variant="pill"
        value={pane}
        onChange={setPane}
        tabs={[{ value: "job", label: "Instellingen" }, { value: "chat", label: "Chat" }]}
        className="shrink-0 px-3 py-1.5 lg:hidden"
      />
      <section
        aria-label={`Chat met ${agent.name}`}
        className={cx(
          "min-h-0 flex-col bg-panel lg:flex lg:w-[360px] lg:shrink-0 xl:w-[380px]",
          pane === "chat" ? "flex flex-1" : "hidden"
        )}
      >
        <AgentChat agent={agent} />
      </section>
      <div className={cx("pane-scroll min-h-0 flex-1 lg:block", pane === "job" ? "block" : "hidden")}>
        <AgentJob agent={agent} />
      </div>
    </div>
  )
}

/* ── left: the conversation ────────────────────────────────────────────────────────────────────── */

type ChatLine = { readonly from: "agent" | "me"; readonly at: string; readonly text: string }

function AgentChat({ agent }: { readonly agent: Agent }) {
  const [tab, setTab] = useState<"chat" | "geheugen">("chat")
  const [sent, setSent] = useState<ReadonlyArray<ChatLine>>([])
  const [thinking, setThinking] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    // Braced: `scrollIntoView` returns a promise in current Chrome, and an effect may only return a cleanup.
    end.current?.scrollIntoView({ block: "end" })
  }, [sent.length, tab, thinking])

  const send = (text: string) => {
    setTab("chat")
    setSent((list) => [...list, { from: "me", at: DEMO_NOW.clock, text }])
    setThinking(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setThinking(false)
      setSent((list) => [...list, { from: "agent", at: DEMO_NOW.clock, text: answer(agent, text) }])
    }, 900)
  }

  return (
    <>
      <nav className="flex h-11 shrink-0 items-center gap-1 px-3" aria-label="Agent">
        <Link
          to={paths.agents}
          className="flex h-8 items-center gap-1 rounded-sm px-2 text-sm text-ink-3 hover:bg-hover hover:text-ink"
        >
          <ArrowLeft size={15} />
          Terug
        </Link>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <Tabs
          label={`Gesprek met ${agent.name}`}
          value={tab}
          onChange={setTab}
          rule={false}
          tabs={[
            { value: "chat", label: "Chat", controls: `${agent.id}-chat` },
            { value: "geheugen", label: "Geheugen", controls: `${agent.id}-geheugen` }
          ]}
        />
      </nav>

      <div
        role="tabpanel"
        id={`${agent.id}-${tab}`}
        aria-labelledby={`${agent.id}-${tab}-tab`}
        className="pane-scroll flex min-h-0 flex-1 flex-col px-5"
      >
        {tab === "geheugen"
          ? <Memory />
          : (
            <div className="mt-auto flex flex-col gap-6 pt-10 pb-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <AgentAvatar glyph={agent.glyph} size={44} />
                <p className="text-sm font-semibold text-ink">Je praat met {agent.name}</p>
                <p className="max-w-[34ch] text-xs text-pretty text-ink-3">
                  Alleen deze agent leest en antwoordt hier, vanuit zijn eigen instructies. {ASSISTANT}{" "}
                  zit niet in dit gesprek; die vind je onder {ASSISTANT} in het menu.
                </p>
              </div>
              {agent.chat !== undefined && <p className="self-center text-2xs text-ink-3">Gisteren</p>}
              {[...(agent.chat ?? []), ...sent].map((line, i) => (
                <Message
                  key={`${i}-${line.at}`}
                  avatar={line.from === "agent"
                    ? <AgentAvatar glyph={agent.glyph} size={28} />
                    : <Avatar name={ME.name} size={28} />}
                  name={line.from === "agent" ? agent.name : ME.name}
                  at={line.at.replace("gisteren ", "")}
                >
                  <p className="text-sm text-pretty text-ink">
                    <Rich text={line.text} />
                  </p>
                </Message>
              ))}
              {thinking && <Thinking label={`${agent.name} kijkt het na…`} />}
              <div ref={end} />
            </div>
          )}
      </div>

      <div className="shrink-0 px-4 pb-4">
        <Composer
          tools={false}
          lead={<AgentAvatar glyph={agent.glyph} size={24} />}
          label={`Bericht aan ${agent.name}`}
          placeholder={`Vraag ${agent.name} iets`}
          dictation="Wat heb je vandaag zelf gedaan?"
          onSend={send}
        />
      </div>
    </>
  )
}

/**
 * The agent's answer in the demo, from the fixtures: what it did today, what it may do on its own,
 * what waits on you, or what it can check. Anything else gets what the agent is for and where
 * Magnus is, because this chat is the agent's own.
 */
function answer(agent: Agent, question: string): string {
  const q = question.toLowerCase()
  const done = ACTIVITY.filter((line) => line.agentId === agent.id)
  const waiting = APPROVALS.find((item) => item.agentId === agent.id)
  if (/vandaag|gedaan|gisteren|vannacht|log/.test(q)) {
    if (done.length === 0) return `Vandaag nog niets dat in het logboek staat. Ik draaide **${agent.runsToday}** keer.`
    const lines = done.map((line) =>
      `om ${line.at.replace("vannacht ", "")}${line.at.startsWith("vannacht") ? " vannacht" : ""}: ${line.text}`
    )
    return `Vandaag draaide ik **${agent.runsToday}** keer. In het logboek: ${lines.join("; ")}.`
  }
  if (/mag|regel|zelf|toestemming|vragen/.test(q)) {
    const rules = (agent.permissions ?? []).map((p) => `${lowerFirst(p.action)}: ${AUTONOMY_WORD[p.setting]}`)
    return rules.length === 0
      ? "Ik vraag je alles eerst; er staan nog geen regels voor wat ik zelf mag."
      : `Zo staan mijn regels nu: ${rules.join("; ")}. Wijzigen kan rechts, onder ‘Wat de agent zelf mag’.`
  }
  if (waiting !== undefined && /wacht|voorstel|korting|luca|kestrel|astrid|omruil/.test(q)) {
    return `Er wacht één voorstel op je: **${waiting.title}**. ${waiting.why} Het staat bovenaan rechts en op Start.`
  }
  if (/vervoerder|postnl|dhl|dpd|ups|pakket/.test(q) && agent.id === "waar-is-mijn-bestelling") {
    return "Ik kijk bij PostNL, DHL, DPD, UPS en ruim 1.500 andere vervoerders, via je track & trace-account. Pakket kwijt? Dan wijs ik het ticket toe aan Sofía Kim."
  }
  return `Ik ben de ${agent.name}: ${
    lowerFirst(agent.purpose)
  }. Vraag me wat ik vandaag deed, wat ik zelf mag of wat er op je wacht. Voor alles buiten ${agent.works.toLowerCase()} is ${ASSISTANT} er.`
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const MEMORIES = [
  { text: "Astrid Berg wil antwoord in het Engels.", from: "Ticket #5148", at: "vandaag" },
  {
    text: "DPD-pakketten naar Duitsland doen er één dag langer over dan DPD belooft.",
    from: "12 tickets",
    at: "deze week"
  },
  { text: "Sofía neemt verloren pakketten over; Elena alleen bij geschillen.", from: "Elena Hart", at: "4 nov" }
] as const

function Memory() {
  return (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-xs text-ink-3">Wat de agent onthoudt tussen gesprekken. Weghalen kan altijd.</p>
      <ul className="flex flex-col">
        {MEMORIES.map((memory) => (
          <li key={memory.text} className="flex flex-col gap-0.5 py-2.5">
            <span className="text-sm text-ink">{memory.text}</span>
            <span className="text-xs text-ink-3">{memory.from} · {memory.at}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── right: the job ────────────────────────────────────────────────────────────────────────────── */

function AgentJob({ agent }: { readonly agent: Agent }) {
  const [run, setRun] = useState<"idle" | "running" | "done">("idle")
  const [active, setActive] = useState(agent.active)
  const job = useJob(agent)
  const timer = useRef<number | undefined>(undefined)
  const demo = useDemo()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const waiting = APPROVALS.filter((item) => item.agentId === agent.id)
  const firstOpen = waiting.find((item) => demo.decisions[item.id] === undefined)?.id

  const runNow = () => {
    setRun("running")
    timer.current = window.setTimeout(() => setRun("done"), 1400)
  }

  const pause = () => {
    const next = !active
    setActive(next)
    toast({
      title: next ? `${agent.name} werkt weer` : `${agent.name} gepauzeerd`,
      body: next ? undefined : "Hij draait niet tot je hem hervat; wat open staat blijft liggen.",
      action: { label: "Ongedaan maken", onClick: () => setActive(!next) }
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-12 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-5">
            <AgentAvatar glyph={agent.glyph} size={52} active={active} />
            <dl className="flex gap-5">
              <Stat value={formatValue(agent.runs, "count")} unit="keer" label="Uitgevoerd" />
              <Stat
                value={`± ${hoursSaved(agent)}`}
                unit="u"
                label="bespaard, geschat"
                explain={`Een schatting: ${formatValue(agent.runs, "count")} uitvoeringen × ${
                  String(agent.minutesPerRun).replace(".", ",")
                } min per keer, de tijd die je zelf instelt voor deze taak.`}
              />
              <Stat value={active ? agent.lastWorked : "gepauzeerd"} unit="" label="Laatst gewerkt" />
            </dl>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-ink">
            {agent.name}
            {!active && <Tag>Gepauzeerd</Tag>}
          </h1>
          <p className="text-sm text-ink-2">{agent.purpose}</p>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <Users size={13} />
            Zichtbaar voor iedereen in {WORKSPACE} · beheerd door {agent.managers}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={run === "done" ? <Check /> : <Play />}
            disabled={run === "running" || !active}
            onClick={runNow}
          >
            {run === "running" ? "Bezig…" : run === "done" ? "Klaar · 3 tickets beantwoord" : "Nu uitvoeren"}
          </Button>
          <DropdownMenu
            label="Meer acties"
            placement="bottom-end"
            trigger={(props) => (
              <IconButton label="Meer acties" tone="outline" {...props}>
                <MoreHorizontal />
              </IconButton>
            )}
          >
            <DropdownItem glyph={active ? Pause : Play} onSelect={pause}>
              {active ? "Pauzeren" : "Hervatten"}
            </DropdownItem>
            <DropdownItem
              glyph={History}
              disabled={agent.log === undefined}
              onSelect={() => document.getElementById("logboek")?.scrollIntoView({ behavior: "smooth" })}
            >
              Naar het logboek
            </DropdownItem>
          </DropdownMenu>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <ModelButton />
            <Popover
              label="Gebruik"
              placement="bottom-end"
              trigger={(props) => <Button variant="ghost" size="sm" icon={<BarChart3 />} {...props}>Gebruik</Button>}
            >
              <Usage agent={agent} />
            </Popover>
            <Popover
              label="Delen"
              placement="bottom-end"
              trigger={(props) => <Button variant="ghost" size="sm" icon={<Share />} {...props}>Delen</Button>}
            >
              <SharePanel
                title={`${agent.name} delen`}
                link={`https://insyte.app/northwind/agents/${agent.id}`}
                audience={`Iedereen in ${WORKSPACE} kan de agent zien en ermee praten. Wijzigen: ${agent.managers}.`}
              />
            </Popover>
          </div>
        </div>
      </header>

      {waiting.length > 0 && (
        <section aria-labelledby="wacht" className="flex flex-col gap-3">
          <CardHead
            id="wacht"
            title="Wacht op jou"
            sub="Dit voorstel staat ook op Start; je antwoord geldt op beide plekken."
          />
          {waiting.map((item) => (
            <WaitingProposal key={item.id} item={item} primary={item.id === firstOpen} avatar={false} />
          ))}
        </section>
      )}
      <Instructions agent={agent} />
      {agent.triggers !== undefined && <Triggers agent={agent} />}
      {agent.permissions !== undefined && <Permissions agent={agent} job={job} />}
      {agent.log !== undefined && <Log job={job} />}
    </div>
  )
}

const cents = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" })

/** Gebruik: this month's runs and spend against the workspace's AI limit, warning at 80%. */
function Usage({ agent }: { readonly agent: Agent }) {
  const usage = usageOf(agent)
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-ink">Gebruik sinds {usage.since}</h2>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-ink-3">Uitvoeringen</dt>
          <dd className="figure text-md text-ink">{formatValue(usage.runs, "count")}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-ink-3">AI-kosten</dt>
          <dd className="figure text-md text-ink">{cents.format(usage.spend)}</dd>
        </div>
      </dl>
      <Meter
        value={usage.spend}
        max={usage.limit}
        label="Maandlimiet"
        format={(n) => cents.format(n)}
      />
      <p className="text-xs text-pretty text-ink-3">
        Bij 80% van de limiet krijg je een melding; daarboven vraagt de agent eerst. De limiet stel je in onder{" "}
        {ASSISTANT}-instellingen.
      </p>
    </div>
  )
}

function Instructions({ agent }: { readonly agent: Agent }) {
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState(
    agent.instructions?.role ?? `Je bent de ${agent.name} van ${WORKSPACE}. ${agent.purpose}.`
  )
  const [draft, setDraft] = useState(role)
  const [saved, setSaved] = useState("2 min geleden")
  const [versions, setVersions] = useState(() => versionsOf(agent))
  const [skills, setSkills] = useState(agent.skills ?? [])
  const does = agent.instructions?.does ?? []
  const handover = agent.instructions?.handover ?? []

  return (
    <Part className="flex flex-col gap-4" aria-labelledby="instructies">
      <CardHead
        id="instructies"
        title="Instructies"
        sub="Wat doet de agent als hij draait?"
        actions={!editing && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Bewerken</Button>}
      />
      <div className="flex flex-col gap-4 rounded-md bg-well p-4">
        <Section title="Rol en doel">
          {editing
            ? (
              <textarea
                value={draft.replaceAll("**", "")}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                aria-label="Rol en doel"
                className="w-full resize-y rounded-sm bg-canvas p-2 text-sm text-ink ring-1 ring-line-strong outline-none focus:ring-accent"
              />
            )
            : (
              <p className="max-w-[60ch] text-sm text-pretty text-ink-2">
                <Rich text={role} />
              </p>
            )}
        </Section>
        {does.length > 0 && (
          <Section title="Wat je doet">
            <Bullets items={does} />
          </Section>
        )}
        {handover.length > 0 && (
          <Section title="Wanneer je overdraagt">
            <Bullets items={handover} />
          </Section>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
        {editing
          ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setRole(draft)
                  setSaved("zojuist")
                  setEditing(false)
                  setVersions((list) => [
                    {
                      id: `v${list.length + 1}`,
                      at: "zojuist",
                      by: ME.name,
                      change: "Rol en doel aangepast",
                      role: draft
                    },
                    ...list
                  ])
                }}
              >
                Opslaan
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(role)
                  setEditing(false)
                }}
              >
                Annuleren
              </Button>
            </>
          )
          : (
            <Popover
              label="Versies"
              width="w-[min(22rem,calc(100vw-1rem))]"
              trigger={(props) => (
                <button
                  type="button"
                  className="flex min-h-8 items-center gap-1.5 rounded-xs hover:text-ink"
                  {...props}
                >
                  <History size={13} />Versies <span className="figure">{versions.length}</span>
                </button>
              )}
            >
              {(close) => (
                <Versions
                  versions={versions}
                  current={role}
                  onRestore={(version) => {
                    const before = role
                    setRole(version.role)
                    setDraft(version.role)
                    setSaved("zojuist")
                    close()
                    toast({
                      title: `Versie van ${version.at} teruggezet`,
                      body: version.change,
                      action: {
                        label: "Ongedaan maken",
                        onClick: () => {
                          setRole(before)
                          setDraft(before)
                        }
                      }
                    })
                  }}
                />
              )}
            </Popover>
          )}
        <span className="ml-auto">{saved === "zojuist" ? "Zojuist opgeslagen" : `${saved} opgeslagen`}</span>
      </div>

      {agent.skills !== undefined && (
        <div className="flex flex-col gap-1 pt-4">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold text-ink">
            Vaardigheden <span className="figure text-xs font-normal text-ink-3">{skills.length}</span>
          </h3>
          <ul className="flex flex-col">
            {skills.map((skill) => (
              <li key={skill.name} className="flex items-center gap-2.5 py-2 text-sm">
                <skill.glyph size={15} className="shrink-0 text-ink-3" />
                <span className="font-medium text-ink">{skill.name}</span>
                <span className="min-w-0 truncate text-ink-3">· {skill.detail}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-3">Toegevoegd</span>
              </li>
            ))}
          </ul>
          <DropdownMenu
            label="Vaardigheid toevoegen"
            width="w-72"
            trigger={(props) => (
              <button
                type="button"
                className="flex min-h-8 items-center gap-2 self-start rounded-xs text-sm text-ink-3 hover:text-ink"
                {...props}
              >
                <Plus size={15} />
                Vaardigheid toevoegen
              </button>
            )}
          >
            {MORE_SKILLS.map((skill) => (
              <DropdownItem
                key={skill.name}
                glyph={skill.glyph}
                hint={skill.detail}
                disabled={skills.some((s) => s.name === skill.name)}
                onSelect={() => {
                  setSkills((list) => [...list, skill])
                  toast({
                    title: `${skill.name} toegevoegd`,
                    action: {
                      label: "Ongedaan maken",
                      onClick: () => setSkills((list) => list.filter((s) => s.name !== skill.name))
                    }
                  })
                }}
              >
                {skill.name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </div>
      )}
    </Part>
  )
}

/** Versies: who changed the instructions and when, newest first, each with a way back to it. */
function Versions({ versions, current, onRestore }: {
  readonly versions: ReadonlyArray<InstructionVersion>
  readonly current: string
  readonly onRestore: (version: InstructionVersion) => void
}) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-ink">Versies van de instructies</h2>
      <ol className="flex flex-col gap-3">
        {versions.map((version) => {
          const live = version.role === current
          return (
            <li key={version.id} className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm text-pretty text-ink">{version.change}</span>
                <span className="text-xs text-ink-3">{version.by} · {version.at}</span>
              </div>
              {live
                ? <Tag tone="accent">Nu actief</Tag>
                : <Button size="sm" variant="ghost" onClick={() => onRestore(version)}>Terugzetten</Button>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  )
}

function Bullets({ items }: { readonly items: ReadonlyArray<string> }) {
  return (
    <ul className="flex max-w-[60ch] list-disc flex-col gap-1 pl-5 text-sm text-pretty text-ink-2 marker:text-ink-4">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

function Triggers({ agent }: { readonly agent: Agent }) {
  const [on, setOn] = useState<Readonly<Record<string, boolean>>>(
    () => Object.fromEntries((agent.triggers ?? []).map((t) => [t.id, t.on]))
  )
  const active = Object.values(on).filter(Boolean).length
  return (
    <Part className="flex flex-col gap-3" aria-labelledby="triggers">
      <CardHead id="triggers" title="Triggers" after={`${active} actief`} sub="Wanneer moet deze agent draaien?" />
      <p className="text-xs text-ink-3">Als er iets gebeurt</p>
      <ul className="flex flex-col">
        {(agent.triggers ?? []).map((trigger) => (
          <li key={trigger.id}>
            <ToggleRow
              glyph={trigger.glyph}
              title={trigger.name}
              detail={trigger.detail}
              on={on[trigger.id] ?? false}
              onChange={(next) => setOn((state) => ({ ...state, [trigger.id]: next }))}
            />
          </li>
        ))}
      </ul>
    </Part>
  )
}

/**
 * The agent's rules and its record share one state, because changing a rule is itself a line in the
 * record: who changed what, from what, with the way back.
 */
function useJob(agent: Agent) {
  const [settings, setSettings] = useState<Readonly<Record<string, Autonomy>>>(
    () => Object.fromEntries((agent.permissions ?? []).map((p) => [p.id, p.setting]))
  )
  const [log, setLog] = useState<ReadonlyArray<LogEntry>>(agent.log ?? [])
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set())
  const changes = useRef(0)

  const revert = (id: string, permission: string, from: Autonomy) => {
    setSettings((state) => ({ ...state, [permission]: from }))
    setLog((list) => list.filter((entry) => entry.id !== id))
  }

  const change = (permission: Permission, to: Autonomy) => {
    const from = settings[permission.id] ?? permission.setting
    if (from === to) return
    changes.current += 1
    const id = `regel-${changes.current}`
    setSettings((state) => ({ ...state, [permission.id]: to }))
    setLog((list) => [
      {
        id,
        at: DEMO_NOW.clock,
        text: `Regel gewijzigd: ${lower(permission.action)} van ${AUTONOMY_WORD[from]} naar ${AUTONOMY_WORD[to]}`,
        record: `Door ${ME.name}`,
        setting: to,
        undo: "kan",
        rule: { permission: permission.id, from }
      },
      ...list
    ])
    toast({
      title: "Regel gewijzigd",
      body: `${permission.action}: ${AUTONOMY_WORD[to]}. Staat in het logboek.`,
      action: { label: "Ongedaan maken", onClick: () => revert(id, permission.id, from) }
    })
  }

  const toggleUndo = (entry: LogEntry) => {
    if (entry.rule !== undefined) {
      revert(entry.id, entry.rule.permission, entry.rule.from)
      return
    }
    setUndone((set) => {
      const next = new Set(set)
      if (next.has(entry.id)) next.delete(entry.id)
      else next.add(entry.id)
      return next
    })
  }

  return { settings, change, log, undone, toggleUndo }
}

type Job = ReturnType<typeof useJob>

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const AUTONOMY_WORD: Record<Autonomy, string> = { zelf: "zelf doen", vragen: "eerst vragen", nooit: "nooit" }

function Permissions({ agent, job }: { readonly agent: Agent; readonly job: Job }) {
  /** A raise to "zelf" on a risky action waits here for a yes, with what it means. */
  const [pending, setPending] = useState<string | null>(null)
  return (
    <Part className="flex flex-col gap-3" aria-labelledby="regels">
      <CardHead
        id="regels"
        title="Wat de agent zelf mag"
        sub="Per handeling: zelf doen en vastleggen, eerst aan jou vragen, of nooit."
      />
      <ul className="flex flex-col gap-1">
        {(agent.permissions ?? []).map((permission) => {
          const value = job.settings[permission.id] ?? permission.setting
          const changed = value !== permission.standard
          return (
            <li key={permission.id} className="flex flex-col gap-2 py-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-ink">{permission.action}</span>
                  {permission.locked !== true && (
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                      {changed ? `Standaard: ${AUTONOMY_WORD[permission.standard]}` : "Standaard"}
                      {changed && (
                        <button
                          type="button"
                          onClick={() => job.change(permission, permission.standard)}
                          className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
                        >
                          Terugzetten
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {permission.locked === true
                  ? (
                    <span className="flex items-center gap-1.5 text-xs text-ink-3">
                      <Lock size={13} />
                      Nooit · vastgezet voor alle agents
                    </span>
                  )
                  : (
                    <Segmented
                      size="sm"
                      label={permission.action}
                      value={pending === permission.id ? "zelf" : value}
                      options={AUTONOMY}
                      onChange={(next) => {
                        if (next === "zelf" && permission.risk !== undefined && value !== "zelf") {
                          setPending(permission.id)
                          return
                        }
                        setPending(null)
                        job.change(permission, next)
                      }}
                    />
                  )}
              </div>
              {pending === permission.id && permission.risk !== undefined && (
                <div
                  role="group"
                  aria-label={`${permission.action}: zelf doen bevestigen`}
                  className="flex flex-col gap-3 rounded-md bg-panel p-3"
                >
                  <p className="max-w-[60ch] text-sm text-pretty text-ink">
                    {permission.risk} Wil je dat de agent dit voortaan zelf doet?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setPending(null)
                        job.change(permission, "zelf")
                      }}
                    >
                      Ja, zelf laten doen
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Annuleren</Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Part>
  )
}

function Log({ job }: { readonly job: Job }) {
  return (
    <Part className="flex flex-col gap-3" aria-labelledby="logboek">
      <CardHead id="logboek" title="Laatst gedaan" sub="Elke handeling met de regel waaronder hij liep." />
      <ol className="flex flex-col">
        {job.log.map((entry) => {
          const isUndone = job.undone.has(entry.id)
          return (
            <li key={entry.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 py-2">
              <span className="figure pt-px text-xs text-ink-3">{entry.at}</span>
              <div className="flex flex-col gap-1">
                <span className={cx("text-sm", isUndone ? "text-ink-3 line-through" : "text-ink")}>{entry.text}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  {entry.record}
                  {entry.rule === undefined && (
                    <Tag tone={entry.setting === "vragen" ? "accent" : "neutral"}>{AUTONOMY_LABEL[entry.setting]}</Tag>
                  )}
                  {entry.undo === "kan" && (
                    <button
                      type="button"
                      onClick={() => job.toggleUndo(entry)}
                      className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
                    >
                      {isUndone ? "Opnieuw doen" : "Ongedaan maken"}
                    </button>
                  )}
                  {entry.undo === "verstuurd" && <span>Verstuurd · niet terug te halen</span>}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </Part>
  )
}

/** A part of the agent's job: a section on the page, no frame; space and its head separate it. */
function Part({ className, children, ...rest }: {
  readonly className?: string
  readonly children: ReactNode
  readonly "aria-labelledby": string
}) {
  return <section className={className} {...rest}>{children}</section>
}
