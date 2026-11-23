import { useState } from "react"
import {
  AFFILIATE_BY_STATE,
  affiliateNotes,
  BRAND,
  FAQS,
  METHOD_LABEL,
  PRIYA,
  RESOURCES,
  TIERS
} from "../../fixtures/affiliate-portal.ts"
import type { AffiliatePerson, PayoutMethod, Resource, ResourceKind } from "../../fixtures/affiliate-portal.ts"
import type { Glyph } from "../../fixtures/agents.ts"
import { navigate, paths } from "../../router.tsx"
import { Accordion } from "../../ui/accordion.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import {
  Bell,
  Clock,
  Download,
  FileText,
  Image,
  Package,
  Palette,
  TrendingUp,
  Video,
  Wallet,
  XCircle
} from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { NotificationList } from "../../ui/notifications.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Rich } from "../../ui/rich.tsx"
import { SettingsSection } from "../../ui/settings.tsx"
import { SkeletonRow } from "../../ui/skeleton.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { setView } from "../../view.ts"
import { day, dayFull, LoadError, useBook, useDataState } from "./parts.tsx"
import { changeWithUndo, mask, useAffiliate } from "./store.ts"

/* ── materiaal ────────────────────────────────────────────────────────────────────────────────── */

const KIND: Readonly<Record<ResourceKind, { readonly glyph: Glyph; readonly label: string }>> = {
  logo: { glyph: Palette, label: "Logo" },
  afbeelding: { glyph: Image, label: "Foto's" },
  video: { glyph: Video, label: "Video" },
  document: { glyph: FileText, label: "Document" },
  gids: { glyph: Package, label: "Gids" }
}

/** A stand-in file: the demo has no real assets, so the download says what it would hold. */
function downloadResource(r: Resource) {
  const body = `${r.name}\n${KIND[r.kind].label} · ${r.size}\nBijgewerkt ${
    dayFull(r.updatedAt)
  }\n\nVoorbeeldbestand uit de demo van ${BRAND}.`
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${r.id}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast({ title: `${r.name} gedownload`, body: r.size })
}

/* What the brand gives affiliates to share: logos, product photos, the guide, and the answers to what they ask most. */
export function ResourcesPage() {
  const state = useDataState()
  const items = state === "empty" ? [] : RESOURCES
  return (
    <Page width="record">
      <PageHead title="Materiaal" meta={`Logo's, foto's en teksten van ${BRAND} om te delen`} />
      <div className="flex flex-col gap-10">
        <PageSection id="bestanden" title="Bestanden" meta={items.length > 0 ? `${items.length}` : undefined}>
          {state === "loading" ?
            (
              <div aria-busy="true" className="flex flex-col">
                {Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)}
              </div>
            ) :
            state === "error" ?
            <LoadError what="Het materiaal" size="sm" /> :
            items.length === 0 ?
            (
              <EmptyState size="sm" glyph={Image} title="Nog geen materiaal">
                {BRAND} heeft nog niets klaargezet. Je krijgt een melding zodra er iets nieuws is.
              </EmptyState>
            ) :
            (
              <List label="Bestanden">
                {items.map((r) => {
                  const G = KIND[r.kind].glyph
                  return (
                    <ListRow
                      key={r.id}
                      lead={
                        <GlyphTile>
                          <G size={16} />
                        </GlyphTile>
                      }
                      title={r.name}
                      meta={`${KIND[r.kind].label} · ${r.size} · bijgewerkt ${day(r.updatedAt)}`}
                      trail={
                        <Button size="sm" variant="ghost" icon={<Download />} onClick={() => downloadResource(r)}>
                          <span className="sr-only sm:not-sr-only">Downloaden</span>
                        </Button>
                      }
                    />
                  )
                })}
              </List>
            )}
        </PageSection>
        <PageSection id="vragen" title="Veelgestelde vragen">
          <Accordion
            items={FAQS.map((f, i) => ({
              id: `faq-${i}`,
              title: f.q,
              children: <p className="text-sm text-pretty text-ink-2">{f.a}</p>
            }))}
          />
        </PageSection>
      </div>
    </Page>
  )
}

