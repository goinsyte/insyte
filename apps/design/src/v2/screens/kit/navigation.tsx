import { useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { STORES } from "../../fixtures/workspace.ts"
import { paths } from "../../router.tsx"
import { MenuGroup, MenuItem, MenuList, RailItem } from "../../shell/nav.tsx"
import { StoreSwitcher } from "../../shell/store-switcher.tsx"
import { Werkdraad } from "../../shell/werkdraad.tsx"
import { Breadcrumbs } from "../../ui/breadcrumbs.tsx"
import { IconButton } from "../../ui/button.tsx"
import { DropdownItem, DropdownLabel, DropdownPanel, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  Archive,
  Copy,
  Edit,
  Home,
  Inbox,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Radio,
  Trash,
  Users
} from "../../ui/icons.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

const RAIL = [
  { id: "start", label: "Start", href: paths.home, glyph: Home },
  { id: "inbox", label: "Inbox", href: paths.section("inbox"), glyph: Inbox, alert: 12 },
  { id: "live", label: "Live", href: paths.live, glyph: Radio },
  { id: "magnus", label: ASSISTANT, href: paths.newChat(), glyph: null }
] as const

export function Navigation() {
  const [rail, setRail] = useState("start")
  const [store, setStore] = useState(STORES[0]?.id ?? "")
  const [tab, setTab] = useState<"open" | "wacht" | "klaar">("open")
  const [pill, setPill] = useState<"dag" | "week" | "maand">("week")
  const [page, setPage] = useState(1)
  return (
    <KitSection
      id="navigatie"
      second="De donkere L en wat erin beweegt."
      title="Navigatie"
      intro="De vaste vorm van de app: de donkere L (winkelkiezer en icoonbalk), het menu ernaast en de hoofdbalk met de werkdraad. Binnen een scherm: tabs, een kruimelpad, pagina's en een menu met acties."
    >
      <Spec
        id="rail"
        title="Icoonbalk en winkelkiezer"
        name="RailItem · StoreSwitcher"
        file="shell/nav.tsx · shell/store-switcher.tsx"
        summary="Eén tegel per gebied op grafiet. Actief is een lichtere tegel en een streepje, niet het accent; de rode telling is wat op je wacht. De winkelkiezer is de kop van de L."
        also="layout/sidebar, layout/store-switcher"
      >
        <States cols={3}>
          <State label="Icoonbalk: druk om te wisselen" surface="rail">
            <ul className="flex items-center gap-2" aria-label="Voorbeeld van de icoonbalk">
              {RAIL.map((section) => (
                <li key={section.id} onClickCapture={(e) => (e.preventDefault(), setRail(section.id))}>
                  <RailItem section={section} active={rail === section.id} />
                </li>
              ))}
            </ul>
          </State>
          <State label="Tegel · hover" surface="rail" force="hover">
            <ul className="flex items-center gap-2" aria-label="Voorbeeld hover">
              <li>
                <RailItem section={RAIL[2]} active={false} />
              </li>
            </ul>
          </State>
          <State label="Winkelkiezer" surface="rail" align="stretch">
            <div className="w-56">
              <StoreSwitcher storeId={store} onChange={setStore} />
            </div>
          </State>
        </States>
      </Spec>

      <Spec
        id="menu"
        title="Menu"
        name="MenuList · MenuGroup · MenuItem"
        file="shell/nav.tsx"
        summary="Het menu naast de icoonbalk, op het paneel. Huidig is de geselecteerde grijstint en vet; tellingen rechts, als cijfers (.figure)."
        also="layout/sidebar nav items"
      >
        <States cols={3}>
          <State label="Menu" surface="panel" align="stretch">
            <MenuList>
              <MenuItem to={paths.newChat()} glyph={Plus} label="Nieuwe chat" active={false} />
              <MenuItem to={paths.agents} glyph={Users} label="Mijn agents" count={7} active />
            </MenuList>
            <MenuGroup title="Recente chats">
              <MenuItem
                to={paths.chat("terugbetalingen")}
                glyph={MessageSquare}
                label="Waarom stegen de terugbetalingen?"
                active={false}
              />
            </MenuGroup>
          </State>
          <State label="Regel · hover" surface="panel" force="hover" align="stretch">
            <MenuList>
              <MenuItem to={paths.section("inbox")} glyph={Inbox} label="Alle tickets" count={48} active={false} />
            </MenuList>
          </State>
          <State label="Regel · focus" surface="panel" force="focus" align="stretch">
            <MenuList>
              <MenuItem to={paths.section("inbox")} glyph={Inbox} label="Alle tickets" count={48} active={false} />
            </MenuList>
          </State>
        </States>
      </Spec>

      <Spec
        id="werkdraad"
        title="Werkdraad"
        anatomy={[
          "Het ding zelf, met zijn icoon",
          "Wat het raakt: leverancier, collega, bestelling, met een korte bijzin",
          "Vraag Magnus, met die context"
        ]}
        name="Werkdraad"
        file="shell/werkdraad.tsx · shell/threads.ts"
        summary="De hoofdbalk zegt waar je bent en wat erbij hoort: het ding zelf, dan wat het raakt, en ‘Vraag Magnus’ met die context. Op een smalle balk vallen eerst de verwante records weg. Hover een record voor een kijkje."
        also="layout/topbar breadcrumbs"
      >
        <States cols={1}>
          <State
            label="In een smalle hoofdbalk: de verwante records krimpen eerst, het ding zelf het laatst"
            align="start"
          >
            <div className="flex h-12 w-full min-w-0 items-center rounded-md bg-bar px-2">
              <Werkdraad
                thread={{
                  ask: "Waarom wordt de Aurora teruggestuurd?",
                  items: [
                    {
                      kind: "product",
                      label: "Aurora Hooded Fleece",
                      peek: ["Product · € 79,00", "212 verkocht deze week"]
                    },
                    {
                      kind: "supplier",
                      label: "Allure Fulfillment",
                      meta: "wijzigde de maattabel · 3 d",
                      peek: ["Leverancier van de Aurora"]
                    },
                    { kind: "person", label: "Sofía Kim", meta: "zag het als eerste", peek: ["CX-lead"] }
                  ]
                }}
              />
            </div>
          </State>
        </States>
      </Spec>

      <Spec
        id="tabs"
        title="Tabs"
        name="Tabs"
        file="ui/tabs.tsx"
        summary="Wisselen tussen delen van één ding. Lijn voor een scherm, pil voor een kleine keuze in een kaart. Pijltjestoetsen gaan langs de tabs; een telling staat erbij."
        also="components/tabs.tsx"
      >
        <States cols={2}>
          <State label="line · met tellingen en een einde" align="stretch">
            <Tabs
              label="Tickets"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "open", label: "Open", count: 23 },
                { value: "wacht", label: "Wacht op klant", count: 8 },
                { value: "klaar", label: "Klaar" }
              ]}
              end={
                <IconButton label="Meer" size="sm">
                  <MoreHorizontal />
                </IconButton>
              }
            />
          </State>
          <State label="pill" align="start">
            <Tabs
              label="Periode"
              variant="pill"
              value={pill}
              onChange={setPill}
              tabs={[{ value: "dag", label: "Dag" }, { value: "week", label: "Week" }, {
                value: "maand",
                label: "Maand"
              }]}
            />
          </State>
          <State label="line · focus" force="focus-current" align="stretch">
            <Tabs
              label="Voorbeeld"
              value="open"
              onChange={() => undefined}
              tabs={[{ value: "open", label: "Overzicht" }, { value: "b", label: "Activiteit" }, {
                value: "c",
                label: "Instellingen"
              }]}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="breadcrumbs"
        title="Kruimelpad"
        name="Breadcrumbs"
        file="ui/breadcrumbs.tsx"
        summary="Alleen waar je diep in een record zit en de werkdraad niet genoeg zegt, zoals in instellingen. Het laatste stuk is de pagina zelf en geen link."
        also="components/breadcrumb.tsx"
      >
        <States cols={2}>
          <State label="Drie niveaus" align="start">
            <Breadcrumbs
              items={[
                { label: "Instellingen", href: paths.section("instellingen") },
                { label: "Koppelingen", href: paths.section("instellingen", "koppelingen") },
                { label: "Shopify" }
              ]}
            />
          </State>
          <State label="Lang, smal" align="start">
            <div className="w-56">
              <Breadcrumbs
                items={[
                  { label: "Leveranciers", href: paths.section("leveranciers") },
                  { label: "Kestrel Goods", href: RECORD_HREF },
                  { label: "Bestellingen langer dan 5 dagen onderweg" }
                ]}
              />
            </div>
          </State>
        </States>
      </Spec>

      <Spec
        id="pagination"
        title="Pagina's"
        name="Pagination"
        file="ui/pagination.tsx"
        summary="Onder een lange lijst: waar je bent in woorden en cijfers, vorige en volgende. Uit aan het begin en het einde."
        also="components/pagination.tsx, data-table pagination"
      >
        <States cols={2}>
          <State label="Druk om te bladeren" align="stretch">
            <Pagination page={page} pageSize={25} total={312} onChange={setPage} />
          </State>
          <State label="Laatste pagina" align="stretch">
            <Pagination page={13} pageSize={25} total={312} onChange={() => undefined} />
          </State>
        </States>
      </Spec>

      <Spec
        id="dropdown"
        title="Menu met acties"
        name="DropdownMenu · DropdownItem"
        file="ui/dropdown.tsx"
        summary="Acties op een ding, achter de drie puntjes. Pijltjes, Home en End gaan langs de regels; Escape sluit en geeft de focus terug. Weghalen staat onderaan, in rood, na een lijn."
        also="components/dropdown-menu.tsx, context menus"
      >
        <States cols={3}>
          <State label="Open, statisch getekend" align="start" surface="desk" inert>
            <DropdownPanel label="Acties">
              <DropdownItem glyph={Edit} shortcut="E">Naam wijzigen</DropdownItem>
              <DropdownItem glyph={Copy}>Dupliceren</DropdownItem>
              <DropdownItem glyph={Archive} disabled hint="al gearchiveerd">Archiveren</DropdownItem>
              <DropdownSeparator />
              <DropdownItem glyph={Trash} tone="danger">Weghalen</DropdownItem>
            </DropdownPanel>
          </State>
          <State label="Met vinkjes en een kop" align="start" surface="desk">
            <DropdownPanel label="Weergave">
              <DropdownLabel>Toon kolommen</DropdownLabel>
              <DropdownItem checked>Klant</DropdownItem>
              <DropdownItem checked>Vervoerder</DropdownItem>
              <DropdownItem checked={false}>Labels</DropdownItem>
            </DropdownPanel>
          </State>
          <State label="Regel · hover" align="start" surface="desk" force="hover">
            <DropdownPanel label="Voorbeeld">
              <DropdownItem glyph={Edit}>Naam wijzigen</DropdownItem>
            </DropdownPanel>
          </State>
        </States>
        <Rule>Het werkende menu staat onder Overlays, en in de hoofdbalk achter Nieuw en je avatar.</Rule>
      </Spec>
    </KitSection>
  )
}

const RECORD_HREF = "/v2/leveranciers/kestrel-goods"
