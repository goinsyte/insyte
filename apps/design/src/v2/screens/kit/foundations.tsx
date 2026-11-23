import { useRef, useState } from "react"
import type { ComponentType } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { FilterChip } from "../../ui/filters.tsx"
import * as Icons from "../../ui/icons.tsx"
import { ACCENTS, MODES } from "../../ui/theme.ts"
import type { Accent, Mode } from "../../ui/theme.ts"
import { Toggle } from "../../ui/toggle.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"
import { contrast, resolve, shortColour, useResolved } from "./measure.ts"

/* ── colour ──────────────────────────────────────────────────────────────────────────────────── */

const GROUPS: ReadonlyArray<{ readonly title: string; readonly note: string; readonly tokens: ReadonlyArray<string> }> =
  [
    {
      title: "Oppervlakken",
      note: "Puur grijs, van buiten naar binnen. Scheiding is een stap in het oppervlak, geen rand.",
      tokens: ["desk", "panel", "canvas", "well", "hover", "selected"]
    },
    {
      title: "Lijnen en inkt",
      note: "ink-3 houdt 4,5:1 op elk oppervlak; ink-4 is nooit tekst.",
      tokens: ["line", "line-strong", "ink", "ink-2", "ink-3", "ink-4"]
    },
    {
      title: "De donkere L",
      note: "Icoonbalk en winkelkiezer: grafiet, zonder blauw, ook in de donkere weergave het donkerst.",
      tokens: ["rail", "rail-2", "rail-ink", "rail-fg"]
    },
    {
      title: "Accent",
      note: "Het ene kleurtje dat de klant kiest: focus, selectie, links, aan, het ene datapunt.",
      tokens: ["accent", "accent-ink", "accent-tint", "on-accent"]
    },
    {
      title: "Signalen",
      note: "Vast in elk thema, en altijd met een woord of teken erbij.",
      tokens: ["good", "good-ink", "good-tint", "warn", "warn-ink", "warn-tint", "bad", "bad-ink", "bad-tint"]
    },
    {
      title: "Data",
      note: "Nu in inkt, ervoor in vergelijkingsgrijs, het ene ding in het accent.",
      tokens: ["series-1", "series-2", "series-3", "compare", "grid"]
    }
  ]

/** Surfaces and tints sit close to the page's own white: only they need an edge to be seen as a swatch. */
const PALE = /canvas|panel|bar|well|hover|selected|tint|desk|grid|on-|knob|compare|line/

function Swatches({ tokens }: { readonly tokens: ReadonlyArray<string> }) {
  const ref = useRef<HTMLUListElement>(null)
  const values = useResolved(ref, tokens)
  return (
    <ul ref={ref} className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tokens.map((token) => (
        <li key={token} className="flex min-w-0 flex-col gap-1.5">
          <span
            className={cx("h-12 rounded-sm", PALE.test(token) && "ring-1 ring-line ring-inset")}
            style={{ background: `var(--color-${token})` }}
          />
          <span className="text-xs font-medium text-ink">{token}</span>
          <span className="truncate figure text-xs text-ink-3">{shortColour(values[token])}</span>
        </li>
      ))}
    </ul>
  )
}

/** Measured, not claimed: the ratio between two tokens as this page resolves them, and whether it passes. */
function Ratio({ fg, bg, min, scope }: {
  readonly fg: string
  readonly bg: string
  readonly min: number
  readonly scope: HTMLElement | null
}) {
  if (scope === null) return <span className="text-xs text-ink-3">…</span>
  const r = contrast(resolve(scope, fg), resolve(scope, bg))
  const pass = r >= min
  return (
    <span
      className={cx(
        "figure inline-flex items-center gap-1 text-xs",
        pass ? "text-ink-2" : "font-semibold text-bad-ink"
      )}
    >
      {r.toFixed(1).replace(".", ",")}:1
      {pass
        ? <Icons.Check size={11} strokeWidth={2.25} className="text-good-ink" />
        : <Icons.AlertTriangle size={11} />}
      <span className="sr-only">{pass ? "voldoet" : `voldoet niet, minimaal ${min}:1`}</span>
    </span>
  )
}

/**
 * One accent in one mode, as a small working surface: its swatches, its text on every surface with
 * the ratio measured live, and the controls that wear it. Rendered inside its own `data-accent` and
 * `data-theme`, so the four themes stand side by side whatever the page is set to.
 */
