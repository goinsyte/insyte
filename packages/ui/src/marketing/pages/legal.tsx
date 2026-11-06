import { motion, useReducedMotion, useScroll, useSpring } from "motion/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { AlertTriangle, ChevronDown, FileText, InfoIcon } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { MarketingPage, PageHero } from "./shell.tsx"

/*
 * The legal pages, in Read mode: one reading column at a 68ch measure, a sticky table of contents
 * that follows the reading (the article on screen is marked and a line beside the list fills as you
 * read), and the date at the top. The text is the legacy site's Dutch, ported as written; where it
 * promised something the product cannot back yet, the passage is marked as a concept to check.
 *
 * Article numbers stay: a contract is cited by them, so they carry information.
 */

export type LegalSectionDef = { readonly n: string; readonly id: string; readonly title: string }

export type LegalDoc = "voorwaarden" | "privacy" | "verwerkersovereenkomst"

const DOCS: ReadonlyArray<{ readonly id: LegalDoc; readonly label: string; readonly path: string }> = [
  { id: "voorwaarden", label: "Voorwaarden", path: "/voorwaarden" },
  { id: "privacy", label: "Privacyverklaring", path: "/privacy" },
  { id: "verwerkersovereenkomst", label: "Verwerkersovereenkomst", path: "/verwerkersovereenkomst" }
]

/** A link to another page of the site, inline in running text. */
export function L({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  const links = useMarketingLinks()
  return (
    <a
      href={links.page(to)}
      className="text-arc-ink underline decoration-arc-ink/35 underline-offset-4 transition-colors hover:decoration-arc-ink"
    >
      {children}
    </a>
  )
}

export function LegalSection(
  { id, n, title, intro, children }: {
    readonly id: string
    readonly n: string
    readonly title: string
    readonly intro?: ReactNode
    readonly children: ReactNode
  }
) {
  return (
    <section id={id} aria-labelledby={`${id}-kop`} className="flex scroll-mt-28 flex-col gap-7">
      <header className="flex flex-col gap-4 border-hairline border-b pb-5">
        <h2 id={`${id}-kop`} className="flex items-baseline gap-4 font-medium text-2xl text-ink sm:text-3xl">
          <span className="min-w-[1.6em] text-ink-3 text-lg tabular-nums">{Number(n)}</span>
          <span>{title}</span>
        </h2>
        {intro === undefined ? null : <p className="max-w-[68ch] text-ink-2 text-md">{intro}</p>}
      </header>
      <div className="flex max-w-[68ch] flex-col gap-5 text-base text-ink-2 leading-[1.7]">{children}</div>
    </section>
  )
}

export function LegalSub(
  { n, title, children }: { readonly n: string; readonly title: string; readonly children: ReactNode }
) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <h3 className="flex items-baseline gap-3 font-medium text-ink text-lg">
        <span className="text-ink-3 text-sm tabular-nums">{n}</span>
        <span>{title}</span>
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

/** A defined term: medium weight in ink, so it can be scanned for. */
export function Term({ children }: { readonly children: ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>
}

export function Defs(
  { items }: { readonly items: ReadonlyArray<{ readonly term: string; readonly desc: ReactNode }> }
) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-[180px_minmax(0,1fr)]">
      {items.map((it) => (
        <div key={it.term} className="contents">
          <dt className="font-medium text-ink">{it.term}</dt>
          <dd className="text-ink-2">{it.desc}</dd>
        </div>
      ))}
    </dl>
  )
}

