import type { CSSProperties, ReactNode } from "react"
import { ASK_ASSISTANT, ASSISTANT } from "../assistant.ts"
import { BarChart } from "../charts/bar-chart.tsx"
import type { BarData } from "../charts/types.ts"
import { STORES } from "../fixtures/workspace.ts"
import { cx } from "../ui/cx.ts"
import { BarChart3, Bell, Home, Inbox, Returns, Search, ShoppingBag, Users } from "../ui/icons.tsx"
import { contrast, css, lift, PANEL, RAIL, WHITE } from "./color.ts"
import type { Okl } from "./color.ts"
import type { Accent, Direction } from "./directions.ts"
import { BlendedDataMark, InsyteMark, Lockup, MagnusFlowerMark } from "./marks.tsx"

/**
 * What a direction looks like in use: its three marks, the product chrome in one of its accents on
 * the neutral base, a landing-page hero, and the contrast of every accent. Each sample scopes its
 * colours to itself through custom properties on its own wrapper; the v2 tokens are never changed.
 */

/* ── the marks in a direction's colours ───────────────────────────────────────────────────────── */

type MarkProps = {
  readonly direction: Direction
  readonly size: number
  readonly mono?: Okl
  /**
   * On a dark ground: overprinting turns to mud, so the marks stack instead, and the darkest tones
   * are lifted (`lift`) so they do not sink into the ground.
   */
  readonly dark?: boolean
  readonly title?: string
}

/** A mark colour as CSS, lifted off the dark ground when the mark stands on it. */
const paint = (color: Okl, dark?: boolean) => css(dark === true ? lift(color) : color)

export function DirectionInsyte({ direction, size, mono, dark, title }: MarkProps) {
  const { insyte, overprint } = direction.marks
  return (
    <InsyteMark
      size={size}
      title={title}
      squares={[paint(insyte.squares[0], dark), paint(insyte.squares[1], dark), paint(insyte.squares[2], dark)]}
      lines={insyte.lines === undefined ? undefined : css(insyte.lines)}
      mono={mono === undefined ? undefined : css(mono)}
      overprint={overprint === true && dark !== true}
    />
  )
}

export function DirectionBlend({ direction, size, mono, dark, title }: MarkProps) {
  return (
    <BlendedDataMark
      size={size}
      title={title}
      pills={direction.marks.blend.map((color) => paint(color, dark))}
      mono={mono === undefined ? undefined : css(mono)}
    />
  )
}

export function DirectionMagnus({ direction, size, mono, dark, title }: MarkProps) {
  const { magnus, overprint } = direction.marks
  return (
    <MagnusFlowerMark
      size={size}
      title={title}
      petals={magnus.petals.map((color) => paint(color, dark))}
      core={paint(magnus.core, dark)}
      star={css(magnus.star)}
      mono={mono === undefined ? undefined : css(mono)}
      overprint={overprint === true && dark !== true}
    />
  )
}

export const MARKS = [
  { id: "insyte", name: "Insyte", role: "Het product", Mark: DirectionInsyte },
  { id: "blend", name: "Blended data", role: "Data uit meerdere bronnen", Mark: DirectionBlend },
  { id: "magnus", name: ASSISTANT, role: "De assistent", Mark: DirectionMagnus }
] as const

/* ── a swatch ─────────────────────────────────────────────────────────────────────────────────── */

export function Swatch({ colour, className }: { readonly colour: Okl; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      // Only a near-white swatch needs an edge to be seen on the page; every other one is its own edge.
      className={cx("block shrink-0", colour[0] > 0.9 && "shadow-[inset_0_0_0_1px_oklch(0_0_0/0.08)]", className)}
      style={{ background: css(colour) }}
    />
  )
}

/* ── the product chrome in one accent ─────────────────────────────────────────────────────────── */

const RETURNS: BarData = {
  items: [
    { label: "Aurora", value: 26, compare: 8 },
    { label: "Coastline", value: 4, compare: 6 },
    { label: "Drift", value: 3, compare: 4 },
    { label: "Harbor", value: 5, compare: 5 },
    { label: "Overig", value: 3, compare: 7 }
  ],
  format: "count",
  focus: 0
}

