import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from "react"
import { cx } from "../ui/cx.ts"
import { Segmented } from "../ui/toggle.tsx"
import { css, hex, INK } from "./color.ts"
import type { Okl } from "./color.ts"
import { DIRECTIONS } from "./directions.ts"
import type { Direction } from "./directions.ts"
import { Lockup } from "./marks.tsx"
import { AppSample, ContrastTable, DirectionInsyte, Ground, HeroSample, MARKS, Swatch } from "./samples.tsx"
import type { RailTone } from "./samples.tsx"

/**
 * `/v2/merk`: the brand exploration. The owner's three marks redrawn, then six palette directions
 * side by side, each shown as marks, lockup, product chrome, a hero and a contrast table. Nothing is
 * chosen here; it is the page to choose from.
 */

const WHITE_INK: Okl = [0.985, 0.002, 95]

export function BrandScreen() {
  const [rail, setRail] = useState<RailTone>("dark")
  return (
    <div data-brand-pane className="pane-scroll flex-1">
      <JumpBar rail={rail} onRail={setRail} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-16 px-4 pt-8 pb-24 sm:px-8 sm:pt-10">
        <header className="flex max-w-[66ch] flex-col gap-3">
          <h1 className="text-2xl font-semibold text-ink">Merk</h1>
          <p className="text-base text-pretty text-ink-2">
            Een verkenning, nog niets gekozen. De drie logo's (Insyte, Blended data, Magnus) staan hier opnieuw
            getekend, met kleuren die je kunt wisselen. Daaronder zes kleurrichtingen: welke tinten het merk heeft, hoe
            de drie tekens ze delen zodat ze familie zijn, en welke ervan een klant als accentkleur kan kiezen op een
            neutraal product.
          </p>
        </header>

        <Overview />
        <MarkSheet />
        {DIRECTIONS.map((direction) => <DirectionSection key={direction.id} direction={direction} rail={rail} />)}
        <Decisions />
      </div>
    </div>
  )
}

/**
 * Scrolls the page's own pane to a section. A plain `#id` link would scroll every ancestor, the
 * shell's fixed frame included, and push the main bar off the screen.
 */
function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id)
  const pane = target?.closest<HTMLElement>("[data-brand-pane]")
  if (target === null || pane === null || pane === undefined) return
  event.preventDefault()
  const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 64
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  pane.scrollTo({ top, behavior: still ? "auto" : "smooth" })
  target.focus({ preventScroll: true })
}

/* ── jump bar ─────────────────────────────────────────────────────────────────────────────────── */

const STOPS = [
  { id: "tekens", label: "Tekens", hues: [] as ReadonlyArray<Okl> },
  ...DIRECTIONS.map((direction) => ({
    id: direction.id,
    label: direction.name,
    hues: direction.hues.map((hue) => hue.value)
  })),
  { id: "beslissen", label: "Te beslissen", hues: [] as ReadonlyArray<Okl> }
]

/** Which stop the reader is in: the last section whose top has passed under the bar. */
function useCurrentStop(bar: RefObject<HTMLDivElement | null>): string | null {
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => {
    const pane = bar.current?.closest<HTMLElement>("[data-brand-pane]")
    if (pane === null || pane === undefined) return
    const update = () => {
      const line = pane.getBoundingClientRect().top + 96
      let found: string | null = null
      for (const stop of STOPS) {
        const top = document.getElementById(stop.id)?.getBoundingClientRect().top
        if (top !== undefined && top <= line) found = stop.id
      }
      // At the foot of the page the last section can never reach the line; it is current anyway.
      const atEnd = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4
      setCurrent(atEnd ? (STOPS.at(-1)?.id ?? found) : found)
    }
    update()
    pane.addEventListener("scroll", update, { passive: true })
    return () => pane.removeEventListener("scroll", update)
  }, [bar])
  return current
}

