import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { type ReactNode, useId, useState } from "react"
import { BadgePercent, Calendar, Check, ChevronDown, Minus, Plus, Store } from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { Frame } from "./frame.tsx"
import { useMarketingLinks } from "./links.tsx"
import { Reveal, RevealItem } from "./motion.tsx"
import { ArrowLink, Logo } from "./parts.tsx"
import { type Cell, COMPARISON, type Cycle, euros, type Plan, planFor, type PlanId, PLANS } from "./plans.ts"

/*
 * Pricing, read from `plans.ts`. A segmented switch for the billing cycle, a framed band with a
 * live fit meter (how many stores, how many orders a month, and which plan holds them), the three
 * plans as columns inside one ruled frame with the chips of what each adds, and the full comparison
 * behind one toggle. Everything here is indicative and labelled so: pricing is an open decision.
 */

const DASH = "border-dashed border-ink/15"

export const ORDER_STOPS = [500, 1000, 2000, 5000, 10000, 20000, 40000] as const

const n = (v: number) => v.toLocaleString("nl-NL")

/** A small cross where two construction lines meet, as on the page's frame. */
function Corner({ at }: { readonly at: "tl" | "tr" | "bl" | "br" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute size-[11px]",
        at[0] === "t" ? "-top-[6px]" : "-bottom-[6px]",
        at[1] === "l" ? "-left-[6px]" : "-right-[6px]"
      )}
    >
      <span className="absolute top-[5px] left-0 h-px w-full bg-ink/30" />
      <span className="absolute top-0 left-[5px] h-full w-px bg-ink/30" />
    </span>
  )
}

export function Framed({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn("relative border", DASH, className)}>
      <Corner at="tl" />
      <Corner at="tr" />
      <Corner at="bl" />
      <Corner at="br" />
      {children}
    </div>
  )
}

