import { useState } from "react"
import {
  AUDIT,
  auditFor,
  EXPORTS,
  INVENTORY,
  PLACES,
  PRIVACY_CLASSES,
  relative,
  RETENTION_PERIODS,
  SESSIONS,
  SHOPPER_REQUESTS,
  stamp,
  SUB_PROCESSORS,
  TRASH_DAYS,
  trashFor
} from "../../fixtures/settings.ts"
import type { AuditRow, TrashItem } from "../../fixtures/settings.ts"
import { Link, paths } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { Archive, Download, FileText, Plus, RotateCcw, Trash } from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { LEVELS, ROLLEN, useView } from "../../view.ts"
import type { PermArea } from "../../view.ts"
import { figure, SaveBar, SettingsPage, useDraft, useSaved } from "./parts.tsx"

const NOW = new Date(2026, 10, 23, 14, 30)
const DAY = 86_400_000

function downloadAudit() {
  const rows = [
    ["Tijd", "Teamlid", "Actie", "Detail", "Locatie"],
    ...AUDIT.map((a) => [a.at, a.who, a.action, a.detail, "Amsterdam, NL"])
  ]
  const csv = rows.map((r) => r.map((c) => `"${c.replaceAll("\"", "\"\"")}"`).join(";")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "insyte-auditlog-northwind.csv"
  a.click()
  URL.revokeObjectURL(url)
  toast({ title: "Auditlog gedownload", body: `${AUDIT.length} regels als CSV.`, tone: "good" })
}

/* ── Beveiliging ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Beveiliging: two-step sign-in for the whole workspace, Google sign-in, the sessions you have open,
 * and the audit trail of sensitive admin actions to export. The current demo's `settings/security`.
 */
export function SecurityScreen() {
  const { edit } = useAccess("settings")
  const [auth, setAuth] = useSaved("security.auth", { twoFactor: true, google: false })
  const [sessions, setSessions] = useSaved<ReadonlyArray<(typeof SESSIONS)[number]>>("security.sessions", SESSIONS)
  return (
    <SettingsPage title="Beveiliging" area="settings" what="de beveiliging" meta="Hoe je team inlogt, en wie wat deed">
      <SettingsSection id="authenticatie" title="Authenticatie">
        <SettingRow
          title="Tweestapsverificatie verplicht"
          description="Iedereen in de werkruimte logt in met een code uit een app. Wie het nog niet heeft, stelt het in bij de volgende keer inloggen."
          control={
            <Toggle
              label="Tweestapsverificatie verplicht"
              disabled={!edit}
              on={auth.twoFactor}
              onChange={(twoFactor) => {
                setAuth({ ...auth, twoFactor })
                toast({ title: twoFactor ? "2FA verplicht" : "2FA optioneel", tone: twoFactor ? "good" : "neutral" })
              }}
            />
          }
        />
        <SettingRow
          title="Inloggen met Google"
          description="Voor wie een Google-account op het domein northwindclothing.co heeft."
          control={
            <Toggle
              label="Inloggen met Google"
              disabled={!edit}
              on={auth.google}
              onChange={(google) => {
                setAuth({ ...auth, google })
                toast({ title: google ? "Inloggen met Google staat aan" : "Inloggen met Google staat uit" })
              }}
            />
          }
        />
      </SettingsSection>

      <PageSection id="sessies" title="Je actieve sessies" meta={String(sessions.length)}>
        <List divided label="Actieve sessies">
          {sessions.map((s) => (
            <ListRow
              key={s.id}
              padded={false}
              title={
                <span className="inline-flex items-center gap-2">
                  {s.device}
                  {s.current && <Tag tone="accent">Dit apparaat</Tag>}
                </span>
              }
              meta={`${s.location} · ${s.last}`}
              trail={s.current
                ? undefined
                : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSessions((all) =>
                        all.filter((x) => x.id !== s.id)
                      )
                      toast({ title: `${s.device} uitgelogd`, body: "Wie daar zat, moet opnieuw inloggen." })
                    }}
                  >
                    Intrekken
                  </Button>
                )}
            />
          ))}
        </List>
      </PageSection>

      <PageSection
        id="audit"
        title="Auditlog"
        meta="Een alleen-lezen spoor van elke gevoelige beheeractie. Na 90 dagen wordt het gearchiveerd."
        actions={<Button size="sm" icon={<Download />} onClick={downloadAudit}>Exporteren als CSV</Button>}
      >
        <Table label="Auditlog" minWidth={640}>
          <THead>
            <Th>Tijd</Th>
            <Th>Teamlid</Th>
            <Th>Actie</Th>
            <Th>Detail</Th>
          </THead>
          <TBody>
            {AUDIT.map((a) => (
              <Tr key={`${a.at}-${a.action}`}>
                <Td muted className="whitespace-nowrap">{a.at}</Td>
                <Td>{a.who}</Td>
                <Td header>{a.action}</Td>
                <Td muted>{a.detail}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="text-xs text-ink-3">
          Wijzigingen in de instellingen zelf staan in het{" "}
          <Link to={paths.settings("logboek")} className="underline">logboek</Link>.
        </p>
      </PageSection>
    </SettingsPage>
  )
}

/* ── Gegevens en privacy ───────────────────────────────────────────────────────────────────────── */

/**
 * Gegevens en privacy: how long each kind of data is kept, deleting after that (counted first, then
 * switched on), and whether Insyte's support may look along. The current demo's `settings/privacy`.
 */
export function PrivacyScreen() {
  const { edit } = useAccess("settings")
  const periods = useDraft(
    "privacy.periods",
    Object.fromEntries(PRIVACY_CLASSES.map((c) => [c.id, c.months])) as Record<string, string>
  )
  const [counted, setCounted] = useState(false)
  const [deleting, setDeleting] = useSaved("privacy.delete", false)
  const [confirm, setConfirm] = useState(false)
  const [support, setSupport] = useSaved("privacy.support", { on: false, days: "7" })
  const total = PRIVACY_CLASSES.reduce((n, c) => n + (periods.saved[c.id] === "never" ? 0 : c.count), 0)

  return (
    <SettingsPage
      title="Gegevens en privacy"
      area="settings"
      what="de privacy-instellingen"
      meta="Hoe lang Insyte gegevens bewaart, en wie mag meekijken"
    >
      <SettingsSection
        id="bewaren"
        title="Bewaartermijnen"
        description={`Na deze termijn verwijdert Insyte de gegevens, als verwijderen aanstaat. Bestellingen en facturen bewaart de wet 7 jaar; die vallen hier niet onder.`}
        footer={
          <SaveBar
            disabled={!edit}
            dirty={periods.dirty}
            onReset={periods.reset}
            onSave={() => {
              periods.commit()
              setCounted(false)
              toast({
                title: "Bewaartermijnen opgeslagen",
                body: deleting ? "Vannacht om 03:00 geldt de nieuwe termijn." : "Er wordt nog niets verwijderd.",
                tone: "good"
              })
            }}
          />
        }
      >
        {PRIVACY_CLASSES.map((c) => (
          <SettingRow
            key={c.id}
            title={c.label}
            htmlFor={`ret-${c.id}`}
            description={c.detail}
            control={
              <Select
                id={`ret-${c.id}`}
                className="w-44"
                disabled={!edit}
                value={periods.draft[c.id]}
                onChange={(e) => periods.patch({ [c.id]: e.target.value })}
              >
                {RETENTION_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            }
          />
        ))}
      </SettingsSection>

      <SettingsSection
        id="verwijderen"
        title="Verwijderen"
        description="Eerst tellen wat er weg zou gaan; pas dan aanzetten."
      >
        <SettingRow
          title={counted ? `${figure(total)} items vallen buiten hun termijn` : "Wat er weg zou gaan"}
          description={counted
            ? PRIVACY_CLASSES.filter((c) => c.count > 0 && periods.saved[c.id] !== "never").map((c) =>
              `${c.label} ${figure(c.count)}`
            ).join(" · ")
            : "Tel het eerst, zodat je weet wat verdwijnt."}
          control={<Button size="sm" onClick={() => setCounted(true)}>Nu tellen</Button>}
        />
        <SettingRow
          title={deleting ? "Verwijderen staat aan" : "Verwijderen staat uit"}
          description={deleting
            ? "Elke nacht om 03:00."
            : counted
            ? "Er wordt nog niets verwijderd."
            : "Tel eerst wat er weg zou gaan."}
          control={
            <Toggle
              label="Verwijderen aan"
              disabled={!edit || (!deleting && !counted)}
              on={deleting}
              onChange={(on) => {
                if (on) setConfirm(true)
                else {
                  setDeleting(false)
                  toast({ title: "Verwijderen staat uit", body: "Er wordt niets meer verwijderd." })
                }
              }}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="support"
        title="Insyte-support mag meekijken"
        description="Alleen lezen, voor een vraag die je zelf stelde. Elke keer dat iemand kijkt, staat in de auditlog."
      >
        <SettingRow
          title={support.on ? "Support mag meekijken" : "Support kijkt niet mee"}
          control={
            <Toggle
              label="Support mag meekijken"
              disabled={!edit}
              on={support.on}
              onChange={(on) => {
                setSupport({ ...support, on })
                toast({ title: on ? `Support mag ${support.days} dagen meekijken` : "Support kijkt niet meer mee" })
              }}
            />
          }
        />
        {support.on && (
          <SettingRow
            title="Gaat vanzelf uit na"
            htmlFor="support-days"
            control={
              <Select
                id="support-days"
                className="w-36"
                disabled={!edit}
                value={support.days}
                onChange={(e) => setSupport({ ...support, days: e.target.value })}
              >
                <option value="1">1 dag</option>
                <option value="7">7 dagen</option>
                <option value="30">30 dagen</option>
              </Select>
            }
          />
        )}
      </SettingsSection>

      <AlertDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setDeleting(true)
          setConfirm(false)
          toast({
            title: "Verwijderen staat aan",
            body: `Vannacht om 03:00 gaan ${figure(total)} items weg.`,
            tone: "good"
          })
        }}
        title="Verwijderen aanzetten?"
        body={`Vannacht om 03:00 verwijdert Insyte ${
          figure(total)
        } items die buiten hun termijn vallen, en daarna elke nacht wat erbij komt. Wat weg is, komt niet terug.`}
        confirmLabel="Aanzetten"
      />
    </SettingsPage>
  )
}

/* ── Je gegevens ───────────────────────────────────────────────────────────────────────────────── */

const SEES: ReadonlyArray<{ readonly area: PermArea; readonly label: string }> = [
  { area: "customers", label: "Klanten" },
  { area: "orders", label: "Bestellingen" },
  { area: "support", label: "Klantcontact" },
  { area: "data", label: "Exporteren" }
]

/**
 * Je gegevens: what Insyte keeps for this workspace and where it is stored, who in the team sees
 * what, exports of everything, the requests customers make under the GDPR, and deleting the
 * workspace. The current demo's `settings/data`.
 */
export function DataScreen() {
  const view = useView()
  const { edit } = useAccess("data")
  const owner = view.rol === "eigenaar"
  const [exports, setExports] = useSaved("data.exports", EXPORTS)
  const [auto, setAuto] = useSaved("data.auto", "week")
  const [requests, setRequests] = useSaved("data.requests", SHOPPER_REQUESTS)
  const [asking, setAsking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removal, setRemoval] = useSaved<Date | null>("data.removal", null)

  return (
    <SettingsPage
      title="Je gegevens"
      width="record"
      area="data"
      what="de gegevens van de werkruimte"
      meta="Wat Insyte van je werkruimte bewaart, waar, en hoe je het meeneemt"
    >
      <PageSection id="wat" title="Wat Insyte bewaart">
        <Table label="Wat Insyte bewaart" minWidth={520}>
          <THead>
            <Th>Soort</Th>
            <Th>Wat erin zit</Th>
            <Th align="right">Aantal</Th>
          </THead>
          <TBody>
            {INVENTORY.map((i) => (
              <Tr key={i.id}>
                <Td header>{i.label}</Td>
                <Td muted>{i.detail}</Td>
                <Td figure>{figure(i.count)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </PageSection>

      <PageSection id="waar" title="Waar het staat">
        <dl className="flex flex-col">
          {PLACES.map((p) => (
            <div key={p.what} className="grid gap-1 py-1.5 sm:grid-cols-[minmax(9rem,30%)_minmax(0,1fr)] sm:gap-3">
              <dt className="text-xs leading-5 text-ink-3">{p.what}</dt>
              <dd className="text-sm text-ink">{p.where}</dd>
            </div>
          ))}
        </dl>
        <h3 className="pt-3 text-xs font-semibold text-ink-3">Diensten die gegevens voor ons verwerken</h3>
        <List divided label="Subverwerkers">
          {SUB_PROCESSORS.map((s) => (
            <ListRow
              key={s.name}
              padded={false}
              title={s.name}
              meta={`${s.purpose} · ${s.where}`}
              trail={<Tag tone={s.outsideEu ? "warn" : "good"}>{s.outsideEu ? "Ook buiten de EU" : "In de EU"}</Tag>}
            />
          ))}
        </List>
      </PageSection>

      <PageSection id="wie" title="Wie wat ziet" meta="Per rol, uit Rollen">
        <Table label="Wie wat ziet" minWidth={520}>
          <THead>
            <Th>Rol</Th>
            {SEES.map((s) => <Th key={s.area}>{s.label}</Th>)}
          </THead>
          <TBody>
            {ROLLEN.map((r) => (
              <Tr key={r.id}>
                <Td header>{r.label}</Td>
                {SEES.map((s) => {
                  const l = LEVELS[r.id][s.area]
                  return (
                    <Td key={s.area} muted={l === 0}>
                      {l === 0 ? "Nee" : s.area === "data" ? "Ja" : l === 1 ? "Bekijken" : "Ja, en wijzigen"}
                    </Td>
                  )
                })}
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="text-xs text-ink-3">
          Aanpassen doe je onder <Link to={paths.settings("rollen")} className="underline">Rollen</Link>.
        </p>
      </PageSection>

      <PageSection
        id="export"
        title="Export"
        meta="Alles van deze werkruimte in één ZIP. Een export blijft 7 dagen te downloaden."
        actions={edit ?
          (
            <Button
              size="sm"
              icon={<Download />}
              loading={exporting}
              onClick={() => {
                setExporting(true)
                window.setTimeout(() => {
                  setExporting(false)
                  setExports((
                    all
                  ) => [{
                    id: `exp_${all.length + 1}`,
                    title: "Export van 23 nov",
                    who: "Door Elena Hart",
                    size: "18,6 MB",
                    state: "ready" as const,
                    until: "Te downloaden tot 30 nov"
                  }, ...all])
                  toast({ title: "Export klaar", body: "Je krijgt ook een mail met de link.", tone: "good" })
                }, 1200)
              }}
            >
              Alles exporteren
            </Button>
          ) :
          undefined}
      >
        <SettingRow
          title="Automatisch exporteren"
          description="Een export die je zelf bewaart, buiten Insyte."
          control={
            <Segmented
              label="Automatisch exporteren"
              disabled={!edit}
              value={auto}
              onChange={(next) => {
                setAuto(next)
                toast({
                  title: next === "uit"
                    ? "Automatisch exporteren staat uit"
                    : `Elke ${next === "week" ? "week" : "maand"} een export`
                })
              }}
              options={[{ value: "uit", label: "Uit" }, { value: "week", label: "Elke week" }, {
                value: "maand",
                label: "Elke maand"
              }]}
            />
          }
        />
        <List divided label="Exports">
          {exports.map((e) => (
            <ListRow
              key={e.id}
              padded={false}
              title={e.title}
              meta={`${e.who} · ${e.size} · ${e.until}`}
              trail={e.state === "ready"
                ? (
                  <Button
                    size="sm"
                    icon={<Download />}
                    onClick={() => toast({ title: `${e.title} wordt gedownload`, body: e.size })}
                  >
                    Downloaden
                  </Button>
                )
                : <Status tone="neutral">Verlopen</Status>}
            />
          ))}
        </List>
      </PageSection>

      <PageSection
        id="verzoeken"
        title="Verzoeken van klanten"
        meta="Je hebt 30 dagen om te antwoorden"
        actions={edit
          ? <Button size="sm" icon={<Plus />} onClick={() => setAsking(true)}>Verzoek invoeren</Button>
          : undefined}
      >
        <List divided label="Verzoeken van klanten">
          {requests.map((r) => (
            <ListRow
              key={r.id}
              padded={false}
              title={`${r.kind} · ${r.subject}`}
              meta={`${r.via} · binnen ${r.received} · ${r.due}`}
              trail={r.state === "open"
                ? (
                  edit
                    ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setRequests((all) =>
                            all.map((
                              x
                            ) => (x.id === r.id ? { ...x, state: "done" as const, due: "Afgehandeld vandaag" } : x))
                          )
                          toast({
                            title: r.kind === "Inzage" ? "Inzage verstuurd" : "Klant gewist",
                            body: `Naar ${r.subject}.`,
                            tone: "good"
                          })
                        }}
                      >
                        {r.kind === "Inzage" ? "Gegevens sturen" : "Wissen"}
                      </Button>
                    )
                    : <Status tone="warn">Open</Status>
                )
                : <Status tone="good">Afgehandeld</Status>}
            />
          ))}
        </List>
      </PageSection>

      <PageSection id="verwijderen" title="Werkruimte verwijderen">
        {removal === null
          ? (
            <div className="flex flex-col items-start gap-3">
              <p className="max-w-[64ch] text-sm text-pretty text-ink-2">
                Alles van Northwind gaat weg: bestellingen, klanten, gesprekken, bestanden. Eerst wacht Insyte 7 dagen,
                zodat je je kunt bedenken. Alleen de eigenaar kan dit.
              </p>
              <Button variant="danger" disabled={!owner} onClick={() => setRemoving(true)}>
                Werkruimte verwijderen
              </Button>
              {!owner && (
                <p className="text-xs text-ink-3">Alleen Elena Hart, de eigenaar, kan de werkruimte verwijderen.</p>
              )}
            </div>
          )
          : (
            <Notice
              tone="bad"
              title={`De werkruimte wordt verwijderd op ${stamp(removal, false)}`}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setRemoval(null)
                    toast({ title: "Verwijderen gestopt", body: "Alles blijft zoals het was.", tone: "good" })
                  }}
                >
                  Toch niet verwijderen
                </Button>
              }
            >
              Tot die tijd werkt alles gewoon. Iedereen in het team kreeg een mail.
            </Notice>
          )}
      </PageSection>

      <ShopperRequestDialog
        open={asking}
        onClose={() => setAsking(false)}
        onAdd={(kind, subject) => {
          setRequests((
            all
          ) => [{
            id: `gdpr_${all.length + 1}`,
            kind,
            subject,
            via: "Door Elena Hart",
            received: "vandaag 14:30",
            state: "open" as const,
            due: "Uiterlijk 23 dec"
          }, ...all])
          setAsking(false)
          toast({ title: "Verzoek ingevoerd", body: "Je hebt tot 23 december om te antwoorden.", tone: "good" })
        }}
      />
      <AlertDialog
        open={removing}
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          setRemoval(new Date(NOW.getTime() + 7 * DAY))
          setRemoving(false)
        }}
        title="Werkruimte verwijderen?"
        body="Over 7 dagen gaat alles van Northwind weg, voorgoed. Tot die tijd kun je het stoppen."
        confirmLabel="Verwijderen over 7 dagen"
      />
    </SettingsPage>
  )
}

