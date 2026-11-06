import { text, type TextToken } from "@insyte/tokens/tokens"
import { RuleSheet, SectionPage } from "../page.tsx"

/*
 * 04 Typografie. General Sans for everything read, Archivo at 88% width for figures and plate
 * numbers only, and the eleven steps of `text` in `tokens.ts`, each shown at its own size, line
 * height and tracking.
 */

const C = "typografie" as const

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" })

/** The utility for each step, written out so Tailwind sees every class. */
const CLASS: Record<TextToken, string> = {
  "2xs": "text-2xs",
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  md: "text-md",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
  "5xl": "text-5xl"
}

const ROLE: Record<TextToken, string> = {
  "2xs": "Een telling in een badge, een streepje op een as. Nooit lopende tekst.",
  xs: "Kolomkoppen, tijden, eenheden.",
  sm: "Dichte rijen, chips, menu-items, knoppen.",
  base: "De standaard: lopende tekst en invoer.",
  md: "Eén zin onder een titel. De grootste stap in 400.",
  lg: "Een kop binnen een pagina of dialoog.",
  xl: "De paginatitel. Eén per scherm.",
  "2xl": "Titel van een dialoog, label bij een groot cijfer.",
  "3xl": "Het cijfer van een scherm.",
  "4xl": "Tussen het cijfer en het monument.",
  "5xl": "Het monumentale cijfer, in de cijferletter."
}

const STEPS = Object.keys(text) as ReadonlyArray<TextToken>

const RULES = [
  {
    title: "Geen mono",
    body:
      "Cijfers staan onder elkaar omdat ze tabular-nums zijn op de schreefloze letter, niet omdat ze een typemachine dragen."
  },
  {
    title: "Schaal of niets",
    body: "Elf stappen en niets ertussen. Een halve pixel is een waarde die geduwd is tot één scherm klopte."
  },
  {
    title: "Twee plekken",
    body: "De cijferletter staat op het monumentale cijfer en op plaatnummers. Nergens anders."
  },
  {
    title: "Zinsletters",
    body: "Alleen het eerste woord met een hoofdletter: in koppen, knoppen, kolommen en menu's."
  },
  {
    title: "Geen kopje boven de kop",
    body: "Geen label in kapitalen boven een kop, geen kicker. De kop draagt zijn eigen gewicht."
  },
  {
    title: "Gewicht boven grootte",
    body: "400 voor tekst, 500 voor koppen, labels en knoppen, 600 alleen voor een dialoogtitel."
  }
] as const