const ROWS = [
  { id: "1042", who: "Noor Visser", what: "Aurora Hooded Fleece · S", reason: "Valt te klein" },
  { id: "1039", who: "Sem de Graaf", what: "Aurora Hooded Fleece · S", reason: "Valt te klein" },
  { id: "1031", who: "Lotte Bakker", what: "Coastline Parka · M", reason: "Niet zoals op de foto" }
] as const

export type RailTone = "dark" | "light"

/** The accent as the v2 tokens a screen reads, scoped to one wrapper. */
export function accentVars(accent: Accent, direction: Direction): CSSProperties {
  const petals = direction.marks.magnus.petals.map(css)
  return {
    "--color-accent": css(accent.fill),
    "--color-accent-ink": css(accent.ink),
    "--color-accent-tint": css(accent.tint),
    "--x-on-accent": css(accent.onFill),
    // A light fill (yellow, lime) cannot carry the focus ring on white; the ink does.
    "--x-accent-edge": contrast(accent.fill, WHITE) >= 3 ? css(accent.fill) : css(accent.ink),
    "--x-ai": `linear-gradient(100deg, ${petals.filter((_, i) => i % 2 === 0).join(", ")})`
  } as CSSProperties
}

export function AppSample({ direction, accent, rail }: {
  readonly direction: Direction
  readonly accent: Accent
  readonly rail: RailTone
}) {
  const dark = rail === "dark"
  // A dark accent (zwart, grafiet) would vanish into a dark rail: the active tile goes light instead.
  const sinks = dark && contrast(accent.fill, RAIL) < 3
  const railBg = dark ? "bg-rail" : "bg-panel"
  const tiles = [
    { id: "start", label: "Start", glyph: Home },
    { id: "inbox", label: "Inbox", glyph: Inbox },
    { id: "magnus", label: ASSISTANT, glyph: null },
    { id: "bestellingen", label: "Bestellingen", glyph: ShoppingBag },
    { id: "retouren", label: "Retouren", glyph: Returns },
    { id: "klanten", label: "Klanten", glyph: Users },
    { id: "analyse", label: "Analyse", glyph: BarChart3 }
  ] as const

  return (
    <div
      style={accentVars(accent, direction)}
      className="overflow-hidden rounded-lg bg-canvas shadow-sm"
      role="img"
      aria-label={`Voorbeeld van het product in ${accent.name}, met een ${dark ? "donkere" : "lichte"} icoonbalk`}
    >
      <div className="flex h-11 bg-panel">
        <div
          className={cx(
            "flex w-[52px] shrink-0 items-center justify-center sm:w-40 sm:justify-start sm:gap-2 sm:px-3",
            railBg
          )}
        >
          <DirectionInsyte direction={direction} size={22} dark={dark} />
          <span className={cx("hidden truncate text-xs font-medium sm:inline", dark ? "text-on-ink" : "text-ink")}>
            {STORES[0]?.name}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 border-b border-line px-3">
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="truncate font-medium text-ink">Retouren</span>
            <span aria-hidden="true" className="hidden h-px w-3 bg-line-strong sm:block" />
            <span className="hidden truncate text-ink-2 sm:inline">Aurora Hooded Fleece</span>
            <span aria-hidden="true" className="h-px w-3 bg-line-strong" />
            <span className="flex shrink-0 items-center gap-1 font-medium text-accent-ink">
              <DirectionMagnus direction={direction} size={15} />
              {ASK_ASSISTANT}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2.5 text-ink-3">
            <Search size={16} />
            <Bell size={16} />
          </span>
        </div>
      </div>

      <div className="flex">
        <div className={cx("flex w-[52px] shrink-0 flex-col items-center gap-1 pt-2 pb-3", railBg)}>
          {tiles.map((tile) => {
            const active = tile.id === "retouren"
            const G = tile.glyph
            return (
              <span
                key={tile.id}
                className={cx(
                  "flex size-9 items-center justify-center rounded-md",
                  active && dark && !sinks && "bg-accent text-(--x-on-accent)",
                  active && sinks && "bg-canvas text-accent-ink",
                  active && !dark && "bg-accent-tint text-accent-ink",
                  !active && (dark ? "text-rail-ink" : "text-ink-3")
                )}
              >
                {G === null ? <DirectionMagnus direction={direction} size={20} dark={dark} /> : <G size={18} />}
              </span>
            )
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-md font-semibold text-ink">Retouren deze week</span>
              <span className="text-xs text-ink-3">26 van de 41 zijn de Aurora in maat S</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden h-8 items-center rounded-sm bg-canvas px-3 text-sm font-medium text-ink shadow-xs ring-1 ring-line-strong ring-inset sm:inline-flex">
                Exporteren
              </span>
              <span className="inline-flex h-8 items-center rounded-sm bg-accent px-3 text-sm font-medium text-(--x-on-accent) shadow-[0_0_0_1px_var(--x-accent-edge)]">
                Voorstel uitvoeren
              </span>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink">Retouren per product</span>
              <BarChart data={RETURNS} height={150} axisLabels={false} />
            </div>
            <div className="-mx-2 flex flex-col gap-1">
              {ROWS.map((row, i) => (
                <span
                  key={row.id}
                  className={cx(
                    "flex items-center gap-2 rounded-sm px-2 py-1.5",
                    i === 0 && "bg-accent-tint"
                  )}
                >
                  <span className="w-11 shrink-0 text-xs text-ink-3 figure">#{row.id}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-ink">{row.who}</span>
                    <span className="truncate text-xs text-ink-3">{row.reason}</span>
                  </span>
                  {i === 0 && <span className="shrink-0 text-xs font-medium text-accent-ink">Open</span>}
                </span>
              ))}
              <span className="mt-auto flex items-center justify-between gap-2 px-2 pt-2">
                <span className="flex items-center gap-2 text-xs text-ink-2">
                  <span aria-hidden="true" className="relative inline-flex h-4 w-7 shrink-0 rounded-full bg-accent">
                    <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-(--x-on-accent)" />
                  </span>
                  Ruil aanbieden
                </span>
                <span className="text-xs font-medium text-accent-ink underline">Alle retouren</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg p-px" style={{ background: "var(--x-ai)" }}>
            <span className="flex h-9 flex-1 items-center gap-2 rounded-[11px] bg-canvas px-3 text-sm text-ink-3">
              <DirectionMagnus direction={direction} size={16} />
              Vertel {ASSISTANT} wat er nu moet gebeuren
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── a landing-page hero ──────────────────────────────────────────────────────────────────────── */

export function HeroSample({ direction }: { readonly direction: Direction }) {
  const { hero } = direction
  const dark = contrast(hero.ground, WHITE) > 4.5
  // When the ground is the mark's own front colour, the mark would vanish into it: it goes one colour.
  const lost = contrast(direction.marks.insyte.squares[2], hero.ground) < 2
  const headline = hero.highlight === undefined
    ? <>Je winkel draait door. {ASSISTANT} doet het werk, binnen jouw regels.</>
    : (
      <>
        Je winkel draait door. {ASSISTANT} doet{" "}
        <span
          className="box-decoration-clone px-[0.12em]"
          style={{
            color: css(hero.ground),
            background: `linear-gradient(transparent 12%, ${css(hero.highlight)} 12%, ${
              css(hero.highlight)
            } 92%, transparent 92%)`
          }}
        >
          het werk
        </span>, binnen jouw regels.
      </>
    )

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ background: css(hero.ground), color: css(hero.ink) }}
    >
      <div className="flex items-center justify-between gap-4 px-5 pt-4 sm:px-8 sm:pt-5">
        <Lockup size={24} colour={css(hero.ink)}>
          <DirectionInsyte direction={direction} size={24} dark={dark} mono={lost ? hero.ink : undefined} />
        </Lockup>
        <span className="hidden items-center gap-5 text-sm sm:flex" style={{ color: css(hero.soft) }}>
          <span>Product</span>
          <span>{ASSISTANT}</span>
          <span>Koppelingen</span>
          <span style={{ color: css(hero.ink) }} className="font-medium">Inloggen</span>
        </span>
      </div>

      <div className="grid items-center gap-8 px-5 pt-8 pb-8 sm:px-8 sm:pt-12 sm:pb-12 md:grid-cols-[1.25fr_1fr]">
        <div className="relative z-10 flex flex-col gap-5">
          <h3 className="max-w-[18ch] text-[30px]/[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]/[1.05]">
            {headline}
          </h3>
          <p className="max-w-[46ch] text-base text-pretty" style={{ color: css(hero.soft) }}>
            Bestellingen, klantvragen, leveranciers en chargebacks op één plek. Privé-bèta, alleen op uitnodiging.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="inline-flex h-10 items-center rounded-sm px-4 text-sm font-semibold"
              style={{ background: css(hero.cta), color: css(hero.ctaInk) }}
            >
              Uitnodiging aanvragen
            </span>
            <span className="text-sm font-medium underline underline-offset-4">Bekijk de demo</span>
          </div>
        </div>
        <HeroArt direction={direction} />
      </div>
    </div>
  )
}

function HeroArt({ direction }: { readonly direction: Direction }) {
  const { art } = direction.hero
  const box = "relative mx-auto flex aspect-[5/4] w-full max-w-[340px] items-center justify-center"

  if (art === "blocks") {
    // The four primaries as tiles, the marks on them in one colour: the mono marks at work.
    const [blue, red, yellow, green] = direction.hues.map((hue) => hue.value)
    const tile = "flex aspect-square items-center justify-center rounded-xl"
    const ink: Okl = [0.225, 0.006, 250]
    const white: Okl = [1, 0, 0]
    return (
      <div className="mx-auto grid w-full max-w-[240px] grid-cols-2 gap-3" aria-hidden="true">
        <span className={tile} style={{ background: yellow && css(yellow) }}>
          <DirectionInsyte direction={direction} size={72} mono={ink} />
        </span>
        <span className={tile} style={{ background: blue && css(blue) }}>
          <DirectionBlend direction={direction} size={72} mono={white} />
        </span>
        <span className={tile} style={{ background: green && css(green) }}>
          <span className="text-xl font-semibold tracking-[-0.03em] text-canvas">Insyte</span>
        </span>
        <span className={tile} style={{ background: red && css(red) }}>
          <DirectionMagnus direction={direction} size={72} mono={white} />
        </span>
      </div>
    )
  }

  if (art === "overprint") {
    const [c, m, y] = direction.hues.map((hue) => css(hue.value))
    return (
      <div className={box} aria-hidden="true">
        <svg viewBox="0 0 200 160" className="absolute inset-0 size-full" style={{ isolation: "isolate" }}>
          <circle cx="78" cy="66" r="52" fill={y} style={{ mixBlendMode: "multiply" }} />
          <circle cx="122" cy="66" r="52" fill={m} style={{ mixBlendMode: "multiply" }} />
          <circle cx="100" cy="102" r="52" fill={c} style={{ mixBlendMode: "multiply" }} />
        </svg>
        <span className="relative rounded-xl bg-canvas p-3 shadow-pop">
          <DirectionMagnus direction={direction} size={56} />
        </span>
      </div>
    )
  }

  if (art === "highlight") {
    return (
      <div className={cx(box, "gap-6")} aria-hidden="true">
        <DirectionInsyte direction={direction} size={128} dark />
        <DirectionMagnus direction={direction} size={72} dark />
      </div>
    )
  }

  if (art === "field") {
    // The darkest brand tone is the ground, so the marks stand on light tiles, as app icons would.
    const tile = "absolute flex items-center justify-center rounded-xl bg-canvas shadow-pop"
    return (
      <div className={box} aria-hidden="true">
        <span className={cx(tile, "top-[6%] left-[18%] size-[46%]")}>
          <DirectionMagnus direction={direction} size={104} />
        </span>
        <span className={cx(tile, "right-[10%] bottom-[30%] size-[26%]")}>
          <DirectionBlend direction={direction} size={52} />
        </span>
        <span className={cx(tile, "bottom-[2%] left-[40%] size-[26%]")}>
          <DirectionInsyte direction={direction} size={52} />
        </span>
      </div>
    )
  }

  // family: the three marks, stepped, on the panel.
  return (
    <div className={cx(box, "rounded-xl bg-panel")} aria-hidden="true">
      <span className="absolute top-[14%] left-[12%]">
        <DirectionInsyte direction={direction} size={96} />
      </span>
      <span className="absolute top-[22%] right-[12%]">
        <DirectionBlend direction={direction} size={72} />
      </span>
      <span className="absolute bottom-[10%] left-[42%]">
        <DirectionMagnus direction={direction} size={80} />
      </span>
    </div>
  )
}

/* ── contrast ─────────────────────────────────────────────────────────────────────────────────── */

const ratio = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function Check({ value, min, label }: { readonly value: number; readonly min: number; readonly label: string }) {
  const pass = value >= min
  return (
    <td className="px-3 py-2 align-top">
      <span className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-sm text-ink figure">{ratio.format(value)}</span>
        <span className={cx("text-xs font-medium", pass ? "text-good-ink" : "text-bad-ink")}>
          {pass ? "AA" : "Te laag"}
        </span>
      </span>
      <span className="sr-only">{label}</span>
    </td>
  )
}

/**
 * Every accent's pairs, computed from the values: its text colour on white and on the panel (4.5:1),
 * the text on the accent field (4.5:1), the field against white (3:1, what a focus ring and a
 * control edge need) and against the dark rail (3:1, what the active rail tile needs).
 */
export function ContrastTable({ direction }: { readonly direction: Direction }) {
  return (
    <div className="pane-scroll overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <caption className="sr-only">Contrast van de accentkleuren van {direction.name}</caption>
        <thead className="bg-panel">
          <tr className="text-xs text-ink-3">
            <th scope="col" className="px-3 py-2 font-medium">Thema</th>
            <th scope="col" className="px-3 py-2 font-medium">Tekstkleur op wit</th>
            <th scope="col" className="px-3 py-2 font-medium">Tekstkleur op paneel</th>
            <th scope="col" className="px-3 py-2 font-medium">Tekst op het vlak</th>
            <th scope="col" className="px-3 py-2 font-medium">Vlak naast wit, 3:1</th>
            <th scope="col" className="px-3 py-2 font-medium">Vlak op donkere balk, 3:1</th>
          </tr>
        </thead>
        <tbody>
          {direction.accents.map((accent) => (
            <tr key={accent.name} className="border-t border-line">
              <th scope="row" className="px-3 py-2 align-top">
                <span className="flex items-center gap-2">
                  <Swatch colour={accent.fill} className="size-4 rounded-xs" />
                  <span className="text-sm font-medium text-ink">{accent.name}</span>
                </span>
              </th>
              <Check value={contrast(accent.ink, WHITE)} min={4.5} label="tekstkleur op wit" />
              <Check value={contrast(accent.ink, PANEL)} min={4.5} label="tekstkleur op paneel" />
              <Check value={contrast(accent.onFill, accent.fill)} min={4.5} label="tekst op het vlak" />
              <Check value={contrast(accent.fill, WHITE)} min={3} label="vlak naast wit" />
              <Check value={contrast(accent.fill, RAIL)} min={3} label="vlak op de donkere icoonbalk" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A specimen's ground: white on the panel tone, or the rail's own dark for "op donker". */
export function Ground({ dark, children, className }: {
  readonly dark?: boolean
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-md",
        dark === true ? "bg-rail" : "bg-canvas",
        className
      )}
    >
      {children}
    </div>
  )
}
