import type { ReactNode } from "react"
import {
  Bell,
  Box,
  ChartLine,
  ChevronDown,
  CornerDownLeft,
  Database,
  Home,
  type IconComponent,
  Inbox,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Ticket,
  Truck,
  Users,
  Workflow
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { Logo, Mark, type Vendor } from "./parts.tsx"

/*
 * The console's chrome, drawn for the landing page's product renders: the abyss rail, the mist area
 * panel, and the top bar. Faithful to the console (the app shell, `packages/ui/src/app/shell`), in the
 * page's palette: the people discs are the brand's own tints rather than the console's six pastels,
 * and status is the brand blue and the ink ramp rather than signal colours.
 */

const RAIL: ReadonlyArray<IconComponent> = [
  Home,
  ShoppingBag,
  Users,
  Box,
  Inbox,
  Ticket,
  CornerDownLeft,
  MessageSquare,
  Sparkles,
  ChartLine,
  Workflow,
  Truck,
  Database
]

/* The services the demo workspace has connected (workspace-store.ts), pinned at the rail's foot as
   the console pins its apps. */
const PINNED: ReadonlyArray<Vendor> = ["shopify", "gmail", "klarna", "slack"]

export function Rail({ active = 0 }: { readonly active?: number }) {
  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center gap-1 bg-abyss py-3 text-mesh-ink-3">
      <span className="mb-2 flex size-8 items-center justify-center">
        <Mark size={24} tone="white" />
      </span>
      {RAIL.map((Icon, i) => (
        <span
          key={i}
          className={cn(
            "flex h-[30px] w-[34px] items-center justify-center rounded-md",
            i === active && "bg-arc text-mesh-ink"
          )}
        >
          <Icon size={17} />
        </span>
      ))}
      <span className="my-2 h-px w-6 bg-mesh-ink/14" />
      {PINNED.map((v) => (
        <span key={v} className="flex h-[30px] w-[34px] items-center justify-center">
          <Logo vendor={v} size={20} />
        </span>
      ))}
      <span className="mt-auto flex h-[30px] w-[34px] items-center justify-center">
        <Settings size={17} />
      </span>
      <Person initials="EH" size={28} tone="arc" className="mt-1" />
    </div>
  )
}

/** A person: initials on one of the brand's own discs, optionally with the presence square. */
export function Person(
  { initials, size = 24, tone = "tint", present = false, className }: {
    readonly initials: string
    readonly size?: number
    readonly tone?: "tint" | "mist" | "abyss" | "arc"
    readonly present?: boolean
    readonly className?: string
  }
) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        tone === "tint" && "bg-arc-tint text-arc-ink",
        tone === "mist" && "bg-mist text-ink-2",
        tone === "abyss" && "bg-abyss-2 text-mesh-ink",
        tone === "arc" && "bg-arc text-mesh-ink",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
      {present
        ? <span className="absolute -right-px -bottom-px size-2 rounded-full bg-arc ring-2 ring-paper" />
        : null}
    </span>
  )
}

export function PanelRow(
  { children, count, icon: Icon, active = false }: {
    readonly children: ReactNode
    readonly count?: number
    readonly icon?: IconComponent
    readonly active?: boolean
  }
) {
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-base",
        active ? "bg-arc-tint text-arc-ink" : "text-ink-2"
      )}
    >
      {Icon === undefined ? null : <Icon size={14} className={active ? "text-arc-ink" : "text-ink-3"} />}
      <span className="flex-1 truncate">{children}</span>
      {count === undefined ? null : <span className="text-sm tabular-nums">{count}</span>}
    </div>
  )
}

export function PanelHead({ children, trail }: { readonly children: ReactNode; readonly trail?: string }) {
  return (
    <div className="flex items-center justify-between px-2 pt-3 pb-1 text-ink-3 text-sm">
      {children}
      {trail === undefined ? null : <span className="text-xs">{trail}</span>}
    </div>
  )
}

export function AreaPanel({ search, children }: { readonly search: string; readonly children: ReactNode }) {
  return (
    <div className="flex w-56 shrink-0 flex-col gap-0.5 bg-mist px-3 py-3 max-sm:hidden">
      <div className="px-2 pb-2 font-medium text-base text-ink">Northwind Clothing Co.</div>
      <div className="mb-1 flex h-8 items-center gap-2 rounded-md px-2.5 text-ink-3 text-sm field">
        <Search size={14} />
        {search}
      </div>
      {children}
    </div>
  )
}

export function Topbar() {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 px-4">
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap font-medium text-base text-ink">
        <span className="flex size-6 items-center justify-center rounded-sm bg-abyss text-2xs text-mesh-ink">NU</span>
        Northwind US
        <ChevronDown size={14} className="text-ink-3" />
      </span>
      <span className="flex h-8 min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-md px-3 text-ink-3 text-sm field max-sm:hidden">
        <Search size={14} className="shrink-0" />
        <span className="truncate">Zoek bestellingen, klanten, tickets…</span>
        <span className="ml-auto rounded-sm bg-paper px-1.5 text-2xs text-ink-3 hairline">⌘ K</span>
      </span>
      <span className="flex shrink-0 -space-x-1.5 max-sm:hidden">
        {(["SK", "EJ", "LT", "MR"] as const).map((who, i) => (
          <Person
            key={who}
            initials={who}
            size={28}
            tone={i % 2 === 0 ? "tint" : "mist"}
            present={i < 2}
            className="ring-2 ring-glacier"
          />
        ))}
      </span>
      <span className="ml-auto flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm">
        <Sparkles size={13} />3 voorstellen klaar
      </span>
      <span className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-arc-tint px-3 font-medium text-arc-ink text-sm max-sm:hidden">
        <Sparkles size={14} />
        Vraag Insyte
      </span>
      <span className="relative flex size-8 items-center justify-center text-ink-2 max-sm:hidden">
        <Bell size={16} />
        <span className="absolute -top-0.5 -right-1 rounded-full bg-abyss px-1 text-2xs text-mesh-ink tabular-nums">
          9+
        </span>
      </span>
      <span className="flex size-8 items-center justify-center rounded-md text-ink-2 field max-sm:hidden">
        <Plus size={16} />
      </span>
    </div>
  )
}

export function Spark({ points }: { readonly points: string }) {
  return (
    <svg viewBox="0 0 60 20" width={44} height={16} aria-hidden className="shrink-0">
      <polyline points={points} fill="none" stroke="var(--arc)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** A status chip: the brand blue when it asks for attention, a quiet well otherwise. */
export function Chip(
  { children, tone = "quiet", icon: Icon }: {
    readonly children: ReactNode
    readonly tone?: "attention" | "quiet" | "done"
    readonly icon?: IconComponent
  }
) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 text-xs",
        tone === "attention" && "bg-arc-tint text-arc-ink",
        tone === "quiet" && "bg-mist text-ink-2",
        tone === "done" && "bg-abyss text-mesh-ink"
      )}
    >
      {Icon === undefined ? null : <Icon size={12} />}
      {children}
    </span>
  )
}
