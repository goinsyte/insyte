import type { AreaDef } from "../../areas.ts"
import { automationCounts, BUSY, SEED, SEED_RUNS } from "../../fixtures/automations.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths, useQuery } from "../../router.tsx"
import type { AreaRoute } from "../../router.tsx"
import { MenuButton, MenuFoot, MenuItem, MenuList } from "../../shell/nav.tsx"
import type { Thread, ThreadItem } from "../../shell/threads.ts"
import { Edit, History, LayoutTemplate, Plus, Sparkles, Star, Workflow } from "../../ui/icons.tsx"
import { AutomationScreen } from "./flow.tsx"
import { AutomationsList, VIEWS } from "./list.tsx"
import type { ListView } from "./list.tsx"
import { useFlows, useRuns } from "./store.ts"

const viewOf = (search: string): ListView => {
  const v = new URLSearchParams(search).get("view")
  return VIEWS.find((x) => x === v) ?? "alle"
}

function thread(route: AreaRoute): Thread {
  const [id] = route.path
  if (id === undefined) {
    const failing = SEED_RUNS.find((r) => r.status === "mislukt")
    const flow = SEED.find((a) => a.id === failing?.automationId)
    const items: Array<ThreadItem> = [{ kind: "page", label: "Automatiseringen" }]
    if (flow !== undefined && failing !== undefined) {
      items.push({
        kind: "automation",
        label: flow.name,
        href: `${paths.automation(flow.id)}?tab=uitvoeringen&run=${failing.id}`,
        meta: `1 mislukt · ${failing.record?.label ?? ""}`,
        peek: [failing.failed?.why ?? "Een uitvoering mislukte", "Opnieuw uitvoeren kan vanuit de run"]
      })
    }
    items.push({
      kind: "automation",
      label: "Lage voorraad → concept-nabestelling",
      href: paths.automation("lage-voorraad"),
      meta: "concept van Ethan",
      peek: ["Nog niet gepubliceerd", "Sequoia Flannel heeft er nog 12"]
    })
    return { items, ask: "Automatiseringen" }
  }
  const flow = [...SEED, ...BUSY].find((a) => a.id === id)
  if (flow === undefined) {
    return { items: [{ kind: "automation", label: "Nieuwe automatisering" }], ask: "Nieuwe automatisering" }
  }
  const editor = PEOPLE[flow.editedBy]
  return {
    items: [
      { kind: "automation", label: flow.name },
      ...flow.touches.slice(0, 3).map((t): ThreadItem => ({
        kind: t.kind === "page" ? "page" : t.kind,
        label: t.label,
        href: t.href,
        meta: t.meta
      })),
      {
        kind: "person",
        label: editor.name,
        href: paths.person(editor.id),
        meta: `wijzigde de flow · ${flow.editedAt}`,
        peek: [editor.role, flow.versions[0]?.note ?? "Nog niet gepubliceerd"]
      }
    ],
    ask: `Automatisering ${flow.name}`
  }
}

function Menu({ pathname }: { readonly pathname: string }) {
  const flows = useFlows()
  const runs = useRuns()
  const counts = automationCounts(flows, runs)
  const view = useQuery("view")
  const on = (v: string | null) => pathname === paths.automations && view === v
  return (
    <>
      <MenuList>
        <MenuItem
          to={paths.automations}
          glyph={Workflow}
          label="Alle automatiseringen"
          count={counts.all}
          active={on(null)}
        />
        <MenuItem
          to={`${paths.automations}?view=concepten`}
          glyph={Edit}
          label="Concepten"
          count={counts.drafts}
          active={on("concepten")}
        />
        <MenuItem
          to={`${paths.automations}?view=ai`}
          glyph={Sparkles}
          label="Met AI-stappen"
          count={counts.ai}
          active={on("ai")}
        />
        <MenuItem
          to={`${paths.automations}?view=geschiedenis`}
          glyph={History}
          label="Geschiedenis"
          hint={counts.failed > 0 ? `${counts.failed} mislukt` : undefined}
          active={on("geschiedenis")}
        />
        <MenuItem
          to={`${paths.automations}?view=sjablonen`}
          glyph={LayoutTemplate}
          label="Sjablonen"
          count={counts.templates}
          active={on("sjablonen")}
        />
        <MenuItem
          to={`${paths.automations}?view=aanbevolen`}
          glyph={Star}
          label="Aanbevolen"
          count={counts.recommended}
          active={on("aanbevolen")}
        />
      </MenuList>
      <MenuFoot>
        <MenuButton to={`${paths.automations}?nieuw=1`} glyph={Plus} label="Nieuwe automatisering" />
      </MenuFoot>
    </>
  )
}

/** Automatiseringen: the area's entry for the shell (`areas.ts`). */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const [id] = route.path
    return id === undefined ? <AutomationsList view={viewOf(route.search)} /> : <AutomationScreen id={id} />
  },
  thread,
  Menu
}