/* ── meldingen ────────────────────────────────────────────────────────────────────────────────── */

const NOTE_GLYPH = { conversie: TrendingUp, uitbetaling: Wallet, materiaal: FileText } as const

/* What happened that is about the affiliate: an order through a link, a payout, new material. */
export function NotificationsPage() {
  const state = useDataState()
  const book = useBook()
  const { read } = useAffiliate()
  const notes = state === "empty" ? [] : affiliateNotes(book)
  const unread = notes.filter((n) => n.unread && !read.has(n.id))
  return (
    <Page width="text">
      <PageHead
        title="Meldingen"
        meta={unread.length > 0 ? `${unread.length} ongelezen` : "Alles gelezen"}
        actions={unread.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              changeWithUndo(
                "Alles als gelezen gemarkeerd",
                (s) => ({ ...s, read: new Set([...s.read, ...unread.map((n) => n.id)]) })
              )}
          >
            Alles gelezen
          </Button>
        )}
      />
      {state === "loading" ?
        (
          <div aria-busy="true" className="flex flex-col">
            {Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)}
          </div>
        ) :
        state === "error" ?
        <LoadError what="Je meldingen" /> :
        (
          <NotificationList
            empty={
              <EmptyState glyph={Bell} title="Nog geen meldingen">
                Je hoort het hier als er een bestelling via je link binnenkomt of als je commissie is uitbetaald.
              </EmptyState>
            }
            items={notes.map((n) => {
              const G = NOTE_GLYPH[n.kind]
              return {
                id: n.id,
                mark: (
                  <GlyphTile>
                    <G size={16} />
                  </GlyphTile>
                ),
                text: <Rich text={n.text} />,
                at: n.at,
                href: paths.affiliatePortal(n.page),
                unread: n.unread && !read.has(n.id)
              }
            })}
          />
        )}
    </Page>
  )
}

/* ── instellingen ─────────────────────────────────────────────────────────────────────────────── */

type SettingsTab = "profiel" | "betaling"

const ACCOUNT_LABEL: Readonly<Record<PayoutMethod, string>> = {
  paypal: "PayPal-e-mailadres",
  bank: "IBAN",
  wise: "Wise-e-mailadres"
}

/* Who the affiliate is to the brand, and where its money goes. */
export function SettingsPage({ tab }: { readonly tab: SettingsTab }) {
  const state = useDataState()
  return (
    <Page width="text">
      <PageHead title="Instellingen" />
      <Tabs
        label="Instellingen"
        value={tab}
        onChange={(next) => navigate(paths.affiliatePortal(`instellingen/${next}`))}
        tabs={[{ value: "profiel", label: "Profiel" }, { value: "betaling", label: "Betaling" }]}
      />
      {state === "loading" ?
        (
          <div aria-busy="true" className="flex flex-col">
            {Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} />)}
          </div>
        ) :
        state === "error"
        ? <LoadError what="Je instellingen" />
        : tab === "profiel"
        ? <ProfileForm />
        : <PaymentForm />}
    </Page>
  )
}

