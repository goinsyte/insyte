import { useEffect, useRef, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  AUTONOMY_ACTIONS,
  AUTONOMY_LABEL,
  budgetFor,
  customerAgentFor,
  DEFAULT_POLICY,
  keysFor,
  member,
  MODE_LABEL,
  NEVER_REACHABLE,
  policyFor,
  policyHistory,
  relative,
  WEEKDAYS
} from "../../fixtures/settings.ts"
import type { AgentSettings, AutonomyLevel, ChannelMode, Policy } from "../../fixtures/settings.ts"
import { Link, paths, useQuery } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { AlertDialog } from "../../ui/dialog.tsx"
import { Bot, FileText, Key, Lock, Send, Sparkles, Webhook } from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { Meter } from "../../ui/progress.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import { money, readSaved, SettingsPage, UnsavedBar, useDraft, useSaved } from "./parts.tsx"

/* ── Zelfstandigheid ───────────────────────────────────────────────────────────────────────────── */

const GROUPS = [...new Set(AUTONOMY_ACTIONS.map((a) => a.group))]
const LEVELS: ReadonlyArray<{ value: AutonomyLevel; label: string }> = [
  { value: "auto", label: AUTONOMY_LABEL.auto },
  { value: "ask", label: AUTONOMY_LABEL.ask },
  { value: "never", label: AUTONOMY_LABEL.never }
]

