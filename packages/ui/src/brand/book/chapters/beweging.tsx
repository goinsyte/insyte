import { durations, easings, type EasingToken } from "@insyte/tokens/tokens"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { type CSSProperties, useState } from "react"
import { Glyph } from "../../../app/common/glyph.tsx"
import { TravelArrow } from "../../../app/marketing-sections/link-index.tsx"
import { Bell, Package, RefreshCcw, Truck } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import { Reveal, RevealItem } from "../../../marketing/motion.tsx"
import { Control, RuleSheet, SectionPage } from "../page.tsx"
import { IN_OUT, sec, useBook, useSpecimen } from "../state.tsx"

/*
 * 07 Beweging. The three curves and the durations from `tokens.ts`, drawn and run; the plate's two
 * authored moments; the small fixed moments every page shares; the book's own page transition as a
 * specimen of itself; and the rules, with the switch that turns motion off for the whole book.
 */

const C = "beweging" as const

const bezier = (v: string) => (v.match(/-?[\d.]+/g) ?? []).map(Number)

const CURVE: Record<EasingToken, { readonly name: string; readonly use: string }> = {
  "out-quart": { name: "Uit, quart", use: "De standaard: alles wat aankomt of van stand wisselt." },
  "out-expo": { name: "Uit, expo", use: "Een langere aankomst, over een echte afstand: de plaat, een tekening." },
  mesh: {
    name: "In en uit",
    use: "Symmetrisch: een pagina die gaat en een die komt, en het menu. Als sfeer (de mesh) alleen nog in het product."
  }
}

function Curve({ k }: { readonly k: EasingToken }) {
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = bezier(easings[k])
  const d = `M0 100 C${x1 * 100} ${100 - y1 * 100} ${x2 * 100} ${100 - y2 * 100} 100 0`
  return (
    <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
      <svg viewBox="-4 -4 108 108" className="aspect-square w-full" aria-hidden>
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--hairline)" />
        <line x1="0" y1="100" x2="100" y2="0" stroke="var(--hairline)" strokeDasharray="2 2" />
        <path d={d} fill="none" stroke="var(--abyss)" strokeWidth="1.5" />
      </svg>
      <div
        className="relative h-6 rounded-full bg-mist"
        style={{ "--track": "100cqw", containerType: "inline-size" } as CSSProperties}
      >
        <span
          className="book-travel absolute top-1 left-1 block size-4 rounded-[4px] bg-abyss"
          style={{ "--curve": easings[k], "--track": "calc(100cqw - 8px)" } as CSSProperties}
        />
      </div>
      <figcaption className="flex flex-col gap-1">
        <span className="font-medium text-ink text-sm">
          {CURVE[k].name} <span className="font-normal text-ink-3">· {k}</span>
        </span>
        <span className="text-ink-2 text-sm">{CURVE[k].use}</span>
        <span className="text-ink-3 text-xs tabular-nums">{easings[k]}</span>
      </figcaption>
    </figure>
  )
}

const DURATION_USE = {
  instant: "Een tik: directe reactie. Ook de overgang zonder beweging.",
  quick: "Een hover, een wissel op iets dat al op het scherm staat.",
  base: "Alles wat komt of gaat. Een pagina die vertrekt.",
  slow: "Een aankomst: een pagina, een specimen, het menu."
} as const

/** The plate's two moments, on the product's own utilities: unroll, then draw, then the scan. */
export function PlateDrawing() {
  return (
    <div className="plate unroll relative h-[360px] w-full max-w-[520px] overflow-hidden rounded-lg">
      <div className="plate-scan" style={{ "--plate-scan-travel": "360px" } as CSSProperties} aria-hidden />
      <svg viewBox="0 0 520 360" className="draw absolute inset-0 size-full" aria-hidden>
        <g stroke="var(--mesh-ink)" strokeOpacity="0.8" fill="none" strokeWidth="1">
          <line x1="40" y1="60" x2="480" y2="60" />
          <line x1="40" y1="52" x2="40" y2="68" />
          <line x1="480" y1="52" x2="480" y2="68" />
          <rect x="40" y="100" width="200" height="90" rx="6" />
          <rect x="280" y="100" width="200" height="90" rx="6" strokeDasharray="4 4" />
          <path d="M240 145 H280" />
          <path d="M140 190 V250 H380 V190" strokeDasharray="3 3" />
          <line x1="40" y1="300" x2="480" y2="300" />
        </g>
        <g fill="var(--mesh-ink-2)" fontSize="12" fontFamily="var(--font-sans)">
          <text x="260" y="48" textAnchor="middle">tot 17:00 vandaag</text>
          <text x="52" y="124">Zoals het record nu is</text>
          <text x="292" y="124">Zoals getekend</text>
          <text x="40" y="324">SUP-0318 · getekend, niet uitgevoerd · zekerheid 3,8</text>
        </g>
      </svg>
    </div>
  )
}

const TABS = ["Alles", "Voor mij", "AI"] as const