function ShopperRequestDialog({ open, onClose, onAdd }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onAdd: (kind: "Inzage" | "Wissen", subject: string) => void
}) {
  const [kind, setKind] = useState<"Inzage" | "Wissen">("Inzage")
  const [subject, setSubject] = useState("")
  const [tried, setTried] = useState(false)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Verzoek van een klant"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (subject.trim() === "") return
              onAdd(kind, subject.trim())
              setSubject("")
              setTried(false)
            }}
          >
            Invoeren
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RadioGroup
          label="Wat de klant vraagt"
          value={kind}
          onChange={setKind}
          options={[
            { value: "Inzage", label: "Inzage", description: "Alles wat we van de klant hebben, in één bestand." },
            {
              value: "Wissen",
              label: "Wissen",
              description: "Naam, adres, telefoon en e-mails van de klant verwijderen. Bedragen en datums blijven."
            }
          ]}
        />
        <Field
          label="E-mailadres van de klant"
          error={tried && subject.trim() === "" ? "Vul in om wie het gaat" : undefined}
        >
          {(c) => <Input {...c} type="email" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── Logboek ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Logboek: every change to a setting, with who made it, what it was and what it became, and the page
 * it was on. The current demo's `settings/log`.
 */
export function SettingsLogScreen() {
  const view = useView()
  const rows = auditFor(view.staat)
  const [period, setPeriod] = useState("30")
  const [who, setWho] = useState("")
  const [page, setPage] = useState("")
  const [more, setMore] = useState(false)
  const people = [...new Set(rows.map((r) => r.who))]
  const pages = [...new Set(rows.map((r) => r.page))]
  const shown = rows.filter((r) =>
    (period === "alles" || NOW.getTime() - r.at.getTime() <= Number(period) * DAY) && (who === "" || r.who === who) &&
    (page === "" || r.page === page)
  )
  const visible = more ? shown : shown.slice(0, 6)
  return (
    <SettingsPage
      title="Logboek"
      width="record"
      area="settings"
      what="het logboek"
      readOnlyNote={false}
      meta="Elke wijziging in de instellingen"
    >
      {rows.length === 0
        ? (
          <EmptyState glyph={FileText} title="Nog niets gewijzigd.">
            Wie een instelling verandert, komt hier te staan, met wat het was en wat het werd.
          </EmptyState>
        )
        : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Periode"
                value={period}
                onChange={setPeriod}
                options={[{ value: "7", label: "7 dagen" }, { value: "30", label: "30 dagen" }, {
                  value: "alles",
                  label: "Alles"
                }]}
              />
              <Select aria-label="Wie" className="w-44" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Iedereen</option>
                {people.map((p) => <option key={p}>{p}</option>)}
              </Select>
              <Select aria-label="Pagina" className="w-44" value={page} onChange={(e) => setPage(e.target.value)}>
                <option value="">Alle pagina's</option>
                {pages.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </div>
            {shown.length === 0
              ? <p className="text-sm text-ink-3">Niets in deze periode met deze filters.</p>
              : (
                <Table label="Wijzigingen" minWidth={680}>
                  <THead>
                    <Th>Wanneer</Th>
                    <Th>Wie</Th>
                    <Th>Wat</Th>
                    <Th>Pagina</Th>
                  </THead>
                  <TBody>
                    {visible.map((r: AuditRow) => (
                      <Tr key={r.id}>
                        <Td muted className="whitespace-nowrap">{relative(r.at)}</Td>
                        <Td>{r.who}</Td>
                        <Td header>
                          {r.field}: <span className="text-ink-3">{r.before}</span> → {r.after}
                        </Td>
                        <Td>
                          <Link to={paths.settings(r.slug)} className="hover:underline">{r.page}</Link>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            {!more && shown.length > visible.length && (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => setMore(true)}
              >
                Meer laden
              </Button>
            )}
          </>
        )}
    </SettingsPage>
  )
}

const daysLeft = (t: TrashItem) => TRASH_DAYS - Math.floor((NOW.getTime() - t.at.getTime()) / DAY)

/* ── Prullenbak ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Prullenbak: what was deleted in the last 30 days, by whom, and how long it still waits. One click
 * puts it back; emptying is final. The current demo's `settings/trash`.
 */
export function TrashScreen() {
  const view = useView()
  const { edit } = useAccess("settings")
  const [items, setItems] = useSaved<ReadonlyArray<TrashItem>>("trash", trashFor(view.staat))
  const [purging, setPurging] = useState<TrashItem | "all" | null>(null)
  const restore = (t: TrashItem) => {
    setItems((all) => all.filter((x) => x.id !== t.id))
    toast({
      title: `${t.kind} teruggezet`,
      body: t.title,
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => setItems((all) => [...all, t]) }
    })
  }
  return (
    <SettingsPage
      title="Prullenbak"
      width="record"
      area="settings"
      what="de prullenbak"
      meta="Verwijderd, de laatste 30 dagen. Na 30 dagen verdwijnt een item vanzelf; tot die tijd zet je het met een klik terug."
      actions={edit && items.length > 0
        ? <Button size="sm" variant="ghost" icon={<Trash />} onClick={() => setPurging("all")}>Prullenbak legen</Button>
        : undefined}
    >
      {items.length === 0
        ? (
          <EmptyState glyph={Archive} title="De prullenbak is leeg.">
            Wat je verwijdert, staat hier nog 30 dagen.
          </EmptyState>
        )
        : (
          <List divided label="Verwijderde items">
            {items.map((t) => (
              <ListRow
                key={t.id}
                padded={false}
                title={
                  <span className="inline-flex items-center gap-2">
                    <Tag>{t.kind}</Tag>
                    {t.title}
                  </span>
                }
                meta={`Verwijderd door ${t.by} · ${relative(t.at)} · nog ${daysLeft(t)} ${
                  daysLeft(t) === 1 ? "dag" : "dagen"
                }`}
                trail={edit
                  ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setPurging(t)}>Definitief</Button>
                      <Button size="sm" icon={<RotateCcw />} onClick={() => restore(t)}>Terugzetten</Button>
                    </>
                  )
                  : undefined}
              />
            ))}
          </List>
        )}
      <AlertDialog
        open={purging !== null}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const p = purging
          setPurging(null)
          if (p === "all") {
            setItems([])
            toast({ title: "Prullenbak geleegd" })
          } else if (p !== null) {
            setItems((all) => all.filter((x) => x.id !== p.id))
            toast({ title: `${p.kind} definitief verwijderd` })
          }
        }}
        title={purging === "all" ? "Prullenbak legen?" : "Definitief verwijderen?"}
        body={purging === "all"
          ? `${items.length} items gaan voorgoed weg. Dat kan niet terug.`
          : `${purging?.title ?? ""} gaat voorgoed weg. Dat kan niet terug.`}
        confirmLabel={purging === "all" ? "Legen" : "Definitief verwijderen"}
      />
    </SettingsPage>
  )
}