export function TypografieChapter() {
  return (
    <>
      <SectionPage
        chapter={C}
        id="lettertype"
        ground="mist"
        status="Live"
        source="tokens.ts · fonts.sans"
        body={
          <p>
            General Sans voor alles wat je leest: een neutrale, iets smalle schreefloze letter, strak gezet. Inter
            Variable vangt op waar General Sans niet laadt.
          </p>
        }
        use={["400 voor tekst, 500 voor koppen en knoppen."]}
        avoid={["Een tweede letter voor tekst.", "Letterspatiëring open zetten."]}
      >
        <div className="grid w-full max-w-[1000px] items-end gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-4">
            <span className="font-medium text-5xl text-ink sm:text-display">General Sans</span>
            <span className="flex gap-6 text-ink-2 text-sm">
              <span>Regular 400</span>
              <span className="font-medium">Medium 500</span>
              <span className="font-semibold">Semibold 600</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 text-3xl text-ink-2">
            <span>ABCDEFGHIJKLM NOPQRSTUVWXYZ</span>
            <span>abcdefghijklm nopqrstuvwxyz</span>
            <span className="tabular-nums">0123456789 € % &amp; ?</span>
          </div>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="cijfers"
        ground="abyss"
        status="Live"
        source="tokens.ts · fonts.display"
        body={
          <>
            <p>
              Archivo, op 88 procent breedte: monolijn en smal, zoals de letters op een technische tekening. Alleen voor
              het monumentale cijfer en voor plaatnummers.
            </p>
            <p>Bedragen in tekst zijn General Sans met tabular-nums, via Intl in nl-NL.</p>
          </>
        }
        use={["Het ene grote cijfer van een scherm, een plaatnummer."]}
        avoid={["Archivo voor koppen of lopende tekst."]}
      >
        <div className="grid w-full max-w-[1000px] items-end gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <span className="figure text-plate text-mesh-ink">{eur.format(172_855).replace(",00", "")}</span>
          <ol className="flex flex-col text-mesh-ink-2 text-lg">
            {[248, 612.4, 89.95, 1_594.2, 35].map((v) => (
              <li key={v} className="flex justify-between gap-8 py-1.5 shadow-[inset_0_-1px_0_var(--mesh-hairline)]">
                <span>Bestelling</span>
                <data value={v} className="text-mesh-ink tabular-nums">{eur.format(v)}</data>
              </li>
            ))}
          </ol>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="schaal"
        ground="paper"
        status="Live"
        source="tokens.ts · text"
        tall
        body={
          <p>
            Elf vaste stappen met een verhouding van ongeveer 1,15. Elke stap draagt zijn eigen regelhoogte en
            spatiëring, dus je vraagt om een rol, niet om drie waarden. Daarboven twee stappen voor de site.
          </p>
        }
        use={["De rol: text-sm voor een rij, text-lg voor een kop."]}
        avoid={["text-[12.5px] of een eigen tracking."]}
      >
        <ol className="flex w-full max-w-[1040px] flex-col py-6">
          {STEPS.map((k) => (
            <li
              key={k}
              className="relative grid items-baseline gap-x-6 gap-y-1 py-4 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,16rem)]"
            >
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
              <span className="text-ink-3 text-sm tabular-nums">
                {k} · {text[k].size}/{text[k].line}
              </span>
              <span aria-hidden className={`${CLASS[k]} truncate text-ink ${k === "5xl" ? "figure" : ""}`}>
                {k === "5xl" ? eur.format(172_855).replace(",00", "") : "Drie bestellingen dreigen te laat te komen"}
              </span>
              <span className="text-ink-2 text-sm">{ROLE[k]}</span>
            </li>
          ))}
          {[
            { k: "display-sm", cls: "text-display-sm", spec: "48/50", role: "Een sectiekop op de site." },
            { k: "display", cls: "text-display", spec: "72/72", role: "De kop van een hero op de site." }
          ].map((d) => (
            <li
              key={d.k}
              className="relative grid items-baseline gap-x-6 gap-y-1 py-4 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,16rem)]"
            >
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
              <span className="text-ink-3 text-sm tabular-nums">{d.k} · {d.spec}</span>
              <span aria-hidden className={`${d.cls} truncate font-medium text-ink`}>Binnen jouw regels</span>
              <span className="text-ink-2 text-sm">{d.role}</span>
            </li>
          ))}
        </ol>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="koppen"
        ground="glacier"
        grounds={["glacier", "abyss"]}
        status="Live"
        body={
          <p>
            Een kop in twee tonen: de stelling in inkt, de tweede zin in de stille inkt. Een sleutelwoord mag in
            arc-ink, en dat is de enige kleur die een woord krijgt.
          </p>
        }
        use={["Een hero, een sectiekop op de site, een hoofdstuk."]}
        avoid={["Een woord in een andere kleur dan arc-ink.", "Verlopen tekst."]}
      >
        {(s) => (
          <div className="flex w-full max-w-[860px] flex-col">
            <span
              className={`font-medium text-4xl sm:text-display ${s.ground === "abyss" ? "text-mesh-ink" : "text-ink"}`}
            >
              De back-end van je{" "}
              <span className={s.ground === "abyss" ? "text-mesh-ink" : "text-arc-ink"}>dropshipstore.</span>
            </span>
            <span
              className={`font-medium text-4xl sm:text-display ${
                s.ground === "abyss" ? "text-mesh-ink-2" : "text-ink-3"
              }`}
            >
              Het werk, binnen jouw regels.
            </span>
          </div>
        )}
      </SectionPage>

      <SectionPage
        chapter={C}
        id="regels"
        ground="mist"
        body={
          <p>
            Zes regels die elke pagina en elk scherm dragen. Ze zijn in de tests vastgelegd waar een grep ze kan vinden.
          </p>
        }
      >
        <RuleSheet rules={RULES} />
      </SectionPage>
    </>
  )
}
