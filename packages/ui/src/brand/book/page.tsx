import { Link } from "@tanstack/react-router"
import { motion, MotionConfig, useReducedMotion } from "motion/react"
import { type ReactNode, useState } from "react"
import { ArrowLeft, ArrowRight, EyeOff, Pause, Play, RotateCcw } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { HeroBar, type TitleField } from "../../marketing/pages/shell.tsx"
import { InsyteMark } from "../mark.tsx"
import {
  type ChapterId,
  chapterOf,
  CHAPTERS,
  type Ground,
  heroPage,
  neighbours,
  type PageId,
  pageNumber,
  pageTitle,
  two,
  UPDATED
} from "./registry.ts"
import { IN_OUT, sec, SpecimenContext, type SpecimenGround, type SpecimenState, useBook } from "./state.tsx"

/*
 * The book's page template, in three parts.
 *
 * - `ChapterHero`: the chapter's plate, numbered. A huge plate number in the display face, the
 *   title in two tones, one sentence and a title block, on a flat ground that differs from its
 *   neighbours (abyss, arc, paper, mist) with the drafting grid and the Drift hatch, still.
 * - `SectionPage`: a slide. A narrow column (the mark, the title, a paragraph, the notes and the
 *   page number at its foot) beside one large panel holding one live specimen, centred, with air.
 *   One viewport tall on a desktop; stacked on a phone.
 * - `ChapterClose`: the abyss band at the end, with the previous and the next chapter.
 */

const DARK: ReadonlySet<Ground> = new Set(["abyss", "arc"])

const GROUND: Record<Ground, string> = {
  abyss: "bg-abyss text-mesh-ink",
  arc: "bg-arc text-mesh-ink",
  paper: "bg-paper text-ink hairline",
  mist: "bg-mist text-ink"
}

/** The chapter number and title carry these, so they morph from the menu into the hero. */
export const numberId = (id: ChapterId): string => `chapter-number-${id}`
export const titleId = (id: ChapterId): string => `chapter-title-${id}`

/** The ground's own patterns: chalk on the dark grounds, ink on the light ones; still, masked. */
function Patterns({ ground }: { readonly ground: Ground }) {
  const dark = DARK.has(ground)
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      <div
        className={cn(
          "absolute inset-0 [mask-image:linear-gradient(180deg,black,transparent_90%)]",
          dark ? "drafting-chalk" : "drafting-ink"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 [mask-image:radial-gradient(55%_70%_at_100%_100%,black,transparent_75%)]",
          dark ? "hatch-chalk" : "hatch-ink"
        )}
      />
    </div>
  )
}

