import type { ReactNode } from "react"
import {
  Box,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Filter,
  Home,
  Inbox,
  Link2,
  MessagesSquare,
  Plug,
  Search,
  ShoppingBag,
  Sparkles,
  Ticket,
  Truck,
  Users,
  Wallet,
  Workflow
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { LIVE_ORDERS, type ProductKey, PRODUCTS, thumb } from "./demo-data.ts"
import { Logo, Mark } from "./parts.tsx"

/*
 * The three portals, drawn for the personas carousel: the operator's orders, the supplier's portal
 * and the partner's dashboard, each a faithful render of its console screen (`packages/ui/src/app`) on the demo
 * workspace ("Gewone dinsdag", `?scenario=settled`). They are pictures: `aria-hidden` and `inert`,
 * drawn at 920px and zoomed by the caller.
 *
 * Records copied here, with their source:
 * - the supplier portal: `routes/_supplier/supplier/dashboard.tsx` as it renders for Allure
 *   Fulfillment (Marco) — the figures strip, "Eerst dit", "Bijna op" and "Van Northwind";
 * - the partner dashboard: `routes/_aff/affiliate/dashboard.tsx` for Priya, with her tiers and
 *   links (`lib/affiliate-data.ts`, `mock-data/affiliate-program.ts`);
 * - the operator's orders: `mock-data/orders.ts` and the live ticker (`./demo-data.ts`).
 * Product photographs: `mock-data/product-catalog.ts` (Unsplash), at thumbnail width.
 */

/** Three more of the catalogue's photographs, for the supplier's rows (product-catalog.ts). */
const EXTRA = {
  shorts: { title: "Trailhead korte broek", img: "1793083873431-24bcd8769e02" },
  puffer: { title: "Cascade pufferjas", img: "1614079290101-0c2181ac8ea3" }
} as const

function Thumb({ img, size = 28 }: { readonly img: string; readonly size?: number }) {
  return (
    <img
      src={thumb(img, 96)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-sm bg-mist object-cover"
      style={{ width: size, height: size }}
    />
  )
}

function PortalRail({ icons }: { readonly icons: ReadonlyArray<typeof Home> }) {
  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 bg-abyss py-3 text-mesh-ink-3">
      <span className="mb-2 flex size-8 items-center justify-center">
        <Mark size={24} tone="white" />
      </span>
      {icons.map((Icon, i) => (
        <span
          key={i}
          className={cn(
            "flex h-[30px] w-[34px] items-center justify-center rounded-md",
            i === 0 && "bg-arc text-mesh-ink"
          )}
        >
          <Icon size={17} />
        </span>
      ))}
      <span className="mt-auto flex size-7 items-center justify-center rounded-full bg-arc-tint text-2xs text-arc-ink">
        {icons.length === 6 ? "MA" : "PR"}
      </span>
    </div>
  )
}

function PortalTop({ role, search }: { readonly role: string; readonly search: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 px-5">
      <span className="flex size-6 items-center justify-center rounded-sm bg-abyss text-2xs text-mesh-ink">NC</span>
      <span className="text-ink-3 text-sm">
        {role} <span className="font-medium text-ink">Northwind Clothing Co.</span>
      </span>
      <span className="flex h-8 w-[260px] items-center gap-2 rounded-md px-3 text-ink-3 text-sm field">
        <Search size={14} />
        {search}
      </span>
    </div>
  )
}

/** The plate across the top of a portal: abyss with the drafting grid, a greeting and four figures. */
function Plate(
  { hello, line, figures, aside }: {
    readonly hello: string
    readonly line: string
    readonly figures: ReadonlyArray<readonly [string, string, string?]>
    readonly aside?: ReactNode
  }
) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-abyss text-mesh-ink">
      <div aria-hidden className="absolute inset-0 drafting-chalk" />
      <div className="relative flex items-start justify-between px-6 pt-5">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-lg">{hello}</span>
          <span className="text-mesh-ink-2 text-sm">{line}</span>
        </div>
        {aside}
      </div>
      <div className="relative grid grid-cols-4 px-2 pt-5 pb-4">
        {figures.map(([label, value, note], i) => (
          <div key={label} className={cn("flex flex-col gap-2 px-4", i > 0 && "border-mesh-hairline border-l")}>
            <span className="text-mesh-ink-2 text-xs">{label}</span>
            <span className="figure text-4xl">{value}</span>
            {note === undefined ? null : <span className="text-mesh-ink-3 text-xs">{note}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── The supplier's portal ────────────────────────────────────────────────────────────────── */

const SUPPLIER_ROWS: ReadonlyArray<{
  readonly number: string
  readonly lines: string
  readonly img: string
  readonly handoff: string
  readonly due: "late" | "today" | "accepted"
}> = [
  {
    number: "SO-12204",
    lines: "2× Drift sweater met ronde hals, 3× Harbor regenjas",
    img: PRODUCTS.crewneck.img,
    handoff: "vr 30 okt",
    due: "late"
  },
  {
    number: "SO-12222",
    lines: "3× Aurora fleece met capuchon",
    img: PRODUCTS.fleece.img,
    handoff: "vr 30 okt",
    due: "late"
  },
  {
    number: "SO-12205",
    lines: "3× Trailhead korte broek",
    img: EXTRA.shorts.img,
    handoff: "za 31 okt",
    due: "today"
  },
  {
    number: "SO-12223",
    lines: "3× Cascade pufferjas, 2× Cloud joggingbroek",
    img: EXTRA.puffer.img,
    handoff: "za 31 okt",
    due: "accepted"
  },
  {
    number: "SO-12240",
    lines: "2× Drift sweater met ronde hals, 3× Harbor regenjas",
    img: PRODUCTS.raincoat.img,
    handoff: "za 31 okt",
    due: "accepted"
  }
]

const LOW = [
  { ...EXTRA.puffer, left: "37 over" },
  { title: PRODUCTS.raincoat.title, img: PRODUCTS.raincoat.img, left: "40 over" }
] as const

export function SupplierWindow() {
  return (
    <div aria-hidden inert className="w-[920px] select-none overflow-hidden bg-glacier text-left">
      <div className="flex h-[600px]">
        <PortalRail icons={[Home, Box, ShoppingBag, MessagesSquare, Wallet, Plug]} />
        <div className="flex min-w-0 flex-1 flex-col bg-paper">
          <PortalTop role="Leverancier voor" search="Zoek bestellingen en producten…" />
          <div className="flex flex-col gap-6 px-6 pt-2">
            <Plate
              hello="Zaterdagochtend, Marco."
              line="5 bestellingen zijn te laat en 5 moeten vandaag naar de vervoerder."
              figures={[["Te accepteren", "20"], ["Vandaag overdragen", "5"], ["Te laat", "5"], [
                "Op tijd bezorgd, 30 dagen",
                "93,7%"
              ]]}
            />
            <div className="grid grid-cols-[1fr_230px] gap-6">
              <div className="flex flex-col">
                <div className="flex items-baseline justify-between pb-1">
                  <span className="font-medium text-ink text-lg">Eerst dit</span>
                  <span className="flex items-center gap-0.5 text-arc-ink text-sm">
                    Alle bestellingen <ChevronRight size={13} />
                  </span>
                </div>
                {SUPPLIER_ROWS.map((r) => (
                  <div
                    key={r.number}
                    className="flex items-center gap-3 py-2.5 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
                  >
                    <Thumb img={r.img} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-ink text-sm tabular-nums">{r.number}</span>
                      <span className="truncate text-ink-3 text-xs">{r.lines}</span>
                    </span>
                    <span className="text-ink-3 text-xs tabular-nums">{r.handoff}</span>
                    <span
                      className={cn(
                        "w-[64px] rounded-sm px-1.5 py-0.5 text-center font-medium text-xs",
                        r.due === "late" ? "bg-abyss text-mesh-ink" : "bg-arc-tint text-arc-ink"
                      )}
                    >
                      {r.due === "late" ? "Te laat" : r.due === "today" ? "Vandaag" : "Geaccepteerd"}
                    </span>
                    {r.due === "accepted"
                      ? (
                        <span className="flex h-8 w-[108px] items-center justify-center gap-1.5 rounded-md bg-abyss font-medium text-mesh-ink text-sm">
                          <Truck size={14} />
                          Verzenden
                        </span>
                      )
                      : (
                        <span className="flex h-8 w-[108px] items-center justify-center gap-1.5 rounded-md bg-mist font-medium text-ink text-sm">
                          <Check size={14} />
                          Accepteren
                        </span>
                      )}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <span className="pb-1 font-medium text-ink text-lg">Bijna op</span>
                  {LOW.map((p) => (
                    <span key={p.title} className="flex items-center gap-2 py-1 text-sm">
                      <Thumb img={p.img} size={22} />
                      <span className="flex-1 truncate text-ink">{p.title}</span>
                      <span className="font-medium text-arc-ink tabular-nums">{p.left}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5 rounded-lg bg-mist p-3.5">
                  <span className="flex items-center gap-1.5 text-ink-3 text-xs">
                    <MessagesSquare size={13} />
                    Sofía K. · #allure-fulfillment
                  </span>
                  <span className="text-ink text-sm">
                    De klant van SO-12224 vraagt waar haar pakket blijft, kun je de nieuwe overdrachtsdatum bevestigen?
                  </span>
                  <span className="font-medium text-arc-ink text-sm">Antwoorden</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── The partner's dashboard ──────────────────────────────────────────────────────────────── */

const WEEKS = "M0 62 L60 74 L120 64 L180 62 L240 54 L300 40 L360 14 L420 22"

const TIERS = [
  { name: "Brons", from: "Vanaf de start", rate: "10%", me: false },
  { name: "Zilver", from: "Vanaf 100 conversies per kwartaal", rate: "12%", me: false },
  { name: "Goud · jij", from: "Vanaf 250 conversies per kwartaal", rate: "15%", me: true }
] as const

const LINKS = [
  { name: "Instagram bio", conv: "312 conversies", earned: "€ 2.763" },
  { name: "Lookbook voorjaar", conv: "148 conversies", earned: "€ 1.382" },
  { name: "YouTube-video · Aurora-review", conv: "41 conversies", earned: "€ 548" }
] as const

export function PartnerWindow() {
  return (
    <div aria-hidden inert className="w-[920px] select-none overflow-hidden bg-glacier text-left">
      <div className="flex h-[600px]">
        <PortalRail icons={[Home, Link2, Wallet, FileText, Plug]} />
        <div className="flex min-w-0 flex-1 flex-col bg-paper">
          <PortalTop role="Partnerprogramma van" search="Zoek links en uitbetalingen…" />
          <div className="flex flex-col gap-6 px-6 pt-2">
            <Plate
              hello="Zaterdagochtend, Priya."
              line="207 bestellingen kwamen de afgelopen 30 dagen via jouw links binnen."
              aside={
                <span className="flex items-center gap-2 rounded-md bg-mesh-ink/10 px-3 py-1.5 text-sm">
                  Kortingscode <span className="font-medium">PRIYA10</span>
                  <Copy size={13} />
                </span>
              }
              figures={[
                ["Nog uit te betalen", "€ 1.971"],
                ["Volgende uitbetaling", "15 juni", "naar PayPal"],
                ["Conversies, 30 dagen", "207"],
                ["Conversieratio, 30 dagen", "7,3%"]
              ]}
            />
            <div className="grid grid-cols-[1fr_260px] gap-6">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-ink text-lg">Wat je links deden</span>
                <span className="text-ink-3 text-xs">Verdiende commissie per week, acht weken tot 26 mei.</span>
                <svg viewBox="0 0 420 84" className="mt-3 h-32 w-full" fill="none" preserveAspectRatio="none">
                  {[0, 1, 2, 3].map((i) => (
                    <line
                      key={i}
                      x1="0"
                      x2="420"
                      y1={6 + i * 24}
                      y2={6 + i * 24}
                      stroke="var(--ink-5)"
                      strokeDasharray="3 4"
                    />
                  ))}
                  <path d={`${WEEKS} L420 84 L0 84 Z`} fill="var(--arc-tint)" opacity="0.7" />
                  <path d={WEEKS} stroke="var(--arc)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="mt-3 flex flex-col">
                  {LINKS.map((l) => (
                    <span
                      key={l.name}
                      className="flex items-center gap-3 py-2 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
                    >
                      <span className="flex size-7 items-center justify-center rounded-md bg-mist text-ink-2">
                        <Link2 size={14} />
                      </span>
                      <span className="flex flex-1 flex-col">
                        <span className="text-ink text-sm">{l.name}</span>
                        <span className="text-ink-3 text-xs">{l.conv}</span>
                      </span>
                      <span className="font-medium text-ink text-sm tabular-nums">{l.earned}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="pb-1 font-medium text-ink text-lg">Je niveau</span>
                {TIERS.map((t) => (
                  <span
                    key={t.name}
                    className={cn("flex items-center justify-between rounded-md px-3 py-2", t.me && "bg-arc-tint")}
                  >
                    <span className="flex flex-col">
                      <span className={cn("text-sm", t.me ? "font-medium text-arc-ink" : "text-ink")}>{t.name}</span>
                      <span className="text-ink-3 text-xs">{t.from}</span>
                    </span>
                    <span className={cn("text-lg tabular-nums", t.me ? "text-arc-ink" : "text-ink")}>{t.rate}</span>
                  </span>
                ))}
                <span className="px-1 pt-1 text-ink-3 text-xs">
                  395 conversies dit kwartaal: je blijft op het hoogste niveau.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── The operator's orders ────────────────────────────────────────────────────────────────── */

const OP_STATUS = ["Betaald", "Vertraagd", "Bij leverancier", "Verzonden", "Betaald"] as const

export function OperatorWindow() {
  return (
    <div aria-hidden inert className="w-[920px] select-none overflow-hidden bg-glacier text-left">
      <div className="flex h-[600px]">
        <PortalRail icons={[ShoppingBag, Home, Users, Box, Inbox, Ticket, Sparkles, Workflow]} />
        <div className="flex min-w-0 flex-1 flex-col bg-paper">
          <div className="flex items-center gap-3 px-6 pt-5 pb-3">
            <span className="font-medium text-ink text-xl">Bestellingen</span>
            <span className="text-ink-3 text-sm">30 wachten op afhandeling · 8 vertraagd</span>
            <span className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-ink-2 text-sm field">
              <Filter size={13} />
              Filter
            </span>
          </div>
          <div className="flex items-center gap-1 px-5 pb-3 text-sm">
            {[["Alle", "60"], ["Te verwerken", "30"], ["Vertraagd", "8"], ["Verzonden", "10"]].map(([t, n], i) => (
              <span
                key={t}
                className={cn("rounded-md px-3 py-1", i === 0 ? "bg-abyss text-mesh-ink" : "text-ink-2")}
              >
                {t} <span className={i === 0 ? "text-mesh-ink-2" : "text-ink-3"}>{n}</span>
              </span>
            ))}
          </div>
          <div className="mx-6 mb-4 flex items-center gap-3 rounded-lg bg-arc-tint px-4 py-2.5">
            <Sparkles size={14} className="shrink-0 text-arc-ink" />
            <span className="flex-1 text-ink text-sm">
              3 bestellingen bij Allure lopen 1 tot 2 dagen achter. Het bericht aan Allure staat klaar.
            </span>
            <span className="rounded-md bg-abyss px-3 py-1 font-medium text-mesh-ink text-sm">Bekijken</span>
          </div>
          <div className="mx-6 overflow-hidden rounded-lg panel">
            <div className="grid h-8 grid-cols-[1fr_120px_90px_130px_40px] items-center bg-mist px-3 text-ink-3 text-xs">
              <span>Bestelling</span>
              <span>Winkel</span>
              <span>Totaal</span>
              <span>Status</span>
              <span />
            </div>
            {LIVE_ORDERS.map((o, i) => {
              const p = PRODUCTS[o.product as ProductKey]
              return (
                <div
                  key={o.number}
                  className={cn(
                    "grid h-12 grid-cols-[1fr_120px_90px_130px_40px] items-center px-3 text-sm",
                    i % 2 === 1 && "bg-mist/60"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Thumb img={p.img} size={30} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-ink">
                        <span className="font-medium tabular-nums">{o.number}</span> · {o.who}
                      </span>
                      <span className="truncate text-ink-3 text-xs">
                        {o.qty} × {p.title}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <Logo vendor="shopify" size={16} />
                    {i % 2 === 0 ? "EU" : "US"}
                  </span>
                  <span className="text-ink-2 tabular-nums">{o.total}</span>
                  <span>
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-xs",
                        OP_STATUS[i] === "Vertraagd" ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2"
                      )}
                    >
                      {OP_STATUS[i]}
                    </span>
                  </span>
                  <span className="text-ink-3 text-xs">{o.ago}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
