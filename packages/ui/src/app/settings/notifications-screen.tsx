import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Checkbox } from "../../components/checkbox"
import { Switch } from "../../components/switch"
import { Bell, Eye, Mail, Moon, Send } from "../../icons"
import { ConfirmDialog } from "../common/confirm-dialog"
import { PageGuide } from "../common/page-guide"
import { counted } from "../lib/counted"
import {
  type Channel,
  CHANNELS,
  EVENT_GROUPS,
  type EventDef,
  EVENTS,
  heard,
  type NotifyPrefs
} from "../lib/notifications"
import { cn } from "../lib/utils"
import { FieldRow, INPUT_CLASS, SelectInput, UnsavedBar } from "./form"
import { type PushHere, type SlackHere, useNotificationSettingsSource } from "./notifications-source"
import { SettingCard } from "./setting-card"

const DIGEST_TIMES = ["06:00", "07:00", "07:30", "08:00", "08:30", "09:00", "10:00"]

const GUIDE = [
  {
    title: "Waar het heen gaat",
    body: "Een melding komt in de app, per e-mail, als push op je telefoon of in Slack. Per gebeurtenis kies je welke.",
    art: "notify"
  },
  {
    title: "In de app",
    body:
      "Deze kolom beslist wat in je meldingen en het klokje verschijnt. Zet je hem uit, dan verdwijnt die gebeurtenis uit beide.",
    art: "rules"
  },
  {
    title: "Stille uren",
    body:
      "Push en Slack wachten tot de stille uren voorbij zijn, in je eigen tijdzone. In de app en per e-mail komt alles gewoon binnen.",
    art: "hours"
  },
  {
    title: "Dagelijks overzicht",
    body: "Elke werkdag één e-mail met wat ongelezen is, wat vandaag afloopt en wat Insyte heeft klaargezet.",
    art: "log"
  },
  {
    title: "Automatisch volgen",
    body: "Een record dat je volgt laat elke update horen onder Overig, ook als die niet aan jou gericht is.",
    art: "people"
  }
] as const

/** What a column that cannot deliver says, in its header and in each row. */
const NOT_CONNECTED = "Niet gekoppeld"

/** What a channel this environment does not have yet says. */
const NOT_YET = "Nog niet beschikbaar"

/**
 * What the operator hears, where, and when.
 *
 * The page is one matrix: every event the workspace raises, grouped the way the product is, against
 * the four places a notification can go. "In de app" is the switch the inbox and the dropdown read, so
 * turning one off takes those rows out of both. Under it, the hours push and Slack keep quiet, the
 * morning digest, and the rules for which records you follow without asking.
 *
 * What it reads and saves is `notifications-source.tsx`'s. A channel that cannot deliver yet says
 * "Niet gekoppeld" instead of offering switches that would do nothing. While a save is out the bar
 * waits; one that did not go keeps the draft, and the host says why.
 */
