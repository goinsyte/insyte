import { Link, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { messagesByConversation } from "../../data-source"
import { ArrowRight, Check, ChevronRight, MessagesSquare, Truck } from "../../icons"
import { EmptyPage } from "../common/empty-page"
import { PageGuide } from "../common/page-guide"
import { useProducts } from "../hooks/use-operator-data"
import { inSupplierView, type SupplierOrderRow, useSupplierOrders } from "../hooks/use-supplier-orders"
import { HISTORY } from "../lib/analytics/history"
import { stockOf, unitsOf } from "../lib/catalog"
import { getGreeting } from "../lib/greetings"
import { ME_SUPPLIER } from "../lib/supplier-work"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { SupplierClosing } from "../marketing-sections/closings"
import { SupplierCheckWork } from "../quality/supplier-checks"
import { useChatStore } from "../stores/chat-store"
import { useWorkspace } from "../stores/workspace-store"
import { ShipDialog } from "./ship-dialog"
import { SupplierStatusChip } from "./status"

/* ─────────────────────────────────────────────────────────────────────
   The supplier's start: what has to leave today, on the brand's plate,
   then the work itself — late first, then today, then what is waiting
   to be accepted — with the stock about to run out and the latest from
   Northwind beside it, and how the supplier has done against the
   promise, from its own deliveries only. A supplier never sees another
   supplier's numbers.
   ───────────────────────────────────────────────────────────────────── */

const GUIDE = [
  {
    title: "Bestellingen accepteren",
    body:
      "Zodra Northwind een bestelling bij je neerlegt, staat hij hier om te accepteren. Nieuwe bestellingen komen als eerste.",
    art: "parcel"
  },
  {
    title: "Verzenden",
    body: "Daarna verzend je met track & trace, en ziet Northwind meteen dat hij onderweg is.",
    art: "handover"
  },
  {
    title: "Hoe je levert",
    body: "Je eigen pakketten, gemeten tegen de leverdatum die de klant zag. Een week onder 90% kleurt oranje.",
    art: "chart"
  }
] as const

const day = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })

export function SupplierDashboard() {
  const navigate = useNavigate()
  const rows = useSupplierOrders()
  const { data: products } = useProducts()
  const [shipping, setShipping] = useState<SupplierOrderRow[] | null>(null)
  const accept = useWorkspace((s) => s.acceptSupplierOrders)
  const snapshot = useWorkspace((s) => s.supplierSnapshot)
  const restore = useWorkspace((s) => s.restoreSupplier)
  const extra = useChatStore((s) => s.extra.conv_supplier_allure)

  const n = {
    accept: rows.filter((r) => inSupplierView(r, "to_accept")).length,
    today: rows.filter((r) => (r.status === "to_ship" || r.status === "to_accept") && r.due === "today").length,
    late: rows.filter((r) => inSupplierView(r, "late")).length,
    problem: rows.filter((r) => r.status === "problem").length
  }
  const perf = usePerformance()

  /* The work, in the order it has to be done: late, then today, then everything waiting to be accepted. */
  const work = useMemo(() => {
    const rank = (
      r: SupplierOrderRow
    ) => (r.due === "late" ? 0 : r.due === "today" ? 1 : r.status === "to_accept" ? 2 : 3)
    return rows
      .filter((r) => r.status === "to_accept" || r.status === "to_ship")
      .sort((a, b) => rank(a) - rank(b) || a.handoff.getTime() - b.handoff.getTime())
      .slice(0, 7)
  }, [rows])

  const low = useMemo(
    () =>
      products
        .filter((p) => p.supplier_id === ME_SUPPLIER.id && p.status === "active" && stockOf(p) !== "available")
        .map((p) => ({ p, units: unitsOf(p) }))
        .sort((a, b) => a.units - b.units)
        .slice(0, 4),
    [products]
  )

  // The last word in the shared #allure-fulfillment thread, whoever had it.
  const last = [...(messagesByConversation.conv_supplier_allure ?? []), ...(extra ?? [])].at(-1)
  const lastMessage = {
    who: last?.sender_id === "u_marco" ? "Jij" : (last?.sender_name ?? "Northwind"),
    body: last?.body ?? "",
    at: last?.at ?? new Date().toISOString()
  }

  const greeting = getGreeting("Marco")
  const sentence = n.late > 0
    ? `${n.late} ${n.late === 1 ? "bestelling is" : "bestellingen zijn"} te laat en ${n.today} ${
      n.today === 1 ? "moet" : "moeten"
    } vandaag naar de vervoerder.`
    : n.today > 0
    ? `${n.today} ${n.today === 1 ? "bestelling moet" : "bestellingen moeten"} vandaag naar de vervoerder.`
    : "Niets hoeft vandaag nog weg."
  const fresh = rows.length === 0

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
                ? "Welkom in het portaal van Northwind. Hier komen de bestellingen die je voor hen levert."
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
                  label: "Op tijd bezorgd, 30 dagen",
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
              title="Nog geen bestellingen van Northwind"
              body="Nieuwe bestellingen van Northwind komen hier binnen."
              action={{ label: "Producten bekijken", onClick: () => void navigate({ to: "/supplier/products" }) }}
              secondary={{
                label: "API koppelen",
                onClick: () => void navigate({ to: "/supplier/settings/api-connection" })
              }}
              starts={[
                {
                  id: "profile",
                  label: "Je bedrijfsgegevens",
                  body: "Naam, contactpersoon en wat je levert, zoals Northwind het ziet.",
                  to: "/supplier/settings/profile"
                },
                {
                  id: "notify",
                  label: "Kiezen wat je hoort",
                  body: "Een mail bij elke nieuwe bestelling, of één overzicht per dag.",
                  to: "/supplier/settings/notifications"
                },
                {
                  id: "chat",
                  label: "Chat met Northwind",
                  body: "Het gedeelde kanaal #allure-fulfillment, voor alles wat niet in een bestelling past.",
                  to: "/supplier/chats"
                }
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
                  <SupplierCheckWork />
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
                                  onClick={() => {
                                    const before = snapshot()
                                    accept(ME_SUPPLIER.id, [r.id])
                                    undoable(`${r.number} geaccepteerd`, () => restore(before))
                                  }}
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
                          {low.map(({ p, units }) => (
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
                                    units === 0 ? "text-signal-red" : "text-signal-amber"
                                  )}
                                >
                                  {units === 0 ? "Uitverkocht" : `${units} over`}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                  </section>

                  <section aria-labelledby="chat-title" className="flex flex-col gap-2">
                    <h2 id="chat-title" className="font-medium text-ink text-xl">
                      Van Northwind
                    </h2>
                    <Link
                      to="/supplier/chats"
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
                </aside>
              </div>

              <Performance perf={perf} problems={n.problem} />
              <SupplierClosing />
            </>
          )}
      </div>
      <ShipDialog rows={shipping ?? []} open={shipping !== null} onOpenChange={(v) => !v && setShipping(null)} />
      <PageGuide id="supplier.dashboard" title="Overzicht" steps={GUIDE} />
    </div>
  )
}

/** On time against the promise, week by week, over this supplier's own delivered parcels. */
function usePerformance() {
  return useMemo(() => {
    const mine = HISTORY.orders.filter((o) => o.supplier === ME_SUPPLIER.id && o.arrived !== undefined)
    const end = Date.parse("2026-05-26T00:00:00Z")
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const to = end - (7 - i) * 7 * 86_400_000
      const from = to - 6 * 86_400_000
      const xs = mine.filter((o) => {
        const t = Date.parse(`${o.arrived}T00:00:00Z`)
        return t >= from && t <= to
      })
      const late = xs.filter((o) => o.took! > o.promised).length
      return {
        label: new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(new Date(to)),
        onTime: xs.length === 0 ? 0 : Math.round(((xs.length - late) / xs.length) * 1000) / 10,
        n: xs.length,
        late
      }
    })
    const last30 = mine.filter((o) => Date.parse(`${o.arrived}T00:00:00Z`) > end - 30 * 86_400_000)
    const late30 = last30.filter((o) => o.took! > o.promised)
    return {
      weeks,
      onTime30: last30.length === 0 ? 0 : Math.round(((last30.length - late30.length) / last30.length) * 1000) / 10,
      parcels30: last30.length,
      lateBy: late30.length === 0
        ? 0
        : Math.round((late30.reduce((n, o) => n + o.took! - o.promised, 0) / late30.length) * 10) / 10
    }
  }, [])
}

function Performance({ perf, problems }: { perf: ReturnType<typeof usePerformance>; problems: number }) {
  return (
    <section aria-labelledby="perf-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="perf-title" className="font-medium text-ink text-xl">
          Hoe je levert voor Northwind
        </h2>
        <p className="text-ink-3 text-sm">Op tijd bezorgd, acht weken tot 26 mei.</p>
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