function JumpBar({ rail, onRail }: { readonly rail: RailTone; readonly onRail: (next: RailTone) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const current = useCurrentStop(bar)
  return (
    <div ref={bar} className="sticky top-0 z-20 border-b border-line bg-canvas">
      <div className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-4 py-2 sm:px-8">
        <nav aria-label="Op deze pagina" className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          <ul className="flex items-center gap-1">
            {STOPS.map((stop) => (
              <li key={stop.id}>
                <a
                  href={`#${stop.id}`}
                  onClick={(event) => jump(event, stop.id)}
                  aria-current={current === stop.id ? "location" : undefined}
                  className={cx(
                    "flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs whitespace-nowrap transition-colors",
                    current === stop.id
                      ? "bg-selected font-medium text-ink"
                      : "text-ink-2 hover:bg-hover hover:text-ink"
                  )}
                >
                  {stop.hues.length > 0 && (
                    <span aria-hidden="true" className="flex">
                      {stop.hues.map((hue) => (
                        <Swatch key={css(hue)} colour={hue} className="-mr-0.5 size-2.5 rounded-full" />
                      ))}
                    </span>
                  )}
                  {stop.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="hidden text-xs text-ink-3 md:inline">Icoonbalk</span>
        <Segmented
          size="sm"
          label="Icoonbalk in de voorbeelden"
          value={rail}
          onChange={onRail}
          options={[{ value: "dark", label: "Donker" }, { value: "light", label: "Licht" }]}
        />
      </div>
    </div>
  )
}

/* ── overview ─────────────────────────────────────────────────────────────────────────────────── */

function Overview() {
  return (
    <section aria-labelledby="overzicht" className="flex flex-col gap-4">
      <SectionHead id="overzicht" title="Zes richtingen naast elkaar">
        Dezelfde drie tekens in elke richting. Klik een richting voor de uitwerking.
      </SectionHead>
      <ul className="flex flex-col">
        {DIRECTIONS.map((direction) => (
          <li key={direction.id}>
            <a
              href={`#${direction.id}`}
              onClick={(event) => jump(event, direction.id)}
              className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 rounded-md px-2 py-3 transition-colors hover:bg-hover sm:grid-cols-[148px_auto_1fr_auto]"
            >
              <span className="text-md font-semibold text-ink">{direction.name}</span>
              <span className="flex items-center gap-2 justify-self-end sm:order-none sm:justify-self-start">
                {MARKS.map(({ id, Mark }) => <Mark key={id} direction={direction} size={32} />)}
              </span>
              <span className="col-span-2 text-sm text-pretty text-ink-2 sm:col-span-1">{direction.character}</span>
              <span className="col-span-2 flex h-5 overflow-hidden rounded-xs sm:col-span-1 sm:w-40">
                {direction.hues.map((hue) => <Swatch key={hue.name} colour={hue.value} className="h-full flex-1" />)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── the three marks ──────────────────────────────────────────────────────────────────────────── */

const SIZES = [64, 32, 24, 16] as const

function MarkSheet() {
  const [id, setId] = useState(DIRECTIONS[0]?.id ?? "")
  const direction = DIRECTIONS.find((d) => d.id === id) ?? DIRECTIONS[0]
  if (direction === undefined) return null

  return (
    <section id="tekens" tabIndex={-1} aria-labelledby="tekens-kop" className="flex flex-col gap-5 outline-none">
      <SectionHead id="tekens-kop" title="De drie tekens">
        Opnieuw getekend op één raster van 48 eenheden, met zijn vormen: drie gestapelde vierkanten, een uitbarsting van
        zes staafjes, een bloem van acht blaadjes rond een ster. Elke kleur is een instelling. Onder 28 px tekent elk
        teken een eigen kleine versie, met dikkere lijnen en ruimere openingen. In één kleur is wat leesbaar moet
        blijven uitgespaard, niet wit geschilderd, zodat het op elke ondergrond werkt.
      </SectionHead>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-3">Kleuren van</span>
        <div className="pane-scroll max-w-full overflow-x-auto">
          <Segmented
            size="sm"
            label="Kleuren van richting"
            value={direction.id}
            onChange={setId}
            options={DIRECTIONS.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
      </div>

      <div className="pane-scroll overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <caption className="sr-only">De drie tekens op vier maten, in kleur, in één kleur en op donker</caption>
          <thead className="bg-panel text-left text-xs text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Teken</th>
              {SIZES.map((size) => <th key={size} scope="col" className="px-2 py-2 font-medium">{size} px</th>)}
              <th scope="col" className="px-2 py-2 font-medium">Eén kleur</th>
              <th scope="col" className="px-2 py-2 font-medium">Op donker</th>
              <th scope="col" className="px-2 py-2 font-medium">Eén kleur op donker</th>
            </tr>
          </thead>
          <tbody>
            {MARKS.map(({ id: markId, name, role, Mark }) => (
              <tr key={markId} className="border-t border-line">
                <th scope="row" className="px-4 py-4 text-left align-middle">
                  <span className="block text-sm font-medium text-ink">{name}</span>
                  <span className="block text-xs font-normal text-ink-3">{role}</span>
                </th>
                {SIZES.map((size) => (
                  <td key={size} className="px-2 py-4">
                    <span className="flex h-16 items-center">
                      <Mark direction={direction} size={size} title={size === 64 ? name : undefined} />
                    </span>
                  </td>
                ))}
                <td className="px-2 py-4">
                  <span className="flex items-center gap-3">
                    <Mark direction={direction} size={32} mono={INK} />
                    <Mark direction={direction} size={16} mono={INK} />
                  </span>
                </td>
                <td className="px-2 py-4">
                  <Ground dark className="h-14 w-24 gap-3">
                    <Mark direction={direction} size={32} dark />
                    <Mark direction={direction} size={16} dark />
                  </Ground>
                </td>
                <td className="px-2 py-4">
                  <Ground dark className="h-14 w-24 gap-3">
                    <Mark direction={direction} size={32} mono={WHITE_INK} />
                    <Mark direction={direction} size={16} mono={WHITE_INK} />
                  </Ground>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ── one direction ────────────────────────────────────────────────────────────────────────────── */

function DirectionSection({ direction, rail }: { readonly direction: Direction; readonly rail: RailTone }) {
  const [accentName, setAccentName] = useState(direction.accents[0]?.name ?? "")
  const accent = direction.accents.find((a) => a.name === accentName) ?? direction.accents[0]
  const headId = `${direction.id}-kop`

  return (
    <section
      id={direction.id}
      tabIndex={-1}
      aria-labelledby={headId}
      className="flex flex-col gap-8 pt-8 outline-none"
    >
      <header className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex max-w-[60ch] flex-col gap-2">
          <h2 id={headId} className="text-2xl font-semibold text-ink">{direction.name}</h2>
          <p className="text-md text-pretty text-ink-2">{direction.character}</p>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Merkkleuren">
          {direction.hues.map((hue) => (
            <li key={hue.name} className="flex w-[104px] flex-col gap-1.5">
              <Swatch colour={hue.value} className="h-14 rounded-md" />
              <span className="text-xs font-medium text-ink">{hue.name}</span>
              <span className="-mt-1 text-2xs text-ink-3 figure">{hex(hue.value)}</span>
            </li>
          ))}
        </ul>
      </header>

      {/* The family, and the lockup. */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="De familie" sub="Hoe de drie tekens de tinten delen.">
          <ul className="grid gap-5 sm:grid-cols-3">
            {MARKS.map(({ id, name, Mark }) => (
              <li key={id} className="flex flex-col gap-3">
                <span className="flex h-28 items-center justify-center rounded-md bg-panel">
                  <Mark direction={direction} size={80} title={`${name}, ${direction.name}`} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">{name}</span>
                  <span className="text-xs text-pretty text-ink-2">{direction.assignment[id]}</span>
                </span>
                <span className="flex items-center gap-2.5" aria-label="Favicon-maten">
                  {[32, 24, 16].map((size) => <Mark key={size} direction={direction} size={size} />)}
                  <span className="flex items-center gap-2 rounded-sm bg-rail px-2 py-1.5">
                    <Mark direction={direction} size={24} dark />
                    <Mark direction={direction} size={16} dark />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Woordmerk"
          sub="Het teken naast het woord, op licht, op donker en in één kleur. Het woord is Mona Sans, nog niet getekend."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Ground className="h-24">
              <Lockup size={40} colour={css(INK)}>
                <DirectionInsyte direction={direction} size={40} />
              </Lockup>
            </Ground>
            <Ground dark className="h-24">
              <Lockup size={40} colour={css(WHITE_INK)}>
                <DirectionInsyte direction={direction} size={40} dark />
              </Lockup>
            </Ground>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <Ground className="h-16">
                <Lockup size={24} colour={css(INK)}>
                  <DirectionInsyte direction={direction} size={24} mono={INK} />
                </Lockup>
              </Ground>
              <Ground className="h-16" dark>
                <Lockup size={24} colour={css(WHITE_INK)}>
                  <DirectionInsyte direction={direction} size={24} mono={WHITE_INK} />
                </Lockup>
              </Ground>
            </div>
          </div>
        </Panel>
      </div>

      {/* The product, in each accent a customer could pick. */}
      {accent !== undefined && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex max-w-[60ch] flex-col gap-0.5">
              <h3 className="text-md font-semibold text-ink">In het product</h3>
              <p className="text-sm text-pretty text-ink-2">
                Neutrale basis, één accentkleur. Een klant kiest uit {themeCount(direction.accents.length)}.
                {direction.accentNote !== undefined && ` ${direction.accentNote}`}
              </p>
            </div>
            <AccentPicker
              direction={direction}
              value={accent.name}
              onChange={setAccentName}
            />
          </div>
          <AppSample direction={direction} accent={accent} rail={rail} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex max-w-[66ch] flex-col gap-0.5">
          <h3 className="text-md font-semibold text-ink">Op de website</h3>
          <p className="text-sm text-pretty text-ink-2">
            Dezelfde tekst in elke richting. De tekening rechts is per richting een eigen idee; vergelijk vooral de
            kleur.
          </p>
        </div>
        <HeroSample direction={direction} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-md font-semibold text-ink">Contrast</h3>
            <p className="max-w-[66ch] text-sm text-pretty text-ink-2">
              Berekend uit de waarden. Tekst vraagt 4,5:1, een rand of focusring 3:1. Haalt een licht vlak die 3:1 niet,
              dan nemen rand en focusring de tekstkleur.
            </p>
          </div>
          <ContrastTable direction={direction} />
        </div>
        <dl className="flex flex-col gap-4 rounded-lg bg-panel p-5">
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-semibold text-ink">Wat het zegt</dt>
            <dd className="text-sm text-pretty text-ink-2">{direction.says}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-semibold text-ink">Risico</dt>
            <dd className="text-sm text-pretty text-ink-2">{direction.risk}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

/* ── what is still open ───────────────────────────────────────────────────────────────────────── */

const QUESTIONS = [
  "Welke richting voelt als Insyte, en welke kun je meteen schrappen?",
  "Welk teken is het hoofdmerk: de gestapelde vierkanten of de bloem? Nu staan ze naast elkaar als gelijken.",
  "Draagt Magnus meer kleur dan Insyte zelf, als het enige kleurrijke ding in het product, of dragen alle drie de tekens evenveel?",
  "Hoeveel accentkleuren krijgt een klant, en mag hij ook een eigen kleur kiezen buiten het merk?",
  "Blijft de icoonbalk donker, of wordt hij licht zoals de rest van het product?"
] as const

function Decisions() {
  return (
    <section
      id="beslissen"
      tabIndex={-1}
      aria-labelledby="beslissen-kop"
      className="flex flex-col gap-4 pt-8 outline-none"
    >
      <SectionHead id="beslissen-kop" title="Te beslissen">
        Wat deze pagina niet voor je kiest.
      </SectionHead>
      <ol className="flex max-w-[66ch] list-decimal flex-col gap-2 pl-5 text-base text-pretty text-ink-2 marker:text-ink-3">
        {QUESTIONS.map((question) => <li key={question}>{question}</li>)}
      </ol>
    </section>
  )
}

const themeCount = (n: number) => (n === 1 ? "één thema" : `${["", "", "twee", "drie", "vier"][n] ?? n} thema's`)

function AccentPicker({ direction, value, onChange }: {
  readonly direction: Direction
  readonly value: string
  readonly onChange: (next: string) => void
}) {
  const names = direction.accents.map((accent) => accent.name)
  // A radio group is one Tab stop; the arrows move the choice, as a native one does.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
      ? -1
      : 0
    if (step === 0) return
    event.preventDefault()
    const next = names[(names.indexOf(value) + step + names.length) % names.length] ?? value
    onChange(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-accent="${next}"]`)?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={`Accentkleur voor ${direction.name}`}
      className="flex flex-wrap gap-1"
      onKeyDown={onKey}
    >
      {direction.accents.map((accent) => {
        const selected = accent.name === value
        return (
          <button
            key={accent.name}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-accent={accent.name}
            onClick={() => onChange(accent.name)}
            className={cx(
              "flex h-8 items-center gap-2 rounded-sm px-2.5 text-xs font-medium transition-colors",
              selected ? "bg-selected text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
            )}
          >
            <Swatch
              colour={accent.fill}
              className={cx("size-3.5 rounded-full", selected && "outline-2 outline-offset-1 outline-ink")}
            />
            {accent.name}
          </button>
        )
      })}
    </div>
  )
}

/* ── layout of this page ──────────────────────────────────────────────────────────────────────── */

function SectionHead(
  { id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }
) {
  return (
    <div className="flex max-w-[66ch] flex-col gap-1">
      <h2 id={id} className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-sm text-pretty text-ink-2">{children}</p>
    </div>
  )
}

function Panel(
  { title, sub, children }: { readonly title: string; readonly sub: string; readonly children: ReactNode }
) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-panel p-4 sm:p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-md font-semibold text-ink">{title}</h3>
        <p className="text-xs text-ink-3">{sub}</p>
      </div>
      {children}
    </div>
  )
}
