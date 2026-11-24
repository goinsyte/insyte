import { useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  automationCounts,
  CATEGORY_LABEL,
  recommended,
  template,
  TEMPLATES,
  usesAi,
  viaOf
} from "../../fixtures/automations.ts"
import type { Automation, Template, TemplateCategory } from "../../fixtures/automations.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { Button } from "../../ui/button.tsx"
import { Dialog, Sheet } from "../../ui/dialog.tsx"
import { ChevronRight, LayoutTemplate, Plus, Sparkles, Workflow } from "../../ui/icons.tsx"
import { SearchField, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { chain, FlowStatusLabel, KIND_GLYPH, RunSheet, RunsTable } from "./parts.tsx"
import { createDraft, useFlows, useRuns } from "./store.ts"

export type ListView = "alle" | "concepten" | "ai" | "geschiedenis" | "sjablonen" | "aanbevolen"

export const VIEWS: ReadonlyArray<ListView> = ["alle", "concepten", "ai", "geschiedenis", "sjablonen", "aanbevolen"]

const TITLE: Readonly<Record<ListView, string>> = {
  alle: "Automatiseringen",
  concepten: "Concepten",
  ai: "Met AI-stappen",
  geschiedenis: "Geschiedenis",
  sjablonen: "Sjablonen",
  aanbevolen: "Aanbevolen"
}

type StatusFilter = "alle" | "actief" | "gepauzeerd" | "concept"

/**
 * Automatiseringen: the flows, their runs and the library they start from, in the views of the
 * menu (`?view=`). Rebuilt from `/app/automations` (`automations-screen.tsx`, `library.tsx`). "Nieuwe
 * automatisering" (and the shell's Nieuw menu, `?nieuw=1`) starts one from a template, empty, or by
 * describing it to the assistant.
 */
export function AutomationsList({ view }: { readonly view: ListView }) {
  const access = useAccess("automations")
  const state = dataState(useView())
  const flows = useFlows()
  const runs = useRuns()
  const creating = useQuery("nieuw") === "1"
  const counts = automationCounts(flows, runs)

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title={TITLE[view]} />
        <Denied area="automations" what="de automatiseringen" />
      </Page>
    )
  }

  const meta = view === "sjablonen"
    ? `${counts.templates} sjablonen · elk maakt een concept`
    : view === "aanbevolen"
    ? `${counts.recommended} de moeite waard om in te stellen, volgens je eigen gegevens`
    : view === "geschiedenis"
    ? `${counts.history} recente ${counts.history === 1 ? "uitvoering" : "uitvoeringen"}`
    : view === "concepten"
    ? `${counts.drafts} ${counts.drafts === 1 ? "concept" : "concepten"} · niet actief`
    : view === "ai"
    ? `${counts.ai} ${counts.ai === 1 ? "flow laat" : "flows laten"} ${ASSISTANT} iets opstellen of lezen`
    : `${counts.active} actief · ${counts.paused} gepauzeerd · ${counts.drafts} ${
      counts.drafts === 1 ? "concept" : "concepten"
    }`

  return (
    <Page>
      <PageHead
        title={TITLE[view]}
        meta={state === "ready" ? meta : undefined}
        actions={access.edit && (
          <Button variant="primary" icon={<Plus />} onClick={() => setQuery({ nieuw: "1" })}>
            Nieuwe automatisering
          </Button>
        )}
      />
      {state === "loading"
        ? <ListSkeleton />
        : state === "error"
        ? (
          <ErrorState
            title="De automatiseringen kwamen niet binnen"
            detail="GET /v1/automations · 503 · verzoek a7f3c2"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Er draait niets anders door: flows die aan staan, blijven gewoon lopen.
          </ErrorState>
        )
        : view === "sjablonen"
        ? <Templates canEdit={access.edit} />
        : view === "aanbevolen"
        ? <Recommended flows={flows} canEdit={access.edit} />
        : view === "geschiedenis"
        ? <History flows={flows} canEdit={access.edit} />
        : flows.length === 0
        ? <FirstDay canEdit={access.edit} />
        : (
          <Flows
            flows={view === "concepten"
              ? flows.filter((a) => a.status === "concept")
              : view === "ai"
              ? flows.filter(usesAi)
              : flows}
            view={view}
          />
        )}
      <NewAutomation open={creating} onClose={() => setQuery({ nieuw: null })} canEdit={access.edit} />
    </Page>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Automatiseringen laden" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-72" />
      <div className="flex flex-col">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-6 border-b border-line">
            <span className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3" style={{ width: `${40 + ((i * 13) % 30)}%` }} />
              <Skeleton className="h-2.5 w-1/4" />
            </span>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── the flows ─────────────────────────────────────────────────────────────────────────────────── */

function Flows({ flows, view }: { readonly flows: ReadonlyArray<Automation>; readonly view: ListView }) {
  const [search, setSearch] = useState("")
  const status = (useQuery("status") ?? "alle") as StatusFilter
  const q = search.trim().toLowerCase()
  const shown = flows
    .filter((a) => view !== "alle" || status === "alle" || a.status === status)
    .filter((a) => q === "" || `${a.name} ${chain(a.steps)} ${viaOf(a).join(" ")}`.toLowerCase().includes(q))
    .toSorted((a, b) => b.runs30 - a.runs30)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          label="Zoek in automatiseringen"
          placeholder="Zoek op flow, trigger of koppeling"
          className="w-full sm:w-80"
        />
        {view === "alle" && (
          <Segmented
            label="Status"
            size="sm"
            value={status}
            onChange={(next) => setQuery({ status: next === "alle" ? null : next })}
            options={[
              { value: "alle", label: "Alle" },
              { value: "actief", label: "Actief" },
              { value: "gepauzeerd", label: "Gepauzeerd" },
              { value: "concept", label: "Concept" }
            ]}
          />
        )}
      </div>
      {shown.length === 0
        ? (
          <EmptyState
            size="sm"
            glyph={Workflow}
            title={view === "concepten"
              ? "Geen concepten"
              : view === "ai"
              ? "Geen flow met een AI-stap"
              : "Geen flow past bij deze zoekopdracht"}
            action={view === "alle"
              ? (
                <Button
                  onClick={() => {
                    setSearch("")
                    setQuery({ status: null })
                  }}
                >
                  Filters wissen
                </Button>
              )
              : <Button onClick={() => navigate(`${paths.automations}?view=sjablonen`)}>Sjablonen bekijken</Button>}
          >
            {view === "ai"
              ? "Voeg in de editor een AI-stap toe: een antwoord opstellen, het sentiment lezen of een gesprek samenvatten."
              : view === "concepten"
              ? "Een nieuwe automatisering begint als concept en draait pas als je hem publiceert."
              : "Probeer een ander woord, of zet het statusfilter op Alle."}
          </EmptyState>
        )
        : (
          <Table label="Automatiseringen" minWidth={880}>
            <THead>
              <Th>Flow</Th>
              <Th>Koppelingen</Th>
              <Th>Status</Th>
              <Th align="right">30 dagen</Th>
              <Th align="right">Totaal</Th>
              <Th>Laatst</Th>
            </THead>
            <TBody>
              {shown.map((a) => (
                <Tr key={a.id} onOpen={() => navigate(paths.automation(a.id))}>
                  <Td header>
                    <Link
                      to={paths.automation(a.id)}
                      className="flex max-w-[34rem] flex-col py-2 hover:[&>span:first-child]:underline"
                    >
                      <span className="truncate font-medium text-ink underline-offset-2">{a.name}</span>
                      <span className="truncate text-xs text-ink-3">{chain(a.steps)}</span>
                    </Link>
                  </Td>
                  <Td muted>
                    <span className="flex items-center gap-2">
                      {viaOf(a).length > 0 && (
                        <span className="flex items-center gap-1">
                          {viaOf(a).map((via) => <ServiceLogo key={via} service={via} name={via} size={18} />)}
                        </span>
                      )}
                      {["Insyte", ...viaOf(a)].join(", ")}
                    </span>
                  </Td>
                  <Td>
                    <FlowStatusLabel status={a.status} />
                  </Td>
                  <Td figure>{a.runs30.toLocaleString("nl-NL")}</Td>
                  <Td figure muted>{a.runs.toLocaleString("nl-NL")}</Td>
                  <Td muted className="whitespace-nowrap">{a.lastRun ?? "Nog nooit"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      {view === "alle" && <Suggested flows={flows} />}
    </div>
  )
}

/** Under the list: the one or two templates the records say would have work, so the next flow is a click away. */
function Suggested({ flows }: { readonly flows: ReadonlyArray<Automation> }) {
  const access = useAccess("automations")
  const items = recommended(flows).slice(0, 3)
  if (items.length === 0 || !access.edit) return null
  return (
    <PageSection
      title="De moeite waard om in te stellen"
      id="aanbevolen-kort"
      className="pt-6"
      actions={
        <Link
          to={`${paths.automations}?view=aanbevolen`}
          className="text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          Alle aanbevolen
        </Link>
      }
    >
      <List label="Aanbevolen sjablonen">
        {items.map((t) => (
          <ListRow
            key={t.id}
            padded={false}
            lead={<TemplateGlyph t={t} />}
            title={t.name}
            meta={t.evidence?.line}
            onClick={() => setQuery({ sjabloon: t.id })}
            trail={<ChevronRight size={15} className="text-ink-4" />}
          />
        ))}
      </List>
      <TemplateSheet canEdit={access.edit} />
    </PageSection>
  )
}

function TemplateGlyph({ t }: { readonly t: Template }) {
  const G = KIND_GLYPH.trigger
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-md bg-well text-ink-2" aria-hidden="true">
      {t.steps.some((st) =>
          st.type.startsWith("ai_")
        )
        ? <Sparkles size={15} />
        : <G size={15} />}
    </span>
  )
}

/* ── the first day ─────────────────────────────────────────────────────────────────────────────── */

function FirstDay({ canEdit }: { readonly canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <EmptyState
        glyph={Workflow}
        title="Nog geen automatiseringen"
        action={canEdit && (
          <>
            <Button variant="primary" onClick={() => setQuery({ nieuw: "1" })}>Nieuwe automatisering</Button>
            <Button onClick={() => navigate(`${paths.automations}?view=sjablonen`)}>Sjablonen bekijken</Button>
          </>
        )}
      >
        Een automatisering let op iets, zoals een bestelling die te laat is of een geschil dat opent, en doet dan de
        volgende stappen voor je. Begin met een sjabloon of beschrijf wat je wilt. Niets gaat vanzelf aan.
      </EmptyState>
      {canEdit && (
        <PageSection title="Begin met een sjabloon" id="eerste-sjablonen" className="mx-auto w-full max-w-2xl">
          <List label="Sjablonen">
            {TEMPLATES.slice(0, 4).map((t) => (
              <ListRow
                key={t.id}
                padded={false}
                lead={<TemplateGlyph t={t} />}
                title={t.name}
                meta={t.description}
                onClick={() => setQuery({ sjabloon: t.id })}
                trail={<ChevronRight size={15} className="text-ink-4" />}
              />
            ))}
          </List>
          <TemplateSheet canEdit={canEdit} />
        </PageSection>
      )}
    </div>
  )
}

/* ── the library ───────────────────────────────────────────────────────────────────────────────── */

function Templates({ canEdit }: { readonly canEdit: boolean }) {
  const groups = Object.keys(CATEGORY_LABEL) as ReadonlyArray<TemplateCategory>
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <p className="max-w-[62ch] text-sm text-pretty text-ink-2">
        Een sjabloon is alleen stappen: gebruiken maakt een concept dat je aanpast, en niets draait tot je het
        publiceert.
      </p>
      {groups.map((g) => {
        const items = TEMPLATES.filter((t) => t.category === g)
        if (items.length === 0) return null
        return (
          <PageSection key={g} title={CATEGORY_LABEL[g]} meta={items.length} id={`sjablonen-${g}`}>
            <List label={CATEGORY_LABEL[g]}>
              {items.map((t) => (
                <ListRow
                  key={t.id}
                  padded={false}
                  lead={<TemplateGlyph t={t} />}
                  title={t.name}
                  meta={t.description}
                  onClick={() => setQuery({ sjabloon: t.id })}
                  trail={<ChevronRight size={15} className="text-ink-4" />}
                />
              ))}
            </List>
          </PageSection>
        )
      })}
      <TemplateSheet canEdit={canEdit} />
    </div>
  )
}

function Recommended({ flows, canEdit }: { readonly flows: ReadonlyArray<Automation>; readonly canEdit: boolean }) {
  const items = recommended(flows)
  if (items.length === 0) {
    return (
      <EmptyState glyph={LayoutTemplate} title="Niets aanbevolen">
        Een sjabloon verschijnt hier als je bestellingen, voorraad of geschillen laten zien dat het werk zou hebben, en
        nog geen actieve flow dat doet.
      </EmptyState>
    )
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="max-w-[62ch] text-sm text-pretty text-ink-2">
        Volgens de bestellingen, klanten en geschillen van Northwind zouden deze flows nu werk hebben, en nog geen
        actieve automatisering doet het.
      </p>
      <List label="Aanbevolen">
        {items.map((t) => (
          <ListRow
            key={t.id}
            padded={false}
            lead={<TemplateGlyph t={t} />}
            title={t.name}
            meta={t.evidence?.line}
            onClick={() => setQuery({ sjabloon: t.id })}
            trail={<span className="figure text-sm text-ink">{t.evidence?.count.toLocaleString("nl-NL")}</span>}
          />
        ))}
      </List>
      <TemplateSheet canEdit={canEdit} />
    </div>
  )
}

/** A template opened from the library (`?sjabloon=`): what it does, its steps, and "Gebruiken". */
function TemplateSheet({ canEdit }: { readonly canEdit: boolean }) {
  const id = useQuery("sjabloon")
  const t = id === null ? undefined : template(id)
  if (t === undefined) return null
  const use = () => {
    const made = createDraft(t.id)
    toast({
      title: `Concept opgesteld vanuit ‘${t.name}’`,
      body: "Het draait pas als je het publiceert.",
      tone: "good"
    })
    navigate(paths.automation(made))
  }
  return (
    <Sheet
      open
      onClose={() => setQuery({ sjabloon: null })}
      title={t.name}
      meta={`Sjabloon · ${CATEGORY_LABEL[t.category]}`}
      footer={canEdit
        ? <Button variant="primary" onClick={use}>Sjabloon gebruiken</Button>
        : <Denied area="automations" need={2} size="inline" />}
    >
      <div className="flex flex-col gap-6">
        <p className="text-sm text-pretty text-ink-2">{t.description}</p>
        {t.evidence !== null && (
          <p className="rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">
            <span className="font-medium text-ink">In je eigen gegevens.</span> {t.evidence.line}
          </p>
        )}
        <section aria-labelledby="sjabloon-stappen" className="flex flex-col gap-2">
          <h3 id="sjabloon-stappen" className="text-sm font-semibold text-ink">Stappen</h3>
          <ol className="flex flex-col">
            {t.steps.map((st, i) => (
              <li key={st.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="figure w-4 shrink-0 text-xs text-ink-3">{i + 1}</span>
                <span className="text-ink">{st.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Sheet>
  )
}

/* ── the history ───────────────────────────────────────────────────────────────────────────────── */

function History({ flows, canEdit }: { readonly flows: ReadonlyArray<Automation>; readonly canEdit: boolean }) {
  const runs = useRuns()
  const [cut, setCut] = useState<"alle" | "mislukt" | "wacht">("alle")
  const openId = useQuery("run")
  const shown = runs.filter((r) => cut === "alle" || r.status === cut)
  const open = runs.find((r) => r.id === openId) ?? null
  if (runs.length === 0) {
    return (
      <EmptyState glyph={Workflow} title="Nog geen uitvoeringen">
        Hier staat elke uitvoering zodra een gepubliceerde flow zijn trigger ziet afgaan.
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Uitvoeringen tonen"
        size="sm"
        value={cut}
        onChange={setCut}
        options={[{ value: "alle", label: "Alle" }, { value: "mislukt", label: "Mislukt" }, {
          value: "wacht",
          label: "Wacht"
        }]}
      />
      {shown.length === 0
        ? (
          <EmptyState
            size="sm"
            title="Geen uitvoeringen in deze selectie"
            action={<Button onClick={() => setCut("alle")}>Alle tonen</Button>}
          />
        )
        : (
          <RunsTable
            runs={shown}
            flows={flows}
            showFlow
            label="Uitvoeringen van alle automatiseringen"
            onOpen={(run) => setQuery({ run: run.id })}
          />
        )}
      <RunSheet
        run={open}
        flow={flows.find((a) => a.id === open?.automationId)}
        onClose={() => setQuery({ run: null })}
        canEdit={canEdit}
      />
    </div>
  )
}

/* ── a new one ─────────────────────────────────────────────────────────────────────────────────── */

/** Nieuwe automatisering: describe it to the assistant, pick a template, or start empty. */
function NewAutomation({ open, onClose, canEdit }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly canEdit: boolean
}) {
  const [text, setText] = useState("")
  const start = (templateId?: string) => {
    const id = createDraft(templateId)
    onClose()
    navigate(paths.automation(id))
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuwe automatisering"
      description="Een automatisering begint als concept. Niets draait tot je hem publiceert."
      size="lg"
      footer={canEdit && (
        <>
          <Button variant="ghost" onClick={() => start()}>Leeg beginnen</Button>
          <Button
            variant="primary"
            icon={<Sparkles />}
            disabled={text.trim() === ""}
            onClick={() => {
              onClose()
              navigate(paths.newChat(`Nieuwe automatisering: ${text.trim()}`))
            }}
          >
            Met {ASSISTANT} opstellen
          </Button>
        </>
      )}
    >
      {!canEdit
        ? <Denied area="automations" need={2} size="section" what="automatiseringen" />
        : (
          <div className="flex flex-col gap-6">
            <label className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <MagnusMark size={16} />
                Beschrijf in één zin wat er moet gebeuren
              </span>
              <Textarea
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Als een bestelling van Kestrel Goods 5 dagen onderweg is, mail de klant met de nieuwe leverdatum."
              />
              <span className="text-xs text-ink-3">
                {ASSISTANT} zet de stappen klaar als concept; jij kijkt ze na en publiceert.
              </span>
            </label>
            <section aria-labelledby="nieuw-sjablonen" className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="nieuw-sjablonen" className="text-sm font-semibold text-ink">Of begin met een sjabloon</h3>
                <Link
                  to={`${paths.automations}?view=sjablonen`}
                  onClick={onClose}
                  className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
                >
                  Alle {TEMPLATES.length} sjablonen
                </Link>
              </div>
              <List label="Sjablonen">
                {TEMPLATES.slice(0, 5).map((t) => (
                  <ListRow
                    key={t.id}
                    padded={false}
                    lead={<TemplateGlyph t={t} />}
                    title={t.name}
                    meta={t.evidence?.line ?? t.description}
                    onClick={() => start(t.id)}
                    trail={<ChevronRight size={15} className="text-ink-4" />}
                  />
                ))}
              </List>
            </section>
          </div>
        )}
    </Dialog>
  )
}
