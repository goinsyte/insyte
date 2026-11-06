import type { ReactNode } from "react"
import { Download, Sparkle } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import { InsyteMark } from "../../mark.tsx"
import { MarkDrift } from "../../marks.tsx"
import { SectionPage } from "../page.tsx"

/*
 * 02 Logo. One mark, InsyteMark = MarkDrift, exactly as the console's rail and the marketing site
 * draw it, set out as the small system it is: the mark, the lockup with the wordmark, its tones and
 * grounds, its sizes, the app icon, its construction and clear space, what not to do, and the files
 * that exist. No alternative marks: the mark is decided.
 */

const C = "logo" as const

/** The lockup as the marketing bar and the console's sign-in draw it. The text is 0.625 of the tile. */
const LOCKUP = [
  { tile: 24, mark: 17, text: "text-md", label: "24 px" },
  { tile: 32, mark: 22, text: "text-xl", label: "32 px" },
  { tile: 40, mark: 28, text: "text-2xl", label: "40 px" },
  { tile: 48, mark: 34, text: "text-3xl", label: "48 px" },
  { tile: 64, mark: 46, text: "text-4xl", label: "64 px" },
  { tile: 96, mark: 68, text: "text-5xl", label: "96 px" }
] as const

export function Lockup(
  { tile = 32, mark = 22, text = "text-xl", dark = false }: {
    readonly tile?: number
    readonly mark?: number
    readonly text?: string
    readonly dark?: boolean
  }
) {
  return (
    <span className="inline-flex items-center" style={{ gap: tile * 0.3 }}>
      {dark
        ? <InsyteMark size={tile} tone="white" />
        : (
          <span
            className="flex shrink-0 items-center justify-center rounded-md bg-abyss"
            style={{ width: tile, height: tile }}
          >
            <InsyteMark size={mark} tone="white" />
          </span>
        )}
      <span className={cn("font-medium", text, dark ? "text-mesh-ink" : "text-ink")}>insyte</span>
    </span>
  )
}

function Cell(
  { ground, label, children, className }: {
    readonly ground: "abyss" | "arc" | "paper" | "mist"
    readonly label: string
    readonly children: ReactNode
    readonly className?: string
  }
) {
  const dark = ground === "abyss" || ground === "arc"
  return (
    <figure
      data-ground={dark ? "dark" : undefined}
      className={cn(
        "flex min-h-[200px] flex-col justify-between gap-4 p-5",
        ground === "abyss" && "rounded-lg bg-abyss",
        ground === "arc" && "rounded-lg bg-arc",
        ground === "paper" && "bg-paper ruled",
        ground === "mist" && "bg-mist ruled",
        className
      )}
    >
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <figcaption className={cn("text-sm", dark ? "text-mesh-ink-2" : "text-ink-2")}>{label}</figcaption>
    </figure>
  )
}

/** A mis-render, struck through, with the word. */
function Wrong({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <figure className="relative flex min-h-[220px] flex-col justify-between gap-4 overflow-hidden bg-paper p-5 ruled">
      <div className="relative flex flex-1 items-center justify-center">
        {children}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <line
            x1="12"
            y1="88"
            x2="88"
            y2="12"
            stroke="var(--ink-3)"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <figcaption className="flex items-baseline gap-2 text-sm">
        <span className="font-medium text-ink">Niet</span>
        <span className="text-ink-2">{label}</span>
      </figcaption>
    </figure>
  )
}

