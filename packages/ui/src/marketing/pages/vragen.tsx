import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useScroll, useSpring } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { FAQ_GROUPS, FAQ_ITEMS, type FaqItem } from "../faq-data.ts"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { PrimaryLink, SecondaryLink } from "../parts.tsx"
import { foldQuery, matches, QuestionRow } from "./accordion.tsx"
import { MarketingPage, PageHero } from "./shell.tsx"

export { faqJsonLd } from "../faq-data.ts"
export const FAQ_ALL: ReadonlyArray<FaqItem> = FAQ_ITEMS

/*
 * /vragen: every question, by group. A sticky index on the left carries the search and the six
 * groups; its dashed rail fills with an abyss line as you read, and a square marker slides to the
 * group on screen. Typing filters the rows (they fold away, the counts follow), marks the matches,
 * and opens an answer whose text matched where the question did not. `/vragen#<id>` opens and
 * scrolls to that question; opening one writes its anchor into the address.
 */

const groupOf = new Map(FAQ_ITEMS.map((i) => [i.id, i.group]))

function useHashOpen(setOpen: (fn: (s: ReadonlySet<string>) => ReadonlySet<string>) => void) {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!groupOf.has(id)) return
      setOpen((s) => new Set([...s, id]))
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.getElementById(id)
          if (el === null) return
          window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 112 })
        })
      )
    }
    go()
    window.addEventListener("hashchange", go)
    return () => window.removeEventListener("hashchange", go)
  }, [setOpen])
}

/** The group whose section holds the reading line (a third of the way down the screen). */
function useActiveGroup(ids: ReadonlyArray<string>) {
  const [active, setActive] = useState(ids[0] ?? "")
  useEffect(() => {
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting)
      const first = ids.find((id) => seen.get(id) === true)
      if (first !== undefined) setActive(first)
    }, { rootMargin: "-30% 0px -60% 0px" })
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el !== null) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids])
  return active
}

function SearchField(
  { value, onChange, count, className }: {
    readonly value: string
    readonly onChange: (v: string) => void
    readonly count: number
    readonly className?: string
  }
) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return
      const t = e.target as HTMLElement | null
      if (t !== null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="relative flex h-11 items-center rounded-md field focus-within:bg-paper focus-within:shadow-[inset_0_0_0_1px_var(--arc),0_0_0_4px_var(--arc-soft)]">
        <span className="sr-only">Zoek in de vragen</span>
        <Search size={16} className="pointer-events-none absolute left-3 text-ink-3" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onChange("")
          }}
          placeholder="Zoek in de vragen"
          autoComplete="off"
          className="h-full w-full bg-transparent pr-10 pl-9 text-base text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {value === ""
          ? (
            <kbd className="pointer-events-none absolute right-2.5 flex size-6 items-center justify-center rounded-sm bg-ink/6 font-sans text-ink-3 text-xs max-lg:hidden">
              /
            </kbd>
          )
          : (
            <button
              type="button"
              aria-label="Zoekterm wissen"
              onClick={() => {
                onChange("")
                ref.current?.focus()
              }}
              className="absolute right-1.5 flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
      </label>
      <p aria-live="polite" className={cn("text-ink-3 text-sm", value === "" && "sr-only")}>
        {count === 1 ? "1 vraag gevonden" : `${count} vragen gevonden`}
      </p>
    </div>
  )
}

/**
 * The index: the groups with their counts, a square marker that slides to the group being read,
 * and a dashed rail that fills with an abyss line in step with the reading.
 */