/** The billing cycle, as a segmented pill; the abyss highlight slides between the two. */
export function CycleSwitch({ cycle, onChange }: { readonly cycle: Cycle; readonly onChange: (c: Cycle) => void }) {
  const options = [
    { value: "monthly", label: "Per maand", extra: "", Icon: Calendar },
    { value: "yearly", label: "Per jaar", extra: ", twee maanden gratis", Icon: BadgePercent }
  ] as const
  return (
    <LayoutGroup id="cycle">
      <div role="radiogroup" aria-label="Betaalperiode" className="flex w-fit gap-1 rounded-full p-1 field">
        {options.map(({ Icon, extra, label, value }) => {
          const on = cycle === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(value)}
              className={cn(
                "relative flex h-9 items-center gap-2 rounded-full px-4 font-medium text-sm transition-colors",
                on ? "text-mesh-ink" : "text-ink-2 hover:text-ink"
              )}
            >
              {on
                ? (
                  <motion.span
                    layoutId="cycle-pill"
                    className="absolute inset-0 rounded-full bg-abyss"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )
                : null}
              <Icon size={15} className="relative" />
              <span className="relative whitespace-nowrap">
                {label}
                <span className="max-sm:hidden">{extra}</span>
              </span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

/** Price, re-set from below when the cycle changes. */
function Price({ value, className }: { readonly value: number; readonly className?: string }) {
  return (
    <span className={cn("relative inline-flex overflow-hidden", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="figure"
        >
          {euros(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/**
 * The fit meter: step the number of stores, slide the orders a month, and the plan that holds both
 * lights up — here and in the columns below. Ten cells stand for ten stores; the rules after the
 * first and the fifth are where Starter and Growth end.
 */
export function FitMeter(
  { stores, setStores, orderStop, setOrderStop, cycle, onView }: {
    readonly stores: number
    readonly setStores: (n: number) => void
    readonly orderStop: number
    readonly setOrderStop: (n: number) => void
    readonly cycle: Cycle
    readonly onView: (id: PlanId) => void
  }
) {
  const orders = ORDER_STOPS[orderStop] ?? 2000
  const plan = planFor(stores, orders)
  const price = cycle === "yearly" ? plan.yearly : plan.monthly
  const sliderId = useId()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium text-base text-ink">
            <Store size={16} className="text-ink-3" />
            Winkels
          </span>
          <span className="flex items-center gap-1 rounded-full p-0.5 field">
            <button
              type="button"
              aria-label="Een winkel minder"
              disabled={stores <= 1}
              onClick={() => setStores(Math.max(1, stores - 1))}
              className="flex size-7 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            >
              <Minus size={14} />
            </button>
            <output aria-live="polite" className="w-8 text-center font-medium text-ink text-sm tabular-nums">
              {stores > 10 ? "10+" : stores}
            </output>
            <button
              type="button"
              aria-label="Een winkel meer"
              disabled={stores >= 11}
              onClick={() => setStores(Math.min(11, stores + 1))}
              className="flex size-7 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </span>
        </div>
        <div aria-hidden className="flex flex-col gap-1.5">
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "relative h-7 rounded-sm transition-colors duration-[240ms]",
                  i < stores ? "bg-abyss" : "bg-ink/6",
                  (i === 1 || i === 5) && "ml-1.5"
                )}
              />
            ))}
          </div>
          <div className="grid grid-cols-10 gap-1 text-ink-3 text-xs max-sm:hidden">
            <span className="col-span-1">Starter</span>
            <span className="col-span-4 pl-1.5">Growth</span>
            <span className="col-span-5 pl-1.5">Scale</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <label htmlFor={sliderId} className="flex items-center justify-between gap-3 text-base">
          <span className="font-medium text-ink">Bestellingen per maand</span>
          <span className="text-ink-2 tabular-nums">
            {orderStop === ORDER_STOPS.length - 1 ? `${n(20000)}+` : n(orders)}
          </span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={ORDER_STOPS.length - 1}
          step={1}
          value={orderStop}
          onChange={(e) => setOrderStop(Number(e.target.value))}
          aria-valuetext={`${n(orders)} bestellingen per maand`}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink/8 accent-abyss [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-abyss [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-abyss"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-abyss px-5 py-4 text-mesh-ink">
        <span className="flex flex-col gap-0.5">
          <span className="text-mesh-ink-2 text-sm">Past bij</span>
          <span aria-live="polite" className="font-medium text-xl">{plan.name}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <Price value={price} className="text-4xl" />
          <span className="text-mesh-ink-2 text-sm">per maand</span>
        </span>
        <button
          type="button"
          onClick={() => onView(plan.id)}
          className="inline-flex h-9 items-center rounded-full border border-mesh-ink/30 px-4 font-medium text-mesh-ink text-sm transition-colors hover:bg-mesh-ink/10"
        >
          Bekijk {plan.name}
        </button>
      </div>
    </div>
  )
}

function Chip({ label, soon = false }: { readonly label: string; readonly soon?: boolean }) {
  return (
    <li
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm",
        soon ? "border-ink/20 border-dashed text-ink-3" : "border-ink/14 text-ink-2"
      )}
    >
      {soon ? null : <Check size={12} className="text-arc-ink" />}
      {label}
      {soon ? <span className="rounded-full bg-mist px-1.5 text-ink-3 text-xs">binnenkort</span> : null}
    </li>
  )
}

function limits(plan: Plan) {
  if (plan.stores === null) return "Onbeperkt winkels, plekken en bestellingen"
  return `${plan.stores === 1 ? "1 winkel" : `Tot ${plan.stores} winkels`} · ${
    plan.seats === 1 ? "1 plek" : `${plan.seats} plekken`
  } · tot ${n(plan.orders ?? 0)} bestellingen`
}

export function PlanColumn(
  { plan, prev, cycle, fit, onView }: {
    readonly plan: Plan
    readonly prev: Plan | undefined
    readonly cycle: Cycle
    readonly fit: boolean
    readonly onView: (id: PlanId) => void
  }
) {
  const links = useMarketingLinks()
  const price = cycle === "yearly" ? plan.yearly : plan.monthly
  return (
    <RevealItem
      as="article"
      className={cn(
        "flex flex-col gap-6 p-6 transition-colors duration-[420ms] sm:p-8",
        fit ? "bg-glacier" : "bg-paper"
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-2xl text-ink">{plan.name}</h3>
          <AnimatePresence initial={false}>
            {fit
              ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="rounded-full bg-arc-tint px-2.5 py-0.5 text-arc-ink text-xs"
                >
                  Past bij jouw winkels
                </motion.span>
              )
              : null}
          </AnimatePresence>
        </div>
        <p className="text-ink-3 text-md">{plan.pitch}</p>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <Price value={price} className="text-5xl text-ink" />
          <span className="text-base text-ink-3">per maand</span>
        </div>
        <span className="text-ink-3 text-sm">
          {cycle === "yearly" ? `Jaarlijks, ${euros(plan.yearly * 12)} per jaar` : "Maandelijks gefactureerd"}
        </span>
      </div>
      <p className="border-t pt-4 text-ink text-sm border-dashed border-ink/15">{limits(plan)}</p>
      <div className="flex flex-1 flex-col gap-3">
        <span className="text-ink-3 text-sm">{prev === undefined ? "Inbegrepen" : `Alles in ${prev.name}, plus`}</span>
        <ul className="flex flex-wrap gap-1.5">
          {plan.chips.map((c) => <Chip key={c.label} label={c.label} soon={c.soon === true} />)}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="button"
          onClick={() => onView(plan.id)}
          className="inline-flex h-10 items-center rounded-full border border-ink/20 px-5 font-medium text-ink text-sm transition-colors hover:border-ink/40 hover:bg-mist"
        >
          Bekijk {plan.name}
        </button>
        <ArrowLink href={links.page("/toegang")}>Toegang aanvragen</ArrowLink>
      </div>
    </RevealItem>
  )
}

export function CellMark({ cell }: { readonly cell: Cell }) {
  if (cell === true) {
    return (
      <>
        <Check size={16} className="draw-check mx-auto text-arc-ink" />
        <span className="sr-only">Inbegrepen</span>
      </>
    )
  }
  if (cell === false) {
    return (
      <>
        <span aria-hidden className="mx-auto block h-px w-3 bg-ink-4" />
        <span className="sr-only">Niet inbegrepen</span>
      </>
    )
  }
  if (typeof cell === "string") return <span className="text-ink text-xs tabular-nums sm:text-sm">{cell}</span>
  return (
    <span className="inline-block rounded-md border border-dashed border-ink/20 px-1 py-0.5 text-ink-3 text-2xs sm:rounded-full sm:px-2 sm:text-xs">
      binnen&shy;kort
    </span>
  )
}

function Comparison({ cycle, focus }: { readonly cycle: Cycle; readonly focus: PlanId | null }) {
  const col = (i: number) => PLANS[i]?.id === focus
  return (
    <div>
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Vergelijking van de abonnementen, indicatief</caption>
        <colgroup>
          <col className="w-[46%] sm:w-[40%]" />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-paper px-4 py-4 align-bottom font-normal text-ink-3 text-xs sm:px-6 sm:text-sm"
            >
              Indicatief, per maand
            </th>
            {PLANS.map((p, i) => (
              <th
                key={p.id}
                scope="col"
                className={cn(
                  "px-1 py-4 text-center align-bottom transition-colors duration-[420ms] sm:px-3",
                  col(i) ? "bg-glacier" : "bg-paper"
                )}
              >
                <span className="block font-medium text-ink text-sm sm:text-base">{p.name}</span>
                <span className="block text-ink-3 text-xs tabular-nums sm:text-sm">
                  {euros(cycle === "yearly" ? p.yearly : p.monthly)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {COMPARISON.map((g) => (
          <tbody key={g.id}>
            <tr>
              <th
                scope="colgroup"
                colSpan={4}
                className="border-t border-dashed border-ink/15 bg-mist/60 px-4 pt-5 pb-2 font-medium text-ink text-md sm:px-6"
              >
                {g.title}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.label} className="border-t border-dashed border-ink/10">
                <th scope="row" className="px-4 py-3 font-normal sm:px-6">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-2 text-sm">
                    {r.label}
                    {r.vendors === undefined ? null : (
                      <span className="flex flex-wrap gap-1.5">
                        {r.vendors.map((v) => <Logo key={v} vendor={v} size={28} label />)}
                      </span>
                    )}
                  </span>
                </th>
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-1 py-3 text-center align-middle transition-colors duration-[420ms] sm:px-3",
                      col(i) && "bg-glacier"
                    )}
                  >
                    <CellMark cell={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/**
 * Pricing, read from `plans.ts`. One frame split by dashed rules rather than three cards; the plan
 * that fits the meter is the one on glacier. No plan is labelled "most chosen" — nobody has chosen
 * anything yet.
 */
export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("yearly")
  const [stores, setStores] = useState(3)
  const [orderStop, setOrderStop] = useState(3)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<PlanId | null>(null)
  const fit = planFor(stores, ORDER_STOPS[orderStop] ?? 2000)
  const tableId = useId()

  const view = (id: PlanId) => {
    setFocus(id)
    setOpen(true)
    requestAnimationFrame(() => {
      document.getElementById(tableId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  return (
    <section id="prijzen" aria-labelledby="prijzen-kop" className="bg-paper">
      <Frame inner="py-20 sm:py-28">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="prijzen-kop" className="font-medium text-4xl text-ink sm:text-display-sm">
            Drie abonnementen. <span className="text-ink-3 lg:block">Indicatief, zolang de bèta loopt.</span>
          </h2>
          <CycleSwitch cycle={cycle} onChange={setCycle} />
        </div>

        <Framed className="mt-12 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col justify-between gap-6 p-6 sm:p-10">
            <div className="flex flex-col gap-4">
              <h3 className="max-w-[22ch] font-medium text-2xl text-ink">Betaal voor de winkels die je draait.</h3>
              <p className="max-w-[44ch] text-ink-2 text-md">
                Een abonnement gaat over winkels, plekken en bestellingen per maand. De prijzen zijn indicatief: Insyte
                is in private bèta en werkt op uitnodiging, en tijdens de bèta liggen de prijzen nog niet vast.
              </p>
            </div>
            <p className="text-ink-3 text-sm">
              Bedragen in euro, per maand. Bij jaarlijks betalen zijn twee maanden gratis.
            </p>
          </div>
          <div className="border-t border-dashed border-ink/15 p-6 sm:p-10 lg:border-t-0 lg:border-l">
            <FitMeter
              stores={stores}
              setStores={setStores}
              orderStop={orderStop}
              setOrderStop={setOrderStop}
              cycle={cycle}
              onView={view}
            />
          </div>
        </Framed>

        <Framed className="mt-6">
          <Reveal className="grid divide-y divide-dashed divide-ink/15 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {PLANS.map((plan, i) => (
              <PlanColumn
                key={plan.id}
                plan={plan}
                prev={i === 0 ? undefined : PLANS[i - 1]}
                cycle={cycle}
                fit={plan.id === fit.id}
                onView={view}
              />
            ))}
          </Reveal>
        </Framed>

        <div id={tableId} className="mt-6 scroll-mt-28">
          <Framed>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${tableId}-tabel`}
              onClick={() => setOpen(!open)}
              className="flex w-full items-center justify-between gap-4 px-4 py-5 text-left sm:px-6"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-ink text-lg">Volledige vergelijking</span>
                <span className="text-ink-3 text-sm">
                  Per onderdeel: bestellingen, klantenservice, chargebacks, automatiseringen, partners, team en
                  koppelingen.
                </span>
              </span>
              <ChevronDown
                size={18}
                className={cn(
                  "shrink-0 text-ink-2 transition-transform duration-[240ms] ease-[var(--ease-out-quart)]",
                  open && "rotate-180"
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {open
                ? (
                  <motion.div
                    id={`${tableId}-tabel`}
                    key="tabel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <Comparison cycle={cycle} focus={focus} />
                  </motion.div>
                )
                : null}
            </AnimatePresence>
          </Framed>
        </div>
      </Frame>
    </section>
  )
}
