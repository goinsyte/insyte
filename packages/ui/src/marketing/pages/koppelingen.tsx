import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Bot, Search, Workflow, X } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Frame } from "../frame.tsx"
import { CATEGORIES, type Category, type Integration, INTEGRATIONS } from "../integrations-data.ts"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { ArrowLink, Logo, Mark, PrimaryLink, type Vendor } from "../parts.tsx"
import { foldQuery, Highlight, matches } from "./accordion.tsx"
import { useRunning, useTicker } from "./hooks.ts"
import { MarketingPage, PageHero } from "./shell.tsx"

/*
 * /koppelingen: every service Insyte connects to, searchable and filtered by what it does. The hero
 * draws the connections in: the marks sit on chalk tiles around the mark and a dashed line runs
 * from each to it in turn. The directory below reflows on every filter (the cards slide to their
 * new places), and a card opens a drawer with what Insyte does with the service and the builder's
 * steps for it. `/koppelingen#<id>` opens that drawer.
 */

const HERO: ReadonlyArray<Vendor> = [
  "shopify",
  "gmail",
  "stripe",
  "klarna",
  "outlook",
  "paypal",
  "klaviyo",
  "dhl",
  "postnl",
  "slack",
  "sheets",
  "zapier"
]

/** Twelve marks on a ring of chalk tiles, each drawing its line to the mark in turn. */
export function Constellation({ paused = false }: { readonly paused?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const run = useRunning(ref, 0.3) && !paused
  const tick = useTicker(run, 520)
  const lit = run ? tick % (HERO.length + 4) : HERO.length
  const R = 42
  return (
    <div ref={ref} aria-hidden className="relative mx-auto aspect-square w-full max-w-[420px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="color-mix(in oklch, var(--ink) 16%, transparent)"
          strokeWidth="0.25"
          strokeDasharray="1 1"
        />
        {HERO.map((v, i) => {
          const a = (i / HERO.length) * Math.PI * 2 - Math.PI / 2
          const x = 50 + Math.cos(a) * R
          const y = 50 + Math.sin(a) * R
          const on = i < lit
          return (
            <motion.line
              key={v}
              x1={x}
              y1={y}
              x2="50"
              y2="50"
              stroke={on
                ? "var(--arc)"
                : "color-mix(in oklch, var(--ink) 10%, transparent)"}
              strokeWidth="0.3"
              strokeDasharray="1 0.8"
              initial={false}
              animate={{ pathLength: on || reduced ? 1 : 0.0001 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )
        })}
      </svg>
      {HERO.map((v, i) => {
        const a = (i / HERO.length) * Math.PI * 2 - Math.PI / 2
        const on = i < lit
        return (
          <span
            key={v}
            className={cn(
              "absolute flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg transition-[background-color,box-shadow] duration-500",
              on
                ? "bg-paper shadow-[inset_0_0_0_1px_var(--arc),0_8px_20px_-14px_color-mix(in_oklch,var(--abyss)_45%,transparent)]"
                : "bg-paper/70 hairline"
            )}
            style={{ left: `${50 + Math.cos(a) * R}%`, top: `${50 + Math.sin(a) * R}%` }}
          >
            <Logo vendor={v} size={32} />
          </span>
        )
      })}
      <span className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-abyss">
        <Mark size={40} tone="white" />
      </span>
    </div>
  )
}

/** A vendor's mark, or for MCP (a protocol, not a vendor) the same tile with an icon. */
function ItemMark(
  { vendor, size, label = false }: {
    readonly vendor: Integration["vendor"]
    readonly size: number
    readonly label?: boolean
  }
) {
  if (vendor !== "mcp") return <Logo vendor={vendor} size={size} label={label} />
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ? "MCP" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-mesh-ink text-ink-2",
        size <= 40 ? "rounded-md" : "rounded-lg"
      )}
      style={{
        width: size,
        height: size,
        boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--ink) 10%, transparent)"
      }}
    >
      <Bot size={Math.round(size * 0.5)} />
    </span>
  )
}