function Index(
  { active, counts, progress }: {
    readonly active: string
    readonly counts: ReadonlyMap<string, number>
    readonly progress: ReturnType<typeof useSpring>
  }
) {
  return (
    <nav aria-label="Onderwerpen" className="relative pl-5">
      <span aria-hidden className="absolute top-1 bottom-1 left-0 w-px dash-y" />
      <motion.span
        aria-hidden
        className="absolute top-1 bottom-1 left-0 w-px origin-top bg-abyss"
        style={{ scaleY: progress }}
      />
      <LayoutGroup id="faq-index">
        <ul className="flex flex-col gap-0.5">
          {FAQ_GROUPS.map((g) => {
            const n = counts.get(g.id) ?? 0
            const on = active === g.id
            return (
              <li key={g.id} className="relative">
                {on
                  ? (
                    <motion.span
                      layoutId="faq-marker"
                      aria-hidden
                      className="absolute top-1/2 -left-[23px] size-[7px] -translate-y-1/2 bg-abyss"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )
                  : null}
                <a
                  href={`#${g.id}`}
                  aria-current={on ? "location" : undefined}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md py-1.5 text-base transition-colors",
                    on ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                    n === 0 && "text-ink-3"
                  )}
                >
                  {g.title}
                  <span className="text-ink-3 text-sm tabular-nums">{n}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </LayoutGroup>
    </nav>
  )
}

/** Below `lg`: the groups as a row of chips under the bar, the one being read filled. */
function Chips({ active, counts }: { readonly active: string; readonly counts: ReadonlyMap<string, number> }) {
  return (
    <nav aria-label="Onderwerpen" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <LayoutGroup id="faq-chips">
        <ul className="flex w-max gap-1">
          {FAQ_GROUPS.map((g) => {
            const on = active === g.id
            return (
              <li key={g.id} className="relative">
                {on
                  ? (
                    <motion.span
                      layoutId="faq-chip"
                      aria-hidden
                      className="absolute inset-0 rounded-md bg-abyss"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )
                  : null}
                <a
                  href={`#${g.id}`}
                  className={cn(
                    "relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors",
                    on ? "text-mesh-ink" : "bg-ink/5 text-ink-2"
                  )}
                >
                  {g.title}
                  <span className={cn("tabular-nums", on ? "text-mesh-ink-2" : "text-ink-3")}>
                    {counts.get(g.id) ?? 0}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </LayoutGroup>
    </nav>
  )
}

const fold = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 }
}

function Questions() {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [raw, setRaw] = useState("")
  const query = foldQuery(raw)
  useHashOpen(setOpen)

  const hits = useMemo(() => {
    const m = new Map<string, "q" | "a">()
    for (const i of FAQ_ITEMS) {
      if (matches(i.q, query)) m.set(i.id, "q")
      else if (i.a.some((p) => matches(p, query))) m.set(i.id, "a")
    }
    return m
  }, [query])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const g of FAQ_GROUPS) c.set(g.id, g.items.filter((i) => hits.has(i.id)).length)
    return c
  }, [hits])

  const visible = useMemo(() => FAQ_GROUPS.filter((g) => (counts.get(g.id) ?? 0) > 0), [counts])
  const ids = useMemo(() => visible.map((g) => g.id), [visible])
  const active = useActiveGroup(ids)

  const list = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 0.35", "end 0.65"] })
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.4 })

  const toggle = (id: string) => {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        window.history.replaceState(null, "", `#${id}`)
      }
      return next
    })
  }

  const t = reduced ? { duration: 0 } : { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <section aria-label="Alle vragen" className="bg-paper">
      <Frame top={false} inner="pt-16 pb-24 sm:pt-20 sm:pb-32">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-16 xl:gap-24">
          <aside className="lg:sticky lg:top-24 lg:self-start max-lg:sticky max-lg:top-16 max-lg:z-20 max-lg:-mx-4 max-lg:bg-paper max-lg:px-4 max-lg:pt-3 max-lg:pb-3 max-lg:shadow-[inset_0_-1px_0_var(--hairline)] sm:max-lg:-mx-8 sm:max-lg:px-8">
            <div className="flex flex-col gap-3 lg:gap-8">
              <SearchField value={raw} onChange={setRaw} count={hits.size} />
              <div className="hidden lg:block">
                <Index active={active} counts={counts} progress={progress} />
              </div>
              <div className="lg:hidden">
                <Chips active={active} counts={counts} />
              </div>
            </div>
          </aside>

          <div ref={list} className="flex min-w-0 flex-col">
            <AnimatePresence initial={false}>
              {visible.map((g, gi) => {
                const items = g.items.filter((i) => hits.has(i.id))
                return (
                  <motion.section
                    key={g.id}
                    id={g.id}
                    aria-labelledby={`${g.id}-kop`}
                    {...fold}
                    transition={t}
                    className="relative scroll-mt-36 overflow-clip lg:scroll-mt-24"
                  >
                    <div className={cn("flex flex-col gap-1.5 pb-6", gi > 0 && "pt-16 sm:pt-20")}>
                      <div className="flex items-baseline justify-between gap-4">
                        <h2 id={`${g.id}-kop`} className="font-medium text-2xl text-ink sm:text-3xl">{g.title}</h2>
                        <span className="text-ink-3 text-sm tabular-nums">
                          {items.length === 1 ? "1 vraag" : `${items.length} vragen`}
                        </span>
                      </div>
                      <p className="text-ink-3 text-md">{g.line}</p>
                    </div>
                    <div className="border-hairline border-t">
                      <AnimatePresence initial={false}>
                        {items.map((item) => (
                          <motion.div key={item.id} {...fold} transition={t} className="overflow-clip">
                            <QuestionRow
                              item={item}
                              copy
                              query={query}
                              open={open.has(item.id) || (query.length >= 3 && hits.get(item.id) === "a")}
                              onToggle={() =>
                                toggle(item.id)}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                )
              })}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {hits.size === 0
                ? (
                  <motion.div key="niets" {...fold} transition={t} className="overflow-clip">
                    <div className="flex flex-col items-start gap-4 rounded-lg bg-glacier p-6 sm:p-8">
                      <p className="font-medium text-ink text-xl">Geen vraag over “{raw.trim()}”.</p>
                      <p className="max-w-[52ch] text-ink-2 text-md">
                        Probeer een ander woord, of stel je vraag bij je toegangsaanvraag.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setRaw("")}
                          className="inline-flex h-10 items-center rounded-md px-4 font-medium text-ink text-sm field hover:bg-paper"
                        >
                          Zoekterm wissen
                        </button>
                        <a
                          href={links.page("/toegang")}
                          className="inline-flex h-10 items-center rounded-md bg-abyss px-4 font-medium text-mesh-ink text-sm hover:bg-abyss-2"
                        >
                          Toegang aanvragen
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )
                : null}
            </AnimatePresence>
          </div>
        </div>
      </Frame>
    </section>
  )
}

/** The page's end before the closing band: one line and the two actions. */
function Ask() {
  const links = useMarketingLinks()
  return (
    <section aria-labelledby="nog-vragen" className="bg-glacier">
      <Frame inner="py-16 sm:py-20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3">
            <h2 id="nog-vragen" className="font-medium text-3xl text-ink sm:text-4xl">
              Staat je vraag er niet bij?
            </h2>
            <p className="max-w-[56ch] text-ink-2 text-md">
              Stel hem bij je toegangsaanvraag. Wie in de bèta zit, vraagt het in de console.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryLink href={links.page("/toegang")}>Toegang aanvragen</PrimaryLink>
            <SecondaryLink href={links.login}>Inloggen</SecondaryLink>
          </div>
        </div>
      </Frame>
    </section>
  )
}

export function VragenPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <MarketingPage links={links}>
      <PageHero
        title="Vragen."
        second="Elk antwoord gaat over vandaag."
        lede="Wat operators het vaakst vragen over Insyte, per onderwerp. Wat nog niet vastligt, staat er zo bij."
        fields={[
          { label: "Onderwerpen", value: FAQ_GROUPS.length },
          { label: "Vragen", value: FAQ_ITEMS.length },
          { label: "Bijgewerkt", value: <time dateTime="2026-10-31">31 oktober 2026</time> }
        ]}
      />
      <Questions />
      <Ask />
    </MarketingPage>
  )
}