export function NotificationSettings() {
  const source = useNotificationSettingsSource()
  const { saved, notes, email } = source
  const [draft, setDraft] = useState<NotifyPrefs>(saved)
  const [saving, setSaving] = useState(false)
  const savedKey = JSON.stringify(saved)
  const dirty = JSON.stringify(draft) !== savedKey

  // A fresh read of the saved settings (a save, its undo, another tab) is what the page shows.
  useEffect(() => setDraft(saved), [savedKey])

  const admin = useMemo(() => notes?.filter((n) => n.persona === "admin" && n.state !== "cleared"), [notes])
  const shown = admin?.filter((n) => heard(n, draft)).length

  const setEvent = (key: string, patch: Partial<NotifyPrefs["events"][string]>) =>
    setDraft((d) => {
      const current = d.events[key] ?? { app: false, email: false, push: false, slack: false, onlyMine: false }
      return { ...d, events: { ...d.events, [key]: { ...current, ...patch } } }
    })

  const threshold = (e: EventDef) =>
    e.threshold === "delayHours"
      ? source.thresholds.delayHours
      : e.threshold === "disputeAmount"
      ? source.thresholds.disputeAmount
      : null

  const connected = (c: Channel) => c === "app" || c === "email" || source.connected[c]

  return (
    <>
      <SettingCard title="Kanalen" icon={Send}>
        <div className="flex flex-col">
          <FieldRow label="E-mail">
            <span className={cn(INPUT_CLASS, "flex items-center text-ink-2")}>{email}</span>
          </FieldRow>
          {source.push ? <PushRow push={source.push} testPush={source.testPush} /> : (
            <FieldRow label="Mobiel push">
              {source.testPush ?
                <FieldButton icon onClick={source.testPush}>Testmelding sturen</FieldButton> :
                <span className="flex h-9 items-center text-base text-ink-3">{NOT_CONNECTED}</span>}
            </FieldRow>
          )}
          {source.slack ?
            (
              <SlackRow
                slack={source.slack}
                channel={draft.slackChannel}
                channels={source.slackChannels}
                onChannel={(v) => setDraft((d) => ({ ...d, slackChannel: v }))}
              />
            ) :
            (
              <FieldRow label="Slack">
                {source.connected.slack ?
                  (
                    <SelectInput
                      value={draft.slackChannel}
                      onChange={(v) => setDraft((d) => ({ ...d, slackChannel: v }))}
                      options={source.slackChannels}
                    />
                  ) :
                  <span className="flex h-9 items-center text-base text-ink-3">{NOT_CONNECTED}</span>}
              </FieldRow>
            )}
        </div>
      </SettingCard>

      <SettingCard
        title="Wat je hoort"
        icon={Bell}
        {...(admin === undefined || shown === undefined || admin.length === 0
          ? {}
          : { subtitle: `${shown} van ${admin.length} in de app` })}
      >
        <div className="overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,76px)] items-end gap-2 px-4 pt-3 pb-2 sm:grid">
            <span className="text-ink-3 text-xs">Gebeurtenis</span>
            {CHANNELS.map((c) => (
              <span key={c.id} className="flex flex-col items-center text-center font-medium text-ink-2 text-xs">
                {c.label}
                {connected(c.id) ? null : <span className="font-normal text-ink-3">{NOT_CONNECTED}</span>}
              </span>
            ))}
          </div>
          {EVENT_GROUPS.map(({ group, icon: Icon }) => {
            const rows = EVENTS.filter((e) => e.group === group)
            return (
              <section key={group} aria-label={group}>
                <h3 className="flex items-center gap-2 bg-mist px-4 py-1.5 font-medium text-ink-2 text-sm">
                  <Icon className="size-3.5 text-ink-3" strokeWidth={1.75} />
                  {group}
                </h3>
                <ul className="[&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
                  {rows.map((e) => {
                    const p = draft.events[e.key] ?? { ...e.defaults, onlyMine: false }
                    const t = threshold(e)
                    return (
                      <li
                        key={e.key}
                        className="grid grid-cols-1 gap-x-2 gap-y-2.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,76px)] sm:items-center"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className={cn("font-medium text-base", p.app ? "text-ink" : "text-ink-2")}>
                            {e.label}
                          </span>
                          <span className="text-ink-3 text-sm">
                            {e.detail}
                            {t ?
                              (
                                <>
                                  {" "}
                                  <Link
                                    // Account's thresholds; a host without that page yet types it as `never`.
                                    to={"/settings/profile" as never}
                                    hash="alerts"
                                    className="text-arc-ink underline decoration-arc-ink/35 underline-offset-2 hover:decoration-arc-ink"
                                  >
                                    {t}, wijzigen
                                  </Link>
                                </>
                              ) :
                              null}
                          </span>
                          {e.mine ?
                            (
                              // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox is inside
                              <label className="mt-0.5 flex w-fit cursor-pointer items-center gap-2 text-ink-2 text-sm">
                                <Checkbox
                                  checked={p.onlyMine}
                                  onCheckedChange={(v) => setEvent(e.key, { onlyMine: v === true })}
                                />
                                Alleen als het mij betreft
                              </label>
                            ) :
                            null}
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:contents">
                          {CHANNELS.map((c) => (
                            <ChannelSwitch
                              key={c.id}
                              channel={c.id}
                              short={c.short}
                              label={`${e.label}: ${c.label}`}
                              on={p[c.id]}
                              connected={connected(c.id)}
                              onChange={(v) => setEvent(e.key, { [c.id]: v })}
                            />
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </SettingCard>

      <SettingCard title="Stille uren" icon={Moon}>
        <div className="flex flex-col">
          <FieldRow label="Stille uren aan">
            <span className="flex h-9 items-center">
              <Switch
                checked={draft.quiet.on}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, on: v } }))}
                aria-label="Stille uren aan"
              />
            </span>
          </FieldRow>
          <FieldRow label="Van en tot" hint={source.timezone}>
            <span className="flex items-center gap-2">
              <input
                type="time"
                value={draft.quiet.from}
                disabled={!draft.quiet.on}
                onChange={(e) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, from: e.target.value } }))}
                aria-label="Stil vanaf"
                className={cn(INPUT_CLASS, "w-32 tabular-nums disabled:opacity-50")}
              />
              <span className="text-ink-3 text-sm">tot</span>
              <input
                type="time"
                value={draft.quiet.to}
                disabled={!draft.quiet.on}
                onChange={(e) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, to: e.target.value } }))}
                aria-label="Stil tot"
                className={cn(INPUT_CLASS, "w-32 tabular-nums disabled:opacity-50")}
              />
            </span>
          </FieldRow>
          <FieldRow label="Weekend">
            <span className="flex h-9 items-center">
              <Switch
                checked={draft.quiet.weekend}
                disabled={!draft.quiet.on}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, weekend: v } }))}
                aria-label="Weekend stil"
              />
            </span>
          </FieldRow>
        </div>
      </SettingCard>

      <SettingCard title="Dagelijks overzicht" icon={Mail}>
        <div className="flex flex-col">
          <FieldRow label="Overzicht sturen">
            <span className="flex h-9 items-center">
              <Switch
                checked={draft.digest.on}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, digest: { ...d.digest, on: v } }))}
                aria-label="Dagelijks overzicht sturen"
              />
            </span>
          </FieldRow>
          <FieldRow label="Om" hint={draft.digest.on ? `Elke werkdag naar ${email}.` : "Staat uit."}>
            <SelectInput
              value={draft.digest.at}
              onChange={(v) => setDraft((d) => ({ ...d, digest: { ...d.digest, at: v } }))}
              options={DIGEST_TIMES}
            />
          </FieldRow>
        </div>
      </SettingCard>

      <SettingCard title="Volg automatisch" icon={Eye}>
        <div className="flex flex-col">
          <FollowRow
            label="Aan mij toegewezen"
            on={draft.follow.assigned}
            onChange={(v) => setDraft((d) => ({ ...d, follow: { ...d.follow, assigned: v } }))}
          />
          <FollowRow
            label="Waarin ik vermeld word"
            on={draft.follow.mentioned}
            onChange={(v) => setDraft((d) => ({ ...d, follow: { ...d.follow, mentioned: v } }))}
          />
          <FollowRow
            label="Die ik heb gemaakt"
            on={draft.follow.created}
            onChange={(v) => setDraft((d) => ({ ...d, follow: { ...d.follow, created: v } }))}
          />
        </div>
      </SettingCard>

      <UnsavedBar
        visible={dirty}
        saving={saving}
        onDiscard={() => setDraft(saved)}
        onSave={() => {
          if (saving) return
          if (draft.quiet.on && draft.quiet.from === draft.quiet.to) {
            toast.error("Stille uren hebben een begin en een eind nodig die niet gelijk zijn")
            return
          }
          setSaving(true)
          void source.save(draft, {
            label: "Meldingen opgeslagen",
            detail: admin === undefined || shown === undefined || admin.length === 0
              ? undefined
              : `Je ziet nu ${shown} van ${admin.length} meldingen in de app.`
          }).finally(() => setSaving(false))
        }}
      />
      <PageGuide id="settings.notifications" title="Meldingen" steps={GUIDE} />
    </>
  )
}