export function ChapterHero({ id, preview = false }: { readonly id: ChapterId; readonly preview?: boolean }) {
  const c = chapterOf(id)
  const dark = DARK.has(c.ground)
  const { still } = useBook()
  /* The morph is off without motion, and in the menu's miniature, which is a picture of the hero. */
  const morph = !(useReducedMotion() === true || still || preview)
  const Title = preview ? "div" : "h1"
  const Shell = preview ? "div" : "header"
  return (
    <Shell className={preview ? "" : "px-2 pt-1 sm:px-3 sm:pt-2"}>
      <div
        data-ground={dark ? "dark" : undefined}
        className={cn("relative isolate flow-root rounded-xl", GROUND[c.ground])}
      >
        <Patterns ground={c.ground} />
        <div
          className={cn(
            "relative mx-auto grid max-w-[1320px] grid-rows-[auto_1fr_auto] gap-10 px-5 pt-8 pb-8 sm:px-10 sm:pt-10",
            preview ? "h-[880px]" : "min-h-[calc(100svh-140px)] lg:max-h-[860px]"
          )}
        >
          {
            /* The colour sits on the row: `cn` reads the book's own size steps as colours and would
              drop `text-plate` in favour of `text-ink`. */
          }
          <div className={cn("flex items-start justify-between gap-6", dark ? "text-mesh-ink" : "text-ink")}>
            <motion.span
              layoutId={morph ? numberId(id) : undefined}
              className="figure block text-plate sm:text-numeral"
            >
              {c.n}
            </motion.span>
            <span className={cn("pt-3 text-right text-sm", dark ? "text-mesh-ink-2" : "text-ink-3")}>
              Hoofdstuk {Number(c.n)} van {CHAPTERS.length}
            </span>
          </div>
          <div />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <Title
              className={cn(
                "font-medium text-4xl sm:text-display-sm",
                c.title.length + c.second.length > 40 ? "" : "lg:text-display"
              )}
            >
              <motion.span layoutId={morph ? titleId(id) : undefined} className="inline-block">
                {c.title}
              </motion.span>
              <span className={cn("block", dark ? "text-mesh-ink-2" : "text-ink-3")}>{c.second}</span>
            </Title>
            <div className="flex flex-col gap-6">
              <p className={cn("max-w-[48ch] text-lg", dark ? "text-mesh-ink-2" : "text-ink-2")}>{c.lede}</p>
              <BookTitleBlock
                dark={dark}
                fields={[
                  { label: "Hoofdstuk", value: c.n },
                  { label: "Pagina's", value: `${heroPage(id)}–${heroPage(id) + c.pages.length}` },
                  { label: "Bron", value: c.source.split(" · ")[0] },
                  { label: "Bijgewerkt", value: UPDATED }
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}

/**
 * The book's title block: the marketing hero's, with the labels in the second ink rather than the
 * third, because on arc the third ink is under 3:1 and a label nobody can read is no label.
 */
export function BookTitleBlock(
  { fields, dark = false }: { readonly fields: ReadonlyArray<TitleField>; readonly dark?: boolean }
) {
  const { still } = useBook()
  const reduced = useReducedMotion() === true || still
  return (
    <dl className="relative grid w-full grid-cols-2 sm:w-auto sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
      <motion.span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-px origin-left", dark ? "dash-x-chalk" : "dash-x")}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.35, ease: IN_OUT }}
      />
      {fields.map((f, i) => (
        <div
          key={f.label}
          className="relative flex min-w-[8rem] flex-col gap-1 px-4 pt-3 pb-1 first:pl-0 sm:first:pl-4"
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-0 left-0 h-full w-px",
              i === 0 ? "max-sm:hidden" : "max-sm:odd:hidden",
              dark ? "dash-y-chalk" : "dash-y"
            )}
          />
          <dt className={cn("text-xs", dark ? "text-mesh-ink-2" : "text-ink-3")}>{f.label}</dt>
          <dd className={cn("text-sm tabular-nums", dark ? "text-mesh-ink" : "text-ink")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Section pages ───────────────────────────────────────────────────────────────────────────── */

export type Status = "Live" | "Lab" | "Alleen in het product"

const PANEL: Record<SpecimenGround, string> = {
  mist: "bg-mist text-ink",
  glacier: "bg-glacier text-ink",
  paper: "bg-paper text-ink hairline",
  abyss: "bg-abyss text-mesh-ink"
}

const GROUND_LABEL: Record<SpecimenGround, string> = {
  mist: "Mist",
  glacier: "Glacier",
  paper: "Papier",
  abyss: "Abyss"
}

/** A segmented control: the specimen's ground, its size, a variant. */
export function Seg<T extends string>(
  { label, value, options, onChange, dark = false, names }: {
    readonly label: string
    readonly value: T
    readonly options: ReadonlyArray<T>
    readonly onChange: (v: T) => void
    readonly dark?: boolean
    readonly names?: Partial<Record<T, string>>
  }
) {
  return (
    <span
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-md p-0.5", dark ? "bg-mesh-ink/10 chalk-line" : "bg-paper hairline")}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "h-7 rounded-sm px-2.5 text-xs transition-colors",
            value === o
              ? (dark ? "bg-mesh-ink/16 text-mesh-ink" : "bg-abyss text-mesh-ink")
              : dark
              ? "text-mesh-ink-2 hover:text-mesh-ink"
              : "text-ink-2 hover:text-ink"
          )}
        >
          {names?.[o] ?? o}
        </button>
      ))}
    </span>
  )
}

/** A small control button for a specimen, a glyph and a word. */
export function Control(
  { onClick, pressed, icon: Icon, children, dark = false }: {
    readonly onClick: () => void
    readonly pressed?: boolean
    readonly icon: typeof Play
    readonly children: ReactNode
    readonly dark?: boolean
  }
) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
        dark
          ? pressed === true
            ? "bg-mesh-ink/20 text-mesh-ink chalk-line"
            : "bg-mesh-ink/10 text-mesh-ink-2 chalk-line hover:text-mesh-ink"
          : pressed === true
          ? "bg-abyss text-mesh-ink"
          : "bg-paper text-ink-2 hairline hover:text-ink"
      )}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

