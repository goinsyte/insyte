import { useState } from "react"
import { BarChart } from "../../charts/bar-chart.tsx"
import { BRAND, CHAT_PEOPLE, CHECKS, CONTACT, dueOf, LOW_AT, PERFORMANCE } from "../../fixtures/supplier-portal.ts"
import type { SupOrder } from "../../fixtures/supplier-portal.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { paths } from "../../router.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { ChevronRight, ClipboardCheck, Package, ShoppingBag } from "../../ui/icons.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { useView } from "../../view.ts"
import { ShipDialog } from "./dialogs.tsx"
import {
  count,
  day,
  Figures,
  FiguresSkeleton,
  Handoff,
  LoadError,
  MoreLink,
  plural,
  time,
  useDataState,
  weekday
} from "./parts.tsx"
import { accept, useOrders, useProducts, useSupplier } from "./store.ts"

const greeting = DEMO_NOW.hours < 12 ? "Goedemorgen" : DEMO_NOW.hours < 18 ? "Goedemiddag" : "Goedenavond"

/*
 * The supplier's start: what is late and what must leave today, the few things to do first, stock
 * that is running out, the last word from Northwind, and how Allure delivers. Calm when there is
 * nothing to do; the work itself lives on the orders page.
 */
export function SupplierDashboard() {
  const state = useDataState()
  const druk = useView().staat === "druk"
  const orders = useOrders()
  const products = useProducts()
  const { chat, checks } = useSupplier()
  const [shipping, setShipping] = useState<SupOrder | null>(null)

  if (state === "loading") {
    return (
      <Page width="wide" label="Overzicht">
        <div aria-busy="true" className="flex flex-col gap-8">
          <Skeleton className="h-6 w-64" />
          <FiguresSkeleton />
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    )
  }

  const open = orders.filter((o) => o.status === "te-accepteren" || o.status === "te-verzenden")
  const late = open.filter((o) => dueOf(o.handoff) === "late")
  const today = open.filter((o) => dueOf(o.handoff) === "today")
  const toAccept = orders.filter((o) => o.status === "te-accepteren")
  const reported = orders.filter((o) => o.status === "probleem")
  const first = [...late, ...today].slice(0, druk ? 8 : 5)
  const low = products
    .flatMap((p) => p.variants.filter((v) => v.stock < 12).map((v) => ({ p, v })))
    .toSorted((a, b) => a.v.stock - b.v.stock)
  const lowProducts = products.filter((p) => p.variants.reduce((n, v) => n + v.stock, 0) < LOW_AT)
  const last = chat.at(-1)
  const openChecks = CHECKS.filter((c) => c.status === "gevraagd" && checks[c.id] === undefined)
  const weeks = PERFORMANCE.weeks
  const onTime30 = weeks.slice(-4).reduce((n, w) => n + w.onTime * w.n, 0) /
    weeks.slice(-4).reduce((n, w) => n + w.n, 0)
  const parcels30 = weeks.slice(-4).reduce((n, w) => n + w.n, 0)

  return (
    <Page width="wide">
      <PageHead
        title={`${greeting}, ${CONTACT.first}`}
        meta={state === "empty"
          ? `Welkom bij ${BRAND}. Bestellingen met jouw artikelen verschijnen hier zodra ze binnenkomen.`
          : late.length + today.length === 0
          ? "Niets hoeft vandaag nog weg."
          : `${plural(late.length, "bestelling is", "bestellingen zijn")} te laat en ${count(today.length)} ${
            today.length === 1 ? "moet" : "moeten"
          } vandaag naar de vervoerder.`}
        actions={<ButtonLink size="sm" to={paths.supplierPortal("bestellingen")}>Naar bestellingen</ButtonLink>}
      />
      {state === "error" ? <LoadError what="Je overzicht" /> : state === "empty" ?
        (
          <EmptyState
            glyph={ShoppingBag}
            title={`Nog geen bestellingen van ${BRAND}`}
            action={
              <ButtonLink size="sm" to={paths.supplierPortal("instellingen/api-koppeling")}>
                Koppeling instellen
              </ButtonLink>
            }
          >
            Zet je voorraad en levertijd klaar onder Producten, en koppel je systeem als je bestellingen automatisch
            wilt ontvangen.
          </EmptyState>
        ) :
        (
          <>
            <Figures
              label="Vandaag"
              items={[
                {
                  label: "Te accepteren",
                  value: count(toAccept.length),
                  to: `${paths.supplierPortal("bestellingen")}?weergave=te-accepteren`
                },
                {
                  label: "Vandaag overdragen",
                  value: count(today.length),
                  to: paths.supplierPortal("bestellingen"),
                  ...(today.length > 0 ? { tone: "warn" as const } : {})
                },
                {
                  label: "Te laat",
                  value: count(late.length),
                  to: `${paths.supplierPortal("bestellingen")}?weergave=te-laat`,
                  ...(late.length > 0 ? { tone: "bad" as const } : {})
                },
                {
                  label: "Op tijd bezorgd, 30 dagen",
                  value: `${onTime30.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`,
                  note: `${count(parcels30)} pakketten`
                }
              ]}
            />
            <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="flex min-w-0 flex-col gap-10">
                <PageSection id="eerst" title="Eerst dit">
                  {openChecks.length === 0 && first.length === 0 ?
                    <p className="text-sm text-ink-3">Alles is geaccepteerd en verzonden.</p> :
                    (
                      <List label="Eerst dit">
                        {openChecks.map((c) => (
                          <ListRow
                            key={c.id}
                            padded={false}
                            href={paths.supplierPortal(`producten/${c.productId}`)}
                            lead={
                              <GlyphTile>
                                <ClipboardCheck size={16} />
                              </GlyphTile>
                            }
                            title={`${c.kind} voor de Aurora Hooded Fleece`}
                            meta={`Gevraagd door ${c.requestedBy} · vóór ${weekday(c.due)}, ${time(c.due)}`}
                            trail={<ChevronRight size={14} />}
                          />
                        ))}
                        {first.map((o) => (
                          <ListRow
                            key={o.number}
                            padded={false}
                            href={paths.supplierPortal(`bestellingen/${o.number}`)}
                            title={
                              <span className="flex items-baseline gap-2">
                                <span className="figure">#{o.number}</span>
                                <span className="truncate font-normal text-ink-2">
                                  {o.lines[0]?.title} · {o.lines[0]?.size}
                                </span>
                              </span>
                            }
                            meta={<Handoff order={o} />}
                            trail={o.status === "te-accepteren"
                              ? <Button size="sm" onClick={() => accept([o.number])}>Accepteren</Button>
                              : <Button size="sm" onClick={() => setShipping(o)}>Verzenden</Button>}
                          />
                        ))}
                      </List>
                    )}
                  {late.length + today.length > first.length && (
                    <MoreLink to={paths.supplierPortal("bestellingen")}>
                      Nog {count(late.length + today.length - first.length)} voor vandaag <ChevronRight size={13} />
                    </MoreLink>
                  )}
                </PageSection>

                <PageSection
                  id="levering"
                  title="Hoe je levert voor Northwind"
                  meta={`${PERFORMANCE.measure}, acht weken tot ${PERFORMANCE.until}`}
                >
                  <BarChart
                    height={190}
                    data={{
                      items: weeks.map((w) => ({ label: w.label, value: w.onTime })),
                      format: "percent",
                      ...(weeks.some((w) => w.onTime < 90) ? { focus: weeks.findIndex((w) => w.onTime < 90) } : {}),
                      reference: { value: 90, label: "Afspraak 90%" }
                    }}
                  />
                  <dl className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-ink-3">Pakketten, 30 dagen</dt>
                      <dd className="figure text-ink">{count(parcels30)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-ink-3">Te laat, gemiddeld</dt>
                      <dd className="figure text-ink">{PERFORMANCE.lateBy.toLocaleString("nl-NL")} dag</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-ink-3">Problemen gemeld, open</dt>
                      <dd className="figure text-ink">{reported.length}</dd>
                    </div>
                  </dl>
                </PageSection>
              </div>

              <aside className="flex min-w-0 flex-col gap-10">
                <PageSection id="bijna-op" title="Bijna op">
                  {low.length === 0 ?
                    <p className="text-sm text-ink-3">Alles is genoeg op voorraad.</p> :
                    (
                      <List label="Bijna op">
                        {low.slice(0, 5).map(({ p, v }) => (
                          <ListRow
                            key={v.id}
                            padded={false}
                            href={paths.supplierPortal(`producten/${p.id}`)}
                            lead={
                              <GlyphTile>
                                <Package size={16} />
                              </GlyphTile>
                            }
                            title={p.name}
                            meta={`Maat ${v.size}`}
                            trail={
                              <span
                                className={v.stock === 0
                                  ? "text-sm font-medium text-bad-ink"
                                  : "figure text-sm text-warn-ink"}
                              >
                                {v.stock === 0 ? "Uitverkocht" : `${v.stock} over`}
                              </span>
                            }
                          />
                        ))}
                      </List>
                    )}
                  {lowProducts.length > 0 && (
                    <p className="text-xs text-ink-3">
                      {plural(lowProducts.length, "product heeft", "producten hebben")} minder dan {LOW_AT}{" "}
                      stuks in totaal.
                    </p>
                  )}
                </PageSection>

                {last !== undefined && (
                  <PageSection id="northwind" title="Van Northwind">
                    <div className="flex gap-3">
                      <Avatar name={CHAT_PEOPLE[last.from].name} size={28} />
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-xs text-ink-3">
                          <span className="font-medium text-ink">{CHAT_PEOPLE[last.from].name}</span> · {day(last.at)},
                          {" "}
                          {time(last.at)}
                        </p>
                        <p className="line-clamp-4 text-sm text-pretty text-ink-2">{last.body}</p>
                      </div>
                    </div>
                    <ButtonLink size="sm" variant="ghost" to={paths.supplierPortal("chats")} className="self-start">
                      Antwoorden
                    </ButtonLink>
                  </PageSection>
                )}
              </aside>
            </div>
          </>
        )}
      <ShipDialog
        open={shipping !== null}
        orders={shipping === null ? [] : [shipping]}
        onClose={() => setShipping(null)}
      />
    </Page>
  )
}
