import { useState, useSyncExternalStore } from "react"
import type { AreaDef } from "../../areas.ts"
import { CATALOG, CATEGORY_LABEL, FEATURED, FEEDBACK_CATEGORIES, LEGAL, OWN } from "../../fixtures/marketplace.ts"
import type { App, AppCategory, LegalTab } from "../../fixtures/marketplace.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { AlertDialog, Dialog, Sheet } from "../../ui/dialog.tsx"
import { Check, Key, MessageSquare, Plug, Shield } from "../../ui/icons.tsx"
import { Field, SearchField, Select, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { install, markOpened, OpenAppDialog, ScopesDialog, uninstall, useInstalled } from "./installed.tsx"
import type { Installed } from "./installed.tsx"

/* "Let me know" requests, while the demo is looked at. Installed apps live in `installed.tsx`. */
type State = { readonly notify: ReadonlyArray<string> }
let state: State = { notify: [] }
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const l of listeners) l()
}
const useStore = () =>
  useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => state)

const Lead = ({ app }: { readonly app: App }) => <ServiceLogo service={app.id} name={app.name} size={32} />

/**
 * Marketplace: apps and integrations from other makers. Rebuilt from `/app/marketplace` (the modal and
 * `marketplace-screen.tsx`) as a page with a list and a detail sheet (`?app=`), without the original's
 * ratings, install counts and coloured category tiles. Browsing is open to everyone; installing needs
 * Koppelingen en API · wijzigen.
 */