/** The mark's construction: its 64-unit field, the three 38-unit squares, the 11-unit step, radius 7. */
function Construction() {
  const chalk = "color-mix(in oklch, var(--mesh-ink) 55%, transparent)"
  const faint = "color-mix(in oklch, var(--mesh-ink) 16%, transparent)"
  return (
    <div className="relative aspect-square w-full max-w-[520px]">
      <div className="absolute inset-[16.67%] [&_svg]:size-full">
        <InsyteMark size={64} tone="white" />
      </div>
      <svg aria-hidden viewBox="-16 -16 96 96" className="absolute inset-0 size-full overflow-visible">
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <line x1={i * 8} y1="-16" x2={i * 8} y2="80" stroke={faint} strokeWidth="0.15" />
            <line x1="-16" y1={i * 8} x2="80" y2={i * 8} stroke={faint} strokeWidth="0.15" />
          </g>
        ))}
        {/* Clear space: one offset step (11 units) all round. */}
        <rect
          x="-11"
          y="-11"
          width="86"
          height="86"
          fill="none"
          stroke={chalk}
          strokeWidth="0.25"
          strokeDasharray="1.2 1.2"
        />
        {[2, 13, 24].map((at) => (
          <rect key={at} x={at} y={at} width="38" height="38" rx="7" fill="none" stroke={chalk} strokeWidth="0.25" />
        ))}
        {/* The step, measured along the top. */}
        <g stroke={chalk} strokeWidth="0.25" fill="var(--mesh-ink)">
          <line x1="2" y1="-4" x2="13" y2="-4" />
          <line x1="2" y1="-5.5" x2="2" y2="-2.5" />
          <line x1="13" y1="-5.5" x2="13" y2="-2.5" />
          <line x1="13" y1="-4" x2="24" y2="-4" />
          <line x1="24" y1="-5.5" x2="24" y2="-2.5" />
          <line x1="66" y1="24" x2="66" y2="62" />
          <line x1="64.5" y1="24" x2="67.5" y2="24" />
          <line x1="64.5" y1="62" x2="67.5" y2="62" />
        </g>
        <g fill="var(--mesh-ink)" fontSize="2.6" fontFamily="var(--font-sans)">
          <text x="7.5" y="-6.5" textAnchor="middle">11</text>
          <text x="18.5" y="-6.5" textAnchor="middle">11</text>
          <text x="69" y="44" textAnchor="start">38</text>
          <text x="26" y="29" textAnchor="start">r 7</text>
          <text x="-10" y="-12.5" textAnchor="start">vrije ruimte: 11</text>
        </g>
      </svg>
    </div>
  )
}

const FILES = [
  {
    name: "insyte-mark-white.svg",
    href: "/brand/insyte-mark-white.svg",
    what: "Het beeldmerk, wit, 64 px. Voor op abyss, of op een abyss-tegel op papier.",
    from: "InsyteMark tone=\"white\", gerenderd met renderToStaticMarkup"
  },
  {
    name: "BRON.md",
    href: "/brand/BRON.md",
    what: "Waar het bestand vandaan komt en hoe het gemaakt is.",
    from: "apps/marketing/public/brand en apps/design/public/brand"
  }
] as const