function Card(
  { item, query, onOpen }: { readonly item: Integration; readonly query: string; readonly onOpen: () => void }
) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/card flex h-full w-full flex-col gap-4 rounded-lg bg-paper p-5 text-left transition-[box-shadow,transform] duration-[240ms] hairline hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_14%,transparent),0_12px_28px_-18px_color-mix(in_oklch,var(--abyss)_40%,transparent)]"
    >
      <span className="flex items-start justify-between gap-3">
        <ItemMark vendor={item.vendor} size={40} label />
        <span
          className={cn(
            "rounded-sm px-2 py-0.5 text-xs",
            item.kind === "Kern"
              ? "bg-abyss text-mesh-ink"
              : item.kind === "Via de API"
              ? "bg-arc-tint text-arc-ink"
              : "border border-dashed border-ink/25 text-ink-3"
          )}
        >
          {item.kind}
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-medium text-ink text-lg">
          <Highlight text={item.name} query={query} />
        </span>
        <span className="text-ink-3 text-sm">{item.category}</span>
      </span>
      <span className="line-clamp-2 text-ink-2 text-sm">
        <Highlight text={item.line} query={query} />
      </span>
      <span className="mt-auto flex items-center gap-1 font-medium text-arc-ink text-sm">
        Bekijken
        <ArrowRight size={13} className="transition-transform duration-[240ms] group-hover/card:translate-x-0.5" />
      </span>
    </button>
  )
}

