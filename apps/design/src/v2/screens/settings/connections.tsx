import { useState } from "react"
import {
  API_AREAS,
  API_EXPIRY,
  API_LEVEL_LABEL,
  APPS,
  hooksFor,
  INTEGRATIONS,
  keysFor,
  relative,
  RETRY_OPTIONS,
  roleLabel,
  ROLES,
  stamp,
  storesLabel,
  WEBHOOK_EVENTS
} from "../../fixtures/settings.ts"
import type { ApiAccess, ApiKey, Endpoint, Integration } from "../../fixtures/settings.ts"
import { STORES } from "../../fixtures/workspace.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import type { Tone } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Checkbox, RadioGroup } from "../../ui/checkbox.tsx"
import { AlertDialog, Dialog, Sheet } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { Eye, EyeOff, Key, LayoutGrid, MoreHorizontal, Plug, Plus, Send, Webhook } from "../../ui/icons.tsx"
import { Field, Input, SearchField, Select } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { hasLogo, ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { AREA_LABEL, useView } from "../../view.ts"
import { CopyValue, SettingsPage, useSaved } from "./parts.tsx"

const NOW = new Date(2026, 10, 23, 14, 30)
const DAY = 86_400_000

const moreButton = (label: string) => (props: Record<string, unknown>) => (
  <button
    {...props}
    type="button"
    aria-label={label}
    className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
  >
    <MoreHorizontal size={16} />
  </button>
)

/* ── Koppelingen ───────────────────────────────────────────────────────────────────────────────── */

const INTEGRATION_STATUS: Readonly<Record<Integration["status"], { tone: Tone; word: string }>> = {
  connected: { tone: "good", word: "Gekoppeld" },
  action: { tone: "warn", word: "Actie nodig" },
  off: { tone: "neutral", word: "Niet gekoppeld" }
}

/**
 * Koppelingen: the services Insyte reads and writes through, by kind, with how each is doing. PayPal
 * needs someone to reconnect it; Outlook and Google Ads are not connected. The current demo's
 * `settings/integrations`.
 */
export function IntegrationsScreen() {
  const { edit } = useAccess("integrations")
  const [rows, setRows] = useSaved<ReadonlyArray<Integration>>("integrations", INTEGRATIONS)
  const [dropping, setDropping] = useState<Integration | null>(null)
  const set = (key: string, status: Integration["status"]) =>
    setRows((all) =>
      all.map((i) => (i.key === key ? { ...i, status, ...(status === "connected" ? { synced: "14:30" } : {}) } : i))
    )
  const categories = [...new Set(rows.map((i) => i.category))]
  const connected = rows.filter((i) => i.status === "connected").length

  return (
    <SettingsPage
      title="Koppelingen"
      width="record"
      area="integrations"
      what="de koppelingen"
      meta={`Gekoppeld · ${connected} van ${rows.length}`}
      actions={<ButtonLink size="sm" variant="ghost" to={paths.marketplace}>Marketplace</ButtonLink>}
    >
      {categories.map((cat) => (
        <PageSection key={cat} id={`cat-${cat}`} title={cat}>
          <List divided label={cat}>
            {rows.filter((i) => i.category === cat).map((i) => {
              const st = INTEGRATION_STATUS[i.status]
              return (
                <ListRow
                  key={i.key}
                  padded={false}
                  lead={hasLogo(i.key)
                    ? <ServiceLogo service={i.key} name={i.name} size={32} />
                    : (
                      <GlyphTile>
                        <Plug size={16} />
                      </GlyphTile>
                    )}
                  title={i.name}
                  meta={i.status === "connected" && i.synced !== undefined
                    ? `${i.description} · gesynchroniseerd om ${i.synced}`
                    : i.description}
                  trail={
                    <>
                      <Status tone={st.tone}>{st.word}</Status>
                      {edit && i.status !== "connected" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            set(i.key, "connected")
                            toast({
                              title: `${i.name} gekoppeld`,
                              body: "De eerste gegevens komen binnen enkele minuten binnen.",
                              tone: "good"
                            })
                          }}
                        >
                          {i.status === "action" ? "Opnieuw koppelen" : "Koppelen"}
                        </Button>
                      )}
                      {edit && i.status === "connected" && (
                        <DropdownMenu
                          label={`Acties voor ${i.name}`}
                          placement="bottom-end"
                          trigger={moreButton(`Acties voor ${i.name}`)}
                        >
                          <DropdownItem tone="danger" onSelect={() => setDropping(i)}>Ontkoppelen</DropdownItem>
                        </DropdownMenu>
                      )}
                    </>
                  }
                />
              )
            })}
          </List>
        </PageSection>
      ))}
      <AlertDialog
        open={dropping !== null}
        onCancel={() => setDropping(null)}
        onConfirm={() => {
          const i = dropping
          if (i === null) return
          set(i.key, "off")
          setDropping(null)
          toast({
            title: `${i.name} ontkoppeld`,
            action: { label: "Ongedaan maken", onClick: () => set(i.key, "connected") }
          })
        }}
        title={`${dropping?.name ?? ""} ontkoppelen?`}
        body="Insyte leest en schrijft hier dan niet meer. Wat er al binnen is, blijft staan."
        confirmLabel="Ontkoppelen"
      />
    </SettingsPage>
  )
}

