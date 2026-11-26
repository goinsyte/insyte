import { Fragment, useEffect, useState } from "react"
import {
  ALERTS,
  CHANNELS,
  GOTO_DEFAULTS,
  member,
  NOTE_EVENTS,
  SCREEN_KEYS,
  SLACK_CHANNELS
} from "../../fixtures/settings.ts"
import type { Channel } from "../../fixtures/settings.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, paths } from "../../router.tsx"
import { Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox, RowCheckbox } from "../../ui/checkbox.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { Kbd } from "../../ui/kbd.tsx"
import { PageSection } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { money, readSaved, SettingsPage, UnsavedBar, useSaved } from "./parts.tsx"

/* ── Meldingen ─────────────────────────────────────────────────────────────────────────────────── */

type NoteSettings = {
  readonly matrix: Readonly<Record<string, Readonly<Record<Channel, boolean>>>>
  readonly mine: Readonly<Record<string, boolean>>
  readonly quiet: { readonly on: boolean; readonly from: string; readonly to: string; readonly weekend: boolean }
  readonly digest: { readonly on: boolean; readonly at: string }
  readonly follow: { readonly assigned: boolean; readonly mentioned: boolean; readonly created: boolean }
}

const NOTE_SEED: NoteSettings = {
  matrix: Object.fromEntries(NOTE_EVENTS.map((e) => [e.key, e.on])),
  mine: Object.fromEntries(NOTE_EVENTS.filter((e) => e.mine === true).map((e) => [e.key, true])),
  quiet: { on: true, from: "20:00", to: "08:00", weekend: true },
  digest: { on: true, at: "08:30" },
  follow: { assigned: true, mentioned: true, created: false }
}

const GROUPS = [...new Set(NOTE_EVENTS.map((e) => e.group))]

/**
 * Meldingen: per event what you hear and where (in the app, by mail, as a push, in Slack), when it is
 * quiet, and the overview each workday. It is yours alone, so every role can change it. The whole
 * page is one set of choices, so it saves with the bar at its foot. The current demo's
 * `settings/notifications`.
 */
