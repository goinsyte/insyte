import type { ComponentType } from "react"
import type { AreaDef } from "../../areas.ts"
import { article, hooksFor, member, menuCount, roleLabel, ROLES } from "../../fixtures/settings.ts"
import { paths } from "../../router.tsx"
import type { AreaRoute } from "../../router.tsx"
import { MenuGroup, MenuItem } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { ButtonLink } from "../../ui/button.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { useView } from "../../view.ts"
import { AccountScreen } from "./account.tsx"
import { ApiKeysScreen, AppsScreen, IntegrationsScreen, WebhooksScreen } from "./connections.tsx"
import { ArticleScreen, KnowledgeScreen } from "./knowledge.tsx"
import { AgentsMcpScreen, AutonomyScreen, CustomerAgentScreen, LimitsScreen } from "./magnus.tsx"
import { OverviewScreen } from "./overview.tsx"
import { SETTINGS_GROUPS, SETTINGS_PAGES } from "./pages.ts"
import { SettingsPage } from "./parts.tsx"
import { PersonScreen } from "./person.tsx"
import { NotificationsScreen, ShortcutsScreen } from "./personal.tsx"
import { RolesScreen } from "./roles.tsx"
import { DataScreen, PrivacyScreen, SecurityScreen, SettingsLogScreen, TrashScreen } from "./security.tsx"
import { BrandScreen, EmailDomainScreen, ReturnsSettingsScreen, ShippingScreen, TemplatesScreen } from "./store.tsx"
import { TeamScreen } from "./team.tsx"
import { BillingScreen, RegionalScreen, StoresScreen, VatScreen } from "./workspace.tsx"

const SCREENS: Readonly<Record<string, ComponentType>> = {
  profiel: AccountScreen,
  team: TeamScreen,
  rollen: RolesScreen,
  meldingen: NotificationsScreen,
  sneltoetsen: ShortcutsScreen,
  winkels: StoresScreen,
  facturatie: BillingScreen,
  regio: RegionalScreen,
  btw: VatScreen,
  retouren: ReturnsSettingsScreen,
  verzending: ShippingScreen,
  sjablonen: TemplatesScreen,
  huisstijl: BrandScreen,
  "e-mail-en-domein": EmailDomainScreen,
  "ai/zelfstandigheid": AutonomyScreen,
  "ai/klantagent": CustomerAgentScreen,
  "ai/kennisbank": KnowledgeScreen,
  "ai/limieten": LimitsScreen,
  agents: AgentsMcpScreen,
  koppelingen: IntegrationsScreen,
  apps: AppsScreen,
  "api-sleutels": ApiKeysScreen,
  webhooks: WebhooksScreen,
  beveiliging: SecurityScreen,
  privacy: PrivacyScreen,
  gegevens: DataScreen,
  logboek: SettingsLogScreen,
  prullenbak: TrashScreen
}

/** The settings page a route is on: `ai/kennisbank/kb_returns` is on `ai/kennisbank`. */
function pageOf(route: AreaRoute) {
  if (route.base === "team") return SETTINGS_PAGES.find((p) => p.slug === "team")
  const joined = route.path.join("/")
  return SETTINGS_PAGES.toSorted((a, b) => b.slug.length - a.slug.length).find((p) =>
    joined === p.slug || joined.startsWith(`${p.slug}/`)
  )
}

/** The id after the page's own slug: a teammate, a knowledge article. */
function recordOf(route: AreaRoute): string | undefined {
  if (route.base === "team") return route.path[0]
  if (route.path[0] === "ai" && route.path[1] === "kennisbank") return route.path[2]
  return undefined
}

const query = (route: AreaRoute, key: string) => new URLSearchParams(route.search).get(key)

