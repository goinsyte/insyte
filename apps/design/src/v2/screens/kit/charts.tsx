import { ASSISTANT } from "../../assistant.ts"
import { BlockView } from "../../charts/block-view.tsx"
import { BLOCKS, PERIOD } from "../../fixtures/analytics.ts"
import { Button } from "../../ui/button.tsx"
import { BarChart3, RotateCcw } from "../../ui/icons.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

/** A block's frame without its chart: the same anatomy, for loading, empty and failed. */
function BlockFrame({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <article className="flex h-full min-h-64 w-full flex-col gap-4 rounded-lg bg-canvas p-4 sm:p-5">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <div className="flex flex-1 flex-col">{children}</div>
    </article>
  )
}

export function Charts() {
  return (
    <KitSection
      id="grafieken"
      second="Vijf vormen, één blok."
      title="Grafieken"
      intro={
        <>
          Vijf vormen en niet meer, elk in hetzelfde blok: de vraag, de grafiek, een notitie van{" "}
          {ASSISTANT}, de sleutel en de bron. Inkt is nu, gestippeld grijs is ervoor, het accent is het ene ding waar
          het blok over gaat. Er is geen kleurkeuze, zodat alles op een bord bij elkaar past; wisselt het thema, dan
          wisselt alleen dat ene accent mee.
        </>
      }
    >
      <Spec
        id="block-figures"
        title="Kerncijfers"
        anatomy={[
          "De vraag als titel",
          "De grafiek, op de ene hoogte van het bord",
          "De notitie van Magnus, als die er is",
          "Sleutel en bron"
        ]}
        name="BlockView · Figures"
        file="charts/block-view.tsx · charts/figures.tsx"
        summary="Kerncijfers: het getal, wat het was, en het verschil als oordeel (groen is beter, rood slechter, ook als lager beter is)."
        also="analytics/kpi-row"
      >
        <BlockView block={BLOCKS.kerncijfers} compareLabel="was" />
      </Spec>

      <Spec
        id="block-line"
        title="Lijn"
        name="LineChart"
        file="charts/line-chart.tsx"
        summary={`Een reeks in de tijd, met de vorige periode (${PERIOD.compare}) gestippeld en de notitie op het punt waar het gebeurde.`}
        also="analytics/line-chart"
      >
        <BlockView block={BLOCKS.omzetPerDag} compareLabel="was" />
      </Spec>
      <Spec
        id="block-rank"
        title="Rangorde"
        name="RankChart"
        file="charts/rank-chart.tsx"
        summary="Delen van een geheel, op volgorde. Geen taart: een rij balken leest sneller."
        also="analytics/pie, donut"
      >
        <BlockView block={BLOCKS.retourredenen} compareLabel="was" />
      </Spec>

      <Spec
        id="block-bar"
        title="Staaf"
        name="BarChart"
        file="charts/bar-chart.tsx"
        summary="Vergelijken tussen dingen. Het ene ding waar het om gaat staat in het accent."
        also="analytics/bar-chart"
      >
        <BlockView block={BLOCKS.terugbetalingenPerProduct} compareLabel="was" />
      </Spec>
      <Spec
        id="block-funnel"
        title="Trechter"
        name="Funnel"
        file="charts/funnel.tsx"
        summary="Stappen die op elkaar volgen, met wat er bij elke stap afvalt."
        also="analytics/funnel"
      >
        <BlockView block={BLOCKS.conversie} compareLabel="was" />
      </Spec>

      <Spec
        id="block-table"
        title="Tabel in een blok"
        name="DataTable"
        file="charts/data-table.tsx"
        summary="Als de precieze getallen tellen: een tabel met een balkje in de kolom die het verhaal draagt."
        also="analytics/table"
      >
        <BlockView block={BLOCKS.retourPerProduct} compareLabel="was" />
      </Spec>

      <Spec
        id="block-states"
        title="Laden, leeg en fout"
        name="BlockView (laden, leeg, fout)"
        file="ui/skeleton.tsx · ui/states.tsx"
        summary="Elk blok heeft dezelfde drie andere staten, in hetzelfde kader zodat een bord niet verspringt."
      >
        <States cols={3}>
          <State label="Laden" align="stretch" surface="desk">
            <BlockFrame title="Omzet per dag">
              <div aria-busy="true" aria-label="Grafiek laadt" className="flex flex-1 items-end gap-2 pt-4">
                {[42, 58, 50, 71, 64, 88, 76].map((h, i) => (
                  <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
                ))}
              </div>
              <Skeleton className="mt-3 h-3 w-1/3" />
            </BlockFrame>
          </State>
          <State label="Leeg" align="stretch" surface="desk">
            <BlockFrame title="Terugbetalingen per vervoerder">
              <EmptyState glyph={BarChart3} title="Nog geen terugbetalingen deze week" size="sm" className="flex-1">
                Zodra er een binnenkomt, staat hij hier.
              </EmptyState>
            </BlockFrame>
          </State>
          <State label="Fout" align="stretch" surface="desk">
            <BlockFrame title="Conversie">
              <ErrorState
                title="Shopify gaf geen antwoord"
                size="sm"
                detail="GET /admin/api/2026-10/orders.json · 503 · 23 nov 14:02"
                action={<Button size="sm" icon={<RotateCcw />}>Opnieuw proberen</Button>}
                className="flex-1"
              >
                De rest van het bord is bijgewerkt.
              </ErrorState>
            </BlockFrame>
          </State>
        </States>
        <Rule>
          Een fout zegt welke bron het was en wat de rest nog wel doet; de technische regel staat ingeklapt voor wie hem
          nodig heeft.
        </Rule>
      </Spec>
    </KitSection>
  )
}