function ThemeCard({ accent, mode }: { readonly accent: Accent; readonly mode: Mode }) {
  const [scope, setScope] = useState<HTMLElement | null>(null)
  const [on, setOn] = useState(true)
  const label = ACCENTS.find((a) => a.value === accent)
  return (
    <div
      ref={setScope}
      data-accent={accent}
      data-theme={mode}
      className="flex min-w-0 flex-col gap-3 bg-canvas p-5 text-ink"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{label?.label}</p>
        <p className="text-xs text-ink-3">{MODES.find((m) => m.value === mode)?.label}</p>
      </div>
      <div className="flex gap-1">
        {["accent", "accent-ink", "accent-tint"].map((t) => (
          <span
            key={t}
            className={cx("h-6 flex-1 rounded-xs", PALE.test(t) && "ring-1 ring-line ring-inset")}
            style={{ background: `var(--color-${t})` }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
        <dt className="text-accent-ink">Link op canvas</dt>
        <dd>
          <Ratio fg="accent-ink" bg="canvas" min={4.5} scope={scope} />
        </dd>
        <dt className="text-ink-2">Link op menu</dt>
        <dd>
          <Ratio fg="accent-ink" bg="panel" min={4.5} scope={scope} />
        </dd>
        <dt className="text-ink-2">Link op tint</dt>
        <dd>
          <Ratio fg="accent-ink" bg="accent-tint" min={4.5} scope={scope} />
        </dd>
        <dt className="text-ink-2">Focusring op well</dt>
        <dd>
          <Ratio fg="accent" bg="well" min={3} scope={scope} />
        </dd>
        <dt className="text-ink-2">Tekst op accent</dt>
        <dd>
          <Ratio fg="on-accent" bg="accent" min={4.5} scope={scope} />
        </dd>
      </dl>
      <div data-force="focus" inert className="flex flex-wrap items-center gap-2.5">
        <Button size="sm">Focus</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Toggle label={`Voorbeeld ${label?.label ?? ""}`} on={on} onChange={setOn} />
        <RowCheckbox label="Voorbeeld" checked onChange={() => undefined} />
        <FilterChip field="Status" value="Vertraagd" onRemove={() => undefined} />
      </div>
    </div>
  )
}

function Colour() {
  return (
    <>
      {GROUPS.map((group, i) => (
        <Spec
          key={group.title}
          id={i === 0 ? "kleur" : `kleur-${group.title.toLowerCase().replaceAll(" ", "-")}`}
          title={group.title}
          name="--color-*"
          file="tokens.css · --color-*"
          summary={group.note}
        >
          <div className="rounded-xl bg-panel px-5 py-7 sm:px-8">
            <Swatches tokens={group.tokens} />
          </div>
        </Spec>
      ))}
      <Spec
        id="kleur-magnus"
        title="Het verloop van Magnus"
        use={["De rand van de composer, het teken van Magnus, de ring om een agent."]}
        avoid={["Tekst, knoppen, grafieken of achtergronden in het verloop."]}
        name={`${ASSISTANT}: --gradient-ai`}
        file="tokens.css · --color-ai-*"
        summary={`Het verloop en zijn vijf stops, alleen voor ${ASSISTANT}: zijn teken, de rand van de composer terwijl je typt, en het punt dat hij in een grafiek vond. Agents krijgen het niet. Vast in elk thema. Tekst wordt nooit met het verloop geverfd en krijgt geen eigen kleur: woorden van de assistent staan in inkt (ai-ink), het teken ernaast zegt wie spreekt.`}
      >
        <div className="flex flex-col gap-5 rounded-xl bg-panel px-5 py-7 sm:px-8">
          <span className="ai-fill h-10 rounded-sm" />
          <Swatches tokens={["ai-amber", "ai-coral", "ai-magenta", "ai-violet", "ai-sky", "ai-ink"]} />
        </div>
      </Spec>
      <Spec
        id="themas"
        title="Accentthema's"
        anatomy={[
          "Tint en verzadiging per thema, op één plek in tokens.css",
          "De weergave (licht, donker) zet lichtheid en verzadiging",
          "accent, accent-ink, accent-tint en on-accent volgen daaruit"
        ]}
        name="data-accent · data-theme"
        file="tokens.css · ui/theme.ts"
        summary="Elk accentthema in licht en donker naast elkaar, met de contrasten gemeten op deze pagina. Een thema is één blok in tokens.css (tint en verzadiging); de hele schaal volgt daaruit. Zo kan het merkpalet later als themaset worden ingezet zonder dat een onderdeel verandert."
      >
        <div className="grid gap-px overflow-hidden rounded-xl bg-line-strong sm:grid-cols-2 xl:grid-cols-4">
          {ACCENTS.map((a) => <ThemeCard key={`${a.value}-l`} accent={a.value} mode="light" />)}
          {ACCENTS.map((a) => <ThemeCard key={`${a.value}-d`} accent={a.value} mode="dark" />)}
        </div>
        <Rule>
          AA-eisen: tekst in het accent 4,5:1 op canvas, menu en de eigen tint; de focusring 3:1 op elk oppervlak; tekst
          op een gevuld accent 4,5:1. Een rode waarde hierboven is een thema dat niet mag worden uitgeleverd.
        </Rule>
      </Spec>
    </>
  )
}

/* ── type, space, shape, depth, motion ─────────────────────────────────────────────────────────── */

const TYPE = [
  ["2xl", "28 / 34", "text-2xl font-semibold", "Goedemiddag, Elena."],
  ["xl", "22 / 28", "text-xl font-semibold", "Weekoverzicht"],
  ["lg", "18 / 24", "text-lg font-semibold", "Magnus"],
  ["md", "16 / 22", "text-md font-semibold", "Wacht op jou"],
  ["base", "14 / 21", "text-base", "De terugbetalingen stegen met 37%."],
  ["sm", "13 / 18", "text-sm", "Mijn agents · de standaard voor tekst in de app"],
  ["xs", "12 / 16", "text-xs", "Shopify · betaalde bestellingen"],
  ["2xs", "11 / 14", "text-2xs", "Bron en sleutel onder een grafiek"]
] as const

function Type() {
  return (
    <Spec
      id="type"
      title="Typografie"
      name="--text-* · .figure"
      file="tokens.css · v2.css"
      summary="Eén letter voor alles: Mona Sans, in vaste pixelstappen van ongeveer 1,15. Geen monospace, ook niet voor cijfers. Bedragen, tijden, aantallen en assen staan in dezelfde letter met gewone, evenredige cijfers (.figure), rechts uitgelijnd in een kolom. Geen tabelcijfers."
    >
      <div className="flex flex-col rounded-xl bg-panel px-5 py-3 sm:px-8">
        {TYPE.map(([name, size, cls, sample]) => (
          <div key={name} className="grid grid-cols-[3.5rem_4.5rem_minmax(0,1fr)] items-baseline gap-3 py-2.5">
            <span className="text-xs font-medium text-ink">{name}</span>
            <span className="figure text-xs text-ink-3">{size}</span>
            <span className={cx(cls, "truncate text-ink")}>{sample}</span>
          </div>
        ))}
        <div className="grid grid-cols-[3.5rem_4.5rem_minmax(0,1fr)] items-baseline gap-3 py-2.5">
          <span className="text-xs font-medium text-ink">figure</span>
          <span className="figure text-xs text-ink-3">cijfers (.figure)</span>
          <span className="figure truncate text-lg text-ink">€ 48.210 · 1.284 · 14:31 · #5142 · 0</span>
        </div>
      </div>
    </Spec>
  )
}

const SPACE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16] as const

function Space() {
  return (
    <Spec
      id="ruimte"
      title="Ruimte"
      name="spacing (4px)"
      file="Tailwind · --spacing"
      summary="Alles op een raster van 4px. Dicht binnen een groep (gap-1 tot gap-3), ruim tussen groepen (gap-6 tot gap-10), meer ruimte boven een kop dan eronder."
    >
      <div className="flex flex-col gap-1.5 rounded-xl bg-panel px-5 py-7 sm:px-8">
        {SPACE.map((n) => (
          <div key={n} className="grid grid-cols-[3rem_3rem_minmax(0,1fr)] items-center gap-3">
            <span className="figure text-xs font-medium text-ink">{n}</span>
            <span className="figure text-xs text-ink-3">{n * 4}px</span>
            <span className="h-2.5 rounded-[2px] bg-ink-3" style={{ width: n * 4 }} />
          </div>
        ))}
      </div>
    </Spec>
  )
}

const RADII = [
  ["xs", "4", "rounded-xs", "chips in tekst, tags"],
  ["sm", "6", "rounded-sm", "knoppen, velden, menuregels"],
  ["md", "8", "rounded-md", "railtegels, kleine kaarten, menu's"],
  ["lg", "12", "rounded-lg", "kaarten, composer, dialogen"],
  ["xl", "16", "rounded-xl", "het app-frame"],
  ["full", "∞", "rounded-full", "personen, schakelaars, stippen"]
] as const

const SHADOWS = [
  ["xs", "shadow-xs", "een knop of tegel die net loskomt"],
  ["sm", "shadow-sm", "de composer, een voorstel in een gesprek"],
  ["pop", "shadow-pop", "wat zweeft: menu, popover, dialoog, melding"]
] as const

function Shape() {
  return (
    <>
      <Spec
        id="radius"
        title="Rondingen"
        name="--radius-*"
        file="tokens.css"
        summary="Zes rondingen en niet meer. Hoe groter het oppervlak, hoe ronder; iets binnen een kaart is nooit ronder dan de kaart."
      >
        <States cols={6}>
          {RADII.map(([name, px, cls, use]) => (
            <State key={name} label={`${name} · ${px}px`}>
              <span className="flex flex-col items-center gap-2">
                <span className={cx("size-12 bg-well ring-1 ring-line-strong ring-inset", cls)} />
                <span className="text-center text-xs text-pretty text-ink-3">{use}</span>
              </span>
            </State>
          ))}
        </States>
      </Spec>
      <Spec
        id="schaduw"
        title="Schaduw"
        name="--shadow-*"
        file="tokens.css"
        summary="Plat is de standaard: een kaart staat op een haarlijn. Een schaduw is voor wat boven de pagina zweeft, altijd met verschuiving en zachte vervaging."
      >
        <States cols={3}>
          {SHADOWS.map(([name, cls, use]) => (
            <State key={name} label={name} surface="desk">
              <span
                className={cx(
                  "flex h-20 w-36 items-center justify-center rounded-md bg-canvas p-3 text-center text-xs text-pretty text-ink-3",
                  cls
                )}
              >
                {use}
              </span>
            </State>
          ))}
        </States>
      </Spec>
    </>
  )
}

const MOTION = [
  ["rise", "animate-rise", "320 ms · uit", "wat verschijnt: een menu, een melding, een voorstel"],
  ["slide-in", "animate-slide-in", "260 ms · uit", "een sheet van de rand"],
  ["shimmer", "animate-shimmer", "1,6 s · in-uit", "een skeleton dat laadt"],
  ["sweep", "animate-sweep", "1,4 s · in-uit", "werk van onbekende duur"]
] as const

function Motion() {
  const [run, setRun] = useState(0)
  return (
    <Spec
      id="beweging"
      title="Beweging"
      name="--ease-* · --animate-* · --duration-*"
      file="tokens.css"
      summary="Beweging zegt dat iets veranderde, niets meer: 120 tot 200 ms voor bediening, één ease-out, en bij ‘minder beweging’ staat alles stil."
    >
      <States cols={4}>
        {MOTION.map(([name, cls, timing, use]) => (
          <State key={`${name}-${run}`} label={`${name} · ${timing}`}>
            <span className="flex w-full flex-col items-center gap-2">
              <span className="relative h-8 w-full overflow-hidden rounded-sm bg-well">
                <span className={cx("absolute inset-y-1.5 left-2 w-12 rounded-xs bg-accent", cls)} />
              </span>
              <span className="text-center text-xs text-pretty text-ink-3">{use}</span>
            </span>
          </State>
        ))}
      </States>
      <div>
        <Button size="sm" icon={<Icons.Play />} onClick={() => setRun((n) => n + 1)}>Opnieuw afspelen</Button>
      </div>
    </Spec>
  )
}

/* ── icons ───────────────────────────────────────────────────────────────────────────────────── */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number }>

const ICONS = (Object.entries(Icons) as ReadonlyArray<[string, unknown]>)
  .filter((entry): entry is [string, IconComponent] => typeof entry[1] === "function" || typeof entry[1] === "object")
  .toSorted(([a], [b]) => a.localeCompare(b))

function IconGrid() {
  const [query, setQuery] = useState("")
  const shown = ICONS.filter(([name]) => name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <Spec
      id="iconen"
      title="Iconen"
      name="ui/icons.tsx"
      file="ui/icons.tsx · @insyte/ui/icons"
      summary="Insytes eigen set: vierkante uiteinden, gehoekte verbindingen, één lijn van 1,75 op een raster van 24. 16px in een menu of knop, 18 tot 19px op de icoonbalk. Een icoon zonder woord heeft altijd een label."
    >
      <div className="flex flex-col gap-4 rounded-xl bg-panel px-5 py-7 sm:px-8">
        <label className="flex max-w-xs items-center gap-2 text-xs text-ink-3">
          <Icons.Search size={14} />
          <span className="sr-only">Icoon zoeken</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Zoek in ${ICONS.length} iconen`}
            className="h-7 min-w-0 flex-1 rounded-sm bg-canvas px-2 text-xs text-ink ring-1 ring-line-strong ring-inset outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <ul className="grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {shown.map(([name, G]) => (
            <li key={name} className="flex min-w-0 flex-col items-center gap-2 text-ink" title={name}>
              <G size={18} />
              <span className="w-full text-center text-xs break-words text-ink-3">{name}</span>
            </li>
          ))}
        </ul>
      </div>
    </Spec>
  )
}

export function Foundations() {
  return (
    <KitSection
      id="fundamenten"
      second="Waar alles uit bestaat."
      title="Fundamenten"
      intro="De waarden waar alles uit bestaat. Een neutrale basis zonder kleurzweem, één accent dat de klant kiest, drie vaste signalen en het verloop voor de assistent. Niets op deze pagina noemt een kleur: alles wordt uit de tokens gelezen."
    >
      <Colour />
      <Type />
      <Space />
      <Shape />
      <Motion />
      <IconGrid />
    </KitSection>
  )
}
