import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowRight, Check, ChevronRight, MessagesSquare, Truck } from "../../icons"
import { EmptyPage } from "../common/empty-page"
import { PageGuide } from "../common/page-guide"
import { getGreeting } from "../lib/greetings"
import { cn } from "../lib/utils"
import { ShipDialog } from "./ship-dialog"
import { type SupplierOrderRow, type SupplierPerformance, useSupplierPortal } from "./source"
import { SupplierStatusChip } from "./status"

/* ─────────────────────────────────────────────────────────────────────
   The supplier's start: what has to leave today, on the brand's plate,
   then the work itself — late first, then today, then what is waiting
   to be accepted — with the stock about to run out and the latest from
   the brand beside it, and how the supplier has done against the
   promise, from its own deliveries only. A supplier never sees another
   supplier's numbers.
   ───────────────────────────────────────────────────────────────────── */

const guideOf = (brand: string, measure: string) =>
  [
    {
      title: "Bestellingen accepteren",
      body:
        `Zodra ${brand} een bestelling bij je neerlegt, staat hij hier om te accepteren. Nieuwe bestellingen komen als eerste.`,
      art: "parcel"
    },
    {
      title: "Verzenden",
      body: `Daarna verzend je met track & trace, en ziet ${brand} meteen dat hij onderweg is.`,
      art: "handover"
    },
    {
      title: "Hoe je levert",
      body: measure === "Op tijd bezorgd"
        ? "Je eigen pakketten, gemeten tegen de leverdatum die de klant zag. Een week onder 90% kleurt oranje."
        : "Je eigen pakketten, gemeten tegen de dag dat ze bij de vervoerder moesten zijn. Een week onder 90% kleurt oranje.",
      art: "chart"
    }
  ] as const

const day = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })

export function SupplierDashboard() {
  const navigate = useNavigate()
  const portal = useSupplierPortal()
  const { brand, parts } = portal
  const view = portal.useDashboard()
  const [shipping, setShipping] = useState<SupplierOrderRow[] | null>(null)
  const n = view.counts
  const perf = view.performance
  const work = view.work
  const low = view.low
  const lastMessage = parts.chat ? view.lastMessage : undefined
  const CheckWork = parts.CheckWork
  const Closing = parts.Closing

  const greeting = getGreeting(portal.firstName)
  const sentence = n.late > 0
    ? `${n.late} ${n.late === 1 ? "bestelling is" : "bestellingen zijn"} te laat en ${n.today} ${
      n.today === 1 ? "moet" : "moeten"
    } vandaag naar de vervoerder.`
    : n.today > 0
    ? `${n.today} ${n.today === 1 ? "bestelling moet" : "bestellingen moeten"} vandaag naar de vervoerder.`
    : "Niets hoeft vandaag nog weg."
  const fresh = view.fresh

  return (
    <div className="px-6 py-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <section aria-labelledby="sup-title" className="plate overflow-hidden rounded-2xl">
          <span aria-hidden className="plate-scan" />
          <header className="flex flex-col gap-1.5 px-7 pt-6">
            <h1 id="sup-title" className="font-medium text-mesh-ink text-xl">
              {greeting.salutation}
            </h1>
            <p className="text-base text-mesh-ink-2">
              {fresh
                ? `Welkom in het portaal van ${brand}. Hier komen de bestellingen die je voor hen levert.`
                : sentence}
            </p>
          </header>
          {fresh ? <div className="h-6" /> : (
            <dl className="grid grid-cols-2 px-3 pt-6 pb-4 sm:grid-cols-4">
              {[
                { label: "Te accepteren", value: n.accept, view: "to_accept" },
                { label: "Vandaag overdragen", value: n.today, view: undefined },
                { label: "Te laat", value: n.late, view: "late", warn: n.late > 0 },
                {
                  label: `${perf.measure}, 30 dagen`,
                  value: perf.parcels30 === 0 ? "—" : `${perf.onTime30.toLocaleString("nl-NL")}%`,
                  view: "shipped"
                }
              ].map((it, i) => (
                <div
                  key={it.label}
                  className={cn(
                    i > 0 && "sm:shadow-[inset_1px_0_0_color-mix(in_oklch,var(--mesh-ink)_12%,transparent)]"
                  )}
                >
                  <Link
                    to="/supplier/orders"
                    search={(it.view ? { view: it.view } : {}) as never}
                    className="flex flex-col gap-2 rounded-xl px-4 py-4 transition-colors hover:bg-mesh-ink/8"
                  >
                    <dt className="text-mesh-ink-2 text-sm">{it.label}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="figure text-4xl text-mesh-ink">{it.value}</span>
                      {"warn" in it && it.warn
                        ? <span className="size-2 rounded-full bg-signal-red" aria-label="vraagt aandacht" />
                        : null}
                    </dd>
                  </Link>
                </div>
              ))}
            </dl>
          )}
        </section>

        {fresh ?
          (
            <EmptyPage
              className="mx-0 pt-0 sm:pt-0"
              kind="orders"
              count="0 bestellingen"
              title={`Nog geen bestellingen van ${brand}`}
              body={`Nieuwe bestellingen van ${brand} komen hier binnen.`}
              action={{ label: "Producten bekijken", onClick: () => void navigate({ to: "/supplier/products" }) }}
              secondary={parts.settings
                ? {
                  label: "API koppelen",
                  onClick: () => void navigate({ to: "/supplier/settings/api-connection" as never })
                }
                : undefined}
              starts={[
                ...(parts.settings
                  ? [
                    {
                      id: "profile",
                      label: "Je bedrijfsgegevens",
                      body: `Naam, contactpersoon en wat je levert, zoals ${brand} het ziet.`,
                      to: "/supplier/settings/profile"
                    },
                    {
                      id: "notify",
                      label: "Kiezen wat je hoort",
                      body: "Een mail bij elke nieuwe bestelling, of één overzicht per dag.",
                      to: "/supplier/settings/notifications"
                    }
                  ]
                  : []),
                ...(parts.chat
                  ? [{
                    id: "chat",
                    label: `Chat met ${brand}`,
                    body: "Het gedeelde kanaal #allure-fulfillment, voor alles wat niet in een bestelling past.",
                    to: "/supplier/chats"
                  }]
                  : [])
              ]}
            />
          ) :
          (
            <>
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
                <section aria-labelledby="work-title" className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <h2 id="work-title" className="font-medium text-ink text-xl">
                      Eerst dit
                    </h2>
                    <Link
                      to="/supplier/orders"
                      search={{ view: "all" } as never}
                      className="flex items-center gap-1 font-medium text-arc-ink text-sm hover:underline"
                    >
                      Alle bestellingen
                      <ChevronRight className="size-3.5" strokeWidth={2} />
                    </Link>
                  </div>
                  {CheckWork ? <CheckWork /> : null}
                  {work.length === 0 ?
                    (
                      <p className="rounded-xl bg-mist px-4 py-6 text-ink-2 text-sm">
                        Alles is geaccepteerd en verzonden.
                      </p>
                    ) :
                    (
                      <ul className="flex flex-col">
                        {work.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center gap-4 py-3 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
                          >
                            <Link
                              to="/supplier/orders/$orderId"
                              params={{ orderId: r.id }}
                              className="group flex min-w-0 flex-1 items-center gap-4"
                            >
                              <span className="w-[4.5rem] shrink-0 font-medium text-ink tabular-nums group-hover:text-arc-ink">
                                {r.number}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-ink-2 text-sm">
                                {r.lines.map((l) => `${l.quantity}× ${l.title}`).join(", ")}
                              </span>
                              <span className="hidden shrink-0 items-center gap-2 text-sm sm:flex">
                                <span className="text-ink-3 tabular-nums">{day.format(r.handoff)}</span>
                                {r.due === "late" ?
                                  (
                                    <span className="rounded-sm bg-signal-red-bg px-1.5 py-0.5 font-medium text-signal-red text-xs">
                                      Te laat
                                    </span>
                                  ) :
                                  r.due === "today" ?
                                  (
                                    <span className="rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs">
                                      Vandaag
                                    </span>
                                  ) :
                                  <SupplierStatusChip status={r.status} />}
                              </span>
                            </Link>
                            {r.status === "to_accept" ?
                              (
                                <button
                                  type="button"
                                  onClick={() => portal.accept([r], { message: `${r.number} geaccepteerd` })}
                                  className="flex h-8 w-[7.5rem] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-mist font-medium text-ink text-sm hover:bg-ink/8"
                                >
                                  <Check className="size-3.5" strokeWidth={2} />
                                  Accepteren
                                </button>
                              ) :
                              (
                                <button
                                  type="button"
                                  onClick={() => setShipping([r])}
                                  className="flex h-8 w-[7.5rem] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-abyss font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
                                >
                                  <Truck className="size-3.5" strokeWidth={1.75} />
                                  Verzenden
                                </button>
                              )}
                          </li>
                        ))}
                      </ul>
                    )}
                </section>

                <aside className="flex flex-col gap-8">
                  <section aria-labelledby="stock-title" className="flex flex-col gap-2">
                    <h2 id="stock-title" className="font-medium text-ink text-xl">
                      Bijna op
                    </h2>
                    {low.length === 0 ?
                      <p className="text-ink-3 text-sm">Alles is genoeg op voorraad.</p> :
                      (
                        <ul className="flex flex-col">
                          {low.map((p) => (
                            <li key={p.id}>
                              <Link
                                to="/supplier/products/$productId"
                                params={{ productId: p.id }}
                                className="flex items-center justify-between gap-3 py-2 text-sm hover:text-arc-ink"
                              >
                                <span className="truncate text-ink">{p.title}</span>
                                <span
                                  className={cn(
                                    "shrink-0 font-medium tabular-nums",
                                    p.units === 0 ? "text-signal-red" : "text-signal-amber"
                                  )}
                                >
                                  {p.units === 0 ? "Uitverkocht" : `${p.units} over`}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                  </section>

                  {lastMessage ?
                    (
                      <section aria-labelledby="chat-title" className="flex flex-col gap-2">
                        <h2 id="chat-title" className="font-medium text-ink text-xl">
                          Van {brand}
                        </h2>
                        <Link
                          to={"/supplier/chats" as never}
                          className="group flex flex-col gap-1.5 rounded-xl bg-mist p-4 transition-colors hover:bg-ink/6"
                        >
                          <span className="flex items-center gap-2 text-ink-3 text-xs">
                            <MessagesSquare className="size-3.5" strokeWidth={1.75} />
                            {lastMessage.who} ·{" "}
                            {new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(
                              new Date(lastMessage.at)
                            )}
                          </span>
                          <span className="line-clamp-2 text-ink text-sm">{lastMessage.body}</span>
                          <span className="flex items-center gap-1 font-medium text-arc-ink text-sm">
                            Antwoorden
                            <ArrowRight
                              className="size-3.5 transition-transform group-hover:translate-x-0.5"
                              strokeWidth={2}
                            />
                          </span>
                        </Link>
                      </section>
                    ) :
                    null}
                </aside>
              </div>

              <Performance perf={perf} problems={n.problem} brand={brand} />
              {Closing ? <Closing /> : null}
            </>
          )}
      </div>
      <ShipDialog rows={shipping ?? []} open={shipping !== null} onOpenChange={(v) => !v && setShipping(null)} />
      <PageGuide id="supplier.dashboard" title="Overzicht" steps={guideOf(brand, perf.measure)} />
    </div>
  )
}

function Performance(
  { perf, problems, brand }: { perf: SupplierPerformance; problems: number; brand: string }
) {
  return (
    <section aria-labelledby="perf-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="perf-title" className="font-medium text-ink text-xl">
          Hoe je levert voor {brand}
        </h2>
        <p className="text-ink-3 text-sm">
          {perf.measure}, acht weken tot {perf.until}.
        </p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perf.weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
              <YAxis
                domain={[80, 100]}
                tick={{ fontSize: 12, fill: "var(--ink-3)" }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in oklch, var(--ink) 4%, transparent)" }}
                content={({ active, payload, label }) =>
                  active && payload?.[0] ?
                    (
                      <div className="panel-raised rounded-lg px-3 py-2 text-sm">
                        <p className="font-medium text-ink">Week tot {String(label)}</p>
                        <p className="text-ink-2 tabular-nums">
                          {String(payload[0].value).replace(".", ",")}% op tijd ·{" "}
                          {(payload[0].payload as { late: number }).late} te laat van{" "}
                          {(payload[0].payload as { n: number }).n}
                        </p>
                      </div>
                    ) :
                    null}
              />
              <Bar dataKey="onTime" radius={[2, 2, 0, 0]}>
                {perf.weeks.map((w) => (
                  <Cell
                    key={w.label}
                    fill={w.onTime >= 90 ? "var(--arc)" : "color-mix(in oklch, var(--signal-amber) 75%, transparent)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <dl className="flex flex-col">
          {[
            ["Pakketten, 30 dagen", perf.parcels30.toLocaleString("nl-NL")],
            ["Te laat, gemiddeld", `${perf.lateBy.toLocaleString("nl-NL")} dag${perf.lateBy === 1 ? "" : "en"}`],
            ["Problemen gemeld, open", String(problems)]
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline justify-between py-2.5 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
            >
              <dt className="text-ink-2 text-sm">{k}</dt>
              <dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
