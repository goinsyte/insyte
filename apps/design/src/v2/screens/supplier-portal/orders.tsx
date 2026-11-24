import { useMemo, useState } from "react"
import { BRAND, dueOf, inView, ORDER_VIEWS, PROBLEM_LABEL, STATUS } from "../../fixtures/supplier-portal.ts"
import type { OrderView, SupOrder } from "../../fixtures/supplier-portal.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import { AlertTriangle, Check, Download, MessagesSquare, Printer, ShoppingBag, Truck } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import type { TimelineItem } from "../../ui/timeline.tsx"
import { toast } from "../../ui/toast.tsx"
import { downloadSlips, ProblemDialog, ShipDialog } from "./dialogs.tsx"
import {
  count,
  day,
  dayLong,
  Handoff,
  LoadError,
  money,
  plural,
  saveFile,
  TableSkeleton,
  time,
  useDataState,
  weekday
} from "./parts.tsx"
import { accept, solve, useOrders } from "./store.ts"

const EMPTY: Readonly<Record<OrderView, { readonly title: string; readonly body: string }>> = {
  "te-verzenden": {
    title: "Niets te verzenden",
    body: "Alles wat je accepteerde is onderweg. Nieuwe bestellingen komen eerst bij Te accepteren."
  },
  "te-accepteren": {
    title: "Alles is geaccepteerd",
    body: `Een nieuwe bestelling van ${BRAND} verschijnt hier, en je krijgt er een e-mail van.`
  },
  "te-laat": { title: "Niets is te laat", body: "Alles wat open staat gaat op tijd naar de vervoerder." },
  probleem: {
    title: "Geen problemen gemeld",
    body: "Is iets op of later klaar, meld het bij de bestelling. Northwind houdt de klant dan op de hoogte."
  },
  verzonden: { title: "Nog niets verzonden", body: "Wat je markeert als verzonden, met track & trace, komt hier." },
  alle: {
    title: "Nog geen bestellingen",
    body: `Zodra ${BRAND} een bestelling met jouw artikelen krijgt, staat hij hier.`
  }
}

function toCsv(rows: ReadonlyArray<SupOrder>) {
  const head = "bestelling,geplaatst,overdragen_voor,status,artikelen,stuks,bedrag,land,vervoerder,tracking"
  const body = rows.map((o) =>
    [
      o.number,
      o.placedAt.toISOString(),
      o.handoff.toISOString(),
      STATUS[o.status].label,
      `"${o.lines.map((l) => `${l.quantity}x ${l.title} ${l.size}`).join("; ")}"`,
      o.units,
      o.amount.toFixed(2),
      o.shipTo.country,
      o.parcel?.carrier ?? "",
      o.parcel?.tracking ?? ""
    ].join(",")
  )
  return [head, ...body].join("\n")
}

const PAGE = 25

/*
 * The supplier's work list: what to accept, what to ship before the carrier comes, what is late, what
 * was reported. Rows can be picked and handled together, the way a warehouse works a morning's batch.
 */
