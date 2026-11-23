import { useMemo, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { AGENTS } from "../../fixtures/agents.ts"
import { ORDER_TOTAL, ORDERS, STATUS } from "../../fixtures/orders.ts"
import type { Order } from "../../fixtures/orders.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths } from "../../router.tsx"
import { Accordion, Disclosure } from "../../ui/accordion.tsx"
import { AgentAvatar, Avatar, AvatarStack } from "../../ui/avatar.tsx"
import { Alert, Count, RecordLabel, Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Card, CardHead } from "../../ui/card.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { AddFilter, ColumnPicker, FilterChip, ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption, FilterField } from "../../ui/filters.tsx"
import {
  Archive,
  Bot,
  CreditCard,
  Download,
  Factory,
  Mail,
  Package,
  RotateCcw,
  TagGlyph,
  Truck,
  Zap
} from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { Stat } from "../../ui/stat.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Stepper } from "../../ui/stepper.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import { toast } from "../../ui/toast.tsx"
import { DoDont, KitSection, Rule, Spec, State, States } from "./frame.tsx"

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const FIELDS: ReadonlyArray<FilterField> = [
  { key: "status", label: "Status", glyph: TagGlyph, options: Object.values(STATUS).map((s) => s.label) },
  { key: "carrier", label: "Vervoerder", glyph: Truck, options: ["PostNL", "DPD", "DHL"] },
  { key: "product", label: "Product", glyph: Package, options: [...new Set(ORDERS.map((o) => o.product))] }
]

const COLUMNS: ReadonlyArray<ColumnOption> = [
  { key: "number", label: "Bestelling", locked: true },
  { key: "customer", label: "Klant" },
  { key: "product", label: "Product" },
  { key: "carrier", label: "Vervoerder" },
  { key: "status", label: "Status" },
  { key: "labels", label: "Labels" },
  { key: "total", label: "Totaal" }
]

const matches = (order: Order, field: string, value: string) =>
  field === "status"
    ? STATUS[order.status].label === value
    : field === "carrier"
    ? order.carrier === value
    : order.product === value

/** The whole list pattern: search, filters, columns, selection with bulk actions, sort, pages, empty. */
function OrdersList() {
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<ReadonlyArray<{ field: string; value: string }>>([{
    field: "status",
    value: "Vertraagd"
  }])
  const [visible, setVisible] = useState<ReadonlySet<string>>(
    new Set(["number", "customer", "product", "carrier", "status", "total"])
  )
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [sort, setSort] = useState<{ key: "placed" | "total"; dir: Exclude<Sort, null> }>({
    key: "placed",
    dir: "desc"
  })
  const [page, setPage] = useState(1)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const shown = ORDERS.filter((o) =>
      (q === "" || `${o.number} ${o.customer} ${o.product}`.toLowerCase().includes(q))
      && filters.every((f) => matches(o, f.field, f.value))
    )
    const dir = sort.dir === "asc" ? 1 : -1
    return shown.toSorted((a, b) =>
      sort.key === "total" ? (a.total - b.total) * dir : (Number(a.number) - Number(b.number)) * dir
    )
  }, [query, filters, sort])

  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someOn = rows.some((r) => selected.has(r.id))
  const toggleSort = (key: "placed" | "total") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const show = (key: string) => visible.has(key)
  const clearAll = () => {
    setQuery("")
    setFilters([])
  }

  return (
    <div className="flex flex-col">
      <ListToolbar
        start={
          <>
            <div className="w-full sm:w-64">
              <SearchField
                label="Bestellingen zoeken"
                value={query}
                onChange={setQuery}
                placeholder="Zoek op nummer of klant"
                shortcut="/"
              />
            </div>
            {filters.map((f) => (
              <FilterChip
                key={`${f.field}-${f.value}`}
                field={FIELDS.find((x) => x.key === f.field)?.label ?? f.field}
                value={f.value}
                onRemove={() => setFilters((all) => all.filter((x) => x !== f))}
              />
            ))}
            <AddFilter
              fields={FIELDS}
              active={new Set(filters.map((f) => f.field))}
              onAdd={(field, value) => setFilters((all) => [...all, { field, value }])}
            />
          </>
        }
        end={
          <>
            <ColumnPicker columns={COLUMNS} visible={visible} onChange={setVisible} />
            <Button
              size="sm"
              icon={<Download />}
              onClick={() => toast({ title: "Export gestart", body: "Je krijgt een mail als het bestand klaar is." })}
            >
              Exporteren
            </Button>
          </>
        }
      />
      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          noun={["bestelling", "bestellingen"]}
          onClear={() => setSelected(new Set())}
        >
          <SelectionAction
            icon={<Mail />}
            onClick={() => toast({ title: `${selected.size} klanten gemaild`, tone: "good" })}
          >
            Klant mailen
          </SelectionAction>
          <SelectionAction icon={<TagGlyph />}>Label geven</SelectionAction>
          <SelectionAction icon={<Archive />} tone="danger">Archiveren</SelectionAction>
        </SelectionBar>
      )}
      {rows.length === 0
        ? (
          <EmptyState
            glyph={Package}
            title="Geen bestellingen die hierbij passen"
            action={<Button size="sm" onClick={clearAll}>Filters wissen</Button>}
            className="py-14"
          >
            Probeer een andere zoekterm of haal een filter weg.
          </EmptyState>
        )
        : (
          <Table label="Bestellingen" minWidth={700}>
            <THead>
              <Th width={44}>
                <RowCheckbox
                  label="Alles op deze pagina kiezen"
                  checked={allOn}
                  indeterminate={!allOn && someOn}
                  onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </Th>
              <Th sort={sort.key === "placed" ? sort.dir : null} onSort={() => toggleSort("placed")}>Bestelling</Th>
              {show("customer") && <Th>Klant</Th>}
              {show("product") && <Th>Product</Th>}
              {show("carrier") && <Th>Vervoerder</Th>}
              {show("status") && <Th>Status</Th>}
              {show("labels") && <Th>Labels</Th>}
              {show("total") && (
                <Th
                  align="right"
                  sort={sort.key === "total" ? sort.dir : null}
                  onSort={() => toggleSort("total")}
                >
                  Totaal
                </Th>
              )}
            </THead>
            <TBody>
              {rows.map((o) => (
                <Tr
                  key={o.id}
                  selected={selected.has(o.id)}
                  onOpen={() => toast({ title: `Bestelling #${o.number}`, body: "Het bestellingscherm komt later." })}
                >
                  <Td>
                    <RowCheckbox
                      label={`Bestelling ${o.number} kiezen`}
                      checked={selected.has(o.id)}
                      onChange={(on) =>
                        setSelected((s) => {
                          const next = new Set(s)
                          if (on) next.add(o.id)
                          else next.delete(o.id)
                          return next
                        })}
                    />
                  </Td>
                  <Td header figure>
                    #{o.number}
                    <span className="ml-2 text-xs font-normal text-ink-3">{o.placed}</span>
                  </Td>
                  {show("customer") && (
                    <Td>
                      <span className="flex items-center gap-2">
                        <Avatar name={o.customer} size={22} />
                        {o.customer}
                      </span>
                    </Td>
                  )}
                  {show("product") && <Td muted>{o.product}</Td>}
                  {show("carrier") && <Td muted>{o.carrier}</Td>}
                  {show("status") && (
                    <Td>
                      <Status tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Status>
                    </Td>
                  )}
                  {show("labels") && (
                    <Td>
                      <span className="flex gap-1">{o.labels.map((l) => <RecordLabel key={l}>{l}</RecordLabel>)}</span>
                    </Td>
                  )}
                  {show("total") && <Td align="right" figure>{euro(o.total)}</Td>}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      <div className="py-2.5">
        <Pagination page={page} pageSize={25} total={rows.length === 0 ? 0 : ORDER_TOTAL} onChange={setPage} />
      </div>
    </div>
  )
}

export function DataDisplay() {
  return (
    <KitSection
      id="data"
      second="Dicht, rustig, in woorden."
      title="Data tonen"
      intro="Lijsten en records. Een tabel is dicht en rustig: haarlijnen tussen regels, cijfers rechts als cijfers (.figure), een status in woorden met een stip. Kleur zegt alleen iets als er iets mis is of op je wacht."
    >
      <Spec
        id="table"
        title="Tabel"
        anatomy={[
          "Werkbalk: zoeken, filters als chips, kolommen, export",
          "Balk met acties zodra je regels kiest",
          "Kop: sorteren alleen waar een pijltje staat",
          "Regels: woorden links, cijfers rechts",
          "Voet: waar je bent en bladeren"
        ]}
        use={["Elke lijst van records die je doorzoekt, filtert of in bulk bewerkt."]}
        avoid={["Kleur per regel of per kolom.", "Een kaart per record als de lijst langer is dan een handvol."]}
        name="Table · THead · Th · Tr · Td"
        file="ui/table.tsx · ui/filters.tsx"
        summary="De hele lijst uit het product, samengesteld: zoeken, filters als chips, kolommen kiezen, regels kiezen met acties voor allemaal tegelijk, sorteren, bladeren, en leeg als er niets past. Kies een paar regels of haal het filter weg."
        also="data-table/*, orders/customers/tickets lists, filters/filter-bar"
      >
        <OrdersList />
        <Rule>
          Een regel opent met een klik of Enter. Een kolomkop sorteert alleen als hij een pijltje heeft. Kies je regels,
          dan verschijnt de balk met acties boven de tabel; Escape of het kruisje wist de keuze.
        </Rule>
      </Spec>

      <Spec
        id="table-states"
        title="Staten van een regel"
        name="Tr (staten)"
        file="ui/table.tsx"
        summary="Regels in een tabel: standaard, hover, gekozen en de focus van het toetsenbord."
      >
        <States cols={1}>
          <State label="Standaard · hover · gekozen · focus" align="stretch">
            <Table label="Staten van een regel" minWidth={520}>
              <THead>
                <Th>Ticket</Th>
                <Th>Klant</Th>
                <Th align="right">Wacht</Th>
              </THead>
              <TBody>
                <Tr onOpen={() => undefined}>
                  <Td header figure>#5141</Td>
                  <Td>Astrid Berg</Td>
                  <Td align="right" figure>12 min</Td>
                </Tr>
                <Tr onOpen={() => undefined} className="bg-hover">
                  <Td header figure>#5142</Td>
                  <Td>Hannah Schmidt</Td>
                  <Td align="right" figure>34 min</Td>
                </Tr>
                <Tr selected onOpen={() => undefined}>
                  <Td header figure>#5143</Td>
                  <Td>Maria Garcia</Td>
                  <Td align="right" figure>1 u 05</Td>
                </Tr>
                <Tr onOpen={() => undefined}>
                  <Td header figure>
                    {/* Focus lands on the record's link in the first cell; the row lights with it. */}
                    <span data-force="focus" inert>
                      <a href="#table" className="text-ink no-underline">#5144</a>
                    </span>
                  </Td>
                  <Td>Chris Lee</Td>
                  <Td align="right" figure>2 u 40</Td>
                </Tr>
              </TBody>
            </Table>
          </State>
        </States>
      </Spec>

      <Spec
        id="list"
        title="Lijst"
        name="List · ListRow · GlyphTile"
        file="ui/list.tsx"
        summary="Een korte lijst in een kaart: wie of wat, één regel uitleg, en rechts een cijfer of actie. Als link of knop is de hele regel het doel."
        also="home lists, team list, integrations list"
      >
        <States cols={2}>
          <State label="Als links: de hele regel is het doel" align="stretch">
            <List label="Agents">
              {AGENTS.slice(0, 3).map((a) => (
                <ListRow
                  key={a.id}
                  href={paths.agent(a.id)}
                  lead={<AgentAvatar glyph={a.glyph} size={32} active={a.active} />}
                  title={a.name}
                  meta={a.purpose}
                  trail={<span className="figure text-xs text-ink-3">{a.runs.toLocaleString("nl-NL")}</span>}
                />
              ))}
            </List>
          </State>
          <State label="Zonder lijnen, met tegels" align="stretch">
            <List label="Koppelingen">
              <ListRow
                lead={
                  <GlyphTile>
                    <Package size={16} />
                  </GlyphTile>
                }
                title="Shopify"
                meta="Northwind EU · bijgewerkt 2 min geleden"
                trail={<Status tone="good">Gekoppeld</Status>}
              />
              <ListRow
                lead={
                  <GlyphTile>
                    <CreditCard size={16} />
                  </GlyphTile>
                }
                title="Klarna"
                meta="Disputen en terugbetalingen"
                trail={<Status tone="warn">Verloopt over 6 dagen</Status>}
              />
              <ListRow
                lead={
                  <GlyphTile>
                    <Truck size={16} />
                  </GlyphTile>
                }
                title="PostNL"
                meta="Track & trace"
                trail={<Status>Niet gekoppeld</Status>}
              />
            </List>
          </State>
        </States>
      </Spec>

      <Spec
        id="key-value"
        title="Kenmerken"
        name="KeyValue"
        file="ui/key-value.tsx"
        summary="De feiten van een record. Regels voor een zijpaneel, een raster voor de kop van een record. Bedragen en nummers als cijfers (.figure)."
        also="detail panels, order/customer sidebars"
      >
        <States cols={2}>
          <State label="rows" align="stretch">
            <KeyValue
              items={[
                { label: "Klant", value: "Astrid Berg" },
                { label: "Bestelling", value: "#4821", figure: true },
                { label: "Betaald", value: "€ 79,00 via Klarna", figure: true },
                { label: "Vervoerder", value: "PostNL · 3SNWD48210" },
                { label: "Geplaatst", value: "22 nov 2026, 09:14" }
              ]}
            />
          </State>
          <State label="grid" align="stretch">
            <KeyValue
              layout="grid"
              items={[
                { label: "Leverancier", value: "Kestrel Goods" },
                { label: "Belofte", value: "5 dagen", figure: true },
                { label: "Gemiddeld", value: "6,1 dagen", figure: true },
                { label: "Open", value: "6 bestellingen", figure: true }
              ]}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="stat"
        title="Getal"
        avoid={[
          "Vier getallen in een rij van gelijke tegels als opbouw van een scherm: zet een getal bij de vraag die het beantwoordt."
        ]}
        name="Stat"
        file="ui/stat.tsx"
        summary="Eén getal met zijn eenheid en wat het is. Een uitleg erbij zegt hoe het getal tot stand kwam."
        also="analytics KPI tiles"
      >
        <States cols={4}>
          <State label="Aantal" align="start">
            <dl>
              <Stat value="1.284" unit="keer" label="Uitgevoerd" />
            </dl>
          </State>
          <State label="Met uitleg" align="start">
            <dl>
              <Stat
                value="± 31"
                unit="u"
                label="bespaard, geschat"
                explain="Een schatting: 1.284 antwoorden × 1,45 min die een collega gemiddeld aan dezelfde taak kwijt is"
              />
            </dl>
          </State>
          <State label="Bedrag" align="start">
            <dl>
              <Stat value="€ 48.210" unit="" label="Omzet deze week" />
            </dl>
          </State>
          <State label="Duur" align="start">
            <dl>
              <Stat value="14" unit="min" label="Eerste reactie" />
            </dl>
          </State>
        </States>
      </Spec>

      <Spec
        id="badge"
        title="Tags, status en tellingen"
        use={["Status met een stip én een woord, zodat het ook zonder kleur leest."]}
        avoid={["Een tag op elke regel ‘voor de duidelijkheid’: dan valt niets meer op."]}
        name="Tag · Status · Count · Alert · RecordLabel"
        file="ui/badge.tsx"
        summary="Een tag zegt een regel of soort in woorden. Een status is een stip met een woord, nooit alleen kleur. Count is een stille telling, Alert de rode die op je wacht. Een label hoort bij een record en is weg te halen."
        also="components/badge.tsx, status pills, tag inputs"
      >
        <States cols={5}>
          <State label="Tag">
            <span className="flex flex-wrap justify-center gap-1.5">
              <Tag>Eerst vragen</Tag>
              <Tag tone="good">Zelf doen</Tag>
              <Tag tone="warn">Wacht op jou</Tag>
              <Tag tone="bad">Nooit</Tag>
              <Tag tone="accent">Nieuw</Tag>
            </span>
          </State>
          <State label="Status" align="start">
            <span className="flex flex-col gap-1.5">
              <Status tone="good">Verzonden</Status>
              <Status tone="warn">Vertraagd</Status>
              <Status tone="bad">Mislukt</Status>
              <Status>Concept</Status>
            </span>
          </State>
          <State label="Count">
            <span className="flex items-center gap-2 text-sm text-ink-2">
              Agents <Count>7</Count>
            </span>
          </State>
          <State label="Alert" surface="rail">
            <span className="relative inline-flex size-9 items-center justify-center rounded-md bg-rail-2 text-rail-fg">
              <Bot size={18} />
              <span className="absolute -top-1 -right-1">
                <Alert count={12} />
              </span>
            </span>
          </State>
          <State label="RecordLabel">
            <span className="flex flex-wrap justify-center gap-1.5">
              <RecordLabel>Vaste klant</RecordLabel>
              <RecordLabel onRemove={() => undefined}>Maat</RecordLabel>
            </span>
          </State>
        </States>
        <DoDont
          items={[
            {
              kind: "wel",
              caption: "Een stip met een woord: leest ook zonder kleur en voor een schermlezer.",
              children: <Status tone="warn">Vertraagd</Status>
            },
            {
              kind: "niet",
              caption: "Alleen een gekleurde stip: wie geen kleur ziet, ziet geen status.",
              children: <span aria-hidden="true" className="size-2 rounded-full bg-warn" />
            }
          ]}
        />
      </Spec>

      <Spec
        id="avatar"
        title="Avatars"
        name="Avatar · AvatarStack · AgentAvatar"
        file="ui/avatar.tsx"
        summary="Mensen zijn rond en grijs met initialen, met een stip voor aanwezig. Een agent is rond met zijn icoon in een neutrale haarlijn; aan of uit zegt de stip."
        also="components/avatar.tsx"
      >
        <States cols={4}>
          <State label="Maten · aanwezigheid">
            <Avatar name={PEOPLE.elena.name} size={22} />
            <Avatar name={PEOPLE.sofia.name} size={28} presence="online" />
            <Avatar name={PEOPLE.liam.name} size={32} presence="away" />
            <Avatar name={PEOPLE.maya.name} size={40} presence="offline" />
          </State>
          <State label="AvatarStack">
            <AvatarStack names={Object.values(PEOPLE).map((p) => p.name)} />
          </State>
          <State label="AgentAvatar · aan, uit">
            <AgentAvatar glyph={Truck} size={32} active />
            <AgentAvatar glyph={Zap} size={32} active={false} />
          </State>
          <State label="Op de icoonbalk" surface="rail">
            <Avatar name={PEOPLE.elena.name} size={28} presence="online" on="rail" />
          </State>
        </States>
      </Spec>

      <Spec
        id="timeline"
        title="Tijdlijn"
        name="Timeline"
        file="ui/timeline.tsx"
        summary={`Wat er met een record gebeurde, nieuwste onderaan: mensen, agents en het systeem op één lijn. Een voorval dat aandacht vraagt krijgt het teken van zijn signaal.`}
        also="activity feeds, order history, ticket history"
      >
        <div className="rounded-xl bg-panel px-5 py-7 sm:px-8">
          <Timeline
            label="Geschiedenis van bestelling #4821"
            items={[
              { id: "t1", at: "22 nov 09:14", glyph: CreditCard, title: "Betaald via Klarna", body: "€ 79,00" },
              { id: "t2", at: "22 nov 15:30", glyph: Truck, title: "Verzonden met PostNL" },
              {
                id: "t3",
                at: "23 nov 10:02",
                mark: <Avatar name="Astrid Berg" size={22} />,
                title: "Astrid Berg vroeg een retour aan",
                body: "‘Valt te klein, ik wil graag een maat groter.’"
              },
              {
                id: "t4",
                at: "23 nov 13:47",
                mark: <AgentAvatar glyph={RotateCcw} size={22} active />,
                title: "Retouragent stelt een omruiling voor",
                body: `Wacht op jou, via Eerst vragen.`,
                tone: "warn"
              }
            ]}
          />
        </div>
      </Spec>

      <Spec
        id="stepper"
        title="Stappen"
        name="Stepper"
        file="ui/stepper.tsx"
        summary="Waar iets is in een vaste volgorde: een bestelling onderweg, een koppeling instellen. Vastgelopen is oranje met een woord, niet alleen een kleur."
        also="onboarding steps, order progress"
      >
        <States cols={2}>
          <State label="horizontal" align="stretch">
            <Stepper
              label="Bestelling #4820"
              current={2}
              steps={[{ label: "Betaald" }, { label: "Ingepakt" }, { label: "Onderweg", detail: "DHL" }, {
                label: "Bezorgd"
              }]}
            />
          </State>
          <State label="horizontal · vastgelopen" align="stretch">
            <Stepper
              label="Bestelling #4815"
              current={2}
              stalled
              steps={[
                { label: "Betaald" },
                { label: "Ingepakt" },
                { label: "Onderweg", detail: "6 dagen, belofte 5" },
                { label: "Bezorgd" }
              ]}
            />
          </State>
          <State label="vertical" span="full" align="start">
            <Stepper
              label="Shopify koppelen"
              orientation="vertical"
              current={1}
              steps={[
                { label: "Winkel kiezen", detail: "Northwind EU" },
                { label: "Toegang geven", detail: "Bestellingen, klanten en producten lezen" },
                { label: "Eerste gegevens ophalen" }
              ]}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="accordion"
        title="Inklappen"
        name="Accordion · Disclosure"
        file="ui/accordion.tsx"
        summary="Wat je zelden nodig hebt, ingeklapt: de regels van een agent per handeling, de technische details van een fout. De kop is een knop met een pijl die draait."
        also="components/accordion.tsx, collapsible"
      >
        <States cols={2}>
          <State label="Accordion" align="stretch">
            <Accordion
              defaultOpen={["a"]}
              items={[
                {
                  id: "a",
                  title: "Wat mag de agent zelf doen?",
                  meta: "3 regels",
                  children: (
                    <p className="text-sm text-ink-2">
                      Een track & trace-antwoord sturen, een ticket toewijzen, en een ticket sluiten als de klant
                      bedankt.
                    </p>
                  )
                },
                {
                  id: "b",
                  title: "Waar vraagt hij eerst?",
                  meta: "1 regel",
                  children: <p className="text-sm text-ink-2">Een kortingscode van 10% geven.</p>
                },
                {
                  id: "c",
                  title: "Wat doet hij nooit?",
                  meta: "1 regel",
                  children: <p className="text-sm text-ink-2">Terugbetalen of annuleren.</p>
                }
              ]}
            />
          </State>
          <State label="Disclosure" align="start">
            <Disclosure label={`Hoe ${ASSISTANT} dit berekende`}>
              <p className="text-sm text-ink-2">
                Terugbetalingen van 16 tot 22 november, gegroepeerd per product, vergeleken met de week ervoor.
              </p>
            </Disclosure>
          </State>
        </States>
      </Spec>

      <Spec
        id="card"
        title="Kaart"
        avoid={[
          "Een kaart in een kaart: binnenin is het een well.",
          "Een raster van gelijke kaarten als opbouw van een scherm."
        ]}
        name="Card · CardHead"
        file="ui/card.tsx"
        summary="Wit op een haarlijn, en nooit een kaart in een kaart: binnenin is het een well."
        also="components/card.tsx"
      >
        <States cols={2}>
          <State label="Kaart op het bureau" surface="desk" align="stretch">
            <Card className="flex flex-col gap-3 p-5">
              <CardHead
                title="Triggers"
                after="2 actief"
                sub="Wanneer moet deze agent draaien?"
                actions={<Button size="sm" variant="ghost">Bewerken</Button>}
              />
              <p className="rounded-md bg-well p-3 text-sm text-ink-2">
                Binnenin een kaart: een well, geen tweede kaart.
              </p>
            </Card>
          </State>
          <State label="Kaart met een lijst" surface="desk" align="stretch">
            <Card className="flex flex-col gap-1 p-2">
              <ListRow
                lead={
                  <GlyphTile>
                    <Factory size={16} />
                  </GlyphTile>
                }
                title="Kestrel Goods"
                meta="6 bestellingen te laat"
                href="/v2/leveranciers/kestrel-goods"
              />
              <ListRow
                lead={
                  <GlyphTile>
                    <Package size={16} />
                  </GlyphTile>
                }
                title="Aurora Hooded Fleece"
                meta="26 terugbetalingen"
                href="/v2/producten/aurora-hooded-fleece"
              />
            </Card>
          </State>
        </States>
        <DoDont
          items={[
            {
              kind: "wel",
              caption: "Binnenin een kaart een well: een stap in het oppervlak.",
              children: (
                <Card className="w-full max-w-xs p-4">
                  <p className="text-sm font-semibold text-ink">Triggers</p>
                  <p className="mt-2 rounded-md bg-well p-3 text-sm text-ink-2">Nieuw ticket</p>
                </Card>
              )
            },
            {
              kind: "niet",
              caption: "Een kaart in een kaart: twee randen zeggen hetzelfde twee keer.",
              children: (
                <Card className="w-full max-w-xs p-4">
                  <p className="text-sm font-semibold text-ink">Triggers</p>
                  <Card className="mt-2 p-3">
                    <p className="text-sm text-ink-2">Nieuw ticket</p>
                  </Card>
                </Card>
              )
            }
          ]}
        />
      </Spec>
    </KitSection>
  )
}
