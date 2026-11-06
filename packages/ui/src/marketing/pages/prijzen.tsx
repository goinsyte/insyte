import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "motion/react"
import { type CSSProperties, useEffect, useId, useRef, useState } from "react"
import { cn } from "../../lib/utils.ts"
import { FAQ_GROUPS } from "../faq-data.ts"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { Reveal } from "../motion.tsx"
import { ArrowLink, Logo, usePlay } from "../parts.tsx"
import { COMPARISON, type Cycle, euros, type Group, planFor, type PlanId, PLANS } from "../plans.ts"
import { CellMark, CycleSwitch, FitMeter, Framed, ORDER_STOPS, PlanColumn } from "../pricing.tsx"
import { QuestionList } from "./accordion.tsx"
import { MarketingPage, PageHero, SectionHead } from "./shell.tsx"

/*
 * /prijzen: the homepage's pricing in full. The same cycle switch, fit meter and three plans (one
 * source, `plans.ts`), then the whole comparison open, its plan header sticking under the bar while
 * the rows pass beneath it. The header's left cell names the group being read and an abyss line
 * under it fills with the reading; each group's checks draw in as it arrives. Indicative throughout:
 * pricing is an open decision.
 */

const STICKY_TOP = "top-16"

function useCurrentGroup(ids: ReadonlyArray<string>) {
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => {
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set((e.target as HTMLElement).dataset.group ?? "", e.isIntersecting)
      setCurrent(ids.find((id) => seen.get(id) === true) ?? null)
    }, { rootMargin: "-140px 0px -55% 0px" })
    for (const id of ids) {
      const el = document.querySelector(`[data-group="${id}"]`)
      if (el !== null) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids])
  return current
}

