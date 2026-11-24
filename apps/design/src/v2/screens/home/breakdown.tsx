import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { BarChart } from "../../charts/bar-chart.tsx"
import { formatChange, formatValue, judge } from "../../charts/format.ts"
import { RankChart } from "../../charts/rank-chart.tsx"
import type { Figure } from "../../charts/types.ts"
import { ARRIVALS, FIRST_REPLY } from "../../fixtures/home.ts"
import { channelLabel, openTicketsOf, TICKETS, waitedMinutes, waitingLong } from "../../fixtures/inbox.ts"
import { ORDER_STATUS, ORDERS_TODAY, product, VAT } from "../../fixtures/records.ts"
import { DEMO_NOW, PEOPLE, STORES } from "../../fixtures/workspace.ts"
import { paths } from "../../router.tsx"
import { ButtonLink } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { ChevronDown } from "../../ui/icons.tsx"

/*
 * "Where does this number come from": each of today's figures on Start, taken apart. The parts add
 * back up to the figure (by store, by product, the shipping beside the lines), and what is not in
 * it is said, so a figure can be traced before it is acted on. A figure in the head opens its own
 * breakdown; a card can open one too (`useOpenBreakdown`).
 */

export type Kpi = "Omzet" | "Bestellingen" | "Open tickets" | "Eerste reactie"

const OpenContext = createContext<(kpi: Kpi) => void>(() => undefined)

export const BreakdownProvider = OpenContext.Provider

/** Opens a figure's breakdown from anywhere on Start. */
export const useOpenBreakdown = () => useContext(OpenContext)

const SIGNAL = { good: "text-good-ink", bad: "text-bad-ink", flat: "text-ink-3" } as const

/**
 * Today's figures as a thin line, like the chart system's strip, but each one a button that opens
 * where it comes from.
 */