export function NotificationsScreen() {
  const [saved, setSaved] = useSaved("notifications", NOTE_SEED)
  const [draft, setDraft] = useState<NoteSettings>(saved)
  const [slack, setSlack] = useSaved<string | null>("notifications.slack", null)
  const [connecting, setConnecting] = useState(false)
  const [channel, setChannel] = useState(SLACK_CHANNELS[0] ?? "")
  const [disconnecting, setDisconnecting] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const inApp = NOTE_EVENTS.filter((e) => draft.matrix[e.key]?.app === true).length
  const alerts = readSaved("gewoon", "alerts", {
    delayHours: String(ALERTS.delayHours),
    disputeAmount: String(ALERTS.disputeAmount)
  })
  const me = member(ME.id)

  const setCell = (key: string, ch: Channel, on: boolean) =>
    setDraft((d) => ({
      ...d,
      matrix: {
        ...d.matrix,
        [key]: { ...(d.matrix[key] ?? { app: false, email: false, push: false, slack: false }), [ch]: on }
      }
    }))
  const save = () => {
    if (draft.quiet.on && (draft.quiet.from === "" || draft.quiet.to === "" || draft.quiet.from === draft.quiet.to)) {
      toast({ title: "Stille uren hebben een begin en een eind nodig die niet gelijk zijn", tone: "bad" })
      return
    }
    setSaved(draft)
    toast({ title: "Meldingen opgeslagen", tone: "good" })
  }
  const columns = CHANNELS.filter((c) => c.id !== "slack" || slack !== null)

  return (
    <SettingsPage
      title="Meldingen"
      area={null}
      meta="Wat je hoort en waar. Dit geldt alleen voor jou."
    >
      <SettingsSection id="kanalen" title="Kanalen" description="Waar een melding je kan bereiken, naast de app zelf.">
        <SettingRow
          title="E-mail"
          description={me?.email ?? "elena@northwindclothing.co"}
          control={<Tag tone="good">Aan</Tag>}
        />
        <SettingRow
          title="Push"
          description="iPhone 15 · de Insyte-app"
          control={
            <Button
              size="sm"
              onClick={() =>
                toast({
                  title: "Testmelding gestuurd",
                  body: "Hij staat binnen een paar seconden op je iPhone.",
                  tone: "good"
                })}
            >
              Testmelding sturen
            </Button>
          }
        />
        <SettingRow
          title="Slack"
          description={slack === null ? "Niet gekoppeld" : `Gekoppeld · meldingen gaan naar ${slack}`}
          control={slack === null
            ? <Button size="sm" onClick={() => setConnecting(true)}>Slack koppelen</Button>
            : <Button size="sm" variant="ghost" onClick={() => setDisconnecting(true)}>Ontkoppelen</Button>}
        />
      </SettingsSection>

      <PageSection
        id="wat"
        title="Wat je hoort"
        meta={`${inApp} van ${NOTE_EVENTS.length} in de app`}
      >
        <Table label="Wat je hoort" minWidth={columns.length * 84 + 300}>
          <THead>
            <Th>Melding</Th>
            {columns.map((c) => <Th key={c.id} align="right" width={84}>{c.short}</Th>)}
          </THead>
          <TBody>
            {GROUPS.map((group) => (
              <Fragment key={group}>
                <tr>
                  <th
                    colSpan={columns.length + 1}
                    scope="colgroup"
                    className="pt-5 pb-1 text-left text-xs font-semibold text-ink-3"
                  >
                    {group}
                  </th>
                </tr>
                {NOTE_EVENTS.filter((e) => e.group === group).map((e) => (
                  <Tr key={e.key}>
                    <Td header>
                      <span className="flex flex-col gap-0.5 py-2">
                        <span className="text-sm text-ink">{e.label}</span>
                        <span className="text-xs text-ink-3">
                          {e.detail}
                          {e.threshold === "delayHours" && (
                            <>
                              {" "}
                              <Link to={paths.settings("profiel")} className="underline">
                                {alerts.delayHours} uur, wijzigen
                              </Link>
                            </>
                          )}
                          {e.threshold === "disputeAmount" && (
                            <>
                              {" "}
                              <Link to={paths.settings("profiel")} className="underline">
                                vanaf {money(Number(alerts.disputeAmount))}, wijzigen
                              </Link>
                            </>
                          )}
                        </span>
                        {e.mine === true && (
                          <span className="pt-1">
                            <Checkbox
                              label="Alleen als het mij betreft"
                              checked={draft.mine[e.key] === true}
                              onChange={(on) => setDraft((d) => ({ ...d, mine: { ...d.mine, [e.key]: on } }))}
                            />
                          </span>
                        )}
                      </span>
                    </Td>
                    {columns.map((c) => (
                      <Td key={c.id} align="right">
                        <RowCheckbox
                          label={`${e.label} · ${c.label}`}
                          checked={draft.matrix[e.key]?.[c.id] === true}
                          onChange={(on) => setCell(e.key, c.id, on)}
                        />
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Fragment>
            ))}
          </TBody>
        </Table>
      </PageSection>

      <SettingsSection
        id="stil"
        title="Stille uren"
        description="Geen push en geen Slack in deze uren. In de app en per mail komt alles gewoon binnen."
      >
        <SettingRow
          title="Stille uren aan"
          control={
            <Toggle
              label="Stille uren"
              on={draft.quiet.on}
              onChange={(on) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, on } }))}
            />
          }
        />
        {draft.quiet.on && (
          <>
            <SettingRow
              title="Van en tot"
              control={
                <span className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label="Van"
                    className="w-28"
                    value={draft.quiet.from}
                    onChange={(e) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, from: e.target.value } }))}
                  />
                  <span className="text-sm text-ink-3">tot</span>
                  <Input
                    type="time"
                    aria-label="Tot"
                    className="w-28"
                    value={draft.quiet.to}
                    onChange={(e) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, to: e.target.value } }))}
                  />
                </span>
              }
            />
            <SettingRow
              title="Weekend"
              description="Zaterdag en zondag de hele dag stil."
              control={
                <Toggle
                  label="Weekend stil"
                  on={draft.quiet.weekend}
                  onChange={(weekend) => setDraft((d) => ({ ...d, quiet: { ...d.quiet, weekend } }))}
                />
              }
            />
          </>
        )}
      </SettingsSection>

      <SettingsSection
        id="overzicht"
        title="Dagelijks overzicht"
        description="Eén mail met wat er gisteren gebeurde en wat vandaag op je wacht."
      >
        <SettingRow
          title="Overzicht sturen"
          control={
            <Toggle
              label="Overzicht sturen"
              on={draft.digest.on}
              onChange={(on) => setDraft((d) => ({ ...d, digest: { ...d.digest, on } }))}
            />
          }
        />
        {draft.digest.on && (
          <SettingRow
            title="Om"
            htmlFor="digest-at"
            description={`Elke werkdag naar ${me?.email ?? "je e-mail"}.`}
            control={
              <Input
                id="digest-at"
                type="time"
                className="w-28"
                value={draft.digest.at}
                onChange={(e) => setDraft((d) => ({ ...d, digest: { ...d.digest, at: e.target.value } }))}
              />
            }
          />
        )}
      </SettingsSection>

      <SettingsSection
        id="volg"
        title="Volg automatisch"
        description="Een record dat je volgt, meldt elke wijziging aan jou."
      >
        {([
          ["assigned", "Aan mij toegewezen"],
          ["mentioned", "Waarin ik vermeld word"],
          ["created", "Die ik heb gemaakt"]
        ] as const).map(([key, title]) => (
          <SettingRow
            key={key}
            title={title}
            control={
              <Toggle
                label={title}
                on={draft.follow[key]}
                onChange={(on) => setDraft((d) => ({ ...d, follow: { ...d.follow, [key]: on } }))}
              />
            }
          />
        ))}
      </SettingsSection>

      <UnsavedBar dirty={dirty} onSave={save} onReset={() => setDraft(saved)} />

      <Dialog
        open={connecting}
        onClose={() => setConnecting(false)}
        title="Slack koppelen"
        description="Meldingen die je op Slack zet, komen in één kanaal. Je kunt het later wijzigen."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConnecting(false)}>Annuleren</Button>
            <Button
              variant="primary"
              onClick={() => {
                setSlack(channel)
                setConnecting(false)
                toast({ title: "Slack gekoppeld", body: `Meldingen gaan naar ${channel}.`, tone: "good" })
              }}
            >
              Koppelen
            </Button>
          </>
        }
      >
        <Field label="Kies een kanaal">
          {(c) => (
            <Select {...c} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {SLACK_CHANNELS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          )}
        </Field>
      </Dialog>
      <AlertDialog
        open={disconnecting}
        onCancel={() => setDisconnecting(false)}
        onConfirm={() => {
          const was = slack
          setSlack(null)
          setDisconnecting(false)
          toast({ title: "Slack ontkoppeld", action: { label: "Ongedaan maken", onClick: () => setSlack(was) } })
        }}
        title="Slack ontkoppelen?"
        body="Meldingen die op Slack stonden, komen dan alleen nog in de app en per mail."
        confirmLabel="Ontkoppelen"
      />
    </SettingsPage>
  )
}

