import { Link } from "@tanstack/react-router"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import { X } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { InsyteMark } from "../mark.tsx"
import { BookTitleBlock, ChapterHero, numberId, titleId } from "./page.tsx"
import { type Chapter, type ChapterId, CHAPTERS, type Ground, UPDATED } from "./registry.ts"
import { IN_OUT, sec, useBook } from "./state.tsx"

/*
 * The chapter menu: full screen, on flat abyss with the drafting grid in chalk, the chapter list on
 * the left and a live miniature of the hovered (or focused) chapter's hero on the right.
 *
 * Choreography, all on the in-out curve: the ground unrolls down from the top (`slow`), the rows
 * rise 12px in a 30ms stagger, the preview fades in last. Closing is the reverse and quicker, with
 * no stagger. Choosing a chapter does not roll the ground up: it fades, so the chosen chapter's
 * number and title can be seen travelling into the new page's hero (`layoutId`).
 *
 * A modal: focus moves to the current chapter, Tab is held inside, the page behind is `inert` and
 * does not scroll, Escape closes and returns focus to the trigger. ↑/↓ move between chapters and
 * move the preview with them, Home/End go to the ends, 1–7 jump. Below 1024px it is a sheet: the
 * list only, each row with a small thumbnail of its ground, a second close at the thumb's end, and a
 * downward swipe closes it.
 */

export type MenuExit = "close" | "go"

const ground: Variants = {
  hidden: { clipPath: "inset(0% 0% 100% 0%)", opacity: 1 },
  shown: { clipPath: "inset(0% 0% 0% 0%)", opacity: 1, transition: { duration: sec("slow"), ease: IN_OUT } },
  close: { clipPath: "inset(0% 0% 100% 0%)", transition: { duration: sec("base"), ease: IN_OUT, delay: 0.08 } },
  go: { opacity: 0, transition: { duration: sec("slow"), ease: IN_OUT } }
}

const fade: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: sec("base"), ease: IN_OUT } },
  close: { opacity: 0, transition: { duration: sec("base"), ease: IN_OUT } },
  go: { opacity: 0, transition: { duration: sec("slow"), ease: IN_OUT } }
}

/* Without motion the menu does not unroll (motion's reduced setting stops transforms, not a
   clip-path): it appears and goes in one 80ms fade. */
const instant: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: sec("instant") } },
  close: { opacity: 0, transition: { duration: sec("instant") } },
  go: { opacity: 0, transition: { duration: sec("instant") } }
}

const list: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.03, delayChildren: 0.12 } }
}

const row: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: sec("slow"), ease: IN_OUT } },
  close: { opacity: 0, transition: { duration: sec("quick"), ease: IN_OUT } },
  go: { opacity: 0, transition: { duration: sec("base"), ease: IN_OUT } }
}

const preview: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: sec("slow"), ease: IN_OUT, delay: 0.24 } },
  close: { opacity: 0, transition: { duration: sec("quick"), ease: IN_OUT } },
  go: { opacity: 0, transition: { duration: sec("quick"), ease: IN_OUT } }
}

/* The phone's thumbnail of each chapter's ground. Nothing solid white on abyss: the light grounds
   are a chalk tile, the dark ones their own field. */
const THUMB: Record<Ground, string> = {
  abyss: "bg-abyss-2 text-mesh-ink chalk-line",
  arc: "bg-arc text-mesh-ink",
  paper: "bg-mesh-ink/16 text-mesh-ink chalk-line",
  mist: "bg-mesh-ink/8 text-mesh-ink chalk-line"
}

function useWide(): boolean {
  const [wide, setWide] = useState(() => globalThis.matchMedia?.("(min-width: 1024px)").matches ?? true)
  useEffect(() => {
    const q = globalThis.matchMedia("(min-width: 1024px)")
    const on = () => setWide(q.matches)
    q.addEventListener("change", on)
    return () => q.removeEventListener("change", on)
  }, [])
  return wide
}