/** The records a settings page is about, after "Instellingen" in the werkdraad. */
function related(slug: string, route: AreaRoute): ReadonlyArray<ThreadItem> {
  switch (slug) {
    case "ai/zelfstandigheid":
      return [
        { kind: "agent", label: "Agents", href: paths.agents, meta: "volgen deze regels" },
        { kind: "page", label: "Logboek", href: paths.log, meta: "wat ze zelf deden" }
      ]
    case "ai/klantagent":
      return [
        { kind: "setting", label: "Kennisbank", href: paths.settings("ai/kennisbank"), meta: "waaruit hij antwoordt" },
        { kind: "page", label: "Winkelchat", href: paths.storeChat }
      ]
    case "ai/limieten":
      return [{ kind: "setting", label: "Zelfstandigheid", href: paths.settings("ai/zelfstandigheid") }]
    case "agents":
      return [
        { kind: "agent", label: "Agents", href: paths.agents },
        { kind: "setting", label: "API-sleutels", href: paths.settings("api-sleutels") }
      ]
    case "team":
      return [
        {
          kind: "person",
          label: "Sofía Kim",
          href: paths.person("sofia-kim"),
          meta: "beantwoordt ticket #5142",
          peek: ["CX-lead"]
        },
        { kind: "setting", label: "Rollen", href: paths.settings("rollen") }
      ]
    case "rollen": {
      const role = ROLES.find((r) => r.id === query(route, "open"))
      return role === undefined
        ? [{ kind: "setting", label: "Team", href: paths.settings("team") }]
        : [{ kind: "setting", label: role.label, meta: role.system ? "systeemrol" : "eigen rol" }, {
          kind: "setting",
          label: "Team",
          href: paths.settings("team")
        }]
    }
    case "retouren":
      return [{ kind: "page", label: "Retouren", href: paths.returns, meta: "de aanvragen zelf" }]
    case "verzending":
      return [{ kind: "page", label: "Bestellingen", href: paths.orders }]
    case "sjablonen":
      return [{ kind: "page", label: "Inbox", href: paths.inbox, meta: "waar de sjablonen staan" }]
    case "winkels":
      return [{ kind: "setting", label: "Koppelingen", href: paths.settings("koppelingen") }]
    case "api-sleutels":
      return [{ kind: "setting", label: "Webhooks", href: paths.settings("webhooks") }]
    case "webhooks": {
      const e = hooksFor("gewoon").find((h) => h.id === query(route, "endpoint"))
      return [
        ...(e === undefined
          ? []
          : [{ kind: "setting" as const, label: e.url.replace(/^https:\/\//, ""), meta: e.description }]),
        { kind: "setting", label: "API-sleutels", href: paths.settings("api-sleutels") }
      ]
    }
    case "facturatie":
      return [{ kind: "setting", label: "Team", href: paths.settings("team"), meta: "wie een plek gebruikt" }]
    case "logboek":
    case "beveiliging":
      return [{ kind: "setting", label: "Rollen", href: paths.settings("rollen") }]
    default:
      return []
  }
}

/** Instellingen: every settings page, and a teammate's page under `/v2/team/:id`. */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const page = pageOf(route)
    const id = recordOf(route)
    if (route.base === "team") return id === undefined ? <TeamScreen /> : <PersonScreen id={id} />
    if (route.path.length === 0) return <OverviewScreen />
    if (page?.slug === "ai/kennisbank" && id !== undefined) return <ArticleScreen id={id} />
    const S = page === undefined ? undefined : SCREENS[page.slug]
    if (S === undefined) {
      return (
        <SettingsPage title="Instellingen" area={null}>
          <EmptyState
            title="Deze instelling bestaat niet"
            action={<ButtonLink to={paths.settings()}>Naar alle instellingen</ButtonLink>}
          >
            Misschien is de link oud. Alle instellingen staan in het menu.
          </EmptyState>
        </SettingsPage>
      )
    }
    return <S />
  },
  thread: (route) => {
    const page = pageOf(route)
    const id = recordOf(route)
    if (route.base === "team" && id !== undefined) {
      const m = member(id)
      const ticket = m?.tickets[0]
      return {
        items: [
          {
            kind: "person",
            label: m?.name ?? "Teamlid",
            meta: m === undefined ? undefined : roleLabel(m.roleId),
            peek: m === undefined ? undefined : [m.doing]
          },
          { kind: "setting", label: "Team", href: paths.settings("team") },
          ...(ticket === undefined
            ? m === undefined ? [] : [{ kind: "page" as const, label: m.focus.label, href: m.focus.href }]
            : [{
              kind: "ticket" as const,
              label: `#${ticket.id} ${ticket.title}`,
              href: paths.ticket(ticket.id),
              meta: ticket.customer
            }])
        ],
        ask: m === undefined ? "Team" : `Team · ${m.name}`
      }
    }
    if (page === undefined) {
      return { items: [{ kind: "setting", label: "Instellingen" }], ask: "Instellingen" }
    }
    if (page.slug === "ai/kennisbank" && id !== undefined) {
      const a = article(id)
      return {
        items: [
          { kind: "setting", label: a?.title ?? "Hoofdstuk" },
          { kind: "setting", label: "Kennisbank", href: paths.settings("ai/kennisbank") },
          { kind: "page", label: "Instellingen", href: paths.settings() }
        ],
        ask: `Kennisbank · ${a?.title ?? "hoofdstuk"}`
      }
    }
    return {
      items: [
        { kind: "setting", label: page.title },
        { kind: "page", label: "Instellingen", href: paths.settings() },
        ...related(page.slug, route)
      ],
      ask: `Instellingen · ${page.title}`
    }
  },
  Menu: ({ route }) => {
    const view = useView()
    const current = route.path.length === 0 && route.base !== "team" ? undefined : pageOf(route)?.slug
    return (
      <>
        {SETTINGS_GROUPS.map((group) => (
          <MenuGroup key={group.title} title={group.title}>
            {group.pages.map((page) => (
              <MenuItem
                key={page.slug}
                to={paths.settings(page.slug)}
                glyph={page.glyph}
                label={page.title}
                count={view.staat === "laden" || view.staat === "fout" ? undefined : menuCount(page.slug, view.staat)}
                active={current === page.slug}
              />
            ))}
          </MenuGroup>
        ))}
      </>
    )
  }
}
