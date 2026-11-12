import { Link } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Box,
  CornerDownLeft,
  Hash,
  type IconComponent,
  Pause,
  Play,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Workflow,
  X
} from "../../icons"
import { Glyph } from "../common/glyph"
import { formatCurrency, initials } from "../lib/format"
import { countryFlag, countryName } from "../lib/format-flag"
import { ago } from "../lib/home/dates"
import { personStyle } from "../lib/person-color"
import type { Currency } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { ProductThumb } from "../product/product-thumb"
import type { Shortcut, ShortcutKind } from "../stores/pins-store"

import { STATUS_LABEL } from "../lib/returns"
import { ReturnStatusBadge } from "../returns/parts"

/*
 * The board's cards over plain figures: what a host hands them, the demo's stores or the console's `Home.widgets`.
 * Nothing here reads a store, so the console can draw them with no data source installed (ADR-0034).
 */

/** A row's hover wash, the same on every ground the operator can give a card. */
export const ROW = "flex h-9 min-w-0 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/[0.045]"

export function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1 text-sm text-ink-3">{children}</p>
}

export type LiveRow = {
  id: string
  number: string
  customer: string
  qty: number
  title: string
  image?: string | undefined
  /** In the board's currency, or in `currency` when the row says its own. */
  total: number
  currency?: Currency | undefined
  country: string | null
  at: number
  /** Where the row opens, or nowhere. */
  to: string | null
}