/** The hovered chapter's hero, drawn at 1280px and scaled to the tile, so it is the real one. */
function Preview({ id }: { readonly id: ChapterId }) {
  const box = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.4)
  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    const measure = () => setScale(el.clientWidth / 1280)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="relative aspect-[16/11] w-full overflow-hidden rounded-xl chalk-line">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: sec("base"), ease: IN_OUT }}
          className="absolute top-0 left-0 w-[1280px] origin-top-left"
          style={{ scale }}
        >
          <ChapterHero id={id} preview />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export function ChapterMenu(
  { current, onClose, onGo, returnTo, exit }: {
    readonly current: ChapterId | "cover"
    readonly onClose: () => void
    readonly onGo: (id: ChapterId) => void
    readonly returnTo: RefObject<HTMLElement | null>
    readonly exit: MenuExit
  }
) {
  const wide = useWide()
  const { still } = useBook()
  const dialog = useRef<HTMLDivElement | null>(null)
  const links = useRef<Array<HTMLAnchorElement | null>>([])
  const [active, setActive] = useState<ChapterId>(current === "cover" ? CHAPTERS[0].id : current)
  const intent = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touch = useRef<number | null>(null)

  /* Focus lands on the current chapter; the page behind goes inert and stops scrolling. */
  useEffect(() => {
    const i = Math.max(0, CHAPTERS.findIndex((c) => c.id === current))
    links.current[i]?.focus({ preventScroll: true })
    const behind = document.getElementById("book-content")
    behind?.setAttribute("inert", "")
    const overflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"
    const back = returnTo.current
    return () => {
      behind?.removeAttribute("inert")
      document.documentElement.style.overflow = overflow
      if (intent.current !== null) clearTimeout(intent.current)
      back?.focus({ preventScroll: true })
    }
  }, [current, returnTo])

  const hover = (id: ChapterId) => {
    if (intent.current !== null) clearTimeout(intent.current)
    intent.current = setTimeout(() => setActive(id), 120)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === "Tab") {
      const nodes = dialog.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
      if (nodes === undefined || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
      return
    }
    const at = links.current.findIndex((l) => l === document.activeElement)
    const to = (i: number) => {
      const n = (i + CHAPTERS.length) % CHAPTERS.length
      links.current[n]?.focus()
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      to(at < 0 ? 0 : at + 1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      to(at < 0 ? CHAPTERS.length - 1 : at - 1)
    } else if (e.key === "Home") {
      e.preventDefault()
      to(0)
    } else if (e.key === "End") {
      e.preventDefault()
      to(CHAPTERS.length - 1)
    } else if (/^[1-7]$/.test(e.key)) {
      const c = CHAPTERS[Number(e.key) - 1]
      if (c !== undefined) {
        e.preventDefault()
        onGo(c.id)
      }
    }
  }

  const rowLink = (c: Chapter, i: number) => {
    const on = c.id === current
    const lit = c.id === active
    /* The current chapter's hero is still mounted behind the menu, so its row carries no layoutId:
       the shared element would otherwise fly out of the page and into the menu on every open. */
    const morph = !on && !still
    return (
      <motion.li key={c.id} variants={row} className="relative">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x-chalk" />
        <Link
          ref={(n: HTMLAnchorElement | null) => {
            links.current[i] = n
          }}
          to="/brand/$chapter"
          params={{ chapter: c.id }}
          resetScroll={false}
          aria-current={on ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault()
            onGo(c.id)
          }}
          onPointerEnter={() => hover(c.id)}
          onFocus={() => setActive(c.id)}
          className="group relative flex items-center gap-4 rounded-lg px-3 py-3 outline-offset-[-2px] lg:gap-6 lg:px-4 lg:py-2.5"
        >
          {lit && wide
            ? (
              <motion.span
                layoutId="menu-highlight"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-lg bg-mesh-ink/8"
                transition={{ duration: sec("base"), ease: IN_OUT }}
              />
            )
            : null}
          {wide ? null : (
            <span
              aria-hidden
              className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", THUMB[c.ground])}
            >
              <span className="figure text-lg">{c.n}</span>
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline gap-4 lg:gap-6">
              <motion.span
                layoutId={morph ? numberId(c.id) : undefined}
                className={cn(
                  "figure hidden w-10 shrink-0 text-2xl tabular-nums lg:block",
                  on ? "text-mesh-ink" : "text-mesh-ink-3"
                )}
              >
                {c.n}
              </motion.span>
              <motion.span
                layoutId={morph ? titleId(c.id) : undefined}
                className="inline-block font-medium text-3xl text-mesh-ink lg:text-display-sm"
              >
                {c.title}
              </motion.span>
              {on
                ? (
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-mesh-ink-2 text-sm">
                    <span aria-hidden className="size-2 rounded-[2px] bg-mesh-ink" />
                    Hier ben je
                  </span>
                )
                : null}
            </span>
            <span
              className={cn(
                "max-w-[56ch] text-mesh-ink-2 text-sm transition-opacity lg:pl-16",
                wide && !lit ? "sr-only" : ""
              )}
            >
              {c.lede}
            </span>
          </span>
        </Link>
      </motion.li>
    )
  }

  return (
    <motion.div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Hoofdstukken"
      data-ground="dark"
      onKeyDown={onKey}
      onTouchStart={(e) => {
        touch.current = e.touches[0]?.clientY ?? null
      }}
      onTouchEnd={(e) => {
        const start = touch.current
        const end = e.changedTouches[0]?.clientY
        const scroller = dialog.current?.querySelector("[data-scroll]")
        if (start !== null && end !== undefined && end - start > 90 && (scroller?.scrollTop ?? 0) <= 0) onClose()
        touch.current = null
      }}
      variants={still ? instant : wide ? ground : fade}
      initial="hidden"
      animate="shown"
      exit={exit}
      className="fixed inset-0 z-50 flex flex-col bg-abyss text-mesh-ink"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 drafting-chalk [mask-image:radial-gradient(90%_80%_at_40%_40%,black,transparent_90%)]"
      />
      <div className="relative flex h-[72px] shrink-0 items-center justify-between px-4 sm:px-6">
        <span className="flex items-center gap-2.5">
          <InsyteMark size={26} tone="white" />
          <span className="font-medium text-mesh-ink text-xl">insyte</span>
          <span className="hidden text-base text-mesh-ink-2 sm:inline">Merkrichtlijnen</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 items-center gap-2 rounded-md px-3 font-medium text-base text-mesh-ink transition-colors hover:bg-mesh-ink/10"
        >
          Sluiten
          <X size={18} />
        </button>
      </div>
      <div data-scroll className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-2 pt-4 pb-10 sm:px-6 lg:grid-cols-12 lg:pt-10">
          <motion.ol variants={list} className="flex flex-col lg:col-span-7">
            {CHAPTERS.map(rowLink)}
          </motion.ol>

          {wide
            ? (
              <motion.div variants={preview} aria-hidden inert className="lg:col-span-5 lg:pt-2">
                <Preview id={active} />
                <p className="mt-4 text-mesh-ink-2 text-sm">
                  Voorbeeld van hoofdstuk {chapterNumber(active)}. Kies een hoofdstuk, of gebruik ↑ en ↓.
                </p>
              </motion.div>
            )
            : null}
          <motion.div variants={row} className="lg:col-span-12">
            <BookTitleBlock
              dark
              fields={[
                { label: "Boek", value: "Merkrichtlijnen" },
                { label: "Versie", value: "2" },
                { label: "Bijgewerkt", value: UPDATED },
                { label: "Hoofdstukken", value: String(CHAPTERS.length) },
                { label: "Bron", value: "tokens.ts" }
              ]}
            />
          </motion.div>
          {wide ? null : (
            <button
              type="button"
              onClick={onClose}
              className="flex h-12 items-center justify-center rounded-lg bg-mesh-ink/10 font-medium text-base text-mesh-ink chalk-line"
            >
              Sluiten
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

const chapterNumber = (id: ChapterId): string => CHAPTERS.find((c) => c.id === id)?.n ?? ""