function StatusTag({ status }: { readonly status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs",
        status === "Live" ? "bg-arc-tint text-arc-ink" : "bg-ink/6 text-ink-2"
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-[1px]", status === "Live" ? "bg-arc" : "bg-ink-3")}
      />
      {status}
    </span>
  )
}

/** "Gebruik als" and "Niet", one to three lines each, under a page's paragraph. */
function Notes({ use, avoid }: { readonly use?: ReadonlyArray<string>; readonly avoid?: ReadonlyArray<string> }) {
  if (use === undefined && avoid === undefined) return null
  return (
    <dl className="flex flex-col gap-4 text-sm">
      {use === undefined ? null : (
        <div className="flex flex-col gap-1.5">
          <dt className="font-medium text-ink">Gebruik als</dt>
          {use.map((u) => <dd key={u} className="text-ink-2">{u}</dd>)}
        </div>
      )}
      {avoid === undefined ? null : (
        <div className="flex flex-col gap-1.5">
          <dt className="font-medium text-ink">Niet</dt>
          {avoid.map((u) => <dd key={u} className="text-ink-2">{u}</dd>)}
        </div>
      )}
    </dl>
  )
}

/**
 * One slide of a chapter: the narrow column and the panel with its specimen.
 *
 * `motion` gives the panel Pauzeren and Zonder beweging; `grounds` gives it a ground switch. The
 * specimen reads both from `useSpecimen()`, and the CSS ones obey `data-paused` and `data-still`
 * on the panel (book.css). `tall` lets a catalogue grow past one viewport.
 */
