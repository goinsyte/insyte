import { Link } from "@tanstack/react-router"
import { motion } from "motion/react"
import { useMemo } from "react"
import { ArrowRight } from "../../icons.tsx"
import { InsyteMark } from "../mark.tsx"
import { BookTitleBlock } from "./page.tsx"
import { CHAPTERS, heroPage, PAGES, two, UPDATED } from "./registry.ts"
import { IN_OUT, sec, useBook } from "./state.tsx"

/*
 * The cover, and under it the book's index.
 *
 * Full-bleed abyss. "Merkrichtlijnen" in the display face at the top left, the mark at the top
 * right, and in the lower right the cover's one picture: the mark drawn as a halftone of its own
 * squares. Every cell of a 16px field is a small rounded square; inside the mark's three squares it
 * is full size at the stratum's strength (the white tone's 20, 50 and 100%), outside them it shrinks
 * with distance until it is gone. The drawing unrolls in from the right once, the plate's own
 * entrance, and is still after that.
 */

const CELL = 16
const W = 720
const H = 600
/* The mark's geometry (a 64-unit field; squares of 38 at 2, 13 and 24; radius 7), at 9×. */
const S = 9
const OX = 120
const OY = 30
const SQUARES = [
  { at: 2, strength: 0.2 },
  { at: 13, strength: 0.5 },
  { at: 24, strength: 1 }
] as const

/** Signed distance from a point to a rounded square, in px: negative inside. */
function rounded(px: number, py: number, x: number, y: number, size: number, r: number): number {
  const cx = x + size / 2
  const cy = y + size / 2
  const qx = Math.abs(px - cx) - size / 2 + r
  const qy = Math.abs(py - cy) - size / 2 + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

type Dot = { readonly x: number; readonly y: number; readonly s: number; readonly o: number }

function halftone(): ReadonlyArray<Dot> {
  const dots: Array<Dot> = []
  for (let y = CELL / 2; y < H; y += CELL) {
    for (let x = CELL / 2; x < W; x += CELL) {
      let inside = 0
      let nearest = Number.POSITIVE_INFINITY
      for (const sq of SQUARES) {
        const d = rounded(x, y, OX + sq.at * S, OY + sq.at * S, 38 * S, 7 * S)
        if (d <= 0) inside = sq.strength
        nearest = Math.min(nearest, d)
      }
      if (inside > 0) {
        dots.push({ x, y, s: CELL * 0.62, o: inside })
        continue
      }
      const fall = 1 - nearest / 150
      if (fall <= 0.06) continue
      dots.push({ x, y, s: CELL * 0.62 * fall * fall, o: 0.14 * fall })
    }
  }
  return dots
}

function Halftone() {
  const dots = useMemo(halftone, [])
  return (
    <motion.svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      initial={{ clipPath: "inset(0% 0% 0% 100%)" }}
      animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
      transition={{ duration: 1.2, ease: IN_OUT, delay: 0.2 }}
    >
      {dots.map((d) => (
        <rect
          key={`${d.x}-${d.y}`}
          x={d.x - d.s / 2}
          y={d.y - d.s / 2}
          width={d.s}
          height={d.s}
          rx={d.s * 0.18}
          fill="var(--mesh-ink)"
          fillOpacity={d.o}
        />
      ))}
    </motion.svg>
  )
}

export function Cover() {
  const book = useBook()
  return (
    <>
      <header className="px-2 pt-1 sm:px-3 sm:pt-2">
        <div
          data-ground="dark"
          className="relative isolate flex min-h-[calc(100svh-84px)] flex-col overflow-hidden rounded-xl bg-abyss text-mesh-ink lg:max-h-[940px]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent_70%)]"
          />
          <div className="flex items-start justify-between gap-6 px-5 pt-8 sm:px-10 sm:pt-12">
            <h1 className="figure text-5xl text-mesh-ink md:text-display xl:text-plate">Merkrichtlijnen</h1>
            <InsyteMark size={56} tone="white" />
          </div>
          <div className="grid flex-1 items-end gap-8 px-5 pb-8 sm:px-10 sm:pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col gap-6 lg:pb-2">
              <p className="max-w-[40ch] text-lg text-mesh-ink-2">
                Hoe Insyte eruitziet, klinkt en beweegt. Elk voorbeeld in dit boek is live: getekend met dezelfde tokens
                en onderdelen als het product en de site.
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-mesh-ink">Insyte · Merkrichtlijnen</span>
                <span className="text-mesh-ink-2">Versie 2 · {UPDATED} · intern</span>
              </div>
            </div>
            <div className="-mr-5 -mb-8 self-end sm:-mr-10 sm:-mb-10">
              <Halftone />
            </div>
          </div>
        </div>
      </header>

      <section aria-labelledby="index-kop" className="px-2 pt-2 sm:px-3">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-3 pt-16 pb-20 sm:px-7 lg:grid-cols-[minmax(260px,22fr)_minmax(0,78fr)]">
          <div className="flex flex-col gap-4">
            <h2 id="index-kop" className="font-medium text-2xl text-ink">Hoofdstukken</h2>
            <p className="max-w-[36ch] text-ink-2 text-sm">
              Zeven hoofdstukken, {PAGES}{" "}
              pagina's. Elk hoofdstuk opent met zijn nummer en eindigt met het volgende. Het menu rechtsboven brengt je
              overal.
            </p>
          </div>
          <div className="flex flex-col gap-8">
            <ol className="flex flex-col">
              {CHAPTERS.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: sec("slow"), ease: IN_OUT, delay: i * 0.03 }}
                  className="relative"
                >
                  <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x" />
                  <Link
                    to="/brand/$chapter"
                    params={{ chapter: c.id }}
                    resetScroll={false}
                    onClick={() => book.go(c.id, "link")}
                    className="group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 rounded-md px-2 py-5 transition-colors hover:bg-ink/3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="figure text-3xl text-ink-3 transition-colors group-hover:text-ink">{c.n}</span>
                    <span className="font-medium text-2xl text-ink sm:text-3xl">{c.title}</span>
                    <span className="col-start-2 text-ink-2 text-sm sm:col-start-3 sm:row-start-1">{c.lede}</span>
                    <span className="col-start-3 row-start-1 flex items-center gap-2 text-ink-3 text-sm sm:col-start-4">
                      <span className="hidden sm:inline">Pagina {two(heroPage(c.id))}</span>
                      <ArrowRight
                        size={16}
                        className="transition-transform duration-[240ms] group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ol>
            <BookTitleBlock
              dark={false}
              fields={[
                { label: "Boek", value: "Merkrichtlijnen" },
                { label: "Versie", value: "2" },
                { label: "Bijgewerkt", value: UPDATED },
                { label: "Pagina's", value: String(PAGES) },
                { label: "Bron", value: "tokens.ts" }
              ]}
            />
          </div>
        </div>
      </section>
    </>
  )
}
