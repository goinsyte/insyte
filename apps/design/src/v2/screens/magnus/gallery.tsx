import type { ReactNode } from "react"
import { AGENTS } from "../../fixtures/agents.ts"
import { GALLERY, GALLERY_GROUPS } from "../../fixtures/magnus.ts"
import type { AgentTemplate, GalleryGroup } from "../../fixtures/magnus.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { AgentAvatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Sheet } from "../../ui/dialog.tsx"
import { LayoutGrid, Plus } from "../../ui/icons.tsx"
import { GlyphTile } from "../../ui/list.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { dataState, useView } from "../../view.ts"
import { LoadError, LoadingRows } from "./states.tsx"

type Filter = GalleryGroup | "alle"
const isFilter = (x: string | null): x is Filter => GALLERY_GROUPS.some((g) => g.value === x)

/** Starting from a template is a conversation: Magnus asks what to change and writes the agent. */
const start = (template: AgentTemplate) => navigate(paths.newChat(`Nieuwe agent: ${template.name}`))

/**
 * Agentgalerij: agents to start from, each with the job, what starts it and the rules it arrives with
 * (what it does alone, what it asks first, what never), and what the workspace's own records say it
 * would have to do today. Templates the workspace already runs say so and lead to that agent. A row
 * opens the template in a sheet; "Agent maken" starts the conversation in which Magnus writes it.
 */
export function GalleryPage() {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("automations")
  const raw = useQuery("groep")
  const filter: Filter = isFilter(raw) ? raw : "alle"
  const openId = useQuery("sjabloon")
  const open = GALLERY.find((t) => t.id === openId)

  const shown = GALLERY.filter((t) => filter === "alle" || t.group === filter)
  const fresh = shown.filter((t) => t.agentId === undefined)
  const inUse = shown.filter((t) => t.agentId !== undefined)

  const head = (
    <PageHead
      title="Agentgalerij"
      meta="Begin bij een agent met een vaste taak; de instructies en regels pas je daarna aan."
      actions={access.edit && (
        <Button size="sm" icon={<Plus />} onClick={() => navigate(paths.newChat("Nieuwe agent"))}>
          Zelf beschrijven
        </Button>
      )}
    />
  )

  if (!access.view) {
    return (
      <Page width="record">
        {head}
        <Denied area="automations" what="de agents" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record">
        {head}
        <LoadingRows rows={5} label="Galerij laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        {head}
        <LoadError what="De galerij" detail="GET /agents/templates · 503 · req_a81f07" />
      </Page>
    )
  }
  if (state === "empty") {
    return (
      <Page width="record">
        {head}
        <EmptyState
          glyph={LayoutGrid}
          title="De galerij is nog leeg"
          action={<Button onClick={() => navigate(paths.newChat("Nieuwe agent"))}>Zelf beschrijven</Button>}
        >
          Sjablonen komen zodra je winkel gekoppeld is: dan weet Insyte welke agents bij je werk passen. Tot die tijd
          beschrijf je een agent zelf, in een gesprek met Magnus.
        </EmptyState>
      </Page>
    )
  }

  return (
    <Page width="record">
      {head}
      <Tabs
        label="Soort agent"
        value={filter}
        onChange={(next) => setQuery({ groep: next === "alle" ? null : next })}
        tabs={GALLERY_GROUPS}
      />
      {fresh.length > 0 && (
        <PageSection id="galerij-nieuw" title="Nog niet in gebruik" meta={String(fresh.length)}>
          <ul className="flex flex-col gap-1">
            {fresh.map((t) => <TemplateRow key={t.id} template={t} canCreate={access.edit} />)}
          </ul>
        </PageSection>
      )}
      {inUse.length > 0 && (
        <PageSection id="galerij-in-gebruik" title="Al aan het werk bij Northwind" meta={String(inUse.length)}>
          <ul className="flex flex-col gap-1">
            {inUse.map((t) => <TemplateRow key={t.id} template={t} canCreate={access.edit} />)}
          </ul>
        </PageSection>
      )}

      <Sheet
        open={open !== undefined}
        onClose={() => setQuery({ sjabloon: null })}
        title={open?.name ?? ""}
        meta={open?.purpose}
        footer={open !== undefined && <TemplateAction template={open} canCreate={access.edit} />}
      >
        {open !== undefined && <TemplateDetail template={open} />}
      </Sheet>
    </Page>
  )
}

function TemplateRow({ template, canCreate }: { readonly template: AgentTemplate; readonly canCreate: boolean }) {
  const agent = AGENTS.find((a) => a.id === template.agentId)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md py-1 pr-1 transition-colors hover:bg-hover">
      <button
        type="button"
        onClick={() => setQuery({ sjabloon: template.id })}
        className="flex min-w-0 flex-1 basis-72 items-start gap-3 rounded-md px-2 py-2 text-left"
      >
        {agent !== undefined
          ? <AgentAvatar glyph={agent.glyph} size={32} />
          : (
            <GlyphTile size={32}>
              <template.glyph size={16} />
            </GlyphTile>
          )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">{template.name}</span>
          <span className="text-sm text-pretty text-ink-2">{template.purpose}</span>
          <span className="text-xs text-pretty text-ink-3">
            {agent !== undefined
              ? (
                <span className="inline-flex flex-wrap items-center gap-x-2">
                  <Status tone={agent.active ? "good" : "neutral"}>
                    {agent.active ? "aan het werk" : "gepauzeerd"}
                  </Status>
                  <span>
                    · <span className="figure">{agent.runs.toLocaleString("nl-NL")}</span> keer gedaan
                  </span>
                </span>
              )
              : template.evidence ?? template.trigger}
          </span>
        </span>
      </button>
      <span className="pl-13 sm:pl-0">
        <TemplateAction template={template} canCreate={canCreate} />
      </span>
    </li>
  )
}

function TemplateAction({ template, canCreate }: { readonly template: AgentTemplate; readonly canCreate: boolean }) {
  if (template.agentId !== undefined) {
    return <ButtonLink to={paths.agent(template.agentId)} size="sm">Agent openen</ButtonLink>
  }
  if (!canCreate) return <Denied area="automations" need={2} size="inline" />
  return <Button size="sm" variant="primary" onClick={() => start(template)}>Agent maken</Button>
}

function TemplateDetail({ template }: { readonly template: AgentTemplate }) {
  return (
    <div className="flex flex-col gap-6">
      {template.evidence !== undefined && (
        <p className="rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">
          In je winkel nu: <span className="text-ink">{template.evidence}</span>
        </p>
      )}
      <Rules title="Begint bij" items={[template.trigger]} />
      <Rules title="Zelf doen" items={template.zelf} none="Niets: alles wat hij doet, vraagt hij eerst." />
      <Rules title="Eerst vragen" items={template.vragen} none="Niets." />
      <Rules title="Nooit" items={template.nooit} />
      <p className="text-xs text-pretty text-ink-3">
        Dit zijn de regels waarmee de agent begint. Je verandert ze per actie op de pagina van de agent of bij
        Zelfstandigheid; wat geld kost of de winkel laat spreken, staat standaard op Eerst vragen.
      </p>
    </div>
  )
}

function Rules({ title, items, none }: {
  readonly title: string
  readonly items: ReadonlyArray<string>
  readonly none?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-ink-3">{title}</h3>
      {items.length === 0
        ? <p className="text-sm text-ink-3">{none}</p>
        : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => <li key={item} className="text-sm text-pretty text-ink">{item}</li>)}
          </ul>
        )}
    </section>
  )
}