/** The orders as they arrive, today's count and value, and the pause. */
export function LiveView({
  rows,
  today,
  auto,
  paused,
  onPause: setPaused,
  currency
}: {
  rows: ReadonlyArray<LiveRow>
  today: { count: number; sum: number }
  auto: boolean
  paused: boolean
  onPause: (paused: boolean) => void
  currency: Currency
}) {
  const still = useReducedMotion()
  const running = auto && !paused
  if (rows.length === 0 && today.count === 0) return <Quiet>Nog geen bestellingen.</Quiet>
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-2 text-sm text-ink-2">
        <span className="relative flex size-2" aria-hidden>
          {running && !still
            ? <span className="absolute inset-0 animate-ping rounded-full bg-signal-green/60" />
            : null}
          <span className={cn("relative size-2 rounded-full", running ? "bg-signal-green" : "bg-ink-4")} />
        </span>
        <span className="min-w-0 flex-1 truncate tabular-nums">
          {running ? "Live" : auto ? "Gepauzeerd" : "Automatisch bijwerken staat uit"} · {today.count} vandaag ·{" "}
          {formatCurrency(today.sum, currency)}
        </span>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          disabled={!auto}
          aria-label={paused ? "Live bestellingen hervatten" : "Live bestellingen pauzeren"}
          title={paused ? "Hervatten" : "Pauzeren"}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          {paused
            ? <Play className="size-3.5" strokeWidth={1.75} />
            : <Pause className="size-3.5" strokeWidth={1.75} />}
        </button>
      </div>
      <ul className="flex flex-col" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {rows.map((o) => (
            <motion.li
              key={o.id}
              layout={still ? false : "position"}
              initial={still ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 40 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="relative isolate overflow-hidden rounded-md"
            >
              {/* A new order arrives tinted and the tint fades, behind the row, in the token's own colour. */}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 bg-arc-tint"
                initial={still ? false : { opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 2.4, ease: "easeOut" }}
              />
              <LiveLink to={o.to} title={o.title}>
                <ProductThumb src={o.image} title={o.title} size={28} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-base text-ink">
                    <span className="font-medium tabular-nums">{o.number}</span> · {o.customer}
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {o.qty} × {o.title}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end leading-tight">
                  <span className="text-sm text-ink tabular-nums">
                    {formatCurrency(o.total, o.currency ?? currency)}
                  </span>
                  <span className="text-xs text-ink-3">
                    {o.country ? <span aria-label={countryName(o.country)}>{countryFlag(o.country)}</span> : null}{" "}
                    {ago(o.at)}
                  </span>
                </span>
              </LiveLink>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

export function LiveLink({ to, title, children }: { to: string | null; title: string; children: React.ReactNode }) {
  if (to === null) return <span className={cn(ROW, "h-10 hover:bg-transparent")}>{children}</span>
  return (
    <Link to={to} title={`${title} openen`} className={cn(ROW, "h-10")}>
      {children}
    </Link>
  )
}

export const SHORT: Record<ShortcutKind, { icon: IconComponent; area: string }> = {
  order: { icon: ShoppingBag, area: "Bestellingen" },
  customer: { icon: Users, area: "Klanten" },
  chargeback: { icon: CornerDownLeft, area: "Chargebacks" },
  product: { icon: Box, area: "Producten" },
  automation: { icon: Workflow, area: "Automatiseringen" },
  supplier: { icon: Truck, area: "Leveranciers" },
  store: { icon: Store, area: "Winkels" }
}

export function ShortcutRow({ s, trail, onRemove }: { s: Shortcut; trail?: React.ReactNode; onRemove?: () => void }) {
  const k = SHORT[s.kind]
  return (
    <li className="group/s relative">
      <Link to={s.to} className={cn(ROW, "glyph-host pr-8")}>
        <Glyph icon={k.icon} size={14} draw={false} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-base text-ink">
          {s.label} <span className="text-ink-3">in {k.area}</span>
        </span>
        {trail}
      </Link>
      {onRemove ?
        (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${s.label} uit je bladwijzers halen`}
            className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/8 hover:text-ink focus-visible:opacity-100 group-hover/s:opacity-100"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        ) :
        null}
    </li>
  )
}

/** The records the person opened last. */
export function RecentView({ recent }: { recent: ReadonlyArray<Shortcut> }) {
  if (recent.length === 0) return <Quiet>Nog niets geopend.</Quiet>
  return (
    <ul className="flex flex-col">
      {recent.map((r) => (
        <ShortcutRow
          key={r.to}
          s={r}
          trail={r.at ? <span className="shrink-0 text-xs text-ink-3 tabular-nums">{ago(r.at)}</span> : null}
        />
      ))}
    </ul>
  )
}

export type BestsellerRow = {
  id: string
  title: string
  image?: string | undefined
  units: number
  revenue: number
  stock: number
}

/** What sold most in the window, with the stock that is left. `revenue` is in the board's currency. */
export function BestsellersView({ rows, currency }: { rows: ReadonlyArray<BestsellerRow>; currency: Currency }) {
  if (rows.length === 0) return <Quiet>Nog geen verkopen.</Quiet>
  return (
    <ul className="flex flex-col">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link to="/products/$productId" params={{ productId: r.id }} className={cn(ROW, "h-11")}>
            <span className="w-3 shrink-0 text-right text-xs text-ink-3 tabular-nums">{i + 1}</span>
            <ProductThumb src={r.image} title={r.title} size={32} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-base text-ink">{r.title}</span>
              <span className="truncate text-xs text-ink-3 tabular-nums">
                {r.units.toLocaleString("nl-NL")} verkocht · {formatCurrency(r.revenue, currency)}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-sm px-1.5 py-0.5 font-medium text-xs tabular-nums",
                r.stock === 0
                  ? "bg-signal-red-bg text-signal-red"
                  : r.stock <= 40
                  ? "bg-signal-amber-bg text-signal-amber"
                  : "text-ink-3"
              )}
            >
              {r.stock === 0 ? "Uitverkocht" : r.stock <= 40 ? `nog ${r.stock}` : `${r.stock} op voorraad`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export type CountryRow = { country: string | null; name: string; n: number }

/** Where the window's orders came from, by shipping country. `analyse` when the breakdown has its screen. */
export function CountriesView(
  { rows, range, analyse = true }: { rows: ReadonlyArray<CountryRow>; range: number; analyse?: boolean }
) {
  const still = useReducedMotion()
  const total = rows.reduce((n, r) => n + r.n, 0)
  const max = Math.max(1, ...rows.map((r) => r.n))

  if (total === 0) return <Quiet>Nog geen bestellingen.</Quiet>
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 text-sm text-ink-2 tabular-nums">
        {total.toLocaleString("nl-NL")} bestellingen in {rows.length} landen, laatste {range} dagen
      </p>
      <ul className="flex flex-col">
        {rows.map((r, i) => (
          <li key={r.country ?? "none"}>
            <CountryLink analyse={analyse}>
              <motion.span
                aria-hidden
                className="absolute inset-y-1 left-0 rounded-md bg-arc/10"
                initial={still ? false : { width: 0 }}
                animate={{ width: `${(r.n / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 160, damping: 26, delay: still ? 0 : i * 0.04 }}
              />
              <span className="relative w-5 shrink-0 text-center" aria-hidden>
                {r.country ? countryFlag(r.country) : null}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-base text-ink">{r.name}</span>
              <span className="relative text-sm text-ink tabular-nums">{r.n.toLocaleString("nl-NL")}</span>
              <span className="relative w-10 text-right text-xs text-ink-3 tabular-nums">
                {Math.round((r.n / total) * 100)}%
              </span>
            </CountryLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CountryLink({ analyse, children }: { analyse: boolean; children: React.ReactNode }) {
  const className = cn(ROW, "relative h-8 overflow-hidden", !analyse && "hover:bg-transparent")
  return analyse ?
    (
      <Link to={"/analytics" as string} className={className}>
        {children}
      </Link>
    ) :
    <span className={className}>{children}</span>
}

export type ReturnsRow = { id: string; number: string; customerName: string; status: "review" | "ready"; late: boolean }

/** What waits to be judged or settled, the late ones marked. */
export function ReturnsView({ rows: open }: { rows: ReadonlyArray<ReturnsRow> }) {
  if (open.length === 0) return <Quiet>Niets te beoordelen of af te handelen.</Quiet>
  return (
    <ul className="flex flex-col">
      {open.map((r) => (
        <li key={r.id}>
          <Link
            to="/returns/$returnId"
            params={{ returnId: r.id }}
            className="flex h-9 min-w-0 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/[0.045]"
            title={STATUS_LABEL[r.status]}
          >
            <span className="font-medium text-ink text-sm tabular-nums">{r.number}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2 text-sm">{r.customerName}</span>
            <ReturnStatusBadge status={r.status} late={r.late} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** One conversation on "Ongelezen chats": a channel's `#name` or a DM's person, its last words and what is unread. */
export type ChatRow = { id: string; group: boolean; name: string; preview: string; unread: number }

/** "Ongelezen chats": the conversations with the most unread first, and how much is unread in all. */
export function ChatsView({ rows, unread }: { rows: ReadonlyArray<ChatRow>; unread: number }) {
  if (rows.every((c) => !c.preview)) {
    return <Quiet>#algemeen is nog stil.</Quiet>
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 text-sm text-ink-2 tabular-nums">
        {unread === 0 ? "Je bent bij" : `${unread} ongelezen ${unread === 1 ? "bericht" : "berichten"}`}
      </p>
      <ul className="flex flex-col">
        {rows.map((c) => (
          <li key={c.id}>
            <Link to={"/chats" as string} search={{ id: c.id } as never} className={cn(ROW, "h-11")}>
              {c.group ?
                (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-band text-ink-2">
                    <Hash className="size-3.5" strokeWidth={1.75} />
                  </span>
                ) :
                (
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs"
                    style={personStyle(c.name)}
                  >
                    {initials(c.name)}
                  </span>
                )}
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className={cn("truncate text-base", c.unread > 0 ? "font-medium text-ink" : "text-ink-2")}>
                  {c.group ? `#${c.name}` : c.name}
                </span>
                <span className="truncate text-xs text-ink-3">{c.preview || "Nog geen berichten"}</span>
              </span>
              {c.unread > 0 ?
                (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-arc px-1.5 font-medium text-2xs text-mesh-ink tabular-nums">
                    {c.unread}
                  </span>
                ) :
                null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
