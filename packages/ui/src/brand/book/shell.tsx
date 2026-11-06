import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants
} from "motion/react"
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LayoutGrid } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { InsyteMark } from "../mark.tsx"
import { BewegingChapter } from "./chapters/beweging.tsx"
import { IconenChapter } from "./chapters/iconen.tsx"
import { KleurChapter } from "./chapters/kleur.tsx"
import { LogoChapter } from "./chapters/logo.tsx"
import { MerkChapter } from "./chapters/merk.tsx"
import { PatronenChapter } from "./chapters/patronen.tsx"
import { TypografieChapter } from "./chapters/typografie.tsx"
import { Cover } from "./cover.tsx"
import { ChapterMenu, type MenuExit } from "./menu.tsx"
import { ChapterClose, ChapterHero } from "./page.tsx"
import { type ChapterId, chapterOf, isChapter } from "./registry.ts"
import { type Book, BookContext, IN_OUT, sec, useBook, type Via } from "./state.tsx"

/*
 * The brand book (`/brand`, `/brand/<hoofdstuk>`): the bar, the chapter menu, the in-page index and
 * the page transitions.
 *
 * The chapter body comes from this registry, keyed by the route param, not from `<Outlet>`: an
 * outlet swaps to the new route while the old one is still leaving, and an exit animation needs the
 * old page to stay what it was. With seven known chapters a static map is cheap.
 *
 * Two transitions, both on the tokens' in-out curve. From a link (the chapter footer, the cover's
 * index) the page leaves (opacity, 12px up, `base`), the window goes to the top, and the next page
 * arrives (opacity, 12px down, `slow`). From the menu the menu already covers the page, so the swap
 * underneath is immediate and what moves is the chosen chapter's number and title, from its row in
 * the menu into the new hero (`layoutId`), while the menu fades. Reduced motion, the reader's or the
 * book's own toggle, is an 80ms cross-fade and nothing else.
 */

const CHAPTER_BODIES: Record<ChapterId, ComponentType> = {
  merk: MerkChapter,
  logo: LogoChapter,
  kleur: KleurChapter,
  typografie: TypografieChapter,
  patronen: PatronenChapter,
  iconen: IconenChapter,
  beweging: BewegingChapter
}

type Key = ChapterId | "cover" | "missing"

const pageVariants = (still: boolean): Variants =>
  still
    ? {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: sec("instant") } },
      exit: { opacity: 0, transition: { duration: sec("instant") } }
    }
    : {
      enter: (via: Via) => (via === "menu" ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }),
      center: { opacity: 1, y: 0, transition: { duration: sec("slow"), ease: IN_OUT } },
      exit: (via: Via) =>
        via === "menu"
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, y: -12, transition: { duration: sec("base"), ease: IN_OUT } }
    }

function useStuck(): boolean {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const on = () => setStuck(globalThis.scrollY > 8)
    on()
    globalThis.addEventListener("scroll", on, { passive: true })
    return () => globalThis.removeEventListener("scroll", on)
  }, [])
  return stuck
}

/** The section page under the reading line (a third of the way down), from the chapter's pages. */
function useSpy(ids: ReadonlyArray<string>): string | null {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const line = globalThis.innerHeight * 0.34
      let current: string | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el !== null && el.getBoundingClientRect().top <= line) current = id
      }
      setActive(current)
    }
    const on = () => {
      if (frame === 0) frame = requestAnimationFrame(read)
    }
    read()
    globalThis.addEventListener("scroll", on, { passive: true })
    globalThis.addEventListener("resize", on)
    return () => {
      globalThis.removeEventListener("scroll", on)
      globalThis.removeEventListener("resize", on)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [ids])
  return active
}

