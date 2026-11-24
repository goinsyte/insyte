import { useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  CANCEL_REASONS,
  CARD,
  INVOICES,
  longDate,
  OSS,
  PLANS,
  REGIONAL,
  REGIONAL_OPTIONS,
  RENEWAL,
  SEATS,
  STORE_ROWS,
  storeName,
  USAGE,
  VAT_STORES
} from "../../fixtures/settings.ts"
import type { PlanId, StoreRow } from "../../fixtures/settings.ts"
import { useAccess } from "../../ui/access.tsx"
import { Disclosure } from "../../ui/accordion.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { CreditCard, Download, MoreHorizontal, Plus } from "../../ui/icons.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { Meter } from "../../ui/progress.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { figure, money, SaveBar, SettingsPage, useDraft, useSaved } from "./parts.tsx"

/* ── Winkels ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Winkels: the Shopify stores the workspace reads, how each is doing, and what Magnus already did
 * when one stopped sending changes. Northwind UK lost its connection and says how to restore it.
 * The current demo's `settings/stores`.
 */
export function StoresScreen() {
  const { edit } = useAccess("settings")
  const [stores, setStores] = useSaved<ReadonlyArray<StoreRow & { live?: boolean }>>("stores", STORE_ROWS)
  const [adding, setAdding] = useState(false)
  const [dropping, setDropping] = useState<StoreRow | null>(null)
  const [reconnecting, setReconnecting] = useState<StoreRow | null>(null)
  const update = (id: string, next: Partial<StoreRow & { live?: boolean }>) =>
    setStores((all) => all.map((s) => (s.id === id ? { ...s, ...next } : s)))

  return (
    <SettingsPage
      title="Winkels"
      width="record"
      area="settings"
      what="de winkels"
      meta={`Shopify-winkels · ${stores.length} · ${stores.filter((s) => s.connected).length} gekoppeld`}
      actions={edit
        ? <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>Winkel koppelen</Button>
        : undefined}
    >
      <List divided label="Winkels">
        {stores.map((s) => (
          <ListRow
            key={s.id}
            padded={false}
            lead={<ServiceLogo service="shopify" name="Shopify" size={32} />}
            title={
              <span className="inline-flex items-center gap-2">
                {s.name}
                {s.id === "store_eu" && <Tag tone="accent">Actief</Tag>}
              </span>
            }
            meta={`${s.domain} · ${s.currency} · ${s.synced}`}
            trail={
              <>
                {s.connected ? <Status tone="good">Gekoppeld</Status> : <Status tone="bad">Niet gekoppeld</Status>}
                {!s.connected && edit && <Button size="sm" onClick={() => setReconnecting(s)}>Opnieuw koppelen</Button>}
                {s.connected && (
                  <DropdownMenu
                    label={`Acties voor ${s.name}`}
                    placement="bottom-end"
                    trigger={(props) => (
                      <button
                        {...props}
                        type="button"
                        aria-label={`Acties voor ${s.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )}
                  >
                    <DropdownItem onSelect={() => window.open(`https://${s.domain}/admin`, "_blank", "noopener")}>
                      Openen in Shopify
                    </DropdownItem>
                    <DropdownItem
                      disabled={!edit}
                      onSelect={() => {
                        update(s.id, { live: s.live !== true })
                        toast(
                          s.live === true
                            ? { title: `Live staat uit voor ${s.name}` }
                            : {
                              title: `Live staat aan voor ${s.name}`,
                              body: "Bezoekers verschijnen op Live zodra ze je winkel openen.",
                              tone: "good"
                            }
                        )
                      }}
                    >
                      {s.live === true ? "Live uitzetten" : "Live aanzetten"}
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem tone="danger" disabled={!edit} onSelect={() => setDropping(s)}>
                      Ontkoppelen
                    </DropdownItem>
                  </DropdownMenu>
                )}
              </>
            }
          />
        ))}
      </List>

      {stores.filter((s) => s.incidents.length > 0 && s.connected).map((s) => {
        const open = s.incidents.filter((i) => i.resolved === null)
        const done = s.incidents.filter((i) => i.resolved !== null)
        return (
          <PageSection key={s.id} id={`gezondheid-${s.id}`} title={`Gezondheid van ${s.name}`}>
            {open.map((i) => (
              <Notice key={i.id} tone="warn" title={i.finding}>
                <span className="flex flex-col gap-2">
                  <span>{i.since} · {i.told} · {i.next}.</span>
                  <span className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink">Wat {ASSISTANT} al deed</span>
                    {i.tried.map((t) => (
                      <span key={t.at} className="text-xs text-ink-2">
                        <span className="figure text-ink-3">{t.at}</span> {t.text}
                      </span>
                    ))}
                  </span>
                </span>
              </Notice>
            ))}
            {done.length > 0 && (
              <Disclosure label={`${done.length} melding opgelost deze week`}>
                {done.map((i) => (
                  <div key={i.id} className="flex flex-col gap-1 text-sm text-ink-2">
                    <span className="text-ink">{i.finding}</span>
                    <span className="text-xs text-ink-3">{i.since} · {i.resolved}</span>
                    {i.tried.map((t) => (
                      <span key={t.at} className="text-xs">
                        <span className="figure text-ink-3">{t.at}</span> {t.text}
                      </span>
                    ))}
                  </div>
                ))}
              </Disclosure>
            )}
          </PageSection>
        )
      })}

      <ConnectDialog
        open={adding || reconnecting !== null}
        store={reconnecting}
        onClose={() => {
          setAdding(false)
          setReconnecting(null)
        }}
        onConnect={(row) => {
          if (reconnecting !== null) {
            update(reconnecting.id, { connected: true, synced: "Gesynchroniseerd om 14:30" })
            toast({
              title: `${reconnecting.name} weer gekoppeld`,
              body: "De wijzigingen sinds 18 nov worden nu opgehaald.",
              tone: "good"
            })
          } else {
            setStores((all) => [...all, row])
            toast({
              title: `${row.name} gekoppeld`,
              body: "Bestellingen, producten en klanten komen binnen enkele minuten binnen.",
              tone: "good"
            })
          }
          setAdding(false)
          setReconnecting(null)
        }}
      />
      <AlertDialog
        open={dropping !== null}
        onCancel={() => setDropping(null)}
        onConfirm={() => {
          const s = dropping
          if (s === null) return
          update(s.id, { connected: false, synced: "Ontkoppeld vandaag" })
          setDropping(null)
          toast({
            title: `${s.name} ontkoppeld`,
            body: "Insyte leest de winkel niet meer. In Shopify verandert niets.",
            action: { label: "Ongedaan maken", onClick: () => update(s.id, { connected: true, synced: s.synced }) }
          })
        }}
        title={`${dropping?.name ?? ""} ontkoppelen?`}
        body="Nieuwe bestellingen worden niet meer gesynchroniseerd. Wat er al is, blijft leesbaar zo lang als onder Account staat."
        confirmLabel="Ontkoppelen"
      />
    </SettingsPage>
  )
}

function ConnectDialog({ open, store, onClose, onConnect }: {
  readonly open: boolean
  readonly store: StoreRow | null
  readonly onClose: () => void
  readonly onConnect: (row: StoreRow) => void
}) {
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [platform, setPlatform] = useState("Shopify")
  const [token, setToken] = useState("")
  const [tried, setTried] = useState(false)
  const missing = store === null && (name.trim() === "" || domain.trim() === "")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      lead={<ServiceLogo service="shopify" name="Shopify" size={40} />}
      title={store === null ? "Winkel toevoegen" : `${store.name} opnieuw koppelen`}
      description={store === null
        ? "Koppel een Shopify-winkel. Bestellingen, producten en klanten worden binnen enkele minuten gesynchroniseerd."
        : "Shopify gaf Insyte geen toegang meer. Maak een nieuw toegangstoken en plak het hier."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (missing || token.trim() === "") return
              onConnect({
                id: `store_${domain.split(".")[0] ?? "nieuw"}`,
                name: name.trim(),
                domain: domain.trim(),
                currency: "EUR",
                connected: true,
                synced: "Gesynchroniseerd om 14:30",
                incidents: []
              })
              setName("")
              setDomain("")
              setToken("")
              setTried(false)
            }}
          >
            {store === null ? "Winkel koppelen" : "Opnieuw koppelen"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {store === null && (
          <>
            {tried && missing && (
              <p className="text-sm text-bad-ink" role="alert">Winkelnaam en domein zijn verplicht</p>
            )}
            <Field label="Winkelnaam">
              {(c) => (
                <Input
                  {...c}
                  placeholder="Northwind DE"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Domein">
              {(c) => (
                <Input
                  {...c}
                  placeholder="northwind-de.myshopify.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              )}
            </Field>
            <Field label="Platform">
              {(c) => (
                <Select {...c} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  <option>Shopify</option>
                  <option>Shopify Plus</option>
                </Select>
              )}
            </Field>
          </>
        )}
        <Field
          label="API-toegangstoken"
          hint="Maak er een aan in Shopify → Apps en verkoopkanalen → Apps ontwikkelen."
          error={tried && token.trim() === "" ? "Plak het toegangstoken" : undefined}
        >
          {(c) => (
            <Input
              {...c}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

const price = (p: (typeof PLANS)[number], yearly: boolean) => (yearly ? p.price * 10 : p.price)

/* ── Facturatie ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Facturatie: the plan and what it includes, how much of it is in use, the card, extra seats and the
 * invoices. The amounts are the current demo's plan copy in euros, not Insyte's public pricing. Only
 * a role with Facturatie · Bewerken changes it; Beheerder reads it. The current demo's
 * `settings/billing`.
 */
export function BillingScreen() {
  const { edit } = useAccess("billing")
  const [plan, setPlan] = useSaved<{ id: PlanId; yearly: boolean; endsOn: Date | null }>("billing.plan", {
    id: "scale",
    yearly: false,
    endsOn: null
  })
  const [extra, setExtra] = useSaved("billing.seats", SEATS.extra)
  const [card, setCard] = useSaved("billing.card", { ...CARD })
  const [changing, setChanging] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [buying, setBuying] = useState(false)
  const [updatingCard, setUpdatingCard] = useState(false)
  const current = PLANS.find((p) => p.id === plan.id) ?? PLANS[2]

  return (
    <SettingsPage
      title="Facturatie"
      width="record"
      area="billing"
      what="de facturatie"
      meta="Abonnement, gebruik, betaalmethode en facturen"
    >
      <PageSection
        id="abonnement"
        title="Abonnement"
        actions={edit
          ? (
            <>
              {plan.endsOn === null && (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Opzeggen</Button>
              )}
              <Button size="sm" onClick={() => setChanging(true)}>Abonnement wijzigen</Button>
            </>
          )
          : undefined}
      >
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
            {current.name}
            {plan.endsOn === null
              ? <Tag tone="good">Actief</Tag>
              : <Tag tone="warn">Stopt op {longDate(plan.endsOn)}</Tag>}
          </p>
          <p className="text-sm text-ink-2">
            <span className="figure">{money(price(current, plan.yearly))}</span> per {plan.yearly ? "jaar" : "maand"} ·
            {" "}
            {current.seats} plekken · {current.stores} winkels ·{" "}
            {plan.endsOn === null ? `verlengt ${longDate(RENEWAL)}` : "daarna is de werkruimte alleen-lezen"}
          </p>
          <p className="text-xs text-ink-3">
            {current.pitch} Demobedragen: de prijzen van Insyte liggen nog niet vast.
          </p>
        </div>
        {plan.endsOn !== null && edit && (
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              setPlan({ ...plan, endsOn: null })
              toast({ title: `${current.name} blijft actief`, tone: "good" })
            }}
          >
            Toch doorgaan met {current.name}
          </Button>
        )}
      </PageSection>

      <PageSection id="gebruik" title="Gebruik deze periode">
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {USAGE.map((u) => (
            <Meter
              key={u.label}
              label={u.label}
              value={u.value}
              max={u.label === "Gebruikte plekken"
                ? current.seats + extra
                : u.label === "Gekoppelde winkels"
                ? current.stores
                : u.label.startsWith("AI")
                ? current.replies
                : u.max}
              format={figure}
            />
          ))}
        </div>
      </PageSection>

      <SettingsSection id="betaalmethode" title="Betaalmethode">
        <SettingRow
          title={`${card.brand} •••• ${card.last4}`}
          description={`Vervalt ${card.expiry}`}
          control={edit
            ? <Button size="sm" icon={<CreditCard />} onClick={() => setUpdatingCard(true)}>Kaart bijwerken</Button>
            : undefined}
        />
      </SettingsSection>

      <SettingsSection
        id="plekken"
        title={`Extra plekken · ${current.seats} in je abonnement`}
        description="Een extra plek gaat naar rato op je volgende factuur en stopt wanneer je hem opzegt."
      >
        <SettingRow
          title={extra === 0 ? "Geen extra plekken" : `${extra} extra ${extra === 1 ? "plek" : "plekken"}`}
          description="Gaat naar rato op je volgende factuur."
          control={edit
            ? (
              <span className="flex gap-2">
                {extra > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setExtra(extra - 1)
                      toast({
                        title: "Extra plek opgezegd",
                        body: "Hij stopt aan het eind van deze periode.",
                        action: { label: "Ongedaan maken", onClick: () => setExtra(extra) }
                      })
                    }}
                  >
                    Plek opzeggen
                  </Button>
                )}
                <Button size="sm" onClick={() => setBuying(true)}>Plek bijkopen</Button>
              </span>
            )
            : undefined}
        />
      </SettingsSection>

      <PageSection id="facturen" title="Facturen" meta={String(INVOICES.length)}>
        <Table label="Facturen" minWidth={520}>
          <THead>
            <Th>Datum</Th>
            <Th>Nummer</Th>
            <Th>Abonnement</Th>
            <Th align="right">Bedrag</Th>
            <Th>Status</Th>
            <Th width={44}>
              <span className="sr-only">Downloaden</span>
            </Th>
          </THead>
          <TBody>
            {INVOICES.map((inv) => (
              <Tr key={inv.id}>
                <Td header>{longDate(inv.date)}</Td>
                <Td muted>{inv.id}</Td>
                <Td>Scale, maandelijks</Td>
                <Td figure>{money(inv.amount)}</Td>
                <Td>
                  <Status tone="good">Betaald</Status>
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    aria-label={`${inv.id} downloaden`}
                    title="Downloaden"
                    onClick={() => toast({ title: `${inv.id}.pdf gedownload` })}
                    className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                  >
                    <Download size={15} />
                  </button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </PageSection>

      <ChangePlanDialog
        open={changing}
        current={plan.id}
        yearly={plan.yearly}
        onClose={() => setChanging(false)}
        onChange={(id, yearly) => {
          const before = plan
          const next = PLANS.find((p) => p.id === id) ?? current
          setPlan({ id, yearly, endsOn: null })
          setChanging(false)
          toast({
            title: `Je hebt nu ${next.name}, ${yearly ? "jaarlijks" : "maandelijks"} gefactureerd`,
            body: "De nieuwe prijs geldt vanaf je volgende verlenging.",
            tone: "good",
            action: { label: "Ongedaan maken", onClick: () => setPlan(before) }
          })
        }}
      />
      <CancelDialog
        open={cancelling}
        plan={current.name}
        onClose={() => setCancelling(false)}
        onCancel={() => {
          setPlan({ ...plan, endsOn: RENEWAL })
          setCancelling(false)
          toast({ title: `${current.name} stopt op ${longDate(RENEWAL)}`, body: "Tot die tijd blijft alles werken." })
        }}
      />
      <AlertDialog
        open={buying}
        onCancel={() => setBuying(false)}
        onConfirm={() => {
          setExtra(extra + 1)
          setBuying(false)
          toast({ title: "Plek bijgekocht", body: "Je kunt meteen iemand uitnodigen.", tone: "good" })
        }}
        title="Plek bijkopen?"
        body={`Naar rato op je volgende factuur van ${longDate(RENEWAL)}. Je kunt hem altijd weer opzeggen.`}
        confirmLabel="Plek bijkopen"
      />
      <CardDialog
        open={updatingCard}
        onClose={() => setUpdatingCard(false)}
        onSave={(last4, expiry) => {
          setCard({ brand: "Visa", last4, expiry })
          setUpdatingCard(false)
          toast({
            title: "Kaart bijgewerkt",
            body: `Visa •••• ${last4} betaalt vanaf de volgende factuur.`,
            tone: "good"
          })
        }}
      />
    </SettingsPage>
  )
}

function ChangePlanDialog({ open, current, yearly: was, onClose, onChange }: {
  readonly open: boolean
  readonly current: PlanId
  readonly yearly: boolean
  readonly onClose: () => void
  readonly onChange: (id: PlanId, yearly: boolean) => void
}) {
  const [id, setId] = useState<PlanId>(current)
  const [yearly, setYearly] = useState(was)
  const pick = PLANS.find((p) => p.id === id)
  const same = id === current && yearly === was
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Abonnement wijzigen"
      description="De nieuwe prijs geldt vanaf je volgende verlenging. Jaarlijks betalen geeft twee maanden gratis."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={same} onClick={() => onChange(id, yearly)}>
            Overstappen naar {pick?.name ?? ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Betalen"
          value={yearly ? "jaar" : "maand"}
          onChange={(v) => setYearly(v === "jaar")}
          options={[{ value: "maand", label: "Maandelijks" }, { value: "jaar", label: "Jaarlijks" }]}
        />
        <RadioGroup
          label="Abonnement"
          value={id}
          onChange={setId}
          options={PLANS.map((p) => ({
            value: p.id,
            label: `${p.name} · ${money(yearly ? p.price * 10 : p.price)} per ${yearly ? "jaar" : "maand"}`,
            description: `${p.pitch} ${p.seats} plekken, ${p.stores} ${p.stores === 1 ? "winkel" : "winkels"}, ${
              figure(p.replies)
            } AI-antwoorden.`
          }))}
        />
      </div>
    </Dialog>
  )
}

function CancelDialog({ open, plan, onClose, onCancel }: {
  readonly open: boolean
  readonly plan: string
  readonly onClose: () => void
  readonly onCancel: () => void
}) {
  const [reason, setReason] = useState(CANCEL_REASONS[0] ?? "")
  const [note, setNote] = useState("")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${plan} opzeggen`}
      description={`Het abonnement stopt op ${
        longDate(RENEWAL)
      }. Tot die tijd blijft alles werken; daarna is de werkruimte alleen-lezen.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Toch niet</Button>
          <Button variant="danger" onClick={onCancel}>Opzeggen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RadioGroup
          label="Waarom stop je?"
          value={reason}
          onChange={setReason}
          options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))}
        />
        <Field label="Wil je ons nog iets laten weten?" optional>
          {(c) => <Textarea {...c} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

function CardDialog({ open, onClose, onSave }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onSave: (last4: string, expiry: string) => void
}) {
  const [number, setNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [tried, setTried] = useState(false)
  const digits = number.replace(/\s/g, "")
  const numberError = /^\d{15,16}$/.test(digits) ? undefined : "Vul een geldig kaartnummer in"
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry.trim())
  const expiryError = m === null
    ? "Gebruik MM/JJ"
    : Number(m[2]) + 2000 < 2026 || (Number(m[2]) + 2000 === 2026 && Number(m[1]) < 11)
    ? "Deze kaart is verlopen"
    : undefined
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kaart bijwerken"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (numberError !== undefined || expiryError !== undefined || m === null) return
              onSave(digits.slice(-4), `${m[1]}/20${m[2]}`)
              setNumber("")
              setExpiry("")
              setTried(false)
            }}
          >
            Opslaan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Kaartnummer" error={tried ? numberError : undefined}>
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              autoComplete="cc-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          )}
        </Field>
        <Field label="Vervaldatum" error={tried ? expiryError : undefined}>
          {(c) => (
            <Input
              {...c}
              placeholder="MM/JJ"
              autoComplete="cc-exp"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-28"
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── Regio ─────────────────────────────────────────────────────────────────────────────────────── */

const REGION_FIELDS: ReadonlyArray<
  { readonly key: keyof typeof REGIONAL; readonly label: string; readonly hint?: string }
> = [
  { key: "language", label: "Taal", hint: "Voor mails aan klanten, exports en facturen." },
  {
    key: "currency",
    label: "Valuta",
    hint: "Waarin Analyse en rapporten rekenen. Bestellingen houden hun eigen valuta."
  },
  { key: "dateFormat", label: "Datumnotatie" },
  { key: "timeFormat", label: "Tijdnotatie" },
  { key: "weekStart", label: "Week begint op" },
  {
    key: "timezone",
    label: "Tijdzone",
    hint: "Bepaalt wanneer een dag begint in Analyse en wanneer stille uren ingaan."
  }
]

/** Regio: language, currency, the date and time notation, and the time zone. `settings/regional`. */
export function RegionalScreen() {
  const { edit } = useAccess("settings")
  const region = useDraft("regional", { ...REGIONAL })
  return (
    <SettingsPage title="Regio" area="settings" what="de regio" meta="Hoe Insyte datums, tijden en bedragen schrijft">
      <SettingsSection
        id="notatie"
        title="Taal en notatie"
        footer={
          <SaveBar
            disabled={!edit}
            dirty={region.dirty}
            onReset={region.reset}
            onSave={() => {
              region.commit()
              toast({ title: "Taal en notatie opgeslagen", tone: "good" })
            }}
          />
        }
      >
        {REGION_FIELDS.map((f) => (
          <SettingRow
            key={f.key}
            title={f.label}
            htmlFor={`region-${f.key}`}
            description={f.hint}
            control={
              <Select
                id={`region-${f.key}`}
                className="w-60"
                disabled={!edit}
                value={region.draft[f.key]}
                onChange={(e) => region.patch({ [f.key]: e.target.value })}
              >
                {REGIONAL_OPTIONS[f.key].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            }
          />
        ))}
      </SettingsSection>
    </SettingsPage>
  )
}

/* ── Btw ───────────────────────────────────────────────────────────────────────────────────────── */

const saved = () =>
  toast({ title: "Btw opgeslagen", body: "Analyse en nieuwe terugbetalingen rekenen er vanaf nu mee.", tone: "good" })

/** Btw: per store how VAT counts on shipping and on a refund, and the EU's one-stop shop. `settings/vat`. */
export function VatScreen() {
  const { edit } = useAccess("settings")
  const stores = useDraft("vat.stores", VAT_STORES.map((s) => ({ ...s })))
  const oss = useDraft("vat.oss", { ...OSS })
  const ossError = oss.draft.on && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(oss.draft.number.trim())
  const saveOss = () => {
    if (ossError) {
      toast({ title: "Vul een OSS-nummer in met landcode, zoals NL123456789B01", tone: "bad" })
      return
    }
    oss.commit()
    saved()
  }
  const setStore = (id: string, next: Partial<(typeof VAT_STORES)[number]>) =>
    stores.set(stores.draft.map((s) => (s.storeId === id ? { ...s, ...next } : s)))

  return (
    <SettingsPage
      title="Btw"
      area="settings"
      what="de btw-instellingen"
      meta="Hoe Insyte btw telt in Analyse en bij terugbetalingen"
    >
      <SettingsSection
        id="per-winkel"
        title="Per winkel"
        description="Hoe btw telt bij verzendkosten en bij een terugbetaling."
        footer={
          <SaveBar
            disabled={!edit}
            dirty={stores.dirty}
            onReset={stores.reset}
            onSave={() => {
              stores.commit()
              saved()
            }}
          />
        }
      >
        {stores.draft.map((s) => (
          <div key={s.storeId} className="flex flex-col py-2">
            <p className="pt-1 text-sm font-medium text-ink">
              {storeName(s.storeId)} <span className="font-normal text-ink-3">· {s.currency}</span>
            </p>
            <SettingRow
              title="Btw over verzending"
              control={
                <Toggle
                  label={`Btw over verzending, ${storeName(s.storeId)}`}
                  disabled={!edit}
                  on={s.vatOnShipping}
                  onChange={(on) => setStore(s.storeId, { vatOnShipping: on })}
                />
              }
            />
            <SettingRow
              title="Terugbetalen met btw"
              description="De btw gaat mee terug naar de klant."
              control={
                <Toggle
                  label={`Terugbetalen met btw, ${storeName(s.storeId)}`}
                  disabled={!edit}
                  on={s.refundInclVat}
                  onChange={(on) => setStore(s.storeId, { refundInclVat: on })}
                />
              }
            />
          </div>
        ))}
      </SettingsSection>

      <SettingsSection
        id="oss"
        title="Verkopen in de EU"
        description="Met de OSS-regeling geef je de btw van alle EU-landen op één plek aan."
        footer={<SaveBar disabled={!edit} dirty={oss.dirty} onSave={saveOss} onReset={oss.reset} />}
      >
        <SettingRow
          title="OSS-registratie"
          control={
            <Toggle
              label="OSS-registratie"
              disabled={!edit}
              on={oss.draft.on}
              onChange={(on) => oss.patch({ on })}
            />
          }
        />
        {oss.draft.on && (
          <SettingRow
            title="OSS-nummer"
            htmlFor="oss-number"
            description="Je btw-nummer met landcode."
            control={
              <Input
                id="oss-number"
                className="w-52"
                disabled={!edit}
                aria-invalid={ossError || undefined}
                value={oss.draft.number}
                onChange={(e) => oss.patch({ number: e.target.value.toUpperCase() })}
              />
            }
          />
        )}
      </SettingsSection>
    </SettingsPage>
  )
}