function GroupBody({ group, focus }: { readonly group: Group; readonly focus: PlanId | null }) {
  const { play, ref } = usePlay<HTMLTableSectionElement>({ rootMargin: "0px 0px -12% 0px" })
  const col = (i: number) => PLANS[i]?.id === focus
  return (
    <tbody ref={ref} data-play={play} data-group={group.id}>
      <tr>
        <th
          id={`vergelijking-${group.id}`}
          scope="colgroup"
          colSpan={4}
          className="scroll-mt-40 border-t border-dashed border-ink/15 bg-mist/60 px-4 pt-6 pb-2.5 font-medium text-ink text-md sm:px-6"
        >
          {group.title}
        </th>
      </tr>
      {group.rows.map((r, ri) => (
        <tr
          key={r.label}
          className="border-t border-dashed border-ink/10 transition-colors hover:bg-glacier/60"
          style={{ "--d": ri } as CSSProperties}
        >
          <th scope="row" className="px-4 py-3.5 font-normal sm:px-6">
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
                "px-1 py-3.5 text-center align-middle transition-colors duration-[420ms] sm:px-3",
                col(i) && "bg-glacier"
              )}
            >
              <CellMark cell={c} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

function FullComparison({ cycle, focus }: { readonly cycle: Cycle; readonly focus: PlanId | null }) {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  const ids = COMPARISON.map((g) => g.id)
  const current = useCurrentGroup(ids)
  const title = COMPARISON.find((g) => g.id === current)?.title
  const table = useRef<HTMLTableElement | null>(null)
  const { scrollYProgress } = useScroll({ target: table, offset: ["start 0.2", "end 0.8"] })
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.4 })
  const col = (i: number) => PLANS[i]?.id === focus
  return (
    <table ref={table} className="w-full table-fixed border-collapse text-left">
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
            className={cn(
              "sticky z-10 bg-paper px-4 py-4 align-bottom font-normal sm:px-6",
              STICKY_TOP,
              "shadow-[inset_0_-1px_0_var(--hairline)]"
            )}
          >
            <span className="relative block h-11 overflow-hidden sm:h-12">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={title ?? "alles"}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-x-0 bottom-0 flex flex-col"
                >
                  <span className="text-ink-3 text-xs sm:text-sm">Indicatief, per maand</span>
                  <span className="truncate font-medium text-ink text-sm sm:text-md">{title ?? "Alle onderdelen"}</span>
                </motion.span>
              </AnimatePresence>
            </span>
            <motion.span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-abyss"
              style={{ scaleX: progress }}
            />
          </th>
          {PLANS.map((p, i) => (
            <th
              key={p.id}
              scope="col"
              className={cn(
                "sticky z-10 px-1 py-4 text-center align-bottom shadow-[inset_0_-1px_0_var(--hairline)] transition-colors duration-[420ms] sm:px-3",
                STICKY_TOP,
                col(i) ? "bg-glacier" : "bg-paper"
              )}
            >
              <span className="block font-medium text-ink text-sm sm:text-base">{p.name}</span>
              <span className="block text-ink-3 text-xs tabular-nums sm:text-sm">
                {euros(cycle === "yearly" ? p.yearly : p.monthly)}
              </span>
              <a
                href={links.page("/toegang")}
                className={cn(
                  "mt-2 hidden h-8 items-center justify-center rounded-md px-3 font-medium text-xs transition-colors md:inline-flex",
                  col(i) ? "bg-abyss text-mesh-ink hover:bg-abyss-2" : "field text-ink hover:bg-paper"
                )}
              >
                Toegang aanvragen
              </a>
            </th>
          ))}
        </tr>
      </thead>
      {COMPARISON.map((g) => <GroupBody key={g.id} group={g} focus={focus} />)}
    </table>
  )
}

function Plans() {
  const [cycle, setCycle] = useState<Cycle>("yearly")
  const [stores, setStores] = useState(3)
  const [orderStop, setOrderStop] = useState(3)
  const [focus, setFocus] = useState<PlanId | null>(null)
  const fit = planFor(stores, ORDER_STOPS[orderStop] ?? 2000)
  const tableId = useId()

  const view = (id: PlanId) => {
    setFocus(id)
    requestAnimationFrame(() => {
      document.getElementById(tableId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  return (
    <>
      <section aria-labelledby="plannen-kop" className="bg-paper">
        <Frame top={false} inner="pt-16 pb-12 sm:pt-20">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="plannen-kop" className="font-medium text-2xl text-ink sm:text-3xl">Kies hoe je betaalt</h2>
            <CycleSwitch cycle={cycle} onChange={setCycle} />
          </div>

          <Framed className="mt-10 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col justify-between gap-6 p-6 sm:p-10">
              <div className="flex flex-col gap-4">
                <h3 className="max-w-[22ch] font-medium text-2xl text-ink">Betaal voor de winkels die je draait.</h3>
                <p className="max-w-[44ch] text-ink-2 text-md">
                  Zet je aantal winkels en je bestellingen per maand; het abonnement dat past, licht hier en in de
                  vergelijking op. Een abonnement gaat over winkels, plekken en bestellingen per maand.
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
        </Frame>
      </section>

      <section id="vergelijking" aria-labelledby="vergelijking-kop" className="bg-paper">
        <Frame inner="pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <SectionHead
              id="vergelijking-kop"
              title="Alles naast elkaar."
              second="Per onderdeel, per abonnement."
              lede="Elke regel is iets wat de console vandaag doet, of een grens van het abonnement. Wat nog niet gebouwd is, staat er als binnenkort bij."
            />
            <nav aria-label="Onderdelen" className="flex flex-wrap gap-1.5 lg:max-w-[420px] lg:justify-end">
              {COMPARISON.map((g) => (
                <a
                  key={g.id}
                  href={`#vergelijking-${g.id}`}
                  className="inline-flex h-8 items-center rounded-md bg-ink/5 px-3 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/8 hover:text-ink"
                >
                  {g.title}
                </a>
              ))}
            </nav>
          </div>
          <div id={tableId} className="mt-12 scroll-mt-20">
            <Framed>
              <FullComparison cycle={cycle} focus={focus ?? fit.id} />
            </Framed>
          </div>
        </Frame>
      </section>
    </>
  )
}

function PriceQuestions() {
  const links = useMarketingLinks()
  const group = FAQ_GROUPS.find((g) => g.id === "prijzen-en-beta")
  if (group === undefined) return null
  return (
    <section aria-labelledby="prijsvragen-kop" className="bg-glacier">
      <Frame inner="py-20 sm:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <h2 id="prijsvragen-kop" className="font-medium text-4xl text-ink sm:text-display-sm">
              Vragen over prijzen.
            </h2>
            <p className="max-w-[40ch] text-ink-2 text-lg">
              Wat het kost, wat erbij zit en hoe je binnenkomt zolang Insyte in bèta is.
            </p>
            <ArrowLink href={links.page("/vragen#prijzen-en-beta")}>Alle vragen</ArrowLink>
          </div>
          <QuestionList items={group.items} size="xl" />
        </div>
      </Frame>
    </section>
  )
}

export function PrijzenPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <MarketingPage links={links}>
      <PageHero
        ground="glacier"
        align="center"
        title="Prijzen."
        second="Indicatief, zolang de bèta loopt."
        lede="Drie abonnementen naar het aantal winkels, plekken en bestellingen dat je draait. Insyte is in private bèta en werkt op uitnodiging; tijdens de bèta liggen de prijzen nog niet vast."
        fields={[
          { label: "Abonnementen", value: PLANS.length },
          { label: "Vanaf", value: `${euros(Math.min(...PLANS.map((p) => p.yearly)))} per maand, jaarlijks` },
          { label: "Status", value: "Indicatief" }
        ]}
      />
      <Plans />
      <PriceQuestions />
    </MarketingPage>
  )
}