/** The in-page index: every section page of the chapter, the one being read marked, a line filling. */
function PageIndex({ id }: { readonly id: ChapterId }) {
  const c = chapterOf(id)
  const ids = useMemo(() => c.pages.map((p) => p.id), [c])
  const active = useSpy(ids)
  const strip = useRef<HTMLOListElement | null>(null)
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 })
  const { still } = useBook()

  useEffect(() => {
    const list = strip.current
    const el = active === null ? null : list?.querySelector<HTMLElement>(`[data-id="${active}"]`)
    if (list == null || el == null) return
    const left = el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2
    list.scrollTo({ left, behavior: still ? "auto" : "smooth" })
  }, [active, still])

  return (
    <nav aria-label="Op deze pagina" className="relative bg-paper">
      <div className="mx-auto flex h-11 items-stretch gap-2 px-2 sm:px-4">
        <span className="hidden shrink-0 items-center gap-2 pr-3 pl-2 text-ink-3 text-sm md:flex">
          <span className="figure text-base text-ink">{c.n}</span>
          Op deze pagina
        </span>
        <LayoutGroup id="page-index">
          <ol ref={strip} className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {c.pages.map((p) => {
              const on = p.id === active
              return (
                <li key={p.id} data-id={p.id} className="relative flex shrink-0">
                  <a
                    href={`#${p.id}`}
                    aria-current={on ? "location" : undefined}
                    className={cn(
                      "relative flex items-center rounded-sm px-3 text-sm transition-colors outline-offset-[-2px]",
                      on ? "font-medium text-ink" : "text-ink-3 hover:text-ink"
                    )}
                  >
                    {p.title}
                    {on
                      ? (
                        <motion.span
                          layoutId="page-index-mark"
                          aria-hidden
                          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-abyss"
                          transition={{ duration: sec("base"), ease: IN_OUT }}
                        />
                      )
                      : null}
                  </a>
                </li>
              )
            })}
          </ol>
        </LayoutGroup>
      </div>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-ink/8" />
      <motion.span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-ink/30"
        style={{ scaleX: progress }}
      />
    </nav>
  )
}

function Bar(
  { id, trigger, menuOpen }: {
    readonly id: Key
    readonly trigger: React.RefObject<HTMLButtonElement | null>
    readonly menuOpen: boolean
  }
) {
  const stuck = useStuck()
  const book = useBook()
  const chapter = isChapter(id) ? chapterOf(id) : null
  return (
    <div
      className={cn(
        "sticky top-0 z-40 bg-paper transition-shadow duration-[240ms]",
        stuck &&
          "shadow-[inset_0_-1px_0_var(--hairline),0_8px_24px_-20px_color-mix(in_oklch,var(--abyss)_40%,transparent)]"
      )}
    >
      <div
        className={cn(
          "relative flex items-center gap-4 px-4 transition-[height] duration-[240ms] sm:px-6",
          stuck ? "h-16" : "h-[72px]"
        )}
      >
        <Link
          to="/brand"
          resetScroll={false}
          onClick={() => book.go("cover", "link")}
          aria-label="Merkrichtlijnen, naar de omslag"
          className="flex items-center gap-2.5 rounded-md"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-abyss">
            <InsyteMark size={22} tone="white" />
          </span>
          <span className="font-medium text-ink text-xl">insyte</span>
          <span className="hidden text-base text-ink-3 sm:inline">Merkrichtlijnen</span>
        </Link>
        <div className="pointer-events-none absolute inset-x-0 hidden justify-center lg:flex" aria-live="polite">
          <span className="flex items-baseline gap-2.5">
            {chapter === null
              ? <span className="text-base text-ink-2">Omslag</span>
              : (
                <>
                  <span className="figure text-xl text-ink">{chapter.n}</span>
                  <span className="font-medium text-base text-ink">{chapter.title}</span>
                </>
              )}
          </span>
        </div>
        <button
          ref={trigger}
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={book.openMenu}
          className="ml-auto flex h-10 items-center gap-2 rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <LayoutGrid size={18} />
          Hoofdstukken
        </button>
      </div>
      {chapter === null ? null : <PageIndex id={chapter.id} />}
    </div>
  )
}