export function SectionPage<C extends ChapterId>(
  {
    chapter,
    id,
    body,
    use,
    avoid,
    status,
    source,
    ground: initial = "mist",
    grounds,
    motion: animated = false,
    replay = false,
    startStill = false,
    tall = false,
    tools,
    children,
    className
  }: {
    readonly chapter: C
    readonly id: PageId<C>
    readonly body: ReactNode
    readonly use?: ReadonlyArray<string>
    readonly avoid?: ReadonlyArray<string>
    readonly status?: Status
    /** The file the specimen is rendered from. */
    readonly source?: string
    readonly ground?: SpecimenGround
    readonly grounds?: ReadonlyArray<SpecimenGround>
    readonly motion?: boolean
    /** Offer Opnieuw, which remounts the specimen so a one-off entrance plays again. */
    readonly replay?: boolean
    /** Open the specimen at rest; Afspelen runs it. For motion that never stops, such as a marquee. */
    readonly startStill?: boolean
    readonly tall?: boolean
    /** Extra controls in the panel's tool row, beside the standard ones. */
    readonly tools?: ReactNode
    readonly children: ReactNode | ((s: SpecimenState) => ReactNode)
    readonly className?: string
  }
) {
  const book = useBook()
  const [ground, setGround] = useState<SpecimenGround>(initial)
  const [paused, setPaused] = useState(startStill)
  const [stillHere, setStillHere] = useState(false)
  const [run, setRun] = useState(0)
  const still = paused || stillHere || book.still
  const dark = ground === "abyss"
  const state: SpecimenState = { paused, still, ground }
  const n = pageNumber(chapter, id)
  const title = pageTitle(chapter, id)
  const hasTools = animated || replay || (grounds !== undefined && grounds.length > 1) || tools !== undefined

  return (
    <section
      id={id}
      aria-labelledby={`${id}-kop`}
      className={cn("relative scroll-mt-32 px-2 pt-2 sm:px-3", className)}
    >
      <div
        className={cn(
          "grid gap-2 lg:grid-cols-[minmax(260px,22fr)_minmax(0,78fr)]",
          !tall && "lg:min-h-[calc(100svh-136px)]"
        )}
      >
        <div className="flex flex-col gap-6 px-3 pt-8 pb-6 sm:px-5 lg:px-4 lg:pt-6">
          <span className="flex size-7 items-center justify-center rounded-md bg-abyss" aria-hidden>
            <InsyteMark size={18} tone="white" />
          </span>
          <div className="flex flex-col gap-3">
            <h2 id={`${id}-kop`} className="font-medium text-2xl text-ink">{title}</h2>
            <div className="flex max-w-[44ch] flex-col gap-3 text-ink-2 text-sm">{body}</div>
          </div>
          {status === undefined && source === undefined ? null : (
            <div className="flex flex-col gap-2">
              {status === undefined ? null : <StatusTag status={status} />}
              {source === undefined ? null : <span className="text-ink-3 text-xs">Bron: {source}</span>}
            </div>
          )}
          <Notes use={use} avoid={avoid} />
          <div className="mt-auto flex items-end justify-between gap-4 pt-6 lg:flex-col lg:items-start">
            <span className="flex items-baseline gap-2 text-ink">
              <span className="text-ink-3 text-sm">Pagina</span>
              <span className="figure text-3xl">{two(n)}</span>
            </span>
            <span className="text-ink-3 text-xs">Insyte / Merkrichtlijnen</span>
          </div>
        </div>
        <div
          data-ground={dark ? "dark" : undefined}
          data-paused={paused}
          data-still={still}
          className={cn("relative isolate flex min-h-[420px] flex-col overflow-hidden rounded-xl", PANEL[ground])}
        >
          {dark
            ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 drafting-chalk [mask-image:radial-gradient(80%_80%_at_50%_50%,transparent,black)]"
              />
            )
            : null}
          {hasTools
            ? (
              <div className="relative z-10 flex flex-wrap items-center justify-end gap-1.5 p-3">
                {tools}
                {grounds !== undefined && grounds.length > 1
                  ? (
                    <Seg
                      label="Ondergrond"
                      value={ground}
                      options={grounds}
                      onChange={setGround}
                      dark={dark}
                      names={GROUND_LABEL}
                    />
                  )
                  : null}
                {replay
                  ? (
                    <Control dark={dark} icon={RotateCcw} onClick={() => setRun((r) => r + 1)}>
                      Opnieuw
                    </Control>
                  )
                  : null}
                {animated
                  ? (
                    <>
                      <Control
                        dark={dark}
                        icon={paused ? Play : Pause}
                        pressed={paused}
                        onClick={() => setPaused((p) => !p)}
                      >
                        {paused ? "Afspelen" : "Pauzeren"}
                      </Control>
                      <Control dark={dark} icon={EyeOff} pressed={stillHere} onClick={() => setStillHere((s) => !s)}>
                        Zonder beweging
                      </Control>
                    </>
                  )
                  : null}
              </div>
            )
            : null}
          <SpecimenContext value={state}>
            <MotionConfig reducedMotion={still ? "always" : "never"}>
              <motion.div
                key={run}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: sec("slow"), ease: IN_OUT }}
                className={cn(
                  "flex flex-1 items-center justify-center px-5 pb-8 sm:px-10 lg:px-14",
                  !hasTools && "pt-8"
                )}
              >
                {typeof children === "function" ? children(state) : children}
              </motion.div>
            </MotionConfig>
          </SpecimenContext>
        </div>
      </div>
    </section>
  )
}

/** A sheet of named rules ruled by dashed lines, as the product pages' feature sheet. */
export function RuleSheet(
  { rules, dark = false }: {
    readonly rules: ReadonlyArray<{ readonly title: string; readonly body: string }>
    readonly dark?: boolean
  }
) {
  return (
    <ul className="grid w-full max-w-[1040px] sm:grid-cols-2 lg:grid-cols-3">
      {rules.map((r) => (
        <li key={r.title} className="relative flex flex-col gap-2 p-6">
          <span aria-hidden className={cn("absolute inset-x-0 top-0 h-px", dark ? "dash-x-chalk" : "dash-x")} />
          <span aria-hidden className={cn("absolute inset-y-0 left-0 w-px", dark ? "dash-y-chalk" : "dash-y")} />
          <span className={cn("font-medium text-lg", dark ? "text-mesh-ink" : "text-ink")}>{r.title}</span>
          <span className={cn("text-sm", dark ? "text-mesh-ink-2" : "text-ink-2")}>{r.body}</span>
        </li>
      ))}
    </ul>
  )
}