/* ── Apps ──────────────────────────────────────────────────────────────────────────────────────── */

type App = (typeof APPS)[number]

/** Apps: what is installed from the marketplace, when it was last opened, and the way out. `settings/apps`. */
export function AppsScreen() {
  const view = useView()
  const { edit } = useAccess("integrations")
  const [apps, setApps] = useSaved<ReadonlyArray<App>>("apps", view.staat === "leeg" ? [] : APPS)
  const [removing, setRemoving] = useState<App | null>(null)
  return (
    <SettingsPage
      title="Apps"
      width="record"
      area="integrations"
      what="de apps"
      meta={`${apps.length} geïnstalleerd`}
      actions={<ButtonLink size="sm" variant="primary" to={paths.marketplace}>Marketplace bekijken</ButtonLink>}
    >
      {apps.length === 0
        ? (
          <EmptyState
            glyph={LayoutGrid}
            title="Nog geen apps geïnstalleerd"
            action={<ButtonLink to={paths.marketplace}>Marketplace bekijken</ButtonLink>}
          >
            Koppelingen voor e-mail, retouren, afhandeling, fraude en meer.
          </EmptyState>
        )
        : (
          <List divided label="Geïnstalleerde apps">
            {apps.map((a) => (
              <ListRow
                key={a.id}
                padded={false}
                lead={<ServiceLogo service={a.id} name={a.name} size={32} />}
                title={
                  <span className="inline-flex items-center gap-2">
                    {a.name}
                    <Tag>{a.kind}</Tag>
                  </span>
                }
                meta={`${a.tagline} · geïnstalleerd ${relative(a.installed)} · ${
                  a.opened === null ? "nooit geopend" : `laatst geopend ${relative(a.opened)}`
                }`}
                trail={
                  <>
                    <ButtonLink size="sm" to={paths.marketplace}>Openen</ButtonLink>
                    {edit && (
                      <DropdownMenu
                        label={`Acties voor ${a.name}`}
                        placement="bottom-end"
                        trigger={moreButton(`Acties voor ${a.name}`)}
                      >
                        <DropdownItem onSelect={() => navigate(paths.marketplace)}>
                          Details in de marketplace
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownItem tone="danger" onSelect={() => setRemoving(a)}>Verwijderen</DropdownItem>
                      </DropdownMenu>
                    )}
                  </>
                }
              />
            ))}
          </List>
        )}
      <AlertDialog
        open={removing !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const a = removing
          if (a === null) return
          setApps((all) => all.filter((x) => x.id !== a.id))
          setRemoving(null)
          toast({
            title: `${a.name} verwijderd`,
            action: { label: "Ongedaan maken", onClick: () => setApps((all) => [...all, a]) }
          })
        }}
        title={`${removing?.name ?? ""} verwijderen?`}
        body="De app verliest zijn toegang tot je werkruimte. Wat hij al schreef, blijft staan."
        confirmLabel="Verwijderen"
      />
    </SettingsPage>
  )
}

/* ── API-sleutels ──────────────────────────────────────────────────────────────────────────────── */

function keyStatus(k: ApiKey): { tone: Tone; word: string } {
  if (k.status === "revoked") return { tone: "neutral", word: "Ingetrokken" }
  if (k.expires !== null && k.expires.getTime() < NOW.getTime()) return { tone: "bad", word: "Verlopen" }
  if (k.rotatedUntil !== undefined) return { tone: "warn", word: "Geroteerd" }
  if (k.agent === true) return { tone: "accent", word: "Agent" }
  if (k.access.kind === "custom" || k.stores !== "all" || k.ips.length > 0) return { tone: "good", word: "Beperkt" }
  return { tone: "good", word: "Actief" }
}

