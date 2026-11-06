import { pattern, radius, type RadiusToken } from "@insyte/tokens/tokens"
import type { ReactNode } from "react"
import { Button } from "../../../components/button.tsx"
import { ChevronDown, Filter, X } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import { TitleBlock } from "../../../marketing/pages/shell.tsx"
import { InsyteMark } from "../../mark.tsx"
import { PillBar, SectionPage } from "../page.tsx"
import { PlateDrawing } from "./beweging.tsx"

/*
 * 05 Patronen & oppervlakken: the drawing language every page is made in. The drafting grid and
 * the Drift hatch from `pattern` in tokens.ts, the plate, the construction frame and title block of
 * the marketing pages, the four hero forms, how grounds follow each other, the radius ladder on
 * its real surfaces, depth, and one note on density.
 */

const C = "patronen" as const

function Swatch(
  { className, label, dark = false, children }: {
    readonly className: string
    readonly label: string
    readonly dark?: boolean
    readonly children?: ReactNode
  }
) {
  return (
    <figure className="flex flex-col gap-3">
      <div
        data-ground={dark ? "dark" : undefined}
        className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg", className)}
      >
        {children}
      </div>
      <figcaption className="text-ink-2 text-sm">{label}</figcaption>
    </figure>
  )
}

/** Four hero forms, drawn as their outlines: the block, the notch, the panel, the form card. */
function HeroForm({ form }: { readonly form: "notch" | "light" | "split" | "form" }) {
  const line = "var(--ink-3)"
  return (
    <svg viewBox="0 0 160 100" aria-hidden className="w-full">
      {form === "notch"
        ? (
          <path
            d="M4 10 Q4 4 10 4 H66 Q72 4 72 10 V12 Q72 18 78 18 H82 Q88 18 88 12 V10 Q88 4 94 4 H150 Q156 4 156 10 V90 Q156 96 150 96 H10 Q4 96 4 90 Z"
            fill="var(--abyss)"
          />
        )
        : (
          <rect
            x="4"
            y="4"
            width="152"
            height="92"
            rx="6"
            fill={form === "split" ? "var(--mist)" : "var(--glacier)"}
            stroke="var(--hairline)"
          />
        )}
      <g fill={form === "notch" ? "var(--mesh-ink)" : "var(--ink)"}>
        <rect x="14" y="30" width="56" height="7" rx="1.5" />
        <rect x="14" y="41" width="40" height="7" rx="1.5" opacity="0.5" />
        <rect x="14" y="56" width="34" height="9" rx="4.5" opacity="0.85" />
      </g>
      {form === "split" ? <rect x="84" y="14" width="62" height="72" rx="4" fill="var(--abyss)" /> : null}
      {form === "form"
        ? <rect x="84" y="44" width="62" height="56" rx="4" fill="var(--paper)" stroke={line} strokeWidth="0.5" />
        : null}
      {form === "notch" ? <rect x="44" y="72" width="72" height="28" rx="3" fill="var(--paper)" /> : null}
    </svg>
  )
}

const FORMS = [
  {
    form: "notch",
    name: "Inkeping",
    use: "Abyss, met een uitsparing bovenin; een render komt uit de voet. /oplossingen."
  },
  {
    form: "light",
    name: "Licht",
    use: "Mist of glacier met het inktraster. /vragen, /prijzen, de juridische pagina's."
  },
  { form: "split", name: "Gedeeld", use: "Licht, met rechts een abyss-paneel met één productmoment. /product/*." },
  { form: "form", name: "Formulier", use: "Rustig glacier; de formulierkaart overlapt de voet. /toegang." }
] as const

const SEQUENCE = [
  { g: "bg-paper hairline", name: "Balk, papier" },
  { g: "bg-abyss", name: "Hero, abyss" },
  { g: "bg-paper hairline", name: "Stelling, papier" },
  { g: "bg-glacier", name: "Bento, glacier" },
  { g: "bg-paper hairline", name: "Rondleiding, papier" },
  { g: "bg-glacier", name: "Bouwer, glacier" },
  { g: "bg-abyss", name: "Koppelingen, abyss" },
  { g: "bg-paper hairline", name: "Prijzen, papier" },
  { g: "bg-glacier", name: "Vragen, glacier" },
  { g: "bg-abyss", name: "Slot, abyss" }
] as const