function MarketplaceScreen() {
  const access = useAccess("integrations")
  const view = useView()
  const status = dataState(view)
  const mine = useInstalled()
  const open = useQuery("app")
  const category = useQuery("categorie") as AppCategory | null
  const [search, setSearch] = useState("")
  const [feedback, setFeedback] = useState(false)
  const [legal, setLegal] = useState<LegalTab | null>(null)

  const catalog = status === "empty" ? [] : CATALOG
  const q = search.trim().toLowerCase()
  const shown = catalog.filter((a) =>
    (category === null || a.category === category) &&
    (q === "" || `${a.name} ${a.tagline} ${a.listing}`.toLowerCase().includes(q))
  )
  const featured = FEATURED.map((id) => catalog.find((a) => a.id === id)).filter((a): a is App => a !== undefined)
  const installedIds = new Set(mine.map((i) => i.app.id))
  const installed = status === "empty" ? [] : mine
  const app = CATALOG.find((a) => a.id === open)

  return (
    <Page>
      <PageHead
        title="Marketplace"
        meta="Apps en koppelingen van andere makers, naast wat Insyte zelf koppelt"
        actions={
          <>
            <Button variant="ghost" onClick={() => setLegal("voorwaarden")}>Beleid</Button>
            <Button icon={<MessageSquare />} onClick={() => setFeedback(true)}>Feedback geven</Button>
          </>
        }
      />
      {status === "loading"
        ? (
          <div aria-busy="true" aria-label="Marketplace laden" className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-80 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        )
        : status === "error"
        ? (
          <ErrorState
            title="De Marketplace kwam niet binnen"
            detail="GET /v1/marketplace/catalog · 503 · verzoek 2c6d81"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Geïnstalleerde apps blijven gewoon werken.
          </ErrorState>
        )
        : (
          <div className="flex flex-col gap-10">
            <PageSection
              id="insyte"
              title="Gekoppeld door Insyte"
              actions={<ButtonLink to={paths.settings("koppelingen")} variant="ghost">Koppelingen beheren</ButtonLink>}
            >
              <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                {OWN.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2">
                    <ServiceLogo service={o.id} name={o.name} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-ink">
                        {o.name} <span className="font-normal text-ink-3">· {o.what}</span>
                      </span>
                      <span className="truncate text-xs text-ink-3">{o.detail}</span>
                    </span>
                    <Status tone="good">Gekoppeld</Status>
                  </li>
                ))}
              </ul>
            </PageSection>

            {installed.length > 0 && (
              <PageSection id="geinstalleerd" title="Geïnstalleerd" meta={`${installed.length}`}>
                <List label="Geïnstalleerd" divided>
                  {installed.map((i) => (
                    <ListRow
                      key={i.app.id}
                      lead={<Lead app={i.app} />}
                      title={i.app.name}
                      meta={i.revoked.length > 0
                        ? `${i.app.tagline} · ${i.revoked.length} ${
                          i.revoked.length === 1 ? "recht" : "rechten"
                        } ingetrokken`
                        : i.app.tagline}
                      onClick={() => setQuery({ app: i.app.id })}
                      trail={<Status tone="good">Geïnstalleerd</Status>}
                    />
                  ))}
                </List>
              </PageSection>
            )}

            {catalog.length === 0
              ? (
                <EmptyState
                  glyph={Plug}
                  title="Nog geen apps in de Marketplace"
                  action={<Button onClick={() => setFeedback(true)}>Een app voorstellen</Button>}
                >
                  De eerste apps van andere makers worden nog beoordeeld. Mis je er een, zeg het ons.
                </EmptyState>
              )
              : (
                <>
                  {category === null && q === "" && (
                    <PageSection id="uitgelicht" title="Uitgelicht" meta="Door Insyte gekozen">
                      <List label="Uitgelicht" divided>
                        {featured.map((a) => <AppRow key={a.id} app={a} installed={installedIds.has(a.id)} />)}
                      </List>
                    </PageSection>
                  )}
                  <PageSection
                    id="alle"
                    title={category === null ? "Alle apps" : CATEGORY_LABEL[category]}
                    meta={`${shown.length}`}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SearchField
                          value={search}
                          onChange={setSearch}
                          label="Apps zoeken"
                          placeholder="Zoek op naam of wat het doet"
                          className="w-full sm:w-80"
                        />
                        <Select
                          aria-label="Categorie"
                          value={category ?? ""}
                          onChange={(event) =>
                            setQuery({ categorie: event.target.value === "" ? null : event.target.value })}
                          className="w-full sm:w-56"
                        >
                          <option value="">Alle categorieën</option>
                          {(Object.keys(CATEGORY_LABEL) as Array<AppCategory>).map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                          ))}
                        </Select>
                      </div>
                      {shown.length === 0
                        ? (
                          <EmptyState
                            size="sm"
                            title="Niets gevonden"
                            action={
                              <Button
                                onClick={() => {
                                  setSearch("")
                                  setQuery({ categorie: null })
                                }}
                              >
                                Filters wissen
                              </Button>
                            }
                          >
                            Bekijk een andere categorie of zoek naar iets anders.
                          </EmptyState>
                        )
                        : (
                          <List label="Apps" divided>
                            {shown.map((a) => <AppRow key={a.id} app={a} installed={installedIds.has(a.id)} />)}
                          </List>
                        )}
                    </div>
                  </PageSection>
                </>
              )}
            <p className="text-xs text-ink-3">
              <button
                type="button"
                className="underline-offset-2 hover:text-ink hover:underline pointer-coarse:py-3"
                onClick={() => setLegal("voorwaarden")}
              >
                Voorwaarden
              </button>
              {" · "}
              <button
                type="button"
                className="underline-offset-2 hover:text-ink hover:underline pointer-coarse:py-3"
                onClick={() => setLegal("privacy")}
              >
                Privacy
              </button>
              {" · "}
              <button
                type="button"
                className="underline-offset-2 hover:text-ink hover:underline pointer-coarse:py-3"
                onClick={() => setLegal("aanbieders")}
              >
                Aanbiedersprogramma
              </button>
            </p>
          </div>
        )}
      <AppSheet
        app={app}
        item={mine.find((i) => i.app.id === app?.id)}
        canInstall={access.edit}
        onClose={() => setQuery({ app: null })}
      />
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} />
      <LegalDialog tab={legal} onTab={setLegal} />
    </Page>
  )
}