const accessLabel = (k: ApiKey) =>
  k.access.kind === "role"
    ? `Rol ${roleLabel(k.access.roleId)}`
    : Object.entries(k.access.scopes).map(([a, l]) =>
      `${AREA_LABEL[a as keyof typeof AREA_LABEL]} ${API_LEVEL_LABEL[l as ApiAccess].toLowerCase()}`
    ).join(", ")

const expiresLabel = (k: ApiKey) => {
  if (k.expires === null) return "Nooit"
  const days = Math.round((k.expires.getTime() - NOW.getTime()) / DAY)
  return days < 0 ? `Verlopen ${relative(k.expires)}` : days === 0 ? "Vandaag" : `Over ${days} dagen`
}

/**
 * API-sleutels: the keys scripts and services use to talk to Insyte, what each may reach, and when it
 * was last used. A new key is shown once; rotating keeps the old one alive for a short overlap;
 * revoking is at once. `?sleutel=` opens one, `?nieuw=agent` starts a key for an agent. The current
 * demo's `settings/api-keys`.
 */
export function ApiKeysScreen() {
  const view = useView()
  const { edit } = useAccess("integrations")
  const openId = useQuery("sleutel")
  const fresh = useQuery("nieuw")
  const [keys, setKeys] = useSaved<ReadonlyArray<ApiKey>>("api-keys", keysFor(view.staat))
  const [showRevoked, setShowRevoked] = useState(false)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const [overlap, setOverlap] = useState("24")
  const [rotated, setRotated] = useState<string | null>(null)
  const [rotatedStored, setRotatedStored] = useState(false)
  const active = keys.filter((k) => k.status === "active")
  const revoked = keys.filter((k) => k.status === "revoked")
  const shown = showRevoked ? keys : active
  const open = keys.find((k) => k.id === openId)
  const hooks = hooksFor(view.staat)

  return (
    <SettingsPage
      title="API-sleutels"
      width="record"
      area="integrations"
      what="de API-sleutels"
      meta={
        <>
          Sleutels · {active.length} actief ·{" "}
          <button type="button" className="underline" onClick={() => navigate(paths.settings("webhooks"))}>
            {hooks.length} endpoints · {hooks.filter((h) => h.failures > 0).length} met fouten
          </button>
        </>
      }
      actions={edit
        ? (
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setQuery({ nieuw: "1" })}>
            Sleutel aanmaken
          </Button>
        )
        : undefined}
    >
      {keys.length === 0
        ? (
          <EmptyState
            glyph={Key}
            title="Nog geen API-sleutels"
            action={edit
              ? <Button icon={<Plus />} onClick={() => setQuery({ nieuw: "1" })}>Eerste sleutel aanmaken</Button>
              : undefined}
          >
            Laat een script of dienst met Insyte praten, zoals je magazijn of een rapportage.
          </EmptyState>
        )
        : (
          <>
            <Table label="API-sleutels" minWidth={760}>
              <THead>
                <Th>Sleutel</Th>
                <Th>Toegang</Th>
                <Th>Winkels</Th>
                <Th>Laatst gebruikt</Th>
                <Th>Verloopt</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {shown.map((k) => {
                  const st = keyStatus(k)
                  return (
                    <Tr key={k.id} selected={k.id === openId} onOpen={() => setQuery({ sleutel: k.id })}>
                      <Td header>
                        <button
                          type="button"
                          onClick={() => setQuery({ sleutel: k.id })}
                          className="flex flex-col text-left hover:underline"
                        >
                          <span>{k.label}</span>
                          <span className="text-xs text-ink-3">{k.prefix}… · door {k.createdBy}</span>
                        </button>
                      </Td>
                      <Td className="max-w-[14rem] truncate">{accessLabel(k)}</Td>
                      <Td muted>{k.stores === "all" ? "Alle" : `${k.stores.length} van ${STORES.length}`}</Td>
                      <Td muted>{k.lastUsed === null ? "Nooit" : relative(k.lastUsed)}</Td>
                      <Td muted>{k.status === "revoked" ? "—" : expiresLabel(k)}</Td>
                      <Td>
                        <Tag tone={st.tone}>{st.word}</Tag>
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
            {revoked.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => setShowRevoked(!showRevoked)}
              >
                {showRevoked
                  ? "Ingetrokken sleutels verbergen"
                  : `${revoked.length} ingetrokken ${revoked.length === 1 ? "sleutel" : "sleutels"} tonen`}
              </Button>
            )}
          </>
        )}

      <Sheet
        open={open !== undefined}
        onClose={() => setQuery({ sleutel: null })}
        title={open?.label ?? ""}
        meta={open === undefined
          ? undefined
          : `${open.prefix}… · gemaakt ${stamp(open.created, false)} door ${open.createdBy}`}
        footer={open !== undefined && open.status === "active" && edit
          ? <Button variant="danger" onClick={() => setRevoking(open)}>Intrekken</Button>
          : undefined}
      >
        {open !== undefined && (
          <div className="flex flex-col gap-6">
            <KeyValue
              items={[
                { label: "Status", value: <Tag tone={keyStatus(open).tone}>{keyStatus(open).word}</Tag> },
                { label: "Toegang", value: accessLabel(open) },
                { label: "Winkels", value: storesLabel(open.stores) },
                { label: "IP-adressen", value: open.ips.length === 0 ? "Overal" : open.ips.join(", ") },
                { label: "Laatst gebruikt", value: open.lastUsed === null ? "Nooit" : relative(open.lastUsed) },
                { label: "Verloopt", value: open.status === "revoked" ? "—" : expiresLabel(open) }
              ]}
            />
            {open.rotatedUntil !== undefined && (
              <p className="text-sm text-ink-2">
                De vorige sleutel blijft nog {Math.round((open.rotatedUntil.getTime() - NOW.getTime()) / 3_600_000)}
                {" "}
                uur geldig, zodat wat hem gebruikt kan overstappen.
              </p>
            )}
            {open.status === "active" && edit && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-ink">Roteren</h3>
                <p className="text-sm text-ink-2">
                  Je krijgt een nieuwe sleutel. De oude blijft geldig tijdens de overgangstijd, daarna niet meer.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Overgangstijd">
                    {(c) => (
                      <Select
                        {...c}
                        className="w-36"
                        value={overlap}
                        onChange={(e) => setOverlap(e.target.value)}
                      >
                        <option value="1">1 uur</option>
                        <option value="24">24 uur</option>
                        <option value="168">7 dagen</option>
                      </Select>
                    )}
                  </Field>
                  <Button
                    onClick={() => {
                      setKeys((all) =>
                        all.map((k) => (k.id === open.id
                          ? { ...k, rotatedUntil: new Date(NOW.getTime() + Number(overlap) * 3_600_000) }
                          : k)
                        )
                      )
                      setRotated(
                        `${open.prefix}${Math.random().toString(36).slice(2, 14)}${
                          Math.random().toString(36).slice(2, 14)
                        }`
                      )
                    }}
                  >
                    Roteren
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Dialog
        open={rotated !== null}
        onClose={() => {
          if (!rotatedStored) return
          setRotated(null)
          setRotatedStored(false)
        }}
        title="De nieuwe sleutel"
        description={`Kopieer hem nu en zet hem op de plek van de oude. De oude werkt nog ${
          overlap === "1" ? "1 uur" : overlap === "24" ? "24 uur" : "7 dagen"
        }; Insyte laat de nieuwe hierna nooit meer zien.`}
        footer={
          <Button
            variant="primary"
            disabled={!rotatedStored}
            onClick={() => {
              setRotated(null)
              setRotatedStored(false)
              toast({ title: "Sleutel geroteerd", tone: "good" })
            }}
          >
            Klaar
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-well px-3 py-2">
            <CopyValue value={rotated ?? ""} label="Sleutel" />
          </div>
          <Checkbox
            label="Ik heb hem opgeslagen"
            description="Kwijt is kwijt: dan maak je een nieuwe."
            checked={rotatedStored}
            onChange={setRotatedStored}
          />
        </div>
      </Dialog>
      <NewKeyDialog
        open={fresh !== null && edit}
        agent={fresh === "agent"}
        onClose={() => setQuery({ nieuw: null })}
        onCreate={(k) => setKeys((all) => [k, ...all])}
      />
      <AlertDialog
        open={revoking !== null}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const k = revoking
          if (k === null) return
          setKeys((all) => all.map((x) => (x.id === k.id ? { ...x, status: "revoked" } : x)))
          setRevoking(null)
          setQuery({ sleutel: null })
          toast({ title: `${k.label} ingetrokken`, body: "Wat deze sleutel gebruikt, krijgt vanaf nu een 401." })
        }}
        title={`${revoking?.label ?? ""} intrekken?`}
        body="Dat kan niet terug. Wat deze sleutel gebruikt, werkt meteen niet meer."
        confirmLabel="Intrekken"
      />
    </SettingsPage>
  )
}

function NewKeyDialog({ open, agent, onClose, onCreate }: {
  readonly open: boolean
  readonly agent: boolean
  readonly onClose: () => void
  readonly onCreate: (k: ApiKey) => void
}) {
  const [name, setName] = useState("")
  const [mode, setMode] = useState<"role" | "custom">("role")
  const [roleId, setRoleId] = useState("alleen-lezen")
  const [scopes, setScopes] = useState<Partial<Record<(typeof API_AREAS)[number], ApiAccess>>>({ orders: 1 })
  const [expiry, setExpiry] = useState("90")
  const [forAgent, setForAgent] = useState(agent)
  const [tried, setTried] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [stored, setStored] = useState(false)
  const close = () => {
    if (secret !== null && !stored) return
    setName("")
    setSecret(null)
    setStored(false)
    setTried(false)
    onClose()
  }
  const create = () => {
    setTried(true)
    if (name.trim() === "") return
    const token = `ins_live_${Math.random().toString(36).slice(2, 6)}${Math.random().toString(36).slice(2, 14)}${
      Math.random().toString(36).slice(2, 14)
    }`
    setSecret(token)
    onCreate({
      id: `key_${token.slice(9, 13)}`,
      label: name.trim(),
      prefix: token.slice(0, 13),
      createdBy: "Elena Hart",
      created: NOW,
      lastUsed: null,
      status: "active",
      access: mode === "role" ? { kind: "role", roleId } : { kind: "custom", scopes },
      stores: "all",
      expires: expiry === "never" ? null : new Date(NOW.getTime() + Number(expiry) * DAY),
      ips: [],
      ...(forAgent ? { agent: true } : {})
    })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={secret === null ? "API-sleutel aanmaken" : "Je nieuwe sleutel"}
      description={secret === null
        ? "Voor een script of dienst die met Insyte praat. Geef hem niet meer dan hij nodig heeft."
        : "Kopieer de sleutel nu en bewaar hem in je secret manager. Insyte laat hem hierna nooit meer zien, ook jou niet."}
      footer={secret === null
        ? (
          <>
            <Button variant="ghost" onClick={close}>Annuleren</Button>
            <Button variant="primary" onClick={create}>Sleutel aanmaken</Button>
          </>
        )
        : <Button variant="primary" disabled={!stored} onClick={close}>Klaar</Button>}
    >
      {secret === null
        ? (
          <div className="flex flex-col gap-4">
            <Field
              label="Naam"
              error={tried && name.trim() === "" ? "Geef de sleutel een naam" : undefined}
              hint="Zodat een collega later weet waar hij voor is."
            >
              {(c) => (
                <Input
                  {...c}
                  placeholder="Voorraadfeed magazijn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink">Toegang</span>
              <Segmented
                label="Toegang"
                value={mode}
                onChange={setMode}
                options={[{ value: "role", label: "Een rol" }, { value: "custom", label: "Eigen rechten" }]}
              />
              {mode === "role"
                ? (
                  <Select aria-label="Rol" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    {ROLES.filter((r) => r.id !== "eigenaar").map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </Select>
                )
                : (
                  <div className="flex flex-col">
                    {API_AREAS.map((a) => (
                      <div key={a} className="flex flex-wrap items-center justify-between gap-2 py-1">
                        <span className="text-sm text-ink">{AREA_LABEL[a]}</span>
                        <Segmented
                          size="sm"
                          label={AREA_LABEL[a]}
                          value={String(scopes[a] ?? 0)}
                          onChange={(v) =>
                            setScopes({ ...scopes, [a]: Number(v) as ApiAccess })}
                          options={([0, 1, 2] as const).map((l) => ({ value: String(l), label: API_LEVEL_LABEL[l] }))}
                        />
                      </div>
                    ))}
                    <p className="pt-1 text-xs text-ink-3">Team, facturatie en sleutels zelf kan een sleutel nooit.</p>
                  </div>
                )}
            </div>
            <Field label="Verloopt na">
              {(c) => (
                <Select {...c} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                  {API_EXPIRY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </Select>
              )}
            </Field>
            <Checkbox
              label="Gebruiken met een agent"
              description="Elke schrijfactie volgt dan Zelfstandigheid; wat op Eerst vragen staat, komt als voorstel bij jou."
              checked={forAgent}
              onChange={setForAgent}
            />
          </div>
        )
        : (
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-well px-3 py-2">
              <CopyValue value={secret} label="Sleutel" />
            </div>
            <Checkbox
              label="Ik heb hem opgeslagen"
              description="Kwijt is kwijt: dan maak je een nieuwe."
              checked={stored}
              onChange={setStored}
            />
          </div>
        )}
    </Dialog>
  )
}

/* ── Webhooks ──────────────────────────────────────────────────────────────────────────────────── */

const successRate = (e: Endpoint) => {
  const ok = e.deliveries.filter((d) => d.status !== null && d.status < 300).length
  return Math.round((ok / Math.max(e.deliveries.length, 1)) * 100)
}
const hookStatus = (e: Endpoint): { tone: Tone; word: string } =>
  !e.active
    ? { tone: "neutral", word: "Uit" }
    : e.failures > 0
    ? { tone: "bad", word: "Mislukt" }
    : { tone: "good", word: "In orde" }

/**
 * Webhooks: the endpoints Insyte sends events to, how deliveries went in the last day, the secret a
 * receiver checks the signature with, and every delivery with a way to send it again. `?endpoint=`
 * opens one. The current demo's `settings/webhooks`.
 */
export function WebhooksScreen() {
  const view = useView()
  const { edit } = useAccess("integrations")
  const openId = useQuery("endpoint")
  const [hooks, setHooks] = useSaved<ReadonlyArray<Endpoint>>("webhooks", hooksFor(view.staat))
  const [editing, setEditing] = useState<Endpoint | "new" | null>(null)
  const [removing, setRemoving] = useState<Endpoint | null>(null)
  const [reveal, setReveal] = useState(false)
  const [tab, setTab] = useState<"alle" | "mislukt">("alle")
  const open = hooks.find((h) => h.id === openId)
  const update = (id: string, next: Partial<Endpoint>) =>
    setHooks((all) => all.map((h) => (h.id === id ? { ...h, ...next } : h)))

  return (
    <SettingsPage
      title="Webhooks"
      width="record"
      area="integrations"
      what="de webhooks"
      meta={`${hooks.length} endpoints · ${hooks.filter((h) => h.failures > 0).length} met fouten`}
      actions={edit
        ? (
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setEditing("new")}>
            Endpoint toevoegen
          </Button>
        )
        : undefined}
    >
      {hooks.length === 0
        ? (
          <EmptyState
            glyph={Webhook}
            title="Nog geen webhooks"
            action={edit
              ? <Button icon={<Plus />} onClick={() => setEditing("new")}>Eerste endpoint toevoegen</Button>
              : undefined}
          >
            Stuur events naar je eigen systemen, zoals een nieuwe bestelling of een chargeback.
          </EmptyState>
        )
        : (
          <Table label="Endpoints" minWidth={720}>
            <THead>
              <Th>Endpoint</Th>
              <Th align="right">Events</Th>
              <Th align="right">Geslaagd, 24 uur</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {hooks.map((h) => (
                <Tr key={h.id} selected={h.id === openId} onOpen={() => setQuery({ endpoint: h.id })}>
                  <Td header className="max-w-[26rem]">
                    <button
                      type="button"
                      onClick={() => setQuery({ endpoint: h.id })}
                      className="flex min-w-0 flex-col text-left hover:underline"
                    >
                      <span className="truncate">{h.url}</span>
                      <span className="truncate text-xs text-ink-3">{h.description}</span>
                    </button>
                  </Td>
                  <Td figure>{h.events.length}</Td>
                  <Td figure>{successRate(h)}%</Td>
                  <Td>
                    <Status tone={hookStatus(h).tone}>{hookStatus(h).word}</Status>
                    {h.failures > 0 && h.active && (
                      <span className="block text-xs text-ink-3">{h.failures} keer achter elkaar</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}

      <Sheet
        open={open !== undefined}
        onClose={() => {
          setQuery({ endpoint: null })
          setReveal(false)
        }}
        title={open?.url.replace(/^https:\/\//, "") ?? ""}
        meta={open?.description}
        actions={open !== undefined && edit
          ? (
            <DropdownMenu label="Endpoint" placement="bottom-end" trigger={moreButton("Meer")}>
              <DropdownItem onSelect={() => setEditing(open)}>Bewerken</DropdownItem>
              <DropdownSeparator />
              <DropdownItem tone="danger" onSelect={() => setRemoving(open)}>Verwijderen</DropdownItem>
            </DropdownMenu>
          )
          : undefined}
        footer={open !== undefined && edit
          ? (
            <Button
              icon={<Send />}
              onClick={() => {
                const ok = open.failures === 0
                toast(
                  ok
                    ? { title: "Testevent aangekomen · 200 in 184 ms", tone: "good" }
                    : {
                      title: "Testevent mislukt",
                      body: "502 van je server na 10 s. Kijk bij de leveringen wat er terugkwam.",
                      tone: "bad"
                    }
                )
              }}
            >
              Testevent sturen
            </Button>
          )
          : undefined}
      >
        {open !== undefined && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink">{open.active ? "Endpoint staat aan" : "Endpoint staat uit"}</span>
              <Toggle
                label="Endpoint aan"
                disabled={!edit}
                on={open.active}
                onChange={(active) => {
                  update(open.id, { active })
                  toast({ title: active ? "Endpoint staat aan" : "Endpoint staat uit" })
                }}
              />
            </div>
            <KeyValue
              items={[
                { label: "Geslaagd in 24 uur", value: `${successRate(open)}%`, figure: true },
                { label: "Leveringen in 24 uur", value: String(open.deliveries.length), figure: true },
                {
                  label: "Gemiddelde duur",
                  value: `${
                    Math.round(open.deliveries.reduce((n, d) => n + d.ms, 0) / Math.max(open.deliveries.length, 1))
                  } ms`,
                  figure: true
                },
                { label: "API-versie", value: open.apiVersion },
                {
                  label: "Opnieuw proberen",
                  value: RETRY_OPTIONS.find((r) => r.value === String(open.retry))?.label ?? `${open.retry} pogingen`
                },
                { label: "Winkels", value: storesLabel(open.stores) },
                { label: "Gemaakt door", value: open.createdBy }
              ]}
            />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">Ondertekening</h3>
              <p className="text-xs text-ink-3">
                Elke levering draagt Insyte-Signature. Controleer hem met dit geheim.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {reveal
                  ? <CopyValue value={open.secret} label="Geheim" className="min-w-0 flex-1" />
                  : <span className="flex-1 text-sm text-ink-3">whsec_••••••••••••••••</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={reveal ? <EyeOff /> : <Eye />}
                  onClick={() => setReveal(!reveal)}
                >
                  {reveal ? "Verbergen" : "Tonen"}
                </Button>
                {edit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update(open.id, {
                        secret: `whsec_${Math.random().toString(36).slice(2, 14)}${
                          Math.random().toString(36).slice(2, 14)
                        }`
                      })
                      setReveal(true)
                      toast({
                        title: "Nieuw geheim gemaakt",
                        body: "Werk de controle aan jouw kant bij; het oude geheim werkt nog 24 uur."
                      })
                    }}
                  >
                    Nieuw geheim
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">Events · {open.events.length}</h3>
              <p className="text-sm text-ink-2">{open.events.join(", ")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Tabs
                label="Leveringen"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "alle", label: "Alle", count: open.deliveries.length },
                  {
                    value: "mislukt",
                    label: "Mislukt",
                    count: open.deliveries.filter((d) => d.status === null || d.status >= 300).length
                  }
                ]}
              />
              <List divided label="Leveringen">
                {open.deliveries.filter((d) => tab === "alle" || d.status === null || d.status >= 300).map((d) => {
                  const ok = d.status !== null && d.status < 300
                  return (
                    <ListRow
                      key={d.id}
                      padded={false}
                      title={d.event}
                      meta={`${stamp(d.at)} · ${
                        d.status === null ? "geen antwoord" : d.status
                      } · ${d.ms} ms · ${d.attempts} ${d.attempts === 1 ? "poging" : "pogingen"}`}
                      trail={
                        <>
                          <Status tone={ok ? "good" : "bad"}>{ok ? "Geslaagd" : "Mislukt"}</Status>
                          {edit && !ok && (
                            <Button
                              size="sm"
                              onClick={() =>
                                toast({
                                  title: "Opnieuw verstuurd",
                                  body: `${d.event} staat in de wachtrij; je ziet hier zo hoe het ging.`
                                })}
                            >
                              Opnieuw versturen
                            </Button>
                          )}
                        </>
                      }
                    />
                  )
                })}
              </List>
            </div>
          </div>
        )}
      </Sheet>

      <EndpointDialog
        endpoint={editing}
        onClose={() => setEditing(null)}
        onSave={(e, isNew) => {
          setHooks((all) => (isNew ? [e, ...all] : all.map((h) => (h.id === e.id ? e : h))))
          setEditing(null)
          toast(
            isNew
              ? { title: "Endpoint toegevoegd", body: "Stuur een testevent om te zien of het aankomt.", tone: "good" }
              : { title: "Endpoint opgeslagen", tone: "good" }
          )
          if (isNew) setQuery({ endpoint: e.id })
        }}
      />
      <AlertDialog
        open={removing !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const e = removing
          if (e === null) return
          setHooks((all) => all.filter((h) => h.id !== e.id))
          setRemoving(null)
          setQuery({ endpoint: null })
          toast({
            title: "Endpoint verwijderd",
            body: "Er gaan geen events meer heen.",
            action: { label: "Ongedaan maken", onClick: () => setHooks((all) => [...all, e]) }
          })
        }}
        title="Endpoint verwijderen?"
        body={`Er gaan dan geen events meer naar ${removing?.url ?? ""}.`}
        confirmLabel="Verwijderen"
      />
    </SettingsPage>
  )
}

function EndpointDialog({ endpoint, onClose, onSave }: {
  readonly endpoint: Endpoint | "new" | null
  readonly onClose: () => void
  readonly onSave: (e: Endpoint, isNew: boolean) => void
}) {
  const isNew = endpoint === "new"
  const base = endpoint === null || endpoint === "new" ? null : endpoint
  const [url, setUrl] = useState(base?.url ?? "")
  const [description, setDescription] = useState(base?.description ?? "")
  const [apiVersion, setApiVersion] = useState(base?.apiVersion ?? "2026-10-01")
  const [retry, setRetry] = useState(String(base?.retry ?? 5))
  const [active, setActive] = useState(base?.active ?? true)
  const [events, setEvents] = useState<ReadonlyArray<string>>(base?.events ?? [])
  const [query, setSearch] = useState("")
  const [tried, setTried] = useState(false)
  const total = WEBHOOK_EVENTS.flatMap((g) => g.events).length
  const urlError = !/^https:\/\/\S+\.\S+/.test(url.trim()) ? "Een endpoint is een https-adres" : undefined
  const q = query.trim().toLowerCase()
  return (
    <Dialog
      key={base?.id ?? String(isNew)}
      open={endpoint !== null}
      onClose={onClose}
      size="lg"
      title={isNew ? "Endpoint toevoegen" : "Endpoint bewerken"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (urlError !== undefined || events.length === 0) return
              onSave({
                id: base?.id ?? `we_${Math.random().toString(36).slice(2, 8)}`,
                url: url.trim(),
                description: description.trim(),
                events,
                stores: base?.stores ?? "all",
                apiVersion,
                retry: Number(retry),
                active,
                failures: base?.failures ?? 0,
                createdBy: base?.createdBy ?? "Elena Hart",
                secret: base?.secret ?? `whsec_${Math.random().toString(36).slice(2, 14)}`,
                deliveries: base?.deliveries ?? []
              }, isNew)
            }}
          >
            {isNew ? "Endpoint toevoegen" : "Opslaan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="URL" error={tried ? urlError : undefined}>
          {(c) => (
            <Input
              {...c}
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
        </Field>
        <Field label="Omschrijving" optional hint="Waar het voor is, zodat een collega het later snapt.">
          {(c) => <Input {...c} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="API-versie" hint="Bepaalt de vorm van de payload.">
            {(c) => (
              <Select {...c} value={apiVersion} onChange={(e) => setApiVersion(e.target.value)}>
                {["2026-10-01", "2026-07-01", "2026-04-01"].map((v) => <option key={v}>{v}</option>)}
              </Select>
            )}
          </Field>
          <div className="flex items-center justify-between gap-3 pt-5">
            <span className="text-sm text-ink">Actief</span>
            <Toggle label="Actief" on={active} onChange={setActive} />
          </div>
        </div>
        <RadioGroup
          label="Opnieuw proberen"
          value={retry}
          onChange={setRetry}
          options={RETRY_OPTIONS.map((r) => ({ value: r.value, label: r.label, description: r.detail }))}
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">Events · {events.length} van {total} gekozen</span>
            <SearchField
              label="Events zoeken"
              placeholder="Zoek een event, zoals order.paid of chargeback"
              value={query}
              onChange={setSearch}
              className="w-full sm:w-72"
            />
          </div>
          {tried && events.length === 0 && <p className="text-xs text-bad-ink" role="alert">Kies minstens één event</p>}
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((g) => {
              const list = g.events.filter((e) => q === "" || e.includes(q) || g.area.toLowerCase().includes(q))
              if (list.length === 0) return null
              return (
                <fieldset key={g.area} className="flex flex-col gap-1.5">
                  <legend className="pb-1 text-xs font-semibold text-ink-3">{g.area}</legend>
                  {list.map((e) => (
                    <Checkbox
                      key={e}
                      label={e}
                      checked={events.includes(e)}
                      onChange={(on) => setEvents((all) => (on ? [...all, e] : all.filter((x) => x !== e)))}
                    />
                  ))}
                </fieldset>
              )
            })}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