function Moments() {
  const { still } = useSpecimen()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Alles")
  return (
    <div className="grid w-full max-w-[1000px] gap-3 sm:grid-cols-2">
      <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
        <Reveal className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <RevealItem key={i}>
              <span className="block h-16 rounded-md bg-ink/8" />
            </RevealItem>
          ))}
        </Reveal>
        <figcaption className="text-ink-2 text-sm">
          <span className="font-medium text-ink">Reveal.</span> Een groep komt één keer binnen als je erheen scrolt.
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
        <span className="flex h-16 items-center gap-4">
          {[Truck, Bell, Package, RefreshCcw].map((I, i) => (
            <Glyph key={i} icon={I} size={22} tile="mist" delay={i * 80} draw={!still} />
          ))}
        </span>
        <figcaption className="text-ink-2 text-sm">
          <span className="font-medium text-ink">De pen.</span> Een icoon tekent zichzelf één keer in.
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
        <LayoutGroup id="moment-tabs">
          <span role="tablist" aria-label="Meldingen" className="flex h-16 items-center">
            <span className="inline-flex rounded-md p-1 field">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn("relative h-7 rounded-sm px-3 text-sm", tab === t ? "text-mesh-ink" : "text-ink-2")}
                >
                  {tab === t
                    ? (
                      <motion.span
                        layoutId="moment-tab"
                        className="absolute inset-0 -z-0 rounded-sm bg-abyss"
                        transition={{ duration: sec("base"), ease: IN_OUT }}
                      />
                    )
                    : null}
                  <span className="relative">{t}</span>
                </button>
              ))}
            </span>
          </span>
        </LayoutGroup>
        <figcaption className="text-ink-2 text-sm">
          <span className="font-medium text-ink">Het schuivende veld.</span> De selectie schuift naar de nieuwe tab.
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
        <span className="flex h-16 items-center">
          <a href="#overgang" className="group/dest flex items-center gap-2 font-medium text-arc-ink text-base">
            Naar de paginaovergang
            <TravelArrow className="size-4" />
          </a>
        </span>
        <figcaption className="text-ink-2 text-sm">
          <span className="font-medium text-ink">De reizende pijl.</span>{" "}
          Bij hover schuift de pijl eruit en komt er een nieuwe.
        </figcaption>
      </figure>
    </div>
  )
}

/** The book's own transition, run in a frame: a page leaves on `base`, the next arrives on `slow`. */
function Transition() {
  const [n, setN] = useState(0)
  const { still } = useSpecimen()
  const pages = [
    { t: "Kleur", g: "bg-paper hairline", i: "text-ink" },
    { t: "Typografie", g: "bg-mist", i: "text-ink" },
    { t: "Patronen", g: "bg-abyss", i: "text-mesh-ink" }
  ] as const
  const p = pages[n % pages.length] ?? pages[0]
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-4">
      <div className="relative aspect-[16/9] overflow-hidden bg-glacier ruled">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={n}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: still ? sec("instant") : sec("slow"), ease: IN_OUT } }}
            exit={still
              ? { opacity: 0, transition: { duration: sec("instant") } }
              : { opacity: 0, y: -12, transition: { duration: sec("base"), ease: IN_OUT } }}
            className={cn("absolute inset-3 flex items-end rounded-md p-6", p.g)}
          >
            <span className={cn("flex items-baseline gap-3 font-medium text-3xl", p.i)}>
              <span className="figure text-4xl">{String(3 + (n % pages.length)).padStart(2, "0")}</span>
              {p.t}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-ink-3 text-sm tabular-nums">
          weg: {durations.base} ms · aankomst: {durations.slow} ms · in en uit · 12 px
        </span>
        <Control icon={RefreshCcw} onClick={() => setN((v) => v + 1)}>Volgende pagina</Control>
      </div>
    </div>
  )
}

const RULES = [
  {
    title: "Het eindbeeld eerst",
    body: "Wat zonder beweging zichtbaar is, is het eindbeeld. Niets hangt af van een animatie om leesbaar te zijn."
  },
  { title: "Buiten beeld staat stil", body: "Elke lus pauzeert buiten beeld en in een verborgen tabblad." },
  {
    title: "Minder beweging is stil",
    body:
      "Met minder beweging staat elke tekening stil in haar laatste stand; pagina's wisselen met een korte overvloeier."
  },
  { title: "Eén moment", body: "Een pagina heeft één bedacht moment, niet op elke sectie dezelfde entree." },
  { title: "Alleen tokens", body: "Drie curves en vier duren. Geen veer die nabotst, geen eigen milliseconden." },
  {
    title: "Geen sfeer op merkvlakken",
    body: "De drijvende mesh is uit het merk. De scanlijn van de plaat is de enige sfeerbeweging, in het product."
  }
] as const

