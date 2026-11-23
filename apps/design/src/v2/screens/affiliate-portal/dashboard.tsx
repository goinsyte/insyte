import { LineChart } from "../../charts/line-chart.tsx"
import { DAY_MS, METHOD_LABEL, NOW_MS, payoutMonths, PRIYA, TIERS, weeksOf } from "../../fixtures/affiliate-portal.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { ChevronRight, Copy, CreditCard, FileText, TrendingUp } from "../../ui/icons.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import {
  day,
  dayLong,
  Figures,
  FiguresSkeleton,
  LoadError,
  money,
  MoreLink,
  pct,
  useBook,
  useDataState
} from "./parts.tsx"
import { useAffiliate } from "./store.ts"

const greeting = DEMO_NOW.hours < 12 ? "Goedemorgen" : DEMO_NOW.hours < 18 ? "Goedemiddag" : "Goedenavond"

export function copyCode(code: string) {
  void navigator.clipboard?.writeText(code).catch(() => undefined)
  toast({ title: `Code ${code} gekopieerd`, body: "Klanten krijgen 10% korting; de bestelling komt op jouw naam." })
}

/**
 * The affiliate's start: what it has earned and when it is paid, then what its links did week by
 * week, the orders that just came in through them, and where it stands in the programme. Every
 * figure is a sum over its own conversions, which open on the links and payouts pages.
 */
