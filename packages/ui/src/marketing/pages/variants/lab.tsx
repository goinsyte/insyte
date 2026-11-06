import { MotionConfig } from "motion/react"
import { type ComponentType, useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Maximize2, X } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import type { MarketingLinks } from "../../links.tsx"
import { MarketingLinksProvider, useMarketingLinks } from "../../links.tsx"
import { Wordmark } from "../../parts.tsx"
import { HeroBar } from "../shell.tsx"
import { GridPerspective } from "./grid-perspective.tsx"
import { GridShimmer } from "./grid-shimmer.tsx"
import { HatchDrift } from "./hatch-drift.tsx"
import { LogoConstellation } from "./logo-constellation.tsx"
import { NodesToMark } from "./nodes-to-mark.tsx"
import { ScanLine } from "./scan-line.tsx"
import { Schematic } from "./schematic.tsx"
import type { Tone } from "./shared.tsx"
import { StaticControl } from "./static-control.tsx"

/*
 * /variants: the lab for hero backgrounds. Not linked, not in the sitemap, `noindex`. Every variant
 * is one component in this folder, drawn behind the same headline and actions so they compare, on
 * abyss or on light (a toggle per variant). The bar at the top flips through them full-screen;
 * `?v=<n>` opens one. The chosen variant is promoted to `PageHero` by importing its component.
 */

type Variant = {
  readonly name: string
  readonly line: string
  readonly C: ComponentType<{ readonly tone: Tone }>
}

const VARIANTS: ReadonlyArray<Variant> = [
  {
    name: "Controle",
    line: "Het drafting-raster en de Drift-arcering, stil. Wat de pagina's nu tekenen.",
    C: StaticControl
  },
  {
    name: "Schema met pulsen",
    line: "Componenten, verbindingen en knooppunten; korte pulsen lopen over de lijnen.",
    C: ({ tone }) => <Schematic tone={tone} />
  },
  { name: "Raster met lichtband", line: "Een trage band licht schuift schuin over het raster.", C: GridShimmer },
  { name: "Drijvende arcering", line: "De Drift-arcering drijft langzaam schuin weg.", C: HatchDrift },
  { name: "Knooppunten naar het merk", line: "Punten trekken om de beurt een lijn naar het merk.", C: NodesToMark },
  {
    name: "Raster in perspectief",
    line: "Het raster als vloer; scrollen kantelt het plat. Alleen op scroll.",
    C: GridPerspective
  },
  { name: "Scanlijn", line: "Eén haarlijn veegt om de paar seconden over het raster.", C: ScanLine },
  {
    name: "Sterrenbeeld van koppelingen",
    line: "De diensten aan de randen, lijnen lichten één voor één op.",
    C: LogoConstellation
  }
]

function Preview(
  { v, n, tone, onTone, full }: {
    readonly v: Variant
    readonly n: number
    readonly tone: Tone
    readonly onTone: (t: Tone) => void
    readonly full: boolean
  }
) {
  const dark = tone === "dark"
  const links = useMarketingLinks()
  return (
    <section
      id={`v${n}`}
      aria-labelledby={`v${n}-kop`}
      className={cn("relative isolate overflow-hidden", full ? "h-[calc(100svh-56px)]" : "min-h-[640px] rounded-xl")}
    >
      <div className={cn("absolute inset-0 -z-20", dark ? "bg-abyss" : "bg-mist")} />
      <div className="absolute inset-0 -z-10">
        <v.C tone={tone} />
      </div>
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2.5 py-1 font-medium text-sm",
            dark ? "bg-mesh-ink/12 text-mesh-ink" : "bg-paper text-ink hairline"
          )}
        >
          {n}. {v.name}
        </span>
        <span
          role="radiogroup"
          aria-label="Ondergrond"
          className={cn("flex rounded-md p-0.5", dark ? "bg-mesh-ink/10" : "bg-paper hairline")}
        >
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tone === t}
              onClick={() => onTone(t)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                tone === t
                  ? (dark ? "bg-mesh-ink text-abyss" : "bg-abyss text-mesh-ink")
                  : dark
                  ? "text-mesh-ink-2"
                  : "text-ink-2"
              )}
            >
              {t === "dark" ? "Abyss" : "Licht"}
            </button>
          ))}
        </span>
      </div>
      <div className="flex h-full min-h-[inherit] flex-col items-center justify-center px-4 py-24 text-center">
        <h2
          id={`v${n}-kop`}
          className={cn(
            "max-w-[22ch] font-medium text-4xl sm:text-display-sm lg:text-display",
            dark ? "text-mesh-ink" : "text-ink"
          )}
        >
          De back-end van je dropshipstore.
        </h2>
        <p className={cn("mt-5 max-w-[56ch] text-lg sm:text-xl", dark ? "text-mesh-ink-2" : "text-ink-2")}>
          Orders, klantenservice, leveranciers, chargebacks en automatiseringen op één scherm. De Insyte-agent doet het
          werk, binnen de regels die jij stelt.
        </p>
        <div className="mt-8">
          <HeroBar
            dark={dark}
            primary={{ href: links.page("/toegang"), label: "Toegang aanvragen" }}
            secondary={{ href: links.login, label: "Inloggen" }}
          />
        </div>
        <p className={cn("mt-6 max-w-[60ch] text-sm", dark ? "text-mesh-ink-3" : "text-ink-3")}>{v.line}</p>
      </div>
    </section>
  )
}