function StillSwitch() {
  const book = useBook()
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={book.still}
        onClick={() => book.setStill(!book.still)}
        className="flex h-11 items-center gap-3 rounded-md bg-paper pr-4 pl-2 font-medium text-base text-ink hairline"
      >
        <span className={cn("relative h-6 w-10 rounded-full transition-colors", book.still ? "bg-abyss" : "bg-ink/15")}>
          <span
            className={cn(
              "absolute top-1 left-1 size-4 rounded-full bg-paper transition-transform",
              book.still && "translate-x-4"
            )}
          />
        </span>
        Zonder beweging, voor het hele boek
      </button>
      <span className="text-ink-3 text-sm">Je systeeminstelling voor minder beweging doet hetzelfde.</span>
    </div>
  )
}

export function BewegingChapter() {
  return (
    <>
      <SectionPage
        chapter={C}
        id="curves"
        ground="mist"
        status="Live"
        source="tokens.ts · easings"
        motion
        body={
          <p>
            Drie curves. Twee vertragen: iets vertrekt snel en komt langzaam aan, zodat een wissel veroorzaakt voelt in
            plaats van ingepland. De derde is symmetrisch, voor wat gaat en komt tegelijk.
          </p>
        }
        use={["Out-quart voor een staat, out-expo voor een aankomst, in en uit voor een overgang."]}
        avoid={["Een veer die nabotst, een elastische curve, linear voor iets dat aankomt."]}
      >
        <div className="grid w-full max-w-[1040px] gap-3 md:grid-cols-3">
          {(Object.keys(easings) as ReadonlyArray<EasingToken>).map((k) => <Curve key={k} k={k} />)}
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="duren"
        ground="paper"
        status="Live"
        source="tokens.ts · durations"
        body={
          <>
            <p>Vier duren voor alles wat aankomt of wisselt. Niets in het merk vindt een vijfde uit.</p>
            <p>
              De twee lange waarden zijn sfeer, geen aankomst: scan ({durations.scan / 1000}{" "}
              s) is de lijn over een plaat, ambient ({durations.ambient / 1000}{" "}
              s) de drijvende mesh, alleen in het product en wordt uitgefaseerd.
            </p>
          </>
        }
        use={["De duur die bij de rol hoort."]}
        avoid={["duration-[300ms] of een andere eigen waarde."]}
      >
        <ol className="flex w-full max-w-[880px] flex-col">
          {(["instant", "quick", "base", "slow"] as const).map((k) => (
            <li
              key={k}
              className="relative grid items-center gap-x-6 gap-y-2 py-4 md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,18rem)]"
            >
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
              <span className="flex items-baseline gap-2">
                <span className="font-medium text-ink text-sm">{k}</span>
                <span className="text-ink-3 text-xs tabular-nums">{durations[k]} ms</span>
              </span>
              <span
                className="block h-3 rounded-sm bg-abyss"
                style={{ width: `${(durations[k] / durations.slow) * 100}%` }}
              />
              <span className="text-ink-2 text-sm">{DURATION_USE[k]}</span>
            </li>
          ))}
        </ol>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="plaat"
        ground="glacier"
        status="Live"
        source="app/app.css · unroll, draw, plate-scan"
        motion
        replay
        body={
          <p>
            Twee bedachte momenten op één curve, na elkaar. De grond rolt van rechts in ({durations.base}{" "}
            ms), dan wordt de tekening van boven naar beneden getrokken ({durations.slow}{" "}
            ms), zodat de lijn geregeld lijkt, niet opgekomen. Dan loopt de scanlijn.
          </p>
        }
        use={["Een voorstel dat net getekend is."]}
        avoid={["Dezelfde entree op elk vlak van een pagina."]}
      >
        <PlateDrawing />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="momenten"
        ground="mist"
        status="Live"
        source="marketing/motion.tsx · common/glyph.tsx"
        replay
        body={<p>De kleine vaste momenten die elke pagina deelt. Ze spelen één keer, of alleen als jij iets doet.</p>}
        use={["Precies deze, op de plek waar ze horen."]}
        avoid={["Een eigen variant van hetzelfde moment."]}
      >
        <Moments />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="overgang"
        ground="paper"
        status="Live"
        source="brand/book/shell.tsx"
        body={
          <>
            <p>
              Dit boek, als voorbeeld van zichzelf. Tussen hoofdstukken vertrekt de pagina 12 px omhoog in{" "}
              {durations.base} ms en komt de volgende 12 px van onder in {durations.slow} ms, op de in-en-uitcurve.
            </p>
            <p>
              Vanuit het menu vliegen het nummer en de titel van het gekozen hoofdstuk van hun rij naar de hero van de
              nieuwe pagina, terwijl het menu vervaagt. Zonder beweging is het een overvloeier van {durations.instant}
              {" "}
              ms.
            </p>
          </>
        }
        use={["Dezelfde overgang voor elke paginawissel."]}
        avoid={["Een andere overgang per pagina."]}
      >
        <Transition />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="regels"
        ground="glacier"
        body={<p>Zes regels, en een schakelaar. Zet hem aan en het hele boek staat stil in zijn eindbeeld.</p>}
      >
        <div className="flex w-full flex-col items-center gap-10">
          <StillSwitch />
          <RuleSheet rules={RULES} />
        </div>
      </SectionPage>
    </>
  )
}