/** "Magnus wijst toe, schrijft notities … zelf. De rest komt eerst als voorstel bij jou." */
function describePolicy(policy: Policy): string {
  const auto = AUTONOMY_ACTIONS.filter((a) => policy[a.id] === "auto")
  const never = AUTONOMY_ACTIONS.filter((a) => policy[a.id] === "never")
  if (auto.length === 0) return `${ASSISTANT} doet niets op eigen houtje. Alles komt eerst als voorstel bij jou.`
  const list = auto.map((a) => a.label.toLowerCase())
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} en ${list.at(-1) ?? ""}`
  return `${ASSISTANT} mag zelf: ${joined}. De rest komt eerst als voorstel bij jou${
    never.length > 0 ? `, ${never.length} ${never.length === 1 ? "actie doet" : "acties doet"} hij nooit` : ""
  }.`
}

type History = ReturnType<typeof policyHistory>

/**
 * Zelfstandigheid: per action whether Magnus does it himself, asks first or never does it. The safe
 * defaults ask first; whatever cannot be taken back (a refund, an evidence pack, accepting a dispute,
 * cancelling a paid order) always asks. Each save is a version, so the history says who let him do
 * what. `?actie=` points at one row. The current demo's `settings/ai/autonomy`.
 */
export function AutonomyScreen() {
  const view = useView()
  const { manage } = useAccess("settings")
  const focus = useQuery("actie")
  const [policy, setPolicy] = useSaved("autonomy", policyFor(view.staat))
  const [history, setHistory] = useSaved<History>("autonomy.history", policyHistory(view.staat))
  const [draft, setDraft] = useState<Policy>(policy)
  const [resetting, setResetting] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy)
  const version = history[0]?.version ?? 1
  const budget = budgetFor(view.staat)
  const spent = budget.limit !== null && budget.used >= budget.limit
  const focused = useRef<HTMLDivElement>(null)
  useEffect(() => {
    focused.current?.scrollIntoView({ block: "center" })
  }, [])

  const commit = (next: Policy, note: string) => {
    const changes = AUTONOMY_ACTIONS.filter((a) => next[a.id] !== policy[a.id]).map((a) => ({
      id: a.id,
      from: policy[a.id] ?? "ask",
      to: next[a.id] ?? "ask"
    }))
    if (changes.length === 0) return
    const before = { policy, history }
    setPolicy(next)
    setDraft(next)
    setHistory([{
      id: `pol_${version + 1}`,
      at: new Date(2026, 10, 23, 14, 30),
      by: "Elena Hart",
      version: version + 1,
      changes
    }, ...history])
    toast({
      title: `Versie ${version + 1} is nu van kracht`,
      body: note,
      tone: "good",
      action: {
        label: "Ongedaan maken",
        onClick: () => {
          setPolicy(before.policy)
          setDraft(before.policy)
          setHistory(before.history)
        }
      }
    })
  }

  return (
    <SettingsPage
      title="Zelfstandigheid"
      width="record"
      area="settings"
      what={`wat ${ASSISTANT} zelf mag`}
      meta={describePolicy(policy)}
      readOnlyNote={false}
      actions={
        <>
          <ButtonLink size="sm" variant="ghost" icon={<Bot />} to={paths.agents}>Agents</ButtonLink>
          {manage && (
            <Button
              size="sm"
              disabled={JSON.stringify(policy) === JSON.stringify(DEFAULT_POLICY)}
              onClick={() => setResetting(true)}
            >
              Standaard herstellen
            </Button>
          )}
        </>
      }
    >
      {!manage && (
        <p className="flex items-start gap-2 rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">
          <Lock size={14} className="mt-0.5 shrink-0 text-ink-3" />
          <span>
            <span className="font-medium text-ink">Alleen lezen.</span>{" "}
            Zelfstandigheid instellen vraagt Instellingen · Beheren; Eigenaar en Beheerder hebben dat.
          </span>
        </p>
      )}
      {spent && (
        <Notice
          tone="warn"
          title={`Het AI-budget is op: ${money(budget.used)} van ${money(budget.limit ?? 0)} deze maand`}
          action={<ButtonLink size="sm" to={paths.settings("ai/limieten")}>Limieten openen</ButtonLink>}
        >
          Tot de maand omslaat of je de limiet verhoogt, komt alles wat {ASSISTANT} zelf zou doen als voorstel bij jou.
        </Notice>
      )}

      <PageSection id="per-actie" title="Per actie" meta={`Versie ${version} is nu van kracht.`}>
        <p className="max-w-[64ch] text-sm text-pretty text-ink-2">
          Alles wat {ASSISTANT} zelf doet, is terug te draaien en staat in het{" "}
          <Link to={paths.log} className="underline">logboek</Link>. Binnen 5 minuten maak je het ongedaan. Ook je eigen
          agents volgen deze regels, straks ook via MCP.
        </p>
        <div className="flex flex-col gap-6 pt-2">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-col">
              <h3 className="pb-1 text-xs font-semibold text-ink-3">{group}</h3>
              {AUTONOMY_ACTIONS.filter((a) => a.group === group).map((a) => {
                const value = draft[a.id] ?? "ask"
                const changed = value !== policy[a.id]
                return (
                  <div
                    key={a.id}
                    ref={focus === a.id ? focused : undefined}
                    className={cx(
                      "-mx-3 flex flex-col gap-x-6 gap-y-2 rounded-md px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                      focus === a.id && "bg-accent-tint"
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-sm font-medium text-ink">
                        {a.label}
                        {changed && (
                          <span className="ml-2 text-2xs font-normal text-accent-ink">
                            was {AUTONOMY_LABEL[policy[a.id] ?? "ask"]}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-pretty text-ink-3">
                        {a.locked ?? `Bij Zelf doen ${a.does} zonder het eerst te vragen.`}
                        {a.sensitive === "contact" && a.locked === undefined && " Dit bereikt iemand buiten het team."}
                      </p>
                    </div>
                    {a.locked !== undefined
                      ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
                          <Lock size={13} className="text-ink-3" />
                          Vraagt altijd
                        </span>
                      )
                      : (
                        <Segmented
                          label={a.label}
                          disabled={!manage}
                          value={value}
                          options={LEVELS}
                          onChange={(next) => setDraft((d) => ({ ...d, [a.id]: next }))}
                        />
                      )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection id="nooit" title={`Wat ${ASSISTANT} nooit kan, wat je ook kiest`}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
          {NEVER_REACHABLE.map((n) => <li key={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</li>)}
        </ul>
      </PageSection>

      <PageSection id="geschiedenis" title="Geschiedenis" meta={String(history.length)}>
        <List divided label="Versies">
          {history.map((h) => (
            <ListRow
              key={h.id}
              padded={false}
              lead={<Avatar name={h.by} size={28} />}
              title={`Versie ${h.version} · ${h.by}`}
              meta={h.changes.length === 0
                ? "De standaard, bij het aanmaken van de werkruimte."
                : h.changes.map((c) =>
                  `${AUTONOMY_ACTIONS.find((a) => a.id === c.id)?.label ?? c.id}: ${AUTONOMY_LABEL[c.from]} → ${
                    AUTONOMY_LABEL[c.to]
                  }`
                ).join(" · ")}
              trail={<span>{relative(h.at)}</span>}
            />
          ))}
        </List>
      </PageSection>

      <UnsavedBar
        dirty={dirty}
        note={`${AUTONOMY_ACTIONS.filter((a) => draft[a.id] !== policy[a.id]).length} acties`}
        onReset={() => setDraft(policy)}
        onSave={() => commit(draft, describePolicy(draft))}
      />
      <AlertDialog
        open={resetting}
        onCancel={() => setResetting(false)}
        onConfirm={() => {
          setResetting(false)
          commit(DEFAULT_POLICY, "Alles komt weer eerst als voorstel bij jou.")
        }}
        title="Standaard herstellen?"
        body={`Alles gaat terug naar Eerst vragen. ${ASSISTANT} doet dan niets meer op eigen houtje tot je het weer toestaat.`}
        confirmLabel="Herstellen"
      />
    </SettingsPage>
  )
}

/* ── Klantagent ────────────────────────────────────────────────────────────────────────────────── */

const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  webchat: "Websitechat",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-mail"
}

const TEST_ANSWERS: ReadonlyArray<{ q: string; a: string; from: string; handover?: boolean }> = [
  {
    q: "Hoe lang duurt verzending naar Duitsland?",
    a: "Naar Duitsland duurt het 2 tot 4 werkdagen. Bestel je op een werkdag vóór 15:00, dan gaat je pakket dezelfde dag de deur uit, met DHL.",
    from: "Verzending en levertijden"
  },
  {
    q: "Valt de Cascade pufferjas klein?",
    a: "Nee, de Cascade Puffer valt juist ruim. Neem je gewone maat, of een maat kleiner als je hem strak wilt.",
    from: "Maten"
  },
  {
    q: "Ik wil mijn geld terug",
    a: "Dat kan binnen 30 dagen na bezorging via het retourportaal. Terugbetalen doe ik niet zelf: een collega kijkt ernaar en je hoort vandaag van ons.",
    from: "Retourneren",
    handover: true
  }
]

/**
 * Klantagent: Magnus on the store's own channels. Which channels he answers himself (only the
 * website chat for now) and where he only drafts, the hours, when he hands over to a colleague, his
 * tone, and a test chat that answers from the published knowledge without sending anything. The
 * current demo's `settings/ai/customer-agent`.
 */
export function CustomerAgentScreen() {
  const view = useView()
  const { edit } = useAccess("settings")
  const data = customerAgentFor(view.staat)
  const [saved, setSaved] = useSaved<AgentSettings>("customer-agent", data.settings)
  const [draft, setDraft] = useState<AgentSettings>(saved)
  const [turningOff, setTurningOff] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const policy = readSaved<Policy>(view.staat, "autonomy", policyFor(view.staat))
  const replyAuto = policy.SendReply === "auto"
  const patch = (next: Partial<AgentSettings>) => setDraft((d) => ({ ...d, ...next }))
  const t = data.today

  if (!saved.on) {
    return (
      <SettingsPage title="Klantagent" area="settings" what="de klantagent">
        <EmptyState
          glyph={Sparkles}
          title="De klantagent staat uit"
          action={edit
            ? (
              <span className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    const next: AgentSettings = { ...saved, on: true, channels: { ...saved.channels, webchat: "auto" } }
                    setSaved(next)
                    setDraft(next)
                    toast({
                      title: "Klantagent staat aan",
                      body: "Op de websitechat, binnen je openingstijden.",
                      tone: "good"
                    })
                  }}
                >
                  Aanzetten voor de websitechat
                </Button>
                <ButtonLink to={paths.settings("ai/kennisbank")}>Kennisbank vullen</ButtonLink>
              </span>
            )
            : undefined}
        >
          Zet hem aan en {ASSISTANT} beantwoordt vragen op je websitechat, uit je eigen kennisbank.
        </EmptyState>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage
      title="Klantagent"
      width="record"
      area="settings"
      what="de klantagent"
      meta={
        <>
          Vandaag <span className="figure">{t.conversations}</span> gesprekken ·{" "}
          <span className="figure">{t.handled}</span> zelf afgehandeld · <span className="figure">{t.handedOver}</span>
          {" "}
          overgedragen · <span className="figure">{t.waiting}</span> wachten · eerste reactie{" "}
          <span className="figure">{t.avgSeconds}</span> s
        </>
      }
      actions={
        <>
          <ButtonLink size="sm" variant="ghost" to={paths.storeChat}>Gesprekken</ButtonLink>
          <ButtonLink size="sm" variant="ghost" to={paths.settings("ai/kennisbank")}>Kennisbank</ButtonLink>
        </>
      }
    >
      {!replyAuto && draft.channels.webchat === "auto" && (
        <Notice
          tone="info"
          title="Klant beantwoorden staat in Zelfstandigheid op Eerst vragen"
          action={
            <ButtonLink size="sm" to={`${paths.settings("ai/zelfstandigheid")}?actie=SendReply`}>
              Zelfstandigheid
            </ButtonLink>
          }
        >
          Dus {ASSISTANT} zet op de websitechat alleen concepten klaar, tot je het daar toestaat.
        </Notice>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <SettingsSection
            id="kanalen"
            title="Kanalen"
            description="Zelf antwoorden kan nu alleen op de websitechat; op de andere kanalen zet hij concepten klaar."
          >
            {Object.keys(CHANNEL_LABEL).map((ch) => {
              const value = draft.channels[ch] ?? "off"
              const options = (ch === "webchat" ? ["auto", "drafts", "off"] : ["drafts", "off"]) as ReadonlyArray<
                ChannelMode
              >
              return (
                <SettingRow
                  key={ch}
                  title={CHANNEL_LABEL[ch] ?? ch}
                  description={ch === "webchat" ? undefined : "Zelf antwoorden: binnenkort"}
                  control={
                    <Segmented
                      label={CHANNEL_LABEL[ch] ?? ch}
                      disabled={!edit}
                      value={value}
                      options={options.map((o) => ({ value: o, label: MODE_LABEL[o] }))}
                      onChange={(next) => patch({ channels: { ...draft.channels, [ch]: next } })}
                    />
                  }
                />
              )
            })}
          </SettingsSection>

          <SettingsSection
            id="tijden"
            title="Openingstijden"
            description="Binnen deze tijden draagt hij over aan het team; daarbuiten doet hij wat je hieronder kiest."
          >
            {WEEKDAYS.map((day, i) => {
              const h = draft.hours[i] ?? { open: false, from: "09:00", to: "18:00" }
              const setDay = (next: Partial<typeof h>) =>
                patch({ hours: draft.hours.map((x, j) => (j === i ? { ...x, ...next } : x)) })
              return (
                <div key={day} className="flex flex-wrap items-center justify-between gap-3 py-1.5">
                  <span className="flex w-36 items-center gap-3">
                    <Toggle label={`${day} open`} disabled={!edit} on={h.open} onChange={(open) => setDay({ open })} />
                    <span className="text-sm text-ink capitalize">{day}</span>
                  </span>
                  {h.open
                    ? (
                      <span className="flex items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${day} van`}
                          className="w-28"
                          disabled={!edit}
                          value={h.from}
                          onChange={(e) => setDay({ from: e.target.value })}
                        />
                        <span className="text-sm text-ink-3">tot</span>
                        <Input
                          type="time"
                          aria-label={`${day} tot`}
                          className="w-28"
                          disabled={!edit}
                          value={h.to}
                          onChange={(e) => setDay({ to: e.target.value })}
                        />
                      </span>
                    )
                    : <span className="text-sm text-ink-3">Gesloten</span>}
                </div>
              )
            })}
            <div className="py-3">
              <RadioGroup
                label="Buiten openingstijden"
                disabled={!edit}
                value={draft.outside}
                onChange={(outside) => patch({ outside })}
                options={[
                  {
                    value: "take",
                    label: "Vraag aannemen",
                    description: "Hij noteert de vraag en zegt wanneer het team antwoordt."
                  },
                  {
                    value: "answer",
                    label: "Antwoorden uit de kennisbank",
                    description: "Wat hij niet weet, neemt hij aan voor de volgende ochtend."
                  }
                ]}
              />
            </div>
          </SettingsSection>

          <SettingsSection id="overdragen" title="Overdragen wanneer">
            <SettingRow
              title={`${ASSISTANT} twijfelt aan het antwoord`}
              control={
                <Toggle
                  label="Overdragen bij twijfel"
                  disabled={!edit}
                  on={draft.unsure}
                  onChange={(unsure) => patch({ unsure })}
                />
              }
            />
            <SettingRow
              title="De klant vraagt om een mens"
              control={
                <Toggle
                  label="Overdragen als de klant om een mens vraagt"
                  disabled={!edit}
                  on={draft.asksPerson}
                  onChange={(asksPerson) => patch({ asksPerson })}
                />
              }
            />
            <SettingRow
              title="Altijd voor een collega"
              htmlFor="topics"
              description="Onderwerpen, met komma's ertussen."
              control={
                <Input
                  id="topics"
                  className="w-64"
                  disabled={!edit}
                  value={draft.topics.join(", ")}
                  onChange={(e) =>
                    patch({ topics: e.target.value.split(",").map((x) => x.trim()).filter((x) => x !== "") })}
                />
              }
            />
            <SettingRow
              title="Na zoveel berichten"
              htmlFor="after"
              description="Leeg is nooit."
              control={
                <Input
                  id="after"
                  inputMode="numeric"
                  suffix="berichten"
                  className="w-36"
                  disabled={!edit}
                  value={draft.afterMessages === null ? "" : String(draft.afterMessages)}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    patch({ afterMessages: Number.isNaN(n) ? null : n })
                  }}
                />
              }
            />
          </SettingsSection>

          <SettingsSection id="toon" title="Toon en woorden">
            <SettingRow
              title="Toon"
              control={
                <Segmented
                  label="Toon"
                  disabled={!edit}
                  value={draft.tone}
                  onChange={(tone) => patch({ tone })}
                  options={[
                    { value: "brand", label: "Zoals je merk" },
                    { value: "short", label: "Kort en vriendelijk" },
                    { value: "formal", label: "Formeel" }
                  ]}
                />
              }
            />
            <div className="py-3">
              <Field label="Bij een overdracht" hint="{wanneer} wordt bijvoorbeeld “vandaag” of “morgen vanaf 9:00”.">
                {(c) => (
                  <Textarea
                    {...c}
                    rows={3}
                    disabled={!edit}
                    value={draft.handover}
                    onChange={(e) => patch({ handover: e.target.value })}
                  />
                )}
              </Field>
            </div>
          </SettingsSection>

          <PageSection id="nooit" title={`Wat ${ASSISTANT} hier nooit doet`}>
            <List label="Wat hij nooit doet" className="-mx-2">
              {([["RefundOrder", "Terugbetalen"], ["CancelOrder", "Een bestelling annuleren"], [
                "",
                "Geld of korting beloven"
              ]] as const).map(([id, label]) => (
                <ListRow
                  key={label}
                  href={id === "" ? undefined : `${paths.settings("ai/zelfstandigheid")}?actie=${id}`}
                  lead={
                    <GlyphTile>
                      <Lock size={15} />
                    </GlyphTile>
                  }
                  title={label}
                  meta={id === ""
                    ? "Hij zegt wat het beleid is en draagt over."
                    : "Vraagt altijd, onder Zelfstandigheid"}
                />
              ))}
            </List>
          </PageSection>

          {edit && (
            <div>
              <Button variant="ghost" onClick={() => setTurningOff(true)}>Klantagent uitzetten</Button>
            </div>
          )}
        </div>
        <TestChat />
      </div>

      <UnsavedBar
        dirty={dirty}
        onReset={() => setDraft(saved)}
        onSave={() => {
          setSaved(draft)
          toast({ title: "Klantagent opgeslagen", tone: "good" })
        }}
      />
      <AlertDialog
        open={turningOff}
        onCancel={() => setTurningOff(false)}
        onConfirm={() => {
          const before = saved
          setSaved({ ...saved, on: false })
          setTurningOff(false)
          toast({
            title: "Klantagent staat uit",
            body: "Nieuwe gesprekken komen bij het team.",
            action: { label: "Ongedaan maken", onClick: () => setSaved(before) }
          })
        }}
        title="Klantagent uitzetten?"
        body="Nieuwe gesprekken op de websitechat komen dan direct bij het team. Gesprekken die al lopen, maakt hij af."
        confirmLabel="Uitzetten"
      />
    </SettingsPage>
  )
}