export function KpiStrip({ figures, onOpen, compareLabel }: {
  readonly figures: ReadonlyArray<Figure>
  readonly onOpen: (kpi: Kpi) => void
  readonly compareLabel: string
}) {
  return (
    <ul aria-label={`Vandaag tot ${DEMO_NOW.clock}`} className="flex shrink-0 gap-x-1 sm:flex-wrap sm:gap-x-3">
      {figures.map((figure) => {
        const verdict = judge(figure.value, figure.previous, figure.better)
        return (
          <li key={figure.label}>
            <button
              type="button"
              onClick={() => onOpen(figure.label as Kpi)}
              title={`Waar ${figure.label.toLowerCase()} vandaan komt`}
              className="group -mx-1 flex min-w-0 flex-col gap-0.5 rounded-sm px-2 py-1 text-left transition-colors hover:bg-hover"
            >
              <span className="flex items-center gap-0.5 truncate text-2xs text-ink-3 group-hover:text-ink-2">
                {figure.label}
                <ChevronDown size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="figure text-sm font-medium text-ink sm:text-md">
                  {formatValue(figure.value, figure.format)}
                </span>
                <span className={cx("figure text-2xs font-medium", SIGNAL[verdict])}>
                  {formatChange(figure.value, figure.previous, figure.format)}
                  <span className="sr-only">
                    ; {compareLabel} {formatValue(figure.previous, figure.format)}
                  </span>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function BreakdownDialog({ kpi, figures, arrived, onClose }: {
  readonly kpi: Kpi | null
  readonly figures: ReadonlyArray<Figure>
  /** How many of today's late arrivals the board has read since it opened. */
  readonly arrived: number
  readonly onClose: () => void
}) {
  const figure = figures.find((f) => f.label === kpi)
  const value = figure === undefined ? "" : formatValue(figure.value, figure.format)
  return (
    <Dialog
      open={kpi !== null && figure !== undefined}
      onClose={onClose}
      size="md"
      title={kpi === "Eerste reactie" ? `Waarom de eerste reactie ${value} is` : `Waar ${value} vandaan komt`}
      description={kpi === null ? undefined : DESCRIPTION[kpi]}
      footer={kpi === null ?
        undefined :
        (
          <ButtonLink to={FOOT[kpi].href} variant="secondary" size="sm" onClick={onClose}>
            {FOOT[kpi].label}
          </ButtonLink>
        )}
    >
      {kpi === "Omzet" && figure !== undefined && <RevenueParts figure={figure} arrived={arrived} />}
      {kpi === "Bestellingen" && figure !== undefined && <OrderParts figure={figure} arrived={arrived} />}
      {kpi === "Open tickets" && <TicketParts />}
      {kpi === "Eerste reactie" && <ReplyParts />}
    </Dialog>
  )
}

const DESCRIPTION: Readonly<Record<Kpi, string>> = {
  Omzet: `Bestelwaarde zonder btw van vandaag tot ${DEMO_NOW.clock}, zoals Analyse hem telt.`,
  Bestellingen: `Elke bestelling die vandaag tot ${DEMO_NOW.clock} binnenkwam, in beide winkels.`,
  "Open tickets": "Tickets die nog niet klaar zijn, over alle kanalen.",
  "Eerste reactie": "De mediaan van de tijd tot het eerste antwoord, over de tickets van vandaag."
}

const FOOT: Readonly<Record<Kpi, { readonly label: string; readonly href: string }>> = {
  Omzet: { label: "Naar Analyse", href: paths.board("week") },
  Bestellingen: { label: "Bestellingen openen", href: paths.orders },
  "Open tickets": { label: "Inbox openen", href: paths.inbox },
  "Eerste reactie": { label: "Inbox openen", href: paths.inbox }
}

function Facts({ items }: { readonly items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="grid grid-cols-3 gap-4">
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="truncate text-2xs text-ink-3">{label}</dt>
          <dd className="figure text-md font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Part({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-ink-2">{title}</h3>
      {children}
    </section>
  )
}

const euro = (n: number) => formatValue(Math.round(n), "euro")
const storeName = (id: string) => STORES.find((s) => s.id === id)?.name ?? id

function RevenueParts({ figure, arrived }: { readonly figure: Figure; readonly arrived: number }) {
  const late = ARRIVALS.slice(0, arrived)
  const lateTotal = late.reduce((sum, a) => sum + a.amount, 0)
  const count = ORDERS_TODAY.length + late.length

  const byStore = new Map<string, number>()
  const byProduct = new Map<string, { value: number; units: number }>()
  let extras = 0
  for (const o of ORDERS_TODAY) {
    byStore.set(o.storeId, (byStore.get(o.storeId) ?? 0) + o.total / VAT)
    const lines = o.lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
    extras += (o.total - lines) / VAT
    for (const l of o.lines) {
      const row = byProduct.get(l.productId) ?? { value: 0, units: 0 }
      byProduct.set(l.productId, { value: row.value + (l.price * l.quantity) / VAT, units: row.units + l.quantity })
    }
  }
  const products = [...byProduct].toSorted((a, b) => b[1].value - a[1].value)
  const top = products.slice(0, 5)
  const rest = products.slice(5)
  const restValue = rest.reduce((sum, [, r]) => sum + r.value, 0)

  return (
    <div className="flex flex-col gap-6">
      <Facts
        items={[
          ["Bestellingen geteld", String(count)],
          ["Gemiddelde bestelling", euro(figure.value / Math.max(1, count))],
          [`Vorige maandag, ${DEMO_NOW.clock}`, euro(figure.previous)]
        ]}
      />
      <Part title="Per winkel">
        <RankChart
          data={{
            items: [...byStore].map(([id, v]) => ({ label: storeName(id), value: Math.round(v) })),
            format: "euro",
            focus: 0
          }}
        />
      </Part>
      <Part title="Per product">
        <ul className="flex flex-col gap-1.5 text-sm">
          {top.map(([id, r]) => (
            <li key={id} className="grid grid-cols-[minmax(0,1fr)_auto_5.5rem] items-baseline gap-x-3">
              <span className="truncate text-ink">{product(id)?.name ?? id}</span>
              <span className="figure text-xs text-ink-3">{r.units} verkocht</span>
              <span className="figure text-right text-ink-2">{euro(r.value)}</span>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-baseline gap-x-3 text-ink-3">
              <span>{rest.length} andere producten</span>
              <span className="figure text-right">{euro(restValue)}</span>
            </li>
          )}
          <li className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-baseline gap-x-3 text-ink-3">
            <span>Verzending min kortingen</span>
            <span className="figure text-right">{euro(extras)}</span>
          </li>
          {late.length > 0 && (
            <li className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-baseline gap-x-3 text-ink-3">
              <span>
                Sinds {DEMO_NOW.clock} binnen: {late.map((a) => `${a.what} uit ${a.from}`).join(", ")}
              </span>
              <span className="figure text-right">{euro(lateTotal)}</span>
            </li>
          )}
        </ul>
      </Part>
      <p className="text-xs text-pretty text-ink-3">
        Geannuleerde en terugbetaalde bestellingen tellen niet mee; vandaag waren dat er geen.
      </p>
    </div>
  )
}

/** Today's orders counted by one of their fields, the biggest first. */
function tally(key: (o: (typeof ORDERS_TODAY)[number]) => string) {
  const counts = new Map<string, number>()
  for (const o of ORDERS_TODAY) counts.set(key(o), (counts.get(key(o)) ?? 0) + 1)
  return [...counts].map(([label, value]) => ({ label, value })).toSorted((a, b) => b.value - a.value)
}

function OrderParts({ figure, arrived }: { readonly figure: Figure; readonly arrived: number }) {
  const hours = Array.from({ length: DEMO_NOW.hours + 1 }, (_, h) => h).filter((h) => h >= 6)
  const perHour = hours.map((h) => ({
    label: `${h}`,
    value: ORDERS_TODAY.filter((o) => o.placedAt.getHours() === h).length
  }))
  return (
    <div className="flex flex-col gap-6">
      <Facts
        items={[
          ["Vandaag", String(figure.value)],
          ["Sinds je Start opende", String(arrived)],
          [`Vorige maandag, ${DEMO_NOW.clock}`, String(figure.previous)]
        ]}
      />
      <Part title="Per uur">
        <BarChart
          data={{ items: perHour, format: "count", focus: perHour.length - 1 }}
          height={140}
        />
      </Part>
      <div className="grid gap-6 sm:grid-cols-2">
        <Part title="Waar ze nu zijn">
          <RankChart
            data={{
              items: tally((o) => ORDER_STATUS[o.status].label),
              format: "count"
            }}
          />
        </Part>
        <Part title="Hoe ze betaalden">
          <RankChart data={{ items: tally((o) => o.payment), format: "count" }} />
        </Part>
      </div>
    </div>
  )
}

function TicketParts() {
  const open = openTicketsOf(TICKETS)
  const long = waitingLong(TICKETS)
  const count = (key: (t: (typeof open)[number]) => string) => {
    const counts = new Map<string, number>()
    for (const t of open) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1)
    return [...counts].map(([label, value]) => ({ label, value })).toSorted((a, b) => b.value - a.value)
  }
  const oldest = Math.max(0, ...open.map((t) => waitedMinutes(t) ?? 0))
  return (
    <div className="flex flex-col gap-6">
      <Facts
        items={[
          ["Open", String(open.length)],
          ["Langer dan 4 uur", String(long.length)],
          ["Langst wachtend", `${Math.floor(oldest / 60)} u`]
        ]}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <Part title="Per kanaal">
          <RankChart data={{ items: count((t) => channelLabel(t.channel)), format: "count" }} />
        </Part>
        <Part title="Bij wie">
          <RankChart
            data={{
              items: count((t) => (t.assignee === null ? "Niemand" : PEOPLE[t.assignee].name)),
              format: "count"
            }}
          />
        </Part>
      </div>
    </div>
  )
}

function ReplyParts() {
  return (
    <div className="flex flex-col gap-6">
      <Facts
        items={[
          ["Eerste antwoorden", String(FIRST_REPLY.replies)],
          ["Door een agent", String(FIRST_REPLY.byPerson[0].count)],
          ["Snelste kanaal", FIRST_REPLY.byChannel[0].label]
        ]}
      />
      <Part title="Per kanaal, mediaan">
        <RankChart data={{ items: [...FIRST_REPLY.byChannel].toReversed(), format: "minutes" }} />
      </Part>
      <Part title="Per persoon of agent">
        <ul className="flex flex-col gap-1.5 text-sm">
          {FIRST_REPLY.byPerson.map((p) => (
            <li key={p.label} className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-baseline gap-x-3">
              <span className="truncate text-ink">{p.label}</span>
              <span className="figure text-xs text-ink-3">{p.count} tickets</span>
              <span className="figure text-right text-ink-2">{formatValue(p.value, "minutes")}</span>
            </li>
          ))}
        </ul>
      </Part>
    </div>
  )
}