export function AffiliateDashboard() {
  const state = useDataState()
  const book = useBook()
  const { name, payment } = useAffiliate()
  const first = name.split(" ")[0] ?? name
  const tier = TIERS.find((t) => t.id === PRIYA.tier) ?? TIERS[0]
  const next = TIERS[TIERS.findIndex((t) => t.id === PRIYA.tier) + 1]
  const fresh = state === "empty"

  if (state === "loading") {
    return (
      <Page width="wide" label="Overzicht">
        <div aria-busy="true" className="flex flex-col gap-8">
          <Skeleton className="h-6 w-56" />
          <FiguresSkeleton />
          <Skeleton className="h-52 w-full" />
        </div>
      </Page>
    )
  }

  const kept = book.conversions.filter((c) => c.status !== "teruggedraaid")
  const last30 = kept.filter((c) => c.at.getTime() > NOW_MS - 30 * DAY_MS)
  const weeks = weeksOf(book)
  const clicks30 = weeks.slice(-4).reduce((n, w) => n + w.clicks, 0)
  const quarter = book.conversions.filter((c) => c.at.getTime() > NOW_MS - 90 * DAY_MS).length
  const owed = book.conversions
    .filter((c) => c.status === "in-retourtermijn" || c.status === "goedgekeurd")
    .reduce((n, c) => n + c.commission, 0)
  const open = payoutMonths(book).find((m) => m.status === "loopt")
  const best = book.totals.toSorted((a, b) => b.revenue - a.revenue).slice(0, 3)
  const labels = new Map(book.links.map((l) => [l.id, l.label]))

  return (
    <Page width="wide">
      <PageHead
        title={`${greeting}, ${first}`}
        meta={fresh
          ? "Welkom in het partnerprogramma van Northwind. Maak een link of deel je kortingscode om te beginnen."
          : `${last30.length} ${
            last30.length === 1 ? "bestelling kwam" : "bestellingen kwamen"
          } de afgelopen 30 dagen via jouw links binnen.`}
        actions={
          <Button size="sm" icon={<Copy />} onClick={() => copyCode(PRIYA.code)}>
            Kortingscode <span className="figure">{PRIYA.code}</span>
          </Button>
        }
      />

      {state === "error" ? <LoadError what="Je cijfers" /> : fresh ?
        (
          <div className="flex flex-col gap-8">
            <EmptyState
              glyph={TrendingUp}
              title="Deel je eerste link"
              action={
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`${paths.affiliatePortal("doorverwijzingen")}?nieuw=1`)}
                  >
                    Link maken
                  </Button>
                  <Button size="sm" onClick={() => copyCode(PRIYA.code)}>Code {PRIYA.code} kopiëren</Button>
                </>
              }
            >
              Je verdient{" "}
              {tier?.rate ?? 15}% op elke bestelling via je link. Elke klik en elke bestelling komt op jouw naam.
            </EmptyState>
            <PageSection id="eerst" title="Om mee te beginnen">
              <List label="Om mee te beginnen">
                <ListRow
                  href={paths.affiliatePortal("materiaal")}
                  lead={
                    <GlyphTile>
                      <FileText size={16} />
                    </GlyphTile>
                  }
                  title="Materiaal om te delen"
                  meta="Productfoto's, teksten en de huisstijl van Northwind."
                  trail={<ChevronRight size={14} />}
                />
                <ListRow
                  href={paths.affiliatePortal("instellingen/betaling")}
                  lead={
                    <GlyphTile>
                      <CreditCard size={16} />
                    </GlyphTile>
                  }
                  title="Je betaalgegevens"
                  meta="Waar je commissie heen gaat. Uitbetaling op de 15e van de maand."
                  trail={<ChevronRight size={14} />}
                />
                <ListRow
                  href={paths.affiliatePortal("uitbetalingen")}
                  lead={
                    <GlyphTile>
                      <TrendingUp size={16} />
                    </GlyphTile>
                  }
                  title="Hoe je niveau stijgt"
                  meta={next === undefined
                    ? "Je zit op het hoogste niveau."
                    : `Vanaf ${next.from} conversies per kwartaal verdien je ${next.rate}%.`}
                  trail={<ChevronRight size={14} />}
                />
              </List>
            </PageSection>
          </div>
        ) :
        (
          <>
            <Figures
              label="Je cijfers"
              items={[
                { label: "Nog uit te betalen", value: money(owed), to: paths.affiliatePortal("uitbetalingen") },
                {
                  label: "Volgende uitbetaling",
                  value: open === undefined ? "—" : dayLong(open.payDay),
                  note: `naar ${METHOD_LABEL[payment.method]}`,
                  to: paths.affiliatePortal("uitbetalingen")
                },
                {
                  label: "Conversies, 30 dagen",
                  value: last30.length.toLocaleString("nl-NL"),
                  to: paths.affiliatePortal("doorverwijzingen")
                },
                {
                  label: "Conversieratio, 30 dagen",
                  value: clicks30 === 0 ? "—" : pct((last30.length / clicks30) * 100),
                  note: `${clicks30.toLocaleString("nl-NL")} klikken`,
                  to: paths.affiliatePortal("doorverwijzingen")
                }
              ]}
            />

            <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="flex min-w-0 flex-col gap-10">
                <PageSection
                  id="weken"
                  title="Wat je links deden"
                  meta={`Verdiende commissie per week, tot ${day(DEMO_NOW.date)}`}
                >
                  <LineChart
                    height={210}
                    data={{ labels: weeks.map((w) => w.label), current: weeks.map((w) => w.earned), format: "euro" }}
                  />
                </PageSection>

                <PageSection id="net-binnen" title="Net binnen">
                  <List label="Net binnen">
                    {book.conversions.slice(0, 6).map((c) => (
                      <ListRow
                        key={c.id}
                        padded={false}
                        href={c.linkId === null
                          ? paths.affiliatePortal("doorverwijzingen")
                          : paths.affiliatePortal(`doorverwijzingen/${c.linkId}`)}
                        title={c.title}
                        meta={`${day(c.at)} · #${c.order} · via ${
                          c.linkId === null ? "je code" : labels.get(c.linkId) ?? "een link"
                        }`}
                        trail={
                          <span
                            className={cx(
                              "figure text-sm",
                              c.status === "teruggedraaid" ? "text-ink-3 line-through" : "text-ink"
                            )}
                          >
                            +{money(c.commission)}
                          </span>
                        }
                      />
                    ))}
                  </List>
                  <MoreLink to={paths.affiliatePortal("doorverwijzingen")}>
                    Alle links <ChevronRight size={13} />
                  </MoreLink>
                </PageSection>
              </div>

              <aside className="flex min-w-0 flex-col gap-10">
                <PageSection id="niveau" title="Je niveau">
                  <ol className="flex flex-col gap-0.5">
                    {TIERS.map((t) => {
                      const on = t.id === tier?.id
                      return (
                        <li
                          key={t.id}
                          className={cx(
                            "flex items-center justify-between gap-3 rounded-md px-2.5 py-2",
                            on && "bg-accent-tint"
                          )}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className={cx("text-sm font-medium", on ? "text-accent-ink" : "text-ink")}>
                              {t.label}
                              {on && " · jij"}
                            </span>
                            <span className="text-xs text-ink-3">
                              {t.from === 0 ? "Vanaf de start" : `Vanaf ${t.from} conversies per kwartaal`}
                            </span>
                          </span>
                          <span className={cx("figure text-sm", on ? "text-accent-ink" : "text-ink-2")}>{t.rate}%</span>
                        </li>
                      )
                    })}
                  </ol>
                  <p className="text-xs text-pretty text-ink-3">
                    {next === undefined
                      ? `${quarter} conversies dit kwartaal: je blijft op het hoogste niveau.`
                      : `Nog ${Math.max(0, next.from - quarter)} conversies dit kwartaal tot ${next.label}.`}
                  </p>
                </PageSection>

                <PageSection id="beste" title="Beste links">
                  <List label="Beste links">
                    {best.map((t) => (
                      <ListRow
                        key={t.link.id}
                        padded={false}
                        href={paths.affiliatePortal(`doorverwijzingen/${t.link.id}`)}
                        title={t.link.label}
                        meta={`${t.conversions} conversies`}
                        trail={<span className="figure text-sm text-ink">{money(t.commission)}</span>}
                      />
                    ))}
                  </List>
                </PageSection>
              </aside>
            </div>
          </>
        )}
    </Page>
  )
}