function TestChat() {
  const [messages, setMessages] = useState<
    ReadonlyArray<{ who: "klant" | "agent"; text: string; from?: string; handover?: boolean }>
  >([
    { who: "agent", text: "Hoi! Waar kunnen we je mee helpen?" }
  ])
  const [text, setText] = useState("")
  const ask = (q: string) => {
    const hit = TEST_ANSWERS.find((x) => x.q === q)
    setMessages((m) => [
      ...m,
      { who: "klant", text: q },
      hit === undefined
        ? {
          who: "agent",
          text:
            "Daar staat niets over in de kennisbank. Ik geef je vraag door aan een collega; je hoort vandaag van ons.",
          handover: true
        }
        : { who: "agent", text: hit.a, from: hit.from, ...(hit.handover === true ? { handover: true } : {}) }
    ])
    setText("")
  }
  return (
    <aside
      aria-label="Testchat"
      className="flex flex-col gap-3 self-start rounded-lg bg-well px-4 py-4 lg:sticky lg:top-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-ink">Testchat</h2>
        <p className="text-xs text-ink-3">
          Antwoordt uit je gepubliceerde kennisbank en zegt uit welk hoofdstuk. Er wordt niets verstuurd.
        </p>
      </div>
      <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={cx("flex flex-col gap-1", m.who === "klant" ? "items-end" : "items-start")}>
            <span
              className={cx(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                m.who === "klant" ? "bg-ink text-on-ink" : "bg-canvas text-ink"
              )}
            >
              {m.text}
            </span>
            {(m.from !== undefined || m.handover === true) && (
              <span className="text-2xs text-ink-3">
                {m.from === undefined ? "" : `Uit: ${m.from}`}
                {m.from !== undefined && m.handover === true ? " · " : ""}
                {m.handover === true ? "Overgedragen" : ""}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {TEST_ANSWERS.map((x) => (
          <button
            key={x.q}
            type="button"
            onClick={() => ask(x.q)}
            className="rounded-full bg-canvas px-2.5 py-1 text-left text-xs text-ink-2 hover:text-ink pointer-coarse:min-h-11"
          >
            {x.q}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim() !== "") ask(text.trim())
        }}
      >
        <Input
          aria-label="Stel een vraag als klant"
          placeholder="Stel een vraag als klant"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Versturen"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-ink text-on-ink pointer-coarse:size-11"
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  )
}

/* ── Limieten ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Limieten: what Magnus may cost a month, for the workspace and per person. At 80% that person and
 * the owner hear of it; at 100% what he would do himself comes to you as a proposal and the customer
 * agent hands new conversations over. The current demo's `settings/ai/limits`.
 */
export function LimitsScreen() {
  const view = useView()
  const { manage } = useAccess("settings")
  const data = budgetFor(view.staat)
  const form = useDraft("limits", {
    limit: data.limit === null ? "" : String(data.limit),
    people: Object.fromEntries(data.people.map((p) => [p.id, p.limit === null ? "" : String(p.limit)])) as Record<
      string,
      string
    >
  })
  const limit = form.saved.limit === "" ? null : Number(form.saved.limit)
  const bad = [form.draft.limit, ...Object.values(form.draft.people)].some((v) =>
    v.trim() !== "" && !(Number(v.replace(",", ".")) > 0)
  )
  const save = () => {
    if (bad) {
      toast({ title: "Een limiet is een bedrag van meer dan € 0, of leeg voor geen limiet", tone: "bad" })
      return
    }
    form.commit()
    toast({ title: "Limieten opgeslagen", body: "Gelden meteen, ook voor werk dat al loopt.", tone: "good" })
  }
  return (
    <SettingsPage
      title="Limieten"
      width="record"
      area="settings"
      what="de AI-limieten"
      meta={`Wat ${ASSISTANT} per maand mag kosten`}
    >
      <SettingsSection
        id="werkruimte"
        title="Werkruimte · november"
        description="Bij 80% krijgen die persoon en de eigenaar een melding."
      >
        <div className="py-3">
          {limit === null
            ? (
              <p className="text-sm text-ink-2">
                <span className="figure">{money(data.used, true)}</span> gebruikt, zonder limiet.
              </p>
            )
            : <Meter label="Gebruikt deze maand" value={data.used} max={limit} format={(n) => money(n, n % 1 !== 0)} />}
          <p className="pt-2 text-xs text-ink-3">
            Waarvan achtergrondwerk (agents, het weekrapport):{" "}
            <span className="figure">{money(data.background, data.background % 1 !== 0)}</span>
          </p>
        </div>
        <SettingRow
          title="Maandbudget"
          htmlFor="month-limit"
          description="Leeg is geen limiet."
          control={
            <Input
              id="month-limit"
              prefix="€"
              inputMode="decimal"
              placeholder="Geen limiet"
              className="w-36"
              disabled={!manage}
              value={form.draft.limit}
              onChange={(e) => form.patch({ limit: e.target.value })}
            />
          }
        />
      </SettingsSection>

      <PageSection
        id="per-persoon"
        title="Per persoon"
        meta="Bij 100%: wat hij zelf zou doen, komt als voorstel bij jou en de klantagent draagt nieuwe gesprekken over."
      >
        <Table label="Limieten per persoon" minWidth={600}>
          <THead>
            <Th>Teamlid</Th>
            <Th>Limiet</Th>
            <Th align="right">Gebruikt</Th>
            <Th>Stand</Th>
          </THead>
          <TBody>
            {data.people.map((p) => {
              const m = member(p.id)
              const own = form.saved.people[p.id] ?? ""
              const cap = own === "" ? null : Number(own)
              const pct = cap === null ? null : Math.round((p.used / cap) * 100)
              return (
                <Tr key={p.id}>
                  <Td header>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={m?.name ?? p.id} size={24} />
                      <Link to={paths.person(p.id)} className="hover:underline">{m?.name ?? p.id}</Link>
                    </span>
                  </Td>
                  <Td>
                    <Input
                      aria-label={`Limiet voor ${m?.name ?? p.id}`}
                      prefix="€"
                      inputMode="decimal"
                      placeholder="Geen limiet"
                      className="w-32"
                      disabled={!manage}
                      value={form.draft.people[p.id] ?? ""}
                      onChange={(e) => form.patch({ people: { ...form.draft.people, [p.id]: e.target.value } })}
                    />
                  </Td>
                  <Td figure>{money(p.used, true)}</Td>
                  <Td>
                    {pct === null
                      ? <span className="text-ink-3">Geen limiet</span>
                      : pct >= 100
                      ? <span className="text-bad-ink">Limiet bereikt · gebruikt de snelle route</span>
                      : pct >= 80
                      ? (
                        <span className="text-warn-ink">
                          <span className="figure">{pct}</span>% gebruikt
                        </span>
                      )
                      : (
                        <span>
                          <span className="figure">{pct}</span>% gebruikt
                        </span>
                      )}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </PageSection>
      <UnsavedBar dirty={manage && form.dirty} onSave={save} onReset={form.reset} />
    </SettingsPage>
  )
}

/* ── Agents en MCP ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Agents en MCP: the team's own agents (an API key marked for an agent), the MCP server that is
 * coming, and where the rules they follow live. MCP is not available yet and says so. The current
 * demo's `settings/agents`.
 */
export function AgentsMcpScreen() {
  const view = useView()
  const keys = keysFor(view.staat).filter((k) => k.agent === true && k.status === "active")
  return (
    <SettingsPage
      title="Agents en MCP"
      area="integrations"
      what="de agents"
      readOnlyNote={false}
      meta={`Je eigen agents werken met dezelfde regels als ${ASSISTANT}`}
      actions={
        <ButtonLink size="sm" variant="ghost" icon={<Bot />} to={paths.agents}>Agents van {ASSISTANT}</ButtonLink>
      }
    >
      <PageSection id="eigen" title="Je eigen agents" meta={String(keys.length)}>
        {keys.length === 0
          ? (
            <EmptyState
              size="sm"
              glyph={Key}
              title="Nog geen sleutel voor een agent"
              action={<ButtonLink to={`${paths.settings("api-sleutels")}?nieuw=agent`}>Sleutel maken</ButtonLink>}
            >
              Een agent van jezelf praat met Insyte via een API-sleutel die je voor een agent maakt. Elke schrijfactie
              volgt Zelfstandigheid; wat op Eerst vragen staat, komt als voorstel bij jou.
            </EmptyState>
          )
          : (
            <List divided label="Je eigen agents">
              {keys.map((k) => (
                <ListRow
                  key={k.id}
                  padded={false}
                  href={`${paths.settings("api-sleutels")}?sleutel=${k.id}`}
                  lead={
                    <GlyphTile>
                      <Bot size={16} />
                    </GlyphTile>
                  }
                  title={k.label}
                  meta={`${k.prefix}… · door ${k.createdBy}`}
                />
              ))}
            </List>
          )}
      </PageSection>

      <PageSection id="mcp" title="MCP-server" meta={<Tag>Binnenkort</Tag>}>
        <p className="max-w-[64ch] text-sm text-pretty text-ink-2">
          Met MCP gebruikt een AI-agent Insyte direct: bestellingen lezen, een ticket beantwoorden, een voorstel doen,
          onder dezelfde regels als {ASSISTANT}. Dat komt binnenkort; tot dan werkt een eigen agent via een API-sleutel.
        </p>
      </PageSection>

      <PageSection id="verder" title="Verder">
        <List label="Verder" className="-mx-2">
          <ListRow
            href={paths.settings("api-sleutels")}
            lead={
              <GlyphTile>
                <Key size={16} />
              </GlyphTile>
            }
            title="API-sleutels"
            meta="Sleutels maken, beperken, roteren en intrekken"
          />
          <ListRow
            href={paths.settings("webhooks")}
            lead={
              <GlyphTile>
                <Webhook size={16} />
              </GlyphTile>
            }
            title="Webhooks"
            meta="Laat je agent weten wanneer er iets gebeurt"
          />
          <ListRow
            href={paths.settings("ai/zelfstandigheid")}
            lead={
              <GlyphTile>
                <Sparkles size={16} />
              </GlyphTile>
            }
            title="Zelfstandigheid"
            meta={`Wat ${ASSISTANT} en je eigen agents zelf mogen`}
          />
          <ListRow
            href={paths.log}
            lead={
              <GlyphTile>
                <FileText size={16} />
              </GlyphTile>
            }
            title={`Wat ${ASSISTANT} deed`}
            meta="Elke actie van een agent, met Ongedaan maken"
          />
        </List>
      </PageSection>
    </SettingsPage>
  )
}