/* ── Sneltoetsen ───────────────────────────────────────────────────────────────────────────────── */

type Keys = { readonly on: boolean; readonly map: Readonly<Record<string, string>> }
const KEY_SEED: Keys = { on: true, map: Object.fromEntries(GOTO_DEFAULTS.map((g) => [g.id, g.key])) }
const ALLOWED = /^[A-Z0-9,.]$/

/**
 * Sneltoetsen: G and then a key goes to a page, and you choose the key; the keys that belong to a
 * screen are fixed and listed. Changing one listens for the next key press and says why a key cannot
 * be used. The current demo's `settings/shortcuts`.
 */
export function ShortcutsScreen() {
  const [keys, setKeys] = useSaved("shortcuts", KEY_SEED)
  const [listening, setListening] = useState<string | null>(null)
  const [problem, setProblem] = useState<{ readonly id: string; readonly text: string } | null>(null)

  useEffect(() => {
    if (listening === null) return
    const target = GOTO_DEFAULTS.find((g) => g.id === listening)
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") {
        setListening(null)
        setProblem(null)
        return
      }
      const k = event.key.length === 1 ? event.key.toUpperCase() : ""
      if (!ALLOWED.test(k)) {
        setProblem({ id: listening, text: "Kies een letter, een cijfer, een komma of een punt" })
        return
      }
      if (k === "G") {
        setProblem({ id: listening, text: "G is de eerste toets. Kies een andere voor de tweede." })
        return
      }
      const owner = GOTO_DEFAULTS.find((g) => g.id !== listening && keys.map[g.id] === k)
      if (owner !== undefined) {
        setProblem({
          id: listening,
          text: `${k} gaat al naar ${owner.label}. Kies een andere toets, of geef die eerst een nieuwe.`
        })
        return
      }
      const before = keys.map[listening] ?? ""
      setKeys({ ...keys, map: { ...keys.map, [listening]: k } })
      setListening(null)
      setProblem(null)
      toast({
        title: `G dan ${k} gaat naar ${target?.label ?? ""}`,
        tone: "good",
        action: {
          label: "Ongedaan maken",
          onClick: () => setKeys((all) => ({ ...all, map: { ...all.map, [listening]: before } }))
        }
      })
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [listening, keys, setKeys])

  const changed = GOTO_DEFAULTS.some((g) => keys.map[g.id] !== g.key)

  return (
    <SettingsPage
      title="Sneltoetsen"
      area={null}
      meta="Sneller door Insyte met het toetsenbord. Dit geldt alleen voor jou."
    >
      <SettingsSection
        id="ga-naar"
        title="Ga naar"
        description="Druk op G en dan op de toets. Nooit terwijl je typt."
        footer={changed
          ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const before = keys
                setKeys({ ...keys, map: KEY_SEED.map })
                toast({
                  title: "Sneltoetsen terug naar standaard",
                  action: { label: "Ongedaan maken", onClick: () => setKeys(before) }
                })
              }}
            >
              Sneltoetsen terug naar standaard
            </Button>
          )
          : undefined}
      >
        <SettingRow
          title={keys.on ? "Aan" : "Uit"}
          control={<Toggle label="Ga naar-sneltoetsen" on={keys.on} onChange={(on) => setKeys({ ...keys, on })} />}
        />
        {keys.on && (
          <ul className="flex flex-col pb-2">
            {GOTO_DEFAULTS.map((g) => {
              const k = keys.map[g.id] ?? g.key
              const now = listening === g.id
              return (
                <li key={g.id} className="flex flex-col gap-1 py-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-ink">{g.label}</span>
                    <span className="flex items-center gap-2">
                      {now
                        ? (
                          <span className="text-xs text-accent-ink" aria-live="polite">
                            Druk op een toets voor {g.label}
                          </span>
                        )
                        : (
                          <span className="flex items-center gap-1" aria-label={`G dan ${k}`}>
                            <Kbd>G</Kbd>
                            <Kbd>{k}</Kbd>
                          </span>
                        )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setProblem(null)
                          setListening(now ? null : g.id)
                        }}
                      >
                        {now ? "Annuleren" : "Wijzigen"}
                      </Button>
                    </span>
                  </div>
                  {problem?.id === g.id && (
                    <p className="text-right text-xs text-bad-ink" role="alert">{problem.text}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SettingsSection>

      <PageSection id="scherm" title="Op een scherm" meta="Deze horen bij een scherm en zijn vast.">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {SCREEN_KEYS.map((group) => (
            <div key={group.group} className="flex flex-col gap-1">
              <h3 className="pb-1 text-xs font-semibold text-ink-3">{group.group}</h3>
              {group.keys.map((row) => (
                <div key={row.what} className="flex items-center justify-between gap-4 py-1">
                  <span className="text-sm text-ink-2">{row.what}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PageSection>
    </SettingsPage>
  )
}