/** A do/don't pair: what to write or draw, and what not to, side by side. */
export function Pair(
  { wel, niet }: { readonly wel: ReactNode; readonly niet: ReactNode }
) {
  return (
    <div className="grid w-full max-w-[920px] gap-3 sm:grid-cols-2">
      {([["Wel", wel], ["Niet", niet]] as const).map(([label, body]) => (
        <div key={label} className="relative flex flex-col gap-3 bg-paper p-5 ruled">
          <span className="flex items-center gap-2 font-medium text-ink text-sm">
            <span aria-hidden className={cn("size-2 rounded-[2px]", label === "Wel" ? "bg-arc" : "bg-ink-3")} />
            {label}
          </span>
          <div className="text-ink-2 text-md">{body}</div>
        </div>
      ))}
    </div>
  )
}

/* ── The close ───────────────────────────────────────────────────────────────────────────────── */

export function ChapterClose({ id }: { readonly id: ChapterId }) {
  const { prev, next } = neighbours(id)
  const book = useBook()
  const link = (c: NonNullable<typeof prev>, dir: "prev" | "next") => (
    <Link
      to="/brand/$chapter"
      params={{ chapter: c.id }}
      resetScroll={false}
      onClick={() => book.go(c.id, "link")}
      className={cn(
        "group flex min-h-[180px] flex-col justify-between gap-6 rounded-lg p-6 transition-colors hover:bg-mesh-ink/8",
        dir === "next" && "items-end text-right"
      )}
    >
      <span className="flex items-center gap-2 text-mesh-ink-2 text-sm">
        {dir === "prev" ? <ArrowLeft size={16} /> : null}
        {dir === "prev" ? "Vorig hoofdstuk" : "Volgend hoofdstuk"}
        {dir === "next" ? <ArrowRight size={16} /> : null}
      </span>
      <span className="flex items-baseline gap-4">
        <span className="figure text-4xl text-mesh-ink-2">{c.n}</span>
        <span className="font-medium text-3xl text-mesh-ink sm:text-display-sm">{c.title}</span>
      </span>
    </Link>
  )
  return (
    <footer className="px-2 pt-2 pb-2 sm:px-3 sm:pb-3">
      <div data-ground="dark" className="relative isolate overflow-hidden rounded-xl bg-abyss text-mesh-ink">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 drafting-chalk" />
        <div className="mx-auto grid max-w-[1320px] gap-2 p-3 sm:p-6 md:grid-cols-2">
          {prev === undefined
            ? (
              <Link
                to="/brand"
                resetScroll={false}
                onClick={() => book.go("cover", "link")}
                className="flex min-h-[180px] flex-col justify-between gap-6 rounded-lg p-6 transition-colors hover:bg-mesh-ink/8"
              >
                <span className="flex items-center gap-2 text-mesh-ink-2 text-sm">
                  <ArrowLeft size={16} />
                  Terug
                </span>
                <span className="font-medium text-3xl text-mesh-ink sm:text-display-sm">Omslag</span>
              </Link>
            )
            : link(prev, "prev")}
          {next === undefined ? <div /> : link(next, "next")}
        </div>
        <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-9 pt-4 pb-8 text-mesh-ink-2 text-sm sm:px-12">
          <span aria-hidden className="absolute inset-x-6 top-0 h-px dash-x-chalk" />
          <span>Insyte · Merkrichtlijnen · intern, niet publiek</span>
          <span className="flex items-center gap-5">
            <a href="/brand/tokens" className="underline-offset-4 hover:text-mesh-ink hover:underline">
              Tokenkit
            </a>
            <button
              type="button"
              onClick={book.openMenu}
              className="font-medium text-mesh-ink underline-offset-4 hover:underline"
            >
              Alle hoofdstukken
            </button>
          </span>
        </div>
      </div>
    </footer>
  )
}

/**
 * The site's pill bar as a specimen. On a phone the bar with two actions wraps into a block, which
 * is not what the site draws there (its heroes stack the actions), so the phone shows the primary.
 */
export function PillBar(props: Parameters<typeof HeroBar>[0]) {
  const { secondary: _secondary, ...primaryOnly } = props
  return (
    <>
      <span className="sm:hidden">
        <HeroBar {...primaryOnly} />
      </span>
      <span className="hidden sm:inline-flex">
        <HeroBar {...props} />
      </span>
    </>
  )
}