export function LegalTable(
  { headers, rows }: { readonly headers: ReadonlyArray<string>; readonly rows: ReadonlyArray<ReadonlyArray<ReactNode>> }
) {
  return (
    <div className="no-scrollbar overflow-x-auto rounded-lg hairline">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm leading-[1.55]">
        <thead>
          <tr className="bg-mist">
            {headers.map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium text-ink-3 text-xs">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-hairline border-t">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3.5 align-top text-ink-2 first:font-medium first:text-ink">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Callout(
  { tone = "info", title, children }: {
    readonly tone?: "info" | "warning" | "success"
    readonly title: string
    readonly children: ReactNode
  }
) {
  const Icon = tone === "warning" ? AlertTriangle : InfoIcon
  return (
    <aside className="flex items-start gap-3.5 rounded-lg bg-glacier p-5">
      <Icon size={16} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-ink text-sm">{title}</span>
        <div className="text-ink-2 text-sm leading-[1.6]">{children}</div>
      </div>
    </aside>
  )
}

/** A passage that still needs a lawyer's eye: the product cannot back it yet, or it was never written. */
export function Concept({ children }: { readonly children?: ReactNode }) {
  return (
    <aside className="flex items-start gap-3.5 rounded-lg border border-dashed border-ink/25 p-5">
      <FileText size={16} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-ink text-sm">Concepttekst — juridisch nog te controleren</span>
        {children === undefined ? null : <div className="text-ink-2 text-sm leading-[1.6]">{children}</div>}
      </div>
    </aside>
  )
}

export function NumberedList({ items }: { readonly items: ReadonlyArray<ReactNode> }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
          <span className="text-ink-3 tabular-nums">{i + 1}.</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}

export function Bullets({ items }: { readonly items: ReadonlyArray<ReactNode> }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
          <span aria-hidden className="mt-[0.8em] block h-px w-3 bg-ink-4" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

export function Para({ children }: { readonly children: ReactNode }) {
  return <p>{children}</p>
}

/* ── The shell ────────────────────────────────────────────────────────────────────────────────── */

function useSpy(ids: ReadonlyArray<string>) {
  const [active, setActive] = useState(ids[0] ?? "")
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.3
      let current = ids[0] ?? ""
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el !== null && el.getBoundingClientRect().top <= line) current = id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [ids])
  return active
}

function Toc(
  { sections, active, progress }: {
    readonly sections: ReadonlyArray<LegalSectionDef>
    readonly active: string
    readonly progress: ReturnType<typeof useSpring>
  }
) {
  const reduced = useReducedMotion() === true
  const list = useRef<HTMLOListElement | null>(null)
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)
    if (el != null) setMark({ top: el.offsetTop, height: el.offsetHeight })
  }, [active])
  return (
    <nav aria-label="Inhoud" className="relative">
      <span className="mb-3 block text-ink-3 text-sm">Inhoud</span>
      <div className="relative pl-4">
        <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-ink/10" />
        <motion.span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-px origin-top bg-ink/25"
          style={{ scaleY: progress }}
        />
        {mark === null ? null : (
          <motion.span
            aria-hidden
            className="absolute left-[-1px] w-[3px] rounded-full bg-abyss"
            initial={false}
            animate={{ top: mark.top, height: mark.height }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
          />
        )}
        <ol ref={list} className="flex flex-col">
          {sections.map((s) => {
            const on = s.id === active
            return (
              <li key={s.id} data-id={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "location" : undefined}
                  className={cn(
                    "grid grid-cols-[1.6rem_minmax(0,1fr)] rounded-sm py-1.5 text-sm transition-colors",
                    on ? "font-medium text-ink" : "text-ink-3 hover:text-ink"
                  )}
                >
                  <span className="tabular-nums">{Number(s.n)}</span>
                  <span>{s.title.replace(/­/g, "")}</span>
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}

export function LegalPage(
  { links, doc, title, lede, updated, updatedIso, sections, children }: {
    readonly links: MarketingLinks
    readonly doc: LegalDoc
    readonly title: string
    readonly lede: string
    readonly updated: string
    readonly updatedIso: string
    readonly sections: ReadonlyArray<LegalSectionDef>
    readonly children: ReactNode
  }
) {
  const ids = sections.map((s) => s.id)
  const active = useSpy(ids)
  const body = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({ target: body, offset: ["start 0.3", "end 0.7"] })
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.4 })
  return (
    <MarketingPage links={links}>
      <PageHero
        ground="glacier"
        title={title}
        lede={lede}
        fields={[
          { label: "Bijgewerkt", value: <time dateTime={updatedIso}>{updated}</time> },
          { label: "Artikelen", value: sections.length },
          { label: "Status", value: "Concept" }
        ]}
      />
      <section aria-label={title} className="bg-paper">
        <Frame top={false} inner="pt-14 pb-24 sm:pt-20 sm:pb-32">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-20">
            <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100svh-7rem)] lg:self-start lg:overflow-y-auto lg:no-scrollbar">
              <div className="flex flex-col gap-8">
                <div className="max-lg:hidden">
                  <Toc sections={sections} active={active} progress={progress} />
                </div>
                <details className="group rounded-lg bg-glacier px-4 py-3 lg:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink text-sm">
                    Inhoud, {sections.length} artikelen
                    <ChevronDown size={16} className="text-ink-3 transition-transform group-open:rotate-180" />
                  </summary>
                  <ol className="mt-3 flex flex-col">
                    {sections.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="grid grid-cols-[1.6rem_minmax(0,1fr)] py-1.5 text-ink-2 text-sm"
                        >
                          <span className="tabular-nums text-ink-3">{Number(s.n)}</span>
                          <span>{s.title.replace(/\u00ad/g, "")}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </details>
                <nav aria-label="Juridisch" className="flex flex-col gap-1 border-hairline border-t pt-5 max-lg:hidden">
                  {DOCS.map((d) => (
                    <a
                      key={d.id}
                      href={links.page(d.path)}
                      aria-current={d.id === doc ? "page" : undefined}
                      className={cn(
                        "rounded-sm py-1 text-sm transition-colors",
                        d.id === doc ? "font-medium text-ink" : "text-ink-3 hover:text-ink"
                      )}
                    >
                      {d.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
            <div ref={body} className="flex min-w-0 flex-col gap-16">
              <Concept>
                Deze tekst komt van de vorige site en is nog niet herzien voor de huidige bèta. Waar hij iets belooft
                wat het product nog niet waarmaakt, staat dat erbij.
              </Concept>
              {children}
            </div>
          </div>
        </Frame>
      </section>
    </MarketingPage>
  )
}

/**
 * A contact address. The site is linked from portfolios and must not offer a working mailbox (the
 * same rule as `lib/contact-email.tsx` in the console), so it reads as an inert sample on .example
 * until the real addresses are decided.
 */
export function ContactEmail({ name }: { readonly name: string }) {
  return <span className="font-medium text-ink">{name}@insyte.example</span>
}