function Drawer({ item, onClose }: { readonly item: Integration | null; readonly onClose: () => void }) {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  const close = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (item === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    requestAnimationFrame(() => close.current?.focus())
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [item, onClose])
  return (
    <AnimatePresence>
      {item === null ?
        null :
        (
          <motion.div key="laag" className="fixed inset-0 z-[60]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
            <motion.button
              type="button"
              aria-label="Sluiten"
              tabIndex={-1}
              onClick={onClose}
              className="absolute inset-0 bg-abyss/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="koppeling-kop"
              className="absolute inset-y-2 right-2 flex w-[min(460px,calc(100vw-16px))] flex-col overflow-y-auto rounded-xl bg-paper window-lift"
              initial={reduced ? { opacity: 0 } : { x: "105%" }}
              animate={reduced ? { opacity: 1 } : { x: 0 }}
              exit={reduced ? { opacity: 0 } : { x: "105%" }}
              transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="relative flex flex-col gap-5 bg-abyss p-6 text-mesh-ink">
                <div aria-hidden className="absolute inset-0 drafting-chalk" />
                <div className="relative flex items-start justify-between">
                  <span className="flex size-16 items-center justify-center rounded-lg bg-mesh-ink/10 chalk-line">
                    <ItemMark vendor={item.vendor} size={44} />
                  </span>
                  <button
                    ref={close}
                    type="button"
                    onClick={onClose}
                    aria-label="Sluiten"
                    className="flex size-8 items-center justify-center rounded-md text-mesh-ink-2 hover:bg-mesh-ink/10 hover:text-mesh-ink"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="relative flex flex-col gap-1.5">
                  <h2 id="koppeling-kop" className="font-medium text-3xl">{item.name}</h2>
                  <p className="text-mesh-ink-2 text-md">{item.line}</p>
                  <span className="mt-1 flex gap-1.5 text-xs">
                    <span className="rounded-sm bg-mesh-ink/12 px-2 py-0.5">{item.category}</span>
                    <span className="rounded-sm bg-mesh-ink/12 px-2 py-0.5">{item.kind}</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-7 p-6">
                <section className="flex flex-col gap-3">
                  <h3 className="font-medium text-ink text-md">Wat Insyte ermee doet</h3>
                  <ul className="flex flex-col gap-2">
                    {item.does.map((d) => (
                      <li key={d} className="flex items-start gap-2.5 text-ink-2 text-base">
                        <span aria-hidden className="mt-[0.55em] size-[6px] shrink-0 bg-abyss" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </section>
                {item.actions === undefined ? null : (
                  <section className="flex flex-col gap-3">
                    <h3 className="flex items-center gap-2 font-medium text-ink text-md">
                      <Workflow size={15} className="text-ink-3" />
                      Stappen in automatiseringen
                    </h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {item.actions.map((a) => (
                        <li
                          key={a}
                          className="flex items-center gap-1.5 rounded-md bg-mist px-2.5 py-1.5 text-ink text-sm"
                        >
                          <ItemMark vendor={item.vendor} size={16} />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <div className="flex flex-col gap-3 border-hairline border-t pt-6">
                  {item.page === undefined
                    ? null
                    : <ArrowLink href={links.page(item.page.path)}>{item.page.label} in Insyte</ArrowLink>}
                  {item.kind === "Binnenkort"
                    ? (
                      <p className="text-ink-3 text-sm">
                        {item.soonNote ??
                          `Gepland. In de console staat ${item.name} als binnenkort; koppelen kan nog niet.`}
                      </p>
                    )
                    : (
                      <ArrowLink
                        href={links.inApp(item.kind === "Via de API" ? "/marketplace" : "/settings/integrations")}
                        external
                      >
                        Koppelen in de console
                      </ArrowLink>
                    )}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
    </AnimatePresence>
  )
}

function Directory() {
  const reduced = useReducedMotion() === true
  const [raw, setRaw] = useState("")
  const [cat, setCat] = useState<Category | "Alle">("Alle")
  const [open, setOpen] = useState<Integration | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const query = foldQuery(raw)

  useEffect(() => {
    const go = () => {
      const id = window.location.hash.slice(1)
      const hit = INTEGRATIONS.find((i) => i.id === id)
      if (hit !== undefined) setOpen(hit)
    }
    go()
    window.addEventListener("hashchange", go)
    return () => window.removeEventListener("hashchange", go)
  }, [])

  const list = useMemo(
    () =>
      INTEGRATIONS.filter((i) =>
        (cat === "Alle" || i.category === cat) &&
        (matches(i.name, query) || matches(i.line, query) || matches(i.category, query))
      ),
    [cat, query]
  )
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of INTEGRATIONS) {
      if (matches(i.name, query) || matches(i.line, query) || matches(i.category, query)) {
        m.set(i.category, (m.get(i.category) ?? 0) + 1)
        m.set("Alle", (m.get("Alle") ?? 0) + 1)
      }
    }
    return m
  }, [query])

  const show = (i: Integration) => {
    opener.current = document.activeElement as HTMLElement | null
    setOpen(i)
    window.history.replaceState(null, "", `#${i.id}`)
  }
  const hide = () => {
    setOpen(null)
    window.history.replaceState(null, "", window.location.pathname)
    opener.current?.focus()
  }

  return (
    <section aria-labelledby="gids-kop" className="bg-glacier">
      <Frame top={false} inner="pt-14 pb-24 sm:pt-20 sm:pb-32">
        <h2 id="gids-kop" className="sr-only">Alle koppelingen</h2>
        <div className="sticky top-16 z-20 -mx-4 flex flex-col gap-3 bg-glacier px-4 py-3 sm:-mx-8 sm:px-8 lg:flex-row lg:items-center">
          <label className="relative flex h-11 shrink-0 items-center rounded-md bg-paper hairline focus-within:shadow-[inset_0_0_0_1px_var(--arc),0_0_0_4px_var(--arc-soft)] lg:w-[280px]">
            <span className="sr-only">Zoek een koppeling</span>
            <Search size={16} className="pointer-events-none absolute left-3 text-ink-3" />
            <input
              type="search"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Zoek een koppeling"
              autoComplete="off"
              className="h-full w-full bg-transparent pr-3 pl-9 text-base text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          <LayoutGroup id="koppeling-filter">
            <div
              role="radiogroup"
              aria-label="Categorie"
              className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-visible"
            >
              {(["Alle", ...CATEGORIES] as const).map((c) => {
                const on = cat === c
                const n = counts.get(c) ?? 0
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCat(c)}
                    className={cn(
                      "relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors",
                      on ? "text-mesh-ink" : n === 0 ? "text-ink-4" : "text-ink-2 hover:text-ink"
                    )}
                  >
                    {on
                      ? (
                        <motion.span
                          layoutId="koppeling-chip"
                          className="absolute inset-0 rounded-md bg-abyss"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )
                      : null}
                    <span className="relative">{c}</span>
                    <span className={cn("relative tabular-nums", on ? "text-mesh-ink-2" : "text-ink-3")}>{n}</span>
                  </button>
                )
              })}
            </div>
          </LayoutGroup>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-ink-3 text-sm">
          <p aria-live="polite">{list.length === 1 ? "1 koppeling" : `${list.length} koppelingen`}</p>
          <p>Kern: in de eerste versie · Via de API: met een sleutel en webhooks · Binnenkort: gepland</p>
        </div>
        <motion.ul layout={!reduced} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((i) => (
              <motion.li
                key={i.id}
                layout={!reduced}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
              >
                <Card item={i} query={query} onOpen={() => show(i)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        {list.length === 0
          ? (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-lg bg-paper p-6 hairline">
              <p className="font-medium text-ink text-lg">Geen koppeling gevonden.</p>
              <p className="text-ink-2 text-md">
                Zapier en de API verbinden Insyte met wat hier niet staat.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRaw("")
                  setCat("Alle")
                }}
                className="inline-flex h-10 items-center rounded-md px-4 font-medium text-ink text-sm field hover:bg-paper"
              >
                Filters wissen
              </button>
            </div>
          )
          : null}
      </Frame>
      <Drawer item={open} onClose={hide} />
    </section>
  )
}

function Missing() {
  const links = useMarketingLinks()
  return (
    <section aria-labelledby="mist-kop" className="bg-paper">
      <Frame inner="py-16 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <div className="flex flex-col gap-3">
            <h2 id="mist-kop" className="font-medium text-3xl text-ink sm:text-4xl">
              Mis je een koppeling?
              <span className="block text-ink-3">Er is altijd een weg.</span>
            </h2>
            <p className="max-w-[56ch] text-ink-2 text-md">
              Zapier verbindt Insyte met de rest, en API-sleutels met scopes en ondertekende webhooks staan open voor je
              eigen koppelingen en agents. Een MCP-server voor je eigen AI-tools komt binnenkort. Laat in je aanvraag
              weten wat je mist.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 lg:justify-end">
            <PrimaryLink href={links.page("/toegang")}>Toegang aanvragen</PrimaryLink>
            <a
              href={links.page("/beveiliging")}
              className="inline-flex h-11 items-center gap-1.5 font-medium text-arc-ink text-md hover:text-abyss"
            >
              API en webhooks
              <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </Frame>
    </section>
  )
}

export function KoppelingenPage({ links }: { readonly links: MarketingLinks }) {
  const core = INTEGRATIONS.filter((i) => i.kind === "Kern").length
  return (
    <MarketingPage links={links}>
      <PageHero
        title="Koppelingen."
        second="Met wat je al gebruikt."
        lede="Je winkel, je inbox, je betaalproviders, je vervoerders en je team. Eén keer koppelen; daarna werkt de Insyte-agent ermee, binnen jouw regels."
        aside={<Constellation />}
        fields={[
          { label: "Koppelingen", value: INTEGRATIONS.length },
          { label: "In de kern", value: core },
          { label: "Categorieën", value: CATEGORIES.length }
        ]}
      />
      <Directory />
      <Missing />
    </MarketingPage>
  )
}