function ChannelSwitch(
  { channel, short, label, on, connected, onChange }: {
    channel: Channel
    short: string
    label: string
    on: boolean
    connected: boolean
    onChange: (v: boolean) => void
  }
) {
  return (
    <span className="flex flex-col items-center gap-1 sm:justify-center" data-channel={channel}>
      <span className="text-ink-3 text-xs sm:hidden">{short}</span>
      {connected ?
        <Switch checked={on} onCheckedChange={onChange} aria-label={label} /> :
        (
          <span className="flex h-5 items-center text-ink-3 text-sm">
            <span aria-hidden>—</span>
            <span className="sr-only">{`${label}: ${NOT_CONNECTED}`}</span>
          </span>
        )}
    </span>
  )
}

/** The design's field button ("Testmelding sturen"), inside a row that is a label, so a click is only the button's. */
function FieldButton(
  { icon = false, disabled = false, onClick, children }: {
    icon?: boolean
    disabled?: boolean
    onClick: () => void
    children: ReactNode
  }
) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      className="field flex h-9 w-fit items-center gap-2 rounded-md px-3 font-medium text-base text-ink hover:field-hover disabled:opacity-50"
    >
      {icon ? <Bell className="size-4 text-ink-3" strokeWidth={1.75} /> : null}
      {children}
    </button>
  )
}