function ProfileForm() {
  const { name } = useAffiliate()
  const [draft, setDraft] = useState(name)
  const tier = TIERS.find((t) => t.id === PRIYA.tier)
  const dirty = draft.trim() !== name && draft.trim() !== ""
  return (
    <SettingsSection
      title="Profiel"
      description={`Zo kent ${BRAND} je. Je e-mailadres en code wijzig je via het partnerteam.`}
      footer={
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty}
          onClick={() => changeWithUndo("Profiel opgeslagen", (s) => ({ ...s, name: draft.trim() }))}
        >
          Opslaan
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Naam">
          {(c) => <Input {...c} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="E-mail">{(c) => <Input {...c} value={PRIYA.email} disabled />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Doorverwijscode">
            {(c) => <Input {...c} value={PRIYA.code} disabled className="figure" />}
          </Field>
          <Field label="Niveau">
            {(c) => <Input {...c} value={`${tier?.label ?? ""} · ${tier?.rate ?? 0}%`} disabled />}
          </Field>
        </div>
      </div>
    </SettingsSection>
  )
}

function PaymentForm() {
  const { payment } = useAffiliate()
  const [method, setMethod] = useState<PayoutMethod>(payment.method)
  const [account, setAccount] = useState("")
  const [taxId, setTaxId] = useState(payment.taxId)
  const changed = account.trim() !== "" || taxId.trim() !== payment.taxId
  const save = () => {
    const nextAccount = account.trim() === "" ? payment.account : account.trim()
    changeWithUndo(`Uitbetalingen gaan naar ${METHOD_LABEL[method]}`, (s) => ({
      ...s,
      payment: { method, account: nextAccount, taxId: taxId.trim() }
    }), mask(nextAccount))
    setAccount("")
  }
  return (
    <SettingsSection
      title="Betaalmethode"
      description={`Nu naar ${METHOD_LABEL[payment.method]}, ${
        mask(payment.account)
      }. Vul je rekening opnieuw in om iets te wijzigen.`}
      footer={
        <Button
          variant="primary"
          size="sm"
          disabled={!changed || (method !== payment.method && account.trim() === "")}
          onClick={save}
        >
          Opslaan
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (changed) save()
        }}
      >
        <Field label="Methode">
          {(c) => (
            <Select {...c} value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)}>
              {(Object.keys(METHOD_LABEL) as Array<PayoutMethod>).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={ACCOUNT_LABEL[method]}
          hint={method === payment.method ? "Laat leeg om je huidige rekening te houden." : "Nodig om over te stappen."}
        >
          {(c) => (
            <Input
              {...c}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={method === "bank" ? "NL00 BANK 0123 4567 89" : "naam@voorbeeld.nl"}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Btw-nummer" optional hint="Alleen als je als bedrijf factureert.">
          {(c) => (
            <Input
              {...c}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="NL000000000B01"
            />
          )}
        </Field>
      </form>
    </SettingsSection>
  )
}

/* ── aanmelding ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Before the brand decides, the portal is one page: the application is being read, or it was turned
 * down and why. The rest of the portal stays closed until it is approved.
 */
export function ApplicationPage({ state }: { readonly state: "in-afwachting" | "afgewezen" }) {
  const person: AffiliatePerson = AFFILIATE_BY_STATE[state]
  const pending = state === "in-afwachting"
  return (
    <Page width="text" label="Aanmelding">
      <div className="flex flex-col items-start gap-5 py-8 sm:py-16">
        <span
          className={cx(
            "flex size-11 items-center justify-center rounded-full",
            pending ? "bg-accent-tint text-accent-ink" : "bg-well text-ink-3"
          )}
        >
          {pending ? <Clock size={20} /> : <XCircle size={20} />}
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-balance text-ink">
            {pending ? "Aanmelding wordt beoordeeld" : "Aanmelding niet goedgekeurd"}
          </h1>
          <p className="max-w-[60ch] text-base text-pretty text-ink-2">
            {pending
              ? `Bedankt voor je aanmelding bij het affiliateprogramma van ${BRAND}, ${
                person.name.split(" ")[0]
              }. Ons team beoordeelt aanmeldingen wekelijks; je krijgt een e-mail op ${person.email} zodra er een besluit is.`
              : `${BRAND} heeft je aanmelding van ${
                dayFull(person.appliedAt)
              } bekeken en besloten je nu niet toe te laten.`}
          </p>
        </div>
        {pending ?
          (
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-ink-3">Aangemeld op</dt>
                <dd className="text-ink">{dayFull(person.appliedAt)}</dd>
              </div>
              <p className="text-ink-3">De meeste besluiten volgen binnen 5 werkdagen.</p>
            </dl>
          ) :
          (
            <>
              {person.rejection !== undefined && (
                <blockquote className="max-w-[60ch] border-l-2 border-line-strong pl-4 text-sm text-pretty text-ink-2">
                  {person.rejection}
                </blockquote>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setView({ affiliate: "in-afwachting" })
                  toast({
                    title: "Aanmelding opnieuw verstuurd",
                    body: "De meeste besluiten volgen binnen 5 werkdagen."
                  })
                }}
              >
                Opnieuw aanmelden
              </Button>
            </>
          )}
      </div>
    </Page>
  )
}