export function OrdersPage() {
  const state = useDataState()
  const all = useOrders()
  const view = (useQuery("weergave") ?? "te-verzenden") as OrderView
  const [query, setQueryText] = useState("")
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<"ship" | "problem" | null>(null)

  const orders = state === "empty" ? [] : all
  const counts = useMemo(
    () =>
      Object.fromEntries(
        ORDER_VIEWS.map((v) => [v.id, orders.filter((o) => inView(o.status, o.handoff, v.id)).length])
      ),
    [orders]
  )
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "")
    const hit = orders.filter((o) =>
      inView(o.status, o.handoff, view) &&
      (q === "" ||
        `${o.number} ${o.shipTo.name} ${o.lines.map((l) => `${l.title} ${l.sku}`).join(" ")}`.toLowerCase().includes(q))
    )
    // Open work by hand-off, the soonest first; the rest newest first.
    return view === "verzonden" || view === "alle"
      ? hit
      : hit.toSorted((a, b) => a.handoff.getTime() - b.handoff.getTime())
  }, [orders, view, query])
  const shown = rows.slice((page - 1) * PAGE, page * PAGE)
  const chosen = rows.filter((o) => picked.has(o.number))
  const late = orders.filter((o) => inView(o.status, o.handoff, "te-laat")).length

  const pick = (number: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s)
      if (on) next.add(number)
      else next.delete(number)
      return next
    })
  const switchView = (next: OrderView) => {
    setQuery({ weergave: next === "te-verzenden" ? null : next })
    setPage(1)
    setPicked(new Set())
  }

  return (
    <Page width="wide">
      <PageHead
        title="Bestellingen"
        meta={state === "ready"
          ? `${count(counts["te-accepteren"] ?? 0)} te accepteren · ${
            count(counts["te-verzenden"] ?? 0)
          } te verzenden · ${count(late)} te laat`
          : `Wat ${BRAND} je stuurt`}
        actions={
          <Button
            size="sm"
            icon={<Download />}
            disabled={rows.length === 0}
            onClick={() => {
              saveFile(`allure-bestellingen-${view}.csv`, toCsv(rows), "text/csv")
              toast({
                title: `${plural(rows.length, "bestelling", "bestellingen")} geëxporteerd`,
                body: `allure-bestellingen-${view}.csv`
              })
            }}
          >
            Exporteren als CSV
          </Button>
        }
      />
      <div className="flex min-w-0 flex-col gap-4">
        <Tabs
          label="Weergave"
          value={view}
          onChange={switchView}
          tabs={ORDER_VIEWS.map((v) => ({
            value: v.id,
            label: v.label,
            ...(state === "ready" ? { count: counts[v.id] ?? 0 } : {})
          }))}
        />
        {state === "loading" ? <TableSkeleton label="Bestellingen laden" /> : state === "error" ?
          <LoadError what="Je bestellingen" /> :
          (
            <>
              {chosen.length > 0 ?
                (
                  <SelectionBar
                    count={chosen.length}
                    noun={["bestelling", "bestellingen"]}
                    onClear={() => setPicked(new Set())}
                  >
                    {chosen.some((o) => o.status === "te-accepteren") && (
                      <SelectionAction
                        icon={<Check />}
                        onClick={() => {
                          accept(chosen.filter((o) => o.status === "te-accepteren").map((o) => o.number))
                          setPicked(new Set())
                        }}
                      >
                        Accepteren
                      </SelectionAction>
                    )}
                    {chosen.some((o) => o.status === "te-verzenden" || o.status === "te-accepteren") && (
                      <SelectionAction
                        icon={<Truck />}
                        onClick={() => setDialog("ship")}
                      >
                        Markeren als verzonden
                      </SelectionAction>
                    )}
                    <SelectionAction
                      icon={<Printer />}
                      onClick={() => {
                        downloadSlips(chosen)
                        toast({
                          title: chosen.length === 1 ? "Pakbon gedownload" : `${chosen.length} pakbonnen gedownload`
                        })
                      }}
                    >
                      Pakbonnen downloaden
                    </SelectionAction>
                    <SelectionAction icon={<AlertTriangle />} onClick={() => setDialog("problem")}>
                      Probleem melden
                    </SelectionAction>
                  </SelectionBar>
                ) :
                (
                  <SearchField
                    value={query}
                    onChange={(q) => {
                      setQueryText(q)
                      setPage(1)
                    }}
                    label="Zoek een bestelling"
                    placeholder="Bestelnummer, naam of SKU"
                    className="sm:max-w-xs"
                  />
                )}
              {rows.length === 0 ?
                (
                  query.trim() === ""
                    ? <EmptyState glyph={ShoppingBag} title={EMPTY[view].title}>{EMPTY[view].body}</EmptyState>
                    : (
                      <EmptyState size="sm" title="Geen bestelling gevonden">
                        Niets in {ORDER_VIEWS.find((v) => v.id === view)?.label.toLowerCase()} past bij ‘{query}’.
                      </EmptyState>
                    )
                ) :
                (
                  <>
                    <Table label="Bestellingen" minWidth={860}>
                      <THead>
                        <Th width={32}>
                          <RowCheckbox
                            label="Alle bestellingen op deze pagina kiezen"
                            checked={shown.length > 0 && shown.every((o) => picked.has(o.number))}
                            indeterminate={shown.some((o) => picked.has(o.number)) &&
                              !shown.every((o) => picked.has(o.number))}
                            onChange={(on) =>
                              setPicked((s) => {
                                const next = new Set(s)
                                for (const o of shown) {
                                  if (on) next.add(o.number)
                                  else next.delete(o.number)
                                }
                                return next
                              })}
                          />
                        </Th>
                        <Th>Bestelling</Th>
                        <Th>Overdragen vóór</Th>
                        <Th>Jouw artikelen</Th>
                        <Th>Naar</Th>
                        <Th>Status</Th>
                        <Th align="right">Jouw bedrag</Th>
                      </THead>
                      <TBody>
                        {shown.map((o) => (
                          <Tr
                            key={o.number}
                            selected={picked.has(o.number)}
                            onOpen={() => navigate(paths.supplierPortal(`bestellingen/${o.number}`))}
                          >
                            <Td>
                              <RowCheckbox
                                label={`#${o.number} kiezen`}
                                checked={picked.has(o.number)}
                                onChange={(on) => pick(o.number, on)}
                              />
                            </Td>
                            <Td header>
                              <Link
                                to={paths.supplierPortal(`bestellingen/${o.number}`)}
                                className="flex flex-col py-1.5 hover:text-accent-ink"
                              >
                                <span className="figure font-medium">#{o.number}</span>
                                <span className="text-xs text-ink-3">{day(o.placedAt)}, {time(o.placedAt)}</span>
                              </Link>
                            </Td>
                            <Td>
                              <Handoff order={o} />
                            </Td>
                            <Td>
                              <span className="flex max-w-[22rem] flex-col">
                                <span className="truncate text-ink">{o.lines[0]?.title} · {o.lines[0]?.size}</span>
                                <span className="text-xs text-ink-3">
                                  {o.lines.length > 1
                                    ? `+ ${plural(o.lines.length - 1, "ander artikel", "andere artikelen")} · `
                                    : ""}
                                  {plural(o.units, "stuk", "stuks")}
                                </span>
                              </span>
                            </Td>
                            <Td muted>
                              <span className="flex flex-col">
                                <span className="text-ink-2">{o.shipTo.city}</span>
                                <span className="text-xs">{o.shipTo.country}</span>
                              </span>
                            </Td>
                            <Td>
                              <Status tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Status>
                            </Td>
                            <Td figure align="right" className="font-medium">{money(o.amount)}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                    {rows.length > PAGE && (
                      <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
                    )}
                  </>
                )}
            </>
          )}
      </div>
      <ShipDialog
        open={dialog === "ship"}
        orders={chosen.filter((o) => o.status === "te-verzenden" || o.status === "te-accepteren")}
        onClose={() => {
          setDialog(null)
          setPicked(new Set())
        }}
      />
      <ProblemDialog
        open={dialog === "problem"}
        orders={chosen}
        onClose={() => {
          setDialog(null)
          setPicked(new Set())
        }}
      />
    </Page>
  )
}

/*
 * One order as the supplier sees it: its lines and what Northwind pays for them, when it has to be
 * with the carrier, where it goes, the parcel, and what happened. The next step is the one button.
 */
export function OrderPage({ number }: { readonly number: string }) {
  const state = useDataState()
  const all = useOrders()
  const [dialog, setDialog] = useState<"ship" | "problem" | null>(null)
  const order = all.find((o) => o.number === number)

  if (state === "loading") {
    return (
      <Page width="record" label="Bestelling">
        <TableSkeleton rows={4} label="Bestelling laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record" label="Bestelling">
        <LoadError what="Deze bestelling" />
      </Page>
    )
  }
  if (order === undefined || state === "empty") {
    return (
      <Page width="text" label="Bestelling niet gevonden">
        <EmptyState
          glyph={ShoppingBag}
          title={`#${number} is geen bestelling voor jou`}
          action={<ButtonLink to={paths.supplierPortal("bestellingen")} size="sm">Naar je bestellingen</ButtonLink>}
        >
          Je ziet alleen bestellingen met artikelen die {BRAND}{" "}
          bij Allure Fulfillment afneemt. Klopt het nummer, vraag het dan na in de chat.
        </EmptyState>
      </Page>
    )
  }

  const due = dueOf(order.handoff)
  const open = order.status === "te-accepteren" || order.status === "te-verzenden"
  const events: Array<TimelineItem> = [
    ...(order.parcel === undefined ? [] : [{
      id: "verzonden",
      at: `${day(order.parcel.at)}, ${time(order.parcel.at)}`,
      glyph: Truck,
      title: `Verzonden met ${order.parcel.carrier}`,
      body: order.parcel.tracking
    }]),
    ...(order.problem === undefined ? [] : [{
      id: "probleem",
      at: `${day(order.problem.at)}, ${time(order.problem.at)}`,
      glyph: AlertTriangle,
      tone: "warn" as const,
      title: `${PROBLEM_LABEL[order.problem.kind]} gemeld`,
      body: order.problem.newDate === undefined
        ? order.problem.note
        : `Nieuwe overdracht ${weekday(order.problem.newDate)}. ${order.problem.note}`
    }]),
    ...(order.acceptedAt === undefined ? [] : [{
      id: "geaccepteerd",
      at: `${day(order.acceptedAt)}, ${time(order.acceptedAt)}`,
      glyph: Check,
      title: "Geaccepteerd door Allure Fulfillment"
    }]),
    {
      id: "ontvangen",
      at: `${day(order.placedAt)}, ${time(order.placedAt)}`,
      glyph: ShoppingBag,
      title: `Doorgestuurd door ${BRAND}`,
      body: `${plural(order.units, "stuk", "stuks")} van jou in deze bestelling.`
    }
  ]

  return (
    <Page width="record">
      <PageHead
        title={`#${order.number}`}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Status tone={STATUS[order.status].tone}>{STATUS[order.status].label}</Status>
            <span>Binnengekomen {day(order.placedAt)}, {time(order.placedAt)}</span>
          </span>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<Printer />}
              onClick={() => {
                downloadSlips([order])
                toast({ title: "Pakbon gedownload", body: `pakbon-${order.number}.html` })
              }}
            >
              Pakbon
            </Button>
            {order.status !== "verzonden" && order.status !== "afgesloten" && order.status !== "probleem" && (
              <Button
                size="sm"
                icon={<AlertTriangle />}
                onClick={() => setDialog("problem")}
              >
                Probleem melden
              </Button>
            )}
            {order.status === "te-accepteren" && (
              <Button
                size="sm"
                variant="primary"
                icon={<Check />}
                onClick={() => accept([order.number])}
              >
                Accepteren
              </Button>
            )}
            {(order.status === "te-verzenden" || order.status === "probleem") && (
              <Button
                size="sm"
                variant="primary"
                icon={<Truck />}
                onClick={() => setDialog("ship")}
              >
                Markeren als verzonden
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          {order.problem !== undefined && (
            <Notice
              tone="warn"
              title={PROBLEM_LABEL[order.problem.kind]}
              action={<Button size="sm" onClick={() => solve(order.number)}>Opgelost</Button>}
            >
              {order.problem.note === "" ? "" : `${order.problem.note} `}
              {BRAND} heeft er een ticket van en ziet de bestelling als vertraagd
              {order.problem.newDate === undefined ? "." : `, tot ${dayLong(order.problem.newDate)}.`}
            </Notice>
          )}

          <PageSection id="artikelen" title="Jouw artikelen" meta={plural(order.units, "stuk", "stuks")}>
            <Table label="Jouw artikelen" minWidth={520}>
              <THead>
                <Th>Artikel</Th>
                <Th>SKU</Th>
                <Th align="right">Aantal</Th>
                <Th align="right">Per stuk</Th>
                <Th align="right">Samen</Th>
              </THead>
              <TBody>
                {order.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td header>
                      <Link
                        to={paths.supplierPortal(`producten/${l.productId}`)}
                        className="flex flex-col py-1.5 hover:text-accent-ink"
                      >
                        <span className="font-medium">{l.title}</span>
                        <span className="text-xs text-ink-3">Maat {l.size}</span>
                      </Link>
                    </Td>
                    <Td muted>{l.sku}</Td>
                    <Td figure align="right">{l.quantity}</Td>
                    <Td figure align="right" muted>{money(l.cost)}</Td>
                    <Td figure align="right">{money(l.cost * l.quantity)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <p className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-ink-2">Wat {BRAND} je hiervoor betaalt</span>
              <span className="figure text-md font-semibold text-ink">{money(order.amount)}</span>
            </p>
          </PageSection>

          <PageSection id="pakketten" title="Pakketten">
            {order.parcel === undefined ?
              <p className="text-sm text-ink-3">Nog niets verzonden.</p> :
              (
                <KeyValue
                  items={[
                    {
                      label: "Vervoerder",
                      value: (
                        <span className="flex items-center gap-2">
                          <ServiceLogo service={order.parcel.carrier} name={order.parcel.carrier} size={20} />
                          {order.parcel.carrier}
                        </span>
                      )
                    },
                    { label: "Track & trace", value: order.parcel.tracking },
                    { label: "Verzonden", value: `${weekday(order.parcel.at)}, ${time(order.parcel.at)}` }
                  ]}
                />
              )}
          </PageSection>

          <PageSection id="verloop" title="Wat er gebeurde">
            <Timeline label={`Verloop van #${order.number}`} items={events} />
          </PageSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="overdracht" className="flex flex-col gap-1">
            <h2 id="overdracht" className="text-xs text-ink-3">Overdragen aan de vervoerder vóór</h2>
            <p className="figure text-lg text-ink">{weekday(order.handoff)}, {time(order.handoff)}</p>
            {open && due === "late" && (
              <p className="text-sm font-medium text-bad-ink">Te laat. {BRAND} ziet dit bij de bestelling.</p>
            )}
            {open && due === "today" && <p className="text-sm text-warn-ink">Vandaag, vóór de ophaling.</p>}
          </section>
          <section aria-labelledby="adres" className="flex flex-col gap-1">
            <h2 id="adres" className="text-xs text-ink-3">Verzendadres</h2>
            <address className="text-sm text-ink not-italic">
              {order.shipTo.name}
              <br />
              {order.shipTo.line1}
              <br />
              {order.shipTo.postcode} {order.shipTo.city}
              <br />
              {order.shipTo.country}
            </address>
            <p className="text-xs text-pretty text-ink-3">E-mail en telefoon van de klant blijven bij {BRAND}.</p>
          </section>
          {order.note !== undefined && (
            <section aria-labelledby="notitie" className="flex flex-col gap-1">
              <h2 id="notitie" className="text-xs text-ink-3">Notitie van {BRAND}</h2>
              <p className="text-sm text-pretty text-ink">{order.note}</p>
            </section>
          )}
          <ButtonLink
            to={`${paths.supplierPortal("chats")}?over=${order.number}`}
            size="sm"
            variant="ghost"
            icon={<MessagesSquare />}
            className="self-start"
          >
            {BRAND} iets vragen over #{order.number}
          </ButtonLink>
        </aside>
      </div>
      <ShipDialog open={dialog === "ship"} orders={[order]} onClose={() => setDialog(null)} />
      <ProblemDialog open={dialog === "problem"} orders={[order]} onClose={() => setDialog(null)} />
    </Page>
  )
}