export function LogoChapter() {
  return (
    <>
      <SectionPage
        chapter={C}
        id="beeldmerk"
        ground="abyss"
        status="Live"
        source="brand/marks.tsx · MarkDrift"
        body={
          <>
            <p>
              Drift: drie afgeronde vierkanten die telkens een stap verspringen. Het is het teken van de rail in de
              console, van inloggen, van de onboarding en van de site.
            </p>
            <p>Dit is het enige teken. Het wordt niet hertekend, en er is geen tweede.</p>
          </>
        }
        use={["Het merk: alleen, op abyss, of op een abyss-tegel op papier."]}
        avoid={["Een ander teken, een variant of een eigen versie van dit teken."]}
      >
        <InsyteMark size={240} tone="white" />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="lockup"
        status="Live"
        source="marketing/parts.tsx · Wordmark"
        body={
          <p>
            Het beeldmerk met "insyte" in General Sans medium, kleine letters, zoals de balk van de site en het
            inlogscherm het zetten. Op papier staat het teken op een abyss-tegel; op abyss staat het alleen.
          </p>
        }
        use={["Kop van een pagina, de balk, een afzender."]}
        avoid={["Het woord in hoofdletters, in een andere letter of los van het teken verschoven."]}
      >
        <div className="grid w-full max-w-[880px] gap-3 md:grid-cols-2">
          <Cell ground="paper" label="Op papier: het teken op zijn abyss-tegel">
            <Lockup tile={64} mark={46} text="text-4xl" />
          </Cell>
          <Cell ground="abyss" label="Op abyss: het teken alleen">
            <Lockup tile={64} text="text-4xl" dark />
          </Cell>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="tonen"
        status="Live"
        source="InsyteMark · tone"
        body={
          <p>
            Eén tekening in vier tonen. Wit op abyss is de standaard. Op papier en mist kan het teken in inkt of in
            abyss staan als het geen tegel krijgt. De merktoon met zichtbare strepen wordt niet gebruikt.
          </p>
        }
        use={["De toon die bij de grond hoort: wit op donker, inkt of abyss op licht."]}
        avoid={["Een kleur buiten deze tonen.", "De merktoon (tone=\"brand\") in de chrome."]}
      >
        <div className="grid w-full max-w-[1000px] grid-cols-2 gap-3 lg:grid-cols-3">
          <Cell ground="abyss" label="Wit op abyss, de standaard">
            <InsyteMark size={88} tone="white" />
          </Cell>
          <Cell ground="arc" label="Wit op arc">
            <InsyteMark size={88} tone="white" />
          </Cell>
          <Cell ground="paper" label="Op papier, op een abyss-tegel">
            <span className="flex size-[120px] items-center justify-center rounded-lg bg-abyss">
              <InsyteMark size={84} tone="white" />
            </span>
          </Cell>
          <Cell ground="paper" label="Abyss op papier (tone mono)">
            <InsyteMark size={88} tone="mono" />
          </Cell>
          <Cell ground="mist" label="Inkt op mist (tone ink)">
            <InsyteMark size={88} tone="ink" />
          </Cell>
          <Cell ground="mist" label="Merktoon: niet gebruikt" className="justify-center">
            <p className="max-w-[24ch] text-center text-ink-2 text-sm">
              De merktoon tekent drie strepen op het voorste vlak. De product-chrome gebruikt hem niet, dus dit boek ook
              niet.
            </p>
          </Cell>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="schalen"
        ground="paper"
        status="Live"
        body={
          <p>
            Het woordmerk loopt mee met de tegel: de letter is steeds de stap uit de schaal die het dichtst bij 0,625
            keer de tegel ligt. Kleiner dan 24 px zet je alleen het teken.
          </p>
        }
        use={["24 px in een lijst, 32 px in de balk, 64 px en groter op een omslag."]}
        avoid={["Het woordmerk onder 24 px.", "Een lettergrootte die niet uit de schaal komt."]}
      >
        <ol className="flex w-full max-w-[880px] flex-col">
          {LOCKUP.map((l) => (
            <li key={l.label} className="relative flex items-center justify-between gap-6 py-5">
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
              <span className="sr-only">Beeldmerk en woordmerk op {l.label}</span>
              <span aria-hidden>
                <Lockup tile={l.tile} mark={l.mark} text={l.text} />
              </span>
              <span aria-hidden className="text-ink-3 text-sm tabular-nums">{l.label}</span>
            </li>
          ))}
        </ol>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="app-icoon"
        status="Live"
        body={
          <p>
            Als app-icoon en favicon staat het teken op een abyss-tegel, zoals op de rail. De tegel volgt de hoekladder:
            tegel boven 40 px, control eronder. Tot 16 px blijft de tekening leesbaar.
          </p>
        }
        use={["App-icoon 180 px, favicon 48, 32 en 16 px."]}
        avoid={["Het teken zonder tegel als favicon: de browserbalk is niet altijd licht."]}
      >
        <div className="flex flex-wrap items-end justify-center gap-8">
          {[
            { size: 180, mark: 124, r: "rounded-xl" },
            { size: 64, mark: 44, r: "rounded-lg" },
            { size: 48, mark: 34, r: "rounded-lg" },
            { size: 32, mark: 22, r: "rounded-md" },
            { size: 16, mark: 12, r: "rounded-sm" }
          ].map((t) => (
            <figure key={t.size} className="flex flex-col items-center gap-3">
              <span
                className={cn("flex items-center justify-center bg-abyss", t.r)}
                style={{ width: t.size, height: t.size }}
              >
                <InsyteMark size={t.mark} tone="white" />
              </span>
              <figcaption className="text-ink-3 text-sm tabular-nums">{t.size} px</figcaption>
            </figure>
          ))}
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="constructie"
        ground="abyss"
        status="Live"
        body={
          <>
            <p>
              Een veld van 64 eenheden. Drie vierkanten van 38, elk 11 verschoven, met een hoek van 7. De verschuiving
              is ook de maat voor de vrije ruimte: 11 eenheden rondom, ongeveer een zesde van het teken.
            </p>
            <p>Het kleinste formaat is 16 px; het woordmerk vanaf 24 px.</p>
          </>
        }
        use={["De maat om het teken van tekst en randen te houden."]}
        avoid={["Iets binnen de stippellijn."]}
      >
        <Construction />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="niet"
        ground="mist"
        body={<p>Het teken is af. Alles wat het verandert, maakt er een ander teken van.</p>}
        avoid={["Herkleuren buiten de tonen.", "Uitrekken of draaien.", "Effecten erop.", "Een ander teken als logo."]}
      >
        <div className="grid w-full max-w-[1000px] grid-cols-2 gap-3 lg:grid-cols-4">
          <Wrong label="herkleurd">
            <MarkDrift size={96} tone="mono" color="var(--arc-soft)" />
          </Wrong>
          <Wrong label="uitgerekt">
            <span className="inline-block scale-x-150">
              <InsyteMark size={88} tone="mono" />
            </span>
          </Wrong>
          <Wrong label="gedraaid">
            <span className="inline-block rotate-[18deg]">
              <InsyteMark size={88} tone="mono" />
            </span>
          </Wrong>
          <Wrong label="een ander teken">
            <span className="flex size-24 items-center justify-center rounded-lg bg-abyss text-mesh-ink">
              <Sparkle size={52} />
            </span>
          </Wrong>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="bestanden"
        ground="paper"
        body={
          <>
            <p>
              Alleen bestanden die echt bestaan. Alles hierboven wordt uit het component gerenderd, niet uit een
              plaatje.
            </p>
            <p>
              Open punten, niet in deze ronde: de verloop-highlight (TopLight) uit het teken halen, de twee azuurtinten
              van de achterste lagen als token vastleggen, en de favicon van de referentie, die nog een oudere tekening
              met strepen is.
            </p>
          </>
        }
        use={["Het witte teken voor een document of een externe pagina."]}
        avoid={["Logo's van derden doorgeven: die zijn niet van ons."]}
      >
        <ul className="flex w-full max-w-[760px] flex-col gap-2">
          {FILES.map((f) => (
            <li key={f.name} className="flex items-center gap-5 bg-mist p-4 ruled">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-abyss">
                {f.name.endsWith(".svg") ?
                  <img src={f.href} alt="" width={36} height={36} /> :
                  <span className="text-mesh-ink-2 text-xs">md</span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-base text-ink">{f.name}</span>
                <span className="text-ink-2 text-sm">{f.what}</span>
                <span className="text-ink-3 text-xs">{f.from}</span>
              </span>
              <a
                href={f.href}
                download
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm transition-colors hover:bg-abyss-2"
              >
                <Download size={15} />
                Downloaden
              </a>
            </li>
          ))}
        </ul>
      </SectionPage>
    </>
  )
}