function useParam(): [number | null, (n: number | null) => void] {
  const [v, setV] = useState<number | null>(null)
  useEffect(() => {
    const read = () => {
      const raw = new URLSearchParams(window.location.search).get("v")
      const n = raw === null ? Number.NaN : Number(raw)
      setV(Number.isInteger(n) && n >= 1 && n <= VARIANTS.length ? n : null)
    }
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [])
  const set = (n: number | null) => {
    const url = new URL(window.location.href)
    if (n === null) url.searchParams.delete("v")
    else url.searchParams.set("v", String(n))
    window.history.pushState(null, "", url)
    setV(n)
    window.scrollTo({ top: 0 })
  }
  return [v, set]
}

export function VariantsPage({ links }: { readonly links: MarketingLinks }) {
  const [v, setV] = useParam()
  const [tones, setTones] = useState<ReadonlyArray<Tone>>(() => VARIANTS.map(() => "dark"))
  const tone = (i: number) => tones[i] ?? "dark"
  const setTone = (i: number) => (t: Tone) => setTones((s) => s.map((x, j) => (j === i ? t : x)))

  useEffect(() => {
    if (v === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setV(v === VARIANTS.length ? 1 : v + 1)
      if (e.key === "ArrowLeft") setV(v === 1 ? VARIANTS.length : v - 1)
      if (e.key === "Escape") setV(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <MarketingLinksProvider links={links}>
      <MotionConfig reducedMotion="user">
        <div className="light min-h-svh bg-paper text-ink">
          <header className="sticky top-0 z-50 flex h-14 items-center gap-3 bg-paper px-3 shadow-[inset_0_-1px_0_var(--hairline)] sm:px-5">
            <a href={links.home} aria-label="Insyte, naar het begin" className="shrink-0 rounded-md">
              <Wordmark tone="ink" />
            </a>
            <span className="text-ink-3 text-sm max-sm:hidden">Achtergronden voor de hero · lab</span>
            <nav aria-label="Varianten" className="no-scrollbar ml-auto flex items-center gap-1 overflow-x-auto">
              {VARIANTS.map((x, i) => (
                <button
                  key={x.name}
                  type="button"
                  aria-current={v === i + 1 ? "true" : undefined}
                  title={x.name}
                  onClick={() => setV(i + 1)}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                    v === i + 1 ? "bg-abyss text-mesh-ink" : "text-ink-2 hover:bg-ink/6"
                  )}
                >
                  {i + 1}
                </button>
              ))}
              {v === null
                ? (
                  <button
                    type="button"
                    onClick={() => setV(1)}
                    className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ink-2 text-sm hover:bg-ink/6"
                  >
                    <Maximize2 size={14} />
                    Volledig scherm
                  </button>
                )
                : (
                  <>
                    <button
                      type="button"
                      aria-label="Vorige"
                      onClick={() => setV(v === 1 ? VARIANTS.length : v - 1)}
                      className="ml-1 flex size-8 items-center justify-center rounded-md hover:bg-ink/6"
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Volgende"
                      onClick={() => setV(v === VARIANTS.length ? 1 : v + 1)}
                      className="flex size-8 items-center justify-center rounded-md hover:bg-ink/6"
                    >
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Alle varianten"
                      onClick={() => setV(null)}
                      className="flex size-8 items-center justify-center rounded-md hover:bg-ink/6"
                    >
                      <X size={15} />
                    </button>
                  </>
                )}
            </nav>
          </header>
          <main>
            {v === null
              ? (
                <div className="flex flex-col gap-3 p-2 sm:p-3">
                  {VARIANTS.map((x, i) => (
                    <Preview key={x.name} v={x} n={i + 1} tone={tone(i)} onTone={setTone(i)} full={false} />
                  ))}
                </div>
              )
              : (
                <Preview
                  key={v}
                  v={VARIANTS[v - 1]!}
                  n={v}
                  tone={tone(v - 1)}
                  onTone={setTone(v - 1)}
                  full
                />
              )}
          </main>
        </div>
      </MotionConfig>
    </MarketingLinksProvider>
  )
}