/** A quieter second step beside a field ("Uitzetten op dit apparaat", "Ontkoppelen"). */
function QuietButton({ disabled = false, onClick, children }: {
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      className="h-9 w-fit px-1 text-ink-2 text-sm underline decoration-ink-3/40 underline-offset-2 hover:text-ink hover:decoration-ink-2 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="flex h-9 items-center text-base text-ink-3">{children}</span>
)

/**
 * "Mobiel push" where the host can deliver it: on in this browser, or a step to turn it on; what the browser or the
 * environment cannot do is said, with the way out where there is one.
 */
export function PushRow({ push, testPush }: { push: PushHere; testPush: (() => void) | undefined }) {
  const others = push.state === "on" ? push.devices - 1 : push.devices
  const elsewhere = others > 0
    ? `Staat ook aan op ${counted(others, "ander apparaat", "andere apparaten")}.`
    : undefined
  switch (push.state) {
    case "unavailable":
      return (
        <FieldRow label="Mobiel push">
          <Muted>{NOT_YET}</Muted>
        </FieldRow>
      )
    case "unsupported":
      return (
        <FieldRow
          label="Mobiel push"
          hint="Op een iPhone of iPad zet je Insyte eerst op je beginscherm en open je het daar."
        >
          <Muted>Niet in deze browser</Muted>
        </FieldRow>
      )
    case "blocked":
      return (
        <FieldRow label="Mobiel push" hint="Sta meldingen voor Insyte toe in de instellingen van je browser.">
          <Muted>Geblokkeerd in deze browser</Muted>
        </FieldRow>
      )
    case "off":
      return (
        <FieldRow label="Mobiel push" {...(elsewhere === undefined ? {} : { hint: elsewhere })}>
          <FieldButton icon disabled={push.busy} onClick={push.enable}>Push aanzetten</FieldButton>
        </FieldRow>
      )
    case "on":
      return (
        <FieldRow label="Mobiel push" {...(elsewhere === undefined ? {} : { hint: elsewhere })}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {testPush
              ? <FieldButton icon disabled={push.busy} onClick={testPush}>Testmelding sturen</FieldButton>
              : null}
            <QuietButton disabled={push.busy} onClick={push.disable}>Uitzetten op dit apparaat</QuietButton>
          </span>
        </FieldRow>
      )
  }
}

/**
 * Slack where the host can connect it: a manager connects the workspace and may let it go again (asked first, as it
 * stops Slack for everyone); every member picks where theirs go.
 */
export function SlackRow({ slack, channel, channels, onChannel }: {
  slack: SlackHere
  channel: string
  channels: ReadonlyArray<string | { value: string; label: string }>
  onChannel: (v: string) => void
}) {
  const [asking, setAsking] = useState(false)
  if (slack.state === "unavailable") {
    return (
      <FieldRow label="Slack">
        <Muted>{NOT_YET}</Muted>
      </FieldRow>
    )
  }
  if (slack.state === "available") {
    return slack.manage ?
      (
        <FieldRow label="Slack">
          <FieldButton disabled={slack.busy} onClick={slack.connect}>Slack koppelen</FieldButton>
        </FieldRow>
      ) :
      (
        <FieldRow label="Slack" hint="Een eigenaar of beheerder koppelt Slack voor de workspace.">
          <Muted>{NOT_CONNECTED}</Muted>
        </FieldRow>
      )
  }
  return (
    <>
      <FieldRow label="Slack" {...(slack.team === null ? {} : { hint: `Gekoppeld met ${slack.team}` })}>
        <span className="flex flex-col gap-1">
          <SelectInput
            value={channel}
            onChange={onChannel}
            options={[{ value: "", label: "Kies een kanaal" }, ...channels]}
          />
          {slack.manage ?
            <QuietButton disabled={slack.busy} onClick={() => setAsking(true)}>Slack ontkoppelen</QuietButton> :
            null}
        </span>
      </FieldRow>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Slack ontkoppelen?"
        description="Meldingen gaan dan voor niemand in de workspace meer naar Slack, en ieders kanaalkeuze vervalt. Je kunt Slack later opnieuw koppelen."
        confirmLabel="Ontkoppelen"
        tone="destructive"
        onConfirm={slack.disconnect}
      />
    </>
  )
}

function FollowRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <FieldRow label={label}>
      <span className="flex h-9 items-center">
        <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
      </span>
    </FieldRow>
  )
}