function Missing() {
  const book = useBook()
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="font-medium text-3xl text-ink">Dit hoofdstuk bestaat niet</h1>
      <p className="text-ink-2 text-md">
        Het boek heeft zeven hoofdstukken.{" "}
        <button type="button" onClick={book.openMenu} className="text-arc-ink underline underline-offset-4">
          Bekijk ze allemaal
        </button>{" "}
        of ga terug naar de omslag.
      </p>
    </div>
  )
}

function Body({ id }: { readonly id: Key }) {
  if (id === "cover") return <Cover />
  if (id === "missing") return <Missing />
  const Chapter = CHAPTER_BODIES[id]
  return (
    <>
      <ChapterHero id={id} />
      <Chapter />
      <ChapterClose id={id} />
    </>
  )
}

export function BrandBook() {
  const params = useParams({ strict: false }) as { chapter?: string }
  const slug = params.chapter
  const id: Key = slug === undefined ? "cover" : isChapter(slug) ? slug : "missing"
  const navigate = useNavigate()
  const reduced = useReducedMotion() === true
  const [bookStill, setBookStill] = useState(false)
  const still = reduced || bookStill
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuExit, setMenuExit] = useState<MenuExit>("close")
  const [via, setVia] = useState<Via>("link")
  const trigger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    document.title = isChapter(id)
      ? `${chapterOf(id).title} · Merkrichtlijnen · Insyte`
      : "Merkrichtlijnen · Insyte"
  }, [id])

  const go = useCallback((to: ChapterId | "cover", how: Via) => {
    setVia(how)
    if (how === "menu") {
      /* The menu covers the page, so the swap underneath can be immediate and at the top; the
         morph measures the new hero after this. The menu closes once the new page is in. */
      setMenuExit("go")
      globalThis.scrollTo({ top: 0, behavior: "instant" })
      void navigate(
        to === "cover" ? { to: "/brand", resetScroll: false } : {
          to: "/brand/$chapter",
          params: { chapter: to },
          resetScroll: false
        }
      ).then(() => setMenuOpen(false))
    }
  }, [navigate])

  const book: Book = useMemo(() => ({
    still,
    setStill: setBookStill,
    menuOpen,
    openMenu: () => {
      setMenuExit("close")
      setMenuOpen(true)
    },
    closeMenu: () => {
      setMenuExit("close")
      setMenuOpen(false)
    },
    go
  }), [still, menuOpen, go])

  return (
    <BookContext value={book}>
      <MotionConfig reducedMotion={still ? "always" : "never"}>
        <LayoutGroup>
          <div data-still={still} className="min-h-svh bg-paper text-ink">
            <a
              href="#inhoud"
              className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-4 focus:py-2"
            >
              Naar de inhoud
            </a>
            <div id="book-content">
              <Bar id={id} trigger={trigger} menuOpen={menuOpen} />
              <AnimatePresence
                mode={via === "menu" ? "popLayout" : "wait"}
                initial={false}
                custom={via}
                onExitComplete={() => {
                  if (via === "link") globalThis.scrollTo({ top: 0, behavior: "instant" })
                }}
              >
                <motion.main
                  id="inhoud"
                  key={id}
                  custom={via}
                  variants={pageVariants(still)}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  onAnimationComplete={(name) => {
                    if (name === "center") setVia("link")
                  }}
                  className="pb-1"
                >
                  <Body id={id} />
                </motion.main>
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {menuOpen
                ? (
                  <ChapterMenu
                    key="menu"
                    current={isChapter(id) ? id : "cover"}
                    exit={menuExit}
                    returnTo={trigger}
                    onClose={book.closeMenu}
                    onGo={(to) => (to === id ? book.closeMenu() : go(to, "menu"))}
                  />
                )
                : null}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      </MotionConfig>
    </BookContext>
  )
}