function AppRow({ app, installed }: { readonly app: App; readonly installed: boolean }) {
  return (
    <ListRow
      lead={<Lead app={app} />}
      title={
        <>
          {app.name} <span className="text-ink-3">· {app.listing}</span>
        </>
      }
      meta={app.tagline}
      onClick={() => setQuery({ app: app.id })}
      trail={installed
        ? <Status tone="good">Geïnstalleerd</Status>
        : app.install.kind === "soon"
        ? <Tag>Binnenkort</Tag>
        : <span className="hidden sm:inline">{app.kind}</span>}
    />
  )
}

function AppSheet(
  { app, item, canInstall, onClose }: {
    readonly app: App | undefined
    readonly item: Installed | undefined
    readonly canInstall: boolean
    readonly onClose: () => void
  }
) {
  const s = useStore()
  const [consent, setConsent] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [opening, setOpening] = useState<Installed | null>(null)
  const [scopes, setScopes] = useState<Installed | null>(null)
  const installed = item !== undefined
  const asked = app !== undefined && s.notify.includes(app.id)

  const add = (a: App) => {
    install(a.id)
    setConsent(false)
    toast({
      title: `${a.name} geïnstalleerd`,
      body: a.install.kind === "key"
        ? "De sleutel staat bij Instellingen → API-sleutels; je ziet hem daar één keer."
        : "De eerste gegevens komen binnen een paar minuten binnen.",
      tone: "good",
      action: a.install.kind === "key"
        ? { label: "API-sleutels", onClick: () => navigate(paths.settings("api-sleutels")) }
        : undefined
    })
  }

  return (
    <Sheet
      open={app !== undefined}
      onClose={onClose}
      title={app?.name ?? ""}
      meta={app === undefined ? undefined : `${app.kind} · ${CATEGORY_LABEL[app.category]} · ${app.vendorUrl}`}
      footer={app !== undefined && (
        !canInstall
          ? <Denied area="integrations" need={2} size="inline" />
          : installed
          ? (
            <div className="flex w-full flex-wrap justify-between gap-2">
              <Button variant="danger" onClick={() => setRemoving(true)}>Verwijderen</Button>
              <span className="flex gap-2">
                <Button onClick={() => setScopes(item)}>Rechten</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    markOpened(item.app.id)
                    setOpening(item)
                  }}
                >
                  Openen
                </Button>
              </span>
            </div>
          )
          : app.install.kind === "soon"
          ? (
            <Button
              disabled={asked}
              icon={asked ? <Check /> : undefined}
              onClick={() => {
                set({ ...state, notify: [...state.notify, app.id] })
                toast({ title: "Genoteerd", body: `Je krijgt een melding zodra ${app.name} er is.` })
              }}
            >
              {asked ? "Je krijgt bericht" : "Laat het me weten"}
            </Button>
          )
          : (
            <Button
              variant="primary"
              icon={app.install.kind === "key" ? <Key /> : <Plug />}
              onClick={() => setConsent(true)}
            >
              {app.install.kind === "key" ? "Sleutel maken" : "Koppelen"}
            </Button>
          )
      )}
    >
      {app !== undefined && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <ServiceLogo service={app.id} name={app.name} size={40} />
            <p className="text-md text-pretty text-ink">{app.tagline}</p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-ink-3">Prijs</h3>
            <p className="text-sm text-ink">{app.pricing}</p>
            <p className="text-xs text-ink-3">De aanbieder factureert zelf.</p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-ink-3">Wat het doet</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-ink">
              {app.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={14} className="mt-0.5 shrink-0 text-accent" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <Shield size={13} />
              {installed ? "De app kan" : "De app kan straks"}
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
              {app.scopes.map((sc) => {
                const off = item?.revoked.includes(sc.id) === true
                return (
                  <li key={sc.id} className={off ? "text-ink-3" : undefined}>
                    <span className={off ? "line-through" : undefined}>{sc.label}</span>
                    {off && <span className="pl-1.5 text-xs">· ingetrokken</span>}
                  </li>
                )
              })}
            </ul>
            {app.install.kind === "key" && (
              <p className="text-xs text-pretty text-ink-3">
                De sleutel leest {app.install.areas.length} onderdelen en mag{" "}
                {app.install.write ? "ook schrijven" : "alleen lezen"}. Schrijven geef je later zelf terug.
              </p>
            )}
          </div>
          {app.install.kind === "soon" && (
            <p className="text-sm text-ink-2">{app.name} wordt nog beoordeeld en is binnenkort te installeren.</p>
          )}
        </div>
      )}
      {app !== undefined && (
        <Dialog
          open={consent}
          onClose={() => setConsent(false)}
          lead={<ServiceLogo service={app.id} name={app.name} size={40} />}
          title={app.install.kind === "key" ? `Een sleutel voor ${app.name}` : `${app.name} koppelen`}
          description={app.install.kind === "key"
            ? "Met deze sleutel leest de app de onderdelen hieronder, namens Northwind."
            : `Je gaat naar ${app.vendorUrl} om in te loggen; daarna kan ${app.name} dit:`}
          footer={
            <>
              <Button onClick={() => setConsent(false)}>Annuleren</Button>
              <Button variant="primary" onClick={() => add(app)}>
                {app.install.kind === "key" ? "Sleutel maken" : "Toestaan en koppelen"}
              </Button>
            </>
          }
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink">
            {app.scopes.filter((sc) => app.install.kind !== "key" || app.install.write || !sc.id.endsWith(".write"))
              .map((sc) => <li key={sc.id}>{sc.label}</li>)}
          </ul>
        </Dialog>
      )}
      <AlertDialog
        open={removing}
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          if (app === undefined) return
          const undo = uninstall(app.id)
          setRemoving(false)
          toast({
            title: `${app.name} verwijderd`,
            body: "De toegang is direct gestopt.",
            action: { label: "Ongedaan maken", onClick: undo }
          })
        }}
        title={`${app?.name ?? "De app"} verwijderen?`}
        body="De toegang stopt direct. Data die de app al kopieerde, valt onder de voorwaarden van de aanbieder."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
      />
      <OpenAppDialog item={opening} onClose={() => setOpening(null)} onScopes={setScopes} />
      <ScopesDialog item={scopes} onClose={() => setScopes(null)} />
    </Sheet>
  )
}

function FeedbackDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [category, setCategory] = useState<string>(FEEDBACK_CATEGORIES[0])
  const [message, setMessage] = useState("")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Feedback over de Marketplace"
      description="Het team van Insyte leest alles. Je krijgt antwoord op je e-mailadres."
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={message.trim() === ""}
            onClick={() => {
              setMessage("")
              onClose()
              toast({ title: "Bedankt", body: "Je feedback is verstuurd naar het team van Insyte.", tone: "good" })
            }}
          >
            Versturen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Waarover">
          {(control) => (
            <Select {...control} value={category} onChange={(event) => setCategory(event.target.value)}>
              {FEEDBACK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Je bericht">
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

function LegalDialog({ tab, onTab }: { readonly tab: LegalTab | null; readonly onTab: (t: LegalTab | null) => void }) {
  return (
    <Dialog
      open={tab !== null}
      onClose={() => onTab(null)}
      title="Marketplace-beleid"
      description="De korte versie van hoe apps, je data en aanbieders samenwerken."
    >
      {tab !== null && (
        <div className="flex flex-col gap-4">
          <Tabs
            label="Beleid"
            variant="pill"
            value={tab}
            onChange={onTab}
            tabs={(Object.keys(LEGAL) as Array<LegalTab>).map((t) => ({ value: t, label: LEGAL[t].label }))}
          />
          <div className="flex flex-col gap-3 text-sm text-pretty text-ink-2">
            {LEGAL[tab].body.map((p) => <p key={p}>{p}</p>)}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function thread() {
  return {
    items: [
      { kind: "page" as const, label: "Marketplace" },
      {
        kind: "setting" as const,
        label: "Koppelingen",
        href: paths.settings("koppelingen"),
        meta: "Shopify, Stripe, Meta, Resend"
      },
      { kind: "setting" as const, label: "Apps", href: paths.settings("apps"), meta: "rechten per app" }
    ],
    ask: "Marketplace"
  }
}

/** Marketplace: the area's entry for the shell (`areas.ts`). In the lead's "Meer" menu, so no Menu. */
export const area: AreaDef = { Screen: MarketplaceScreen, thread }