const RADIUS_USE: Record<RadiusToken, string> = {
  pill: "Alleen statuspillen. Een pil is nooit een knop.",
  chip: "Chips en de kleinste bediening.",
  control: "Alles wat je bedient: knoppen, velden, menu-items.",
  tile: "Tegels, panelen, het kader om een tabel.",
  "tile-hero": "Een hero, een dialoog. Niets kleiners."
}

function RadiusSpecimen({ k }: { readonly k: RadiusToken }) {
  if (k === "pill") {
    return (
      <span className="inline-flex h-6 items-center rounded-full bg-arc-tint px-2.5 text-arc-ink text-xs">Open</span>
    )
  }
  if (k === "chip") {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-arc-tint pr-1.5 pl-2 text-arc-ink text-xs">
        Status: open
        <X size={12} />
      </span>
    )
  }
  if (k === "control") {
    return (
      <Button variant="outline" size="sm">
        <Filter />
        Filter
        <ChevronDown />
      </Button>
    )
  }
  if (k === "tile") return <span className="block h-16 w-28 rounded-lg panel" />
  return <span className="block h-20 w-32 rounded-xl panel-raised" />
}

export function PatronenChapter() {
  return (
    <>
      <SectionPage
        chapter={C}
        id="raster"
        ground="glacier"
        status="Live"
        source={`tokens.ts · pattern.grid (${pattern.grid})`}
        body={
          <p>
            Het tekenraster van{" "}
            {pattern.grid}: de ondergrond van een plaat en van elk abyss-vlak op de site. Krijt op abyss, inkt op licht,
            op een paar procent, en met een masker uitgefaded naar de tekst.
          </p>
        }
        use={["De grond van een plaat, een hero, een abyss-sectie."]}
        avoid={["Het raster vol op het canvas van de console.", "Een raster op een andere maat."]}
      >
        <div className="grid w-full max-w-[920px] gap-4 sm:grid-cols-2">
          <Swatch className="bg-abyss drafting-chalk" dark label="Krijt op abyss">
            <span className="text-mesh-ink-2 text-sm">{pattern.grid}</span>
          </Swatch>
          <Swatch className="bg-mist drafting-ink" label="Inkt op mist">
            <span className="text-ink-3 text-sm">{pattern.grid}</span>
          </Swatch>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="arcering"
        ground="paper"
        status="Live"
        source={`tokens.ts · pattern.hatch (${pattern.hatch})`}
        body={
          <p>
            De Drift-arcering is het teken zelf, als patroon: drie verspringende punten per veld van{" "}
            {pattern.hatch}, op de stap waarmee de vierkanten van het merk verspringen. Het vult een vak dat niets te
            zeggen heeft.
          </p>
        }
        use={["De band van een lege pagina, de voet van een paneel, een hoek van een hero."]}
        avoid={["Een icoon in een cirkel als vulling.", "De arcering achter tekst."]}
      >
        <div className="grid w-full max-w-[1000px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Swatch className="bg-mist" label="Afgeleid van het merk">
            <span className="flex items-center gap-4">
              <InsyteMark size={44} tone="mono" />
              <svg viewBox="0 0 24 24" width={72} height={72} aria-hidden>
                <rect
                  x="0.5"
                  y="0.5"
                  width="23"
                  height="23"
                  fill="none"
                  stroke="var(--hairline-strong)"
                  strokeDasharray="1 1"
                />
                <circle cx="4" cy="4" r="1.6" fill="var(--ink)" fillOpacity="0.5" />
                <circle cx="12" cy="12" r="1.6" fill="var(--ink)" fillOpacity="0.35" />
                <circle cx="20" cy="20" r="1.6" fill="var(--ink)" fillOpacity="0.22" />
              </svg>
            </span>
          </Swatch>
          <Swatch className="bg-mist hatch" label="Inkt, in de console" />
          <Swatch className="bg-abyss hatch-chalk" dark label="Krijt, op de site" />
          <Swatch className="plate hatch-on-plate" dark label="Op een plaat" />
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="plaat"
        ground="abyss"
        status="Live"
        source="app/app.css · plate, unroll, draw, plate-scan"
        motion
        replay
        body={
          <>
            <p>
              Een voorstel getekend voordat het een record is: abyss, krijtlijnen, het raster, maat- en leiderlijnen
              waarin elk teken iets meet, en het titelblok aan de voet, waar een technische tekening het zet.
            </p>
            <p>Eén vage lijn loopt omlaag over de plaat: de enige sfeerbeweging in het product.</p>
          </>
        }
        use={["Wat de agent eerst vraagt: een voorstel dat nog niet is uitgevoerd."]}
        avoid={["Een plaat voor iets dat al een record is: dat staat op papier."]}
      >
        <PlateDrawing />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="constructie"
        ground="paper"
        status="Live"
        source="marketing/frame.tsx · pages/shell.tsx"
        replay
        body={
          <p>
            Elke sectie van de site tekent dezelfde lijnen: twee gestippelde rails langs de kolom, een gestippelde lijn
            over de volle breedte bovenaan, en een klein kruis waar ze elkaar raken. Aan de voet van een hero staat een
            titelblok.
          </p>
        }
        use={["De rand van een sectie, de cellen van een vergelijking, het titelblok."]}
        avoid={["Een doorgetrokken rand om een sectie of een kaart."]}
      >
        <div className="flex w-full max-w-[920px] flex-col gap-10">
          <div className="relative h-56 rounded-lg bg-glacier">
            <span aria-hidden className="absolute inset-x-0 top-12 h-px dash-x" />
            <div className="rails-ink absolute inset-y-0 right-16 left-16">
              {(["left", "right"] as const).map((side) => (
                <span
                  key={side}
                  aria-hidden
                  className={cn("absolute top-[43px] size-[11px]", side === "left" ? "-left-[5px]" : "-right-[5px]")}
                >
                  <span className="absolute top-[5px] left-0 h-px w-full bg-ink/30" />
                  <span className="absolute top-0 left-[5px] h-full w-px bg-ink/30" />
                </span>
              ))}
              <div className="flex h-full flex-col justify-center gap-2 px-6 pt-8">
                <span className="font-medium text-2xl text-ink">Een sectie, met haar rails</span>
                <span className="text-ink-3 text-sm">dash-x · rails-ink · kruis 11 px</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <TitleBlock
              dark={false}
              fields={[
                { label: "Pagina", value: "Koppelingen" },
                { label: "Diensten", value: "28" },
                { label: "Soort", value: "Kern, via de API" },
                { label: "Bijgewerkt", value: "1 nov 2026" }
              ]}
            />
          </div>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="helden"
        ground="glacier"
        status="Live"
        source="marketing/pages/shell.tsx · PageHero, HeroBar"
        body={
          <p>
            Eén familie in vier vormen, elk een afgerond blok onder de balk, met een kop in twee tonen, één zin, de
            acties als pillenbalk en een titelblok aan de voet. De grond beweegt niet.
          </p>
        }
        use={["Een vorm die verschilt van die van de buurpagina."]}
        avoid={["Een bewegende achtergrond: die wordt eerst in het lab getest."]}
      >
        <div className="flex w-full max-w-[1040px] flex-col gap-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FORMS.map((f) => (
              <figure key={f.form} className="flex flex-col gap-3">
                <HeroForm form={f.form} />
                <figcaption className="flex flex-col gap-1">
                  <span className="font-medium text-ink text-sm">{f.name}</span>
                  <span className="text-ink-2 text-sm">{f.use}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-center bg-mist p-6 ruled">
              <PillBar
                primary={{ href: "/site/toegang", label: "Toegang aanvragen" }}
                secondary={{ href: "/site/vragen", label: "Vragen" }}
              />
            </div>
            <div data-ground="dark" className="flex items-center justify-center rounded-lg bg-abyss p-6">
              <PillBar
                dark
                primary={{ href: "/site/toegang", label: "Toegang aanvragen" }}
                secondary={{ href: "/site/vragen", label: "Vragen" }}
              />
            </div>
          </div>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="gronden"
        ground="mist"
        body={
          <p>
            Een pagina is een reeks vlakken. Papier en glacier dragen het lezen; abyss komt terug als hoofdstuk en als
            slot. Zo loopt de homepage, van boven naar beneden.
          </p>
        }
        use={["Een wissel van grond om een nieuwe sectie te beginnen."]}
        avoid={["Twee abyss-secties naast elkaar.", "Een verloop tussen twee gronden."]}
      >
        <ol className="flex w-full max-w-[640px] flex-col gap-1">
          {SEQUENCE.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex items-center gap-4">
              <span className="w-6 text-right text-ink-3 text-xs tabular-nums">{i + 1}</span>
              <span className={cn("block h-7 flex-1 rounded-sm", s.g)} />
              <span className="w-44 text-ink-2 text-sm">{s.name}</span>
            </li>
          ))}
        </ol>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="hoeken"
        ground="glacier"
        status="Live"
        source="tokens.ts · radius"
        body={
          <p>
            Vijf hoeken, elk met één taak, en geen zesde. Tailwinds sm, md, lg en xl zijn op deze vijf gelegd, dus
            rounded-md is de hoek van een knop.
          </p>
        }
        use={["De hoek die bij de rol hoort."]}
        avoid={["Een hoek groter dan 16 px, of een maat tussen twee stappen."]}
      >
        <ol className="grid w-full max-w-[1040px] gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(radius) as ReadonlyArray<RadiusToken>).map((k) => (
            <li key={k} className="flex flex-col gap-4 rounded-lg bg-mist p-5">
              <span className="flex h-24 items-center justify-center">
                <RadiusSpecimen k={k} />
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-ink text-sm">{k}</span>
                <span className="text-ink-3 text-xs tabular-nums">{radius[k] === "9999px" ? "rond" : radius[k]}</span>
              </span>
              <span className="text-ink-2 text-sm">{RADIUS_USE[k]}</span>
            </li>
          ))}
        </ol>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="diepte"
        ground="glacier"
        status="Live"
        body={
          <p>
            Plat, met één uitzondering. Een paneel is een vlak en een randje, zonder schaduw. Alleen wat de pagina echt
            verlaat, een menu, een dialoog, het productvenster, krijgt een schaduw: met afstand en een zachte val, nooit
            een gloed.
          </p>
        }
        use={["panel voor een vlak, panel-raised voor een menu, window-lift voor het productvenster."]}
        avoid={["Een schaduw om een paneel te laten opvallen.", "Een gekleurde gloed."]}
      >
        <div className="grid w-full max-w-[920px] gap-6 sm:grid-cols-3">
          {[
            { cls: "panel", name: "panel", use: "Een vlak op het canvas" },
            { cls: "panel-raised", name: "panel-raised", use: "Een menu, een dialoog" },
            { cls: "bg-paper window-lift", name: "window-lift", use: "Het productvenster op de site" }
          ].map((d) => (
            <figure key={d.name} className="flex flex-col gap-3">
              <span className={cn("block aspect-[4/3] rounded-lg", d.cls)} />
              <figcaption className="flex flex-col">
                <span className="font-medium text-ink text-sm">{d.name}</span>
                <span className="text-ink-2 text-sm">{d.use}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="dichtheid"
        ground="mist"
        body={
          <p>
            Tabellen lopen strak, een hero ademt. Een rij is 36 px met tekst op 13 px; een hero heeft ruimte om zich
            heen. Het ritme tussen die twee is de persoonlijkheid.
          </p>
        }
        use={["Dichtheid waar dozijnen rijen gelezen worden."]}
        avoid={["Overal dezelfde ruimte."]}
      >
        <div className="grid w-full max-w-[1000px] items-center gap-6 md:grid-cols-2">
          <div className="bg-paper ruled">
            <div className="flex h-8 items-center bg-mist px-3 text-ink-3 text-xs">Bestelling · Klant · Bedrag</div>
            {[
              "#2049 · Sanne de Vries · € 89,95",
              "#2048 · Tom Bakker · € 612,40",
              "#2047 · Eva Smit · € 35,00",
              "#2046 · Noah Visser · € 248,00"
            ].map((
              r,
              i
            ) => (
              <div
                key={r}
                className={cn("flex h-9 items-center px-3 text-ink-2 text-sm tabular-nums", i % 2 === 1 && "bg-mist")}
              >
                {r}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4 rounded-lg bg-glacier p-10">
            <span className="font-medium text-3xl text-ink">
              Een hero ademt.
              <span className="block text-ink-3">Een tabel niet.</span>
            </span>
          </div>
        </div>
      </SectionPage>
    </>
  )
}
