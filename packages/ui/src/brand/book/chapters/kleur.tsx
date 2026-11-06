import { contrast, oklchToHex, oklchToRgb } from "@insyte/tokens/color"
import { colors, type ColorToken, darkColors, pairs } from "@insyte/tokens/tokens"
import { useState } from "react"
import { cn } from "../../../lib/utils.ts"
import { Pair, RuleSheet, SectionPage, Seg } from "../page.tsx"

/*
 * 03 Kleur, read from `tokens.ts`: every value, hex, RGB and contrast ratio on these pages is
 * computed from the token at render time, so the page cannot disagree with the product.
 *
 * What is left out on purpose: `sky` and `powder` (the mesh's atmosphere, product only and being
 * retired), the six person colours (told apart in the product, never read), and green except as
 * one small product-only signal pair.
 */

const C = "kleur" as const

const nl = (n: number, d = 2) => n.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d })

const DARK_FIELDS: ReadonlySet<ColorToken> = new Set(["arc", "abyss", "abyss-2", "ink", "ink-2", "ink-3", "arc-ink"])

const fg = (k: ColorToken) => (DARK_FIELDS.has(k) ? "text-mesh-ink" : "text-ink")
const fg2 = (k: ColorToken) => (DARK_FIELDS.has(k) ? "text-mesh-ink-2" : "text-ink-2")

/** What each colour is for, in Dutch; keyed by token so a renamed token fails the typecheck. */
const JOB: Partial<Record<ColorToken, string>> = {
  glacier: "Het canvas, de grond achter alles.",
  mist: "Een vlak dat van het canvas loskomt.",
  paper: "Het helderste vlak: panelen, menu's, rijen.",
  "arc-tint": "De informatieve tint: waar het product iets voorstelt.",
  "arc-soft": "Alleen de buitenste focusgloed.",
  arc: "Elk interactief moment. Een vlak, nooit tekst.",
  "arc-ink": "Het merk als tekst: links, actieve tabs.",
  "abyss-2": "Abyss bij hover.",
  abyss: "De donkere grond: de plaat, de rail, de hoofdknop.",
  ink: "Lopende tekst."
}

const PALETTE: ReadonlyArray<ColorToken> = [
  "glacier",
  "mist",
  "paper",
  "arc-tint",
  "arc-soft",
  "arc",
  "abyss-2",
  "abyss"
]
const RAMP: ReadonlyArray<ColorToken> = ["ink", "ink-2", "ink-3", "ink-4", "ink-5", "hairline-strong", "hairline"]
const ON_DARK: ReadonlyArray<ColorToken> = ["mesh-ink", "mesh-ink-2", "mesh-ink-3", "mesh-hairline"]

const rgb = (k: ColorToken) => {
  const { r, g, b } = oklchToRgb(colors[k])
  return [r, g, b].map((v) => Math.round(v * 255)).join(" ")
}

function Column({ k }: { readonly k: ColorToken }) {
  return (
    <div
      className={cn("flex min-h-[280px] flex-col justify-end gap-1 p-3 lg:min-h-[420px]", k === "paper" && "hairline")}
      style={{ background: `var(--${k})` }}
    >
      <span className={cn("font-medium text-sm", fg(k))}>{k}</span>
      {JOB[k] === undefined ? null : <span className={cn("mb-2 text-xs", fg2(k))}>{JOB[k]}</span>}
      <span className={cn("text-xs tabular-nums", fg2(k))}>{oklchToHex(colors[k]).toUpperCase()}</span>
      <span className={cn("text-xs tabular-nums", fg2(k))}>RGB {rgb(k)}</span>
      <span className={cn("text-xs tabular-nums", fg2(k))}>{colors[k].slice(6, -1)}</span>
    </div>
  )
}

function Ramp({ tokens, dark = false }: { readonly tokens: ReadonlyArray<ColorToken>; readonly dark?: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tokens.length}, minmax(0, 1fr))` }}>
      {tokens.map((k) => (
        <div key={k} className="flex flex-col gap-2">
          <span className="block h-14" style={{ background: `var(--${k})` }} />
          <span className={cn("text-xs", dark ? "text-mesh-ink" : "text-ink")}>{k}</span>
          <span className={cn("text-xs tabular-nums", dark ? "text-mesh-ink-2" : "text-ink-3")}>
            {oklchToHex(colors[k]).toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  )
}

function Ratio({ on, ink }: { readonly on: ColorToken; readonly ink: ColorToken }) {
  const r = contrast(colors[on], colors[ink])
  return (
    <span className="tabular-nums">
      {nl(r)}:1 {r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA groot" : "te laag"}
    </span>
  )
}

const SHOWN_PAIRS = pairs.filter(([a, b]) =>
  !a.startsWith("person") && !a.startsWith("signal") && !b.startsWith("signal")
)

const RULES = [
  {
    title: "Eén tint",
    body: "Productvlakken dragen precies één kleurfamilie: tint 270. De inkt heeft chroma 0, in beide thema's."
  },
  {
    title: "Arc is staat",
    body: "Arc betekent interactie en merk. Geen arc-achtergronden als versiering, geen arc-icoon dat geen knop is."
  },
  { title: "Drie inkten", body: "Alleen ink, ink-2 en ink-3 dragen tekst. Ink-4 en ink-5 zijn lijnen en streepjes." },
  {
    title: "Vaste velden",
    body: "Een identiteitsveld (arc, abyss) houdt zijn waarde in beide thema's, en de inkt erop staat vast."
  },
  {
    title: "Woord bij de kleur",
    body: "Een status is een signaalinkt op zijn eigen tint, en een woord. Kleur is nooit het enige signaal."
  },
  {
    title: "Geen zwart, geen gloed",
    body: "Donker is abyss. Niets massief wit op abyss, geen roze of groen, geen gloed en geen verloop."
  }
] as const

export function KleurChapter() {
  const [night, setNight] = useState<"Dag" | "Nacht">("Dag")
  const map: Record<string, string> = night === "Dag" ? colors : darkColors
  return (
    <>
      <SectionPage
        chapter={C}
        id="palet"
        ground="paper"
        status="Live"
        source="tokens.ts · colors"
        tall
        body={
          <p>
            Royal Azure op neutraal grijs. Bovenaan de vlakken en het merk, eronder de inkt. Elke waarde hier wordt uit
            het token berekend: OKLCH is de bron, hex en RGB volgen eruit.
          </p>
        }
        use={["Deze waarden, en geen andere."]}
        avoid={[
          "Een kleur die niet in tokens.ts staat.",
          "Sky en powder: sfeer, alleen in het product (wordt uitgefaseerd)."
        ]}
      >
        <div className="flex w-full flex-col gap-8 py-6">
          <div className="grid grid-cols-2 overflow-hidden rounded-lg sm:grid-cols-4 lg:grid-cols-8">
            {PALETTE.map((k) => <Column key={k} k={k} />)}
          </div>
          <Ramp tokens={RAMP} />
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="oppervlakken"
        ground="glacier"
        status="Live"
        source="families · Surfaces"
        body={
          <p>
            Glacier, dan mist, dan papier. Een gebied begint waar het vlak verandert, niet waar een lijn staat. Een
            haarlijn is alleen voor een datagrens: een rij, een invoerveld.
          </p>
        }
        use={["Een vlakwissel om twee gebieden te scheiden."]}
        avoid={["Een rand om een sectie, een kaart of een kop."]}
      >
        <div className="grid w-full max-w-[880px] grid-cols-[1fr_2fr] gap-0 ruled">
          <div className="flex flex-col gap-2 bg-mist p-5">
            <span className="font-medium text-ink text-sm">mist</span>
            {["Bestellingen", "Klanten", "Producten", "Leveranciers"].map((t, i) => (
              <span
                key={t}
                className={cn("rounded-md px-2 py-1.5 text-sm", i === 0 ? "bg-arc-tint text-arc-ink" : "text-ink-2")}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-3 bg-glacier p-5">
            <span className="font-medium text-ink text-sm">glacier</span>
            <div className="flex flex-col overflow-hidden rounded-lg bg-paper">
              <span className="px-4 py-3 font-medium text-ink text-sm">paper</span>
              {["#2049 · Northwind EU", "#2048 · Northwind US", "#2047 · Northwind UK"].map((r, i) => (
                <span
                  key={r}
                  className={cn("flex justify-between px-4 py-2.5 text-ink-2 text-sm", i % 2 === 0 && "bg-mist")}
                >
                  {r}
                  <span className="tabular-nums">€ {nl(89.95 + i * 41)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="inkt"
        ground="paper"
        status="Live"
        body={
          <p>
            Vijf grijzen zonder tint. De eerste drie dragen tekst: lopende tekst, de middelste nadruk en elk bijschrift.
            De laatste twee zijn tekens, geen tekst.
          </p>
        }
        use={["Ink-3 voor een bijschrift, een eenheid, een tijdstip."]}
        avoid={["Tekst in ink-4 of ink-5: die halen het contrast niet."]}
      >
        <div className="flex w-full max-w-[880px] flex-col">
          {(["ink", "ink-2", "ink-3"] as const).map((k) => (
            <div key={k} className="relative flex items-baseline justify-between gap-6 py-5">
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
              <span className="text-2xl" style={{ color: `var(--${k})` }}>
                Drie bestellingen dreigen te laat te komen.
              </span>
              <span className="shrink-0 text-ink-3 text-sm">
                {k} · <Ratio on="paper" ink={k} />
              </span>
            </div>
          ))}
          {(["ink-4", "ink-5"] as const).map((k) => (
            <div key={k} className="relative flex items-center justify-between gap-6 py-5">
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
              <span className="flex flex-1 items-end gap-2">
                {Array.from(
                  { length: 24 },
                  (_, i) => (
                    <span
                      key={i}
                      className="w-px"
                      style={{ height: i % 4 === 0 ? 16 : 8, background: `var(--${k})` }}
                    />
                  )
                )}
              </span>
              <span className="shrink-0 text-ink-3 text-sm">{k} · een teken, geen tekst</span>
            </div>
          ))}
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="abyss"
        ground="abyss"
        status="Live"
        source="families · On dark"
        body={
          <p>
            Op abyss leest de inkt van de donkere reeks, die in beide thema's vaststaat. Vlakken op abyss zijn krijt:
            mesh-ink op 6 tot 16 procent met een krijtlijn. Een witte kaart op blauw is een merkfout.
          </p>
        }
        use={["Krijtvlakken voor kaarten, chips en tabs op abyss."]}
        avoid={["Een massief witte kaart op abyss.", "Zwart, voor wat dan ook."]}
      >
        <div className="flex w-full max-w-[880px] flex-col gap-8">
          <div className="flex flex-col">
            {(["mesh-ink", "mesh-ink-2", "mesh-ink-3"] as const).map((k) => (
              <div key={k} className="relative flex items-baseline justify-between gap-6 py-4">
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x-chalk" />
                <span className="text-xl" style={{ color: `var(--${k})` }}>Voorstel SUP-0318, getekend.</span>
                <span className="shrink-0 text-mesh-ink-2 text-sm">
                  {k} · <Ratio on="abyss" ink={k} />
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[6, 10, 16].map((pct) => (
              <figure key={pct} className="flex flex-col gap-2">
                <span
                  className="block h-24 rounded-lg chalk-line"
                  style={{ background: `color-mix(in oklch, var(--mesh-ink) ${pct}%, transparent)` }}
                />
                <figcaption className="flex flex-col">
                  <span className="font-medium text-mesh-ink text-sm">Krijt {pct}%</span>
                  <span className="text-mesh-ink-2 text-xs">met krijtlijn</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <Ramp tokens={ON_DARK} dark />
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="paren"
        ground="paper"
        status="Live"
        source="tokens.ts · pairs"
        tall
        body={
          <p>
            Welke inkt op welk vlak mag. De lijst is vastgelegd, niet afgeleid, en een test meet elk paar. Een vlak dat
            er niet in staat, draagt geen tekst.
          </p>
        }
        use={["Een paar uit deze lijst voor elke tekst."]}
        avoid={["Tekst op een vlak dat hier niet staat, zoals sky of powder."]}
      >
        <div className="w-full max-w-[880px] overflow-x-auto py-6">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-ink-3 text-xs">
                <th className="py-2 font-medium">Vlak</th>
                <th className="py-2 font-medium">Inkt</th>
                <th className="py-2 font-medium">Voorbeeld</th>
                <th className="py-2 text-right font-medium">Contrast</th>
              </tr>
            </thead>
            <tbody>
              {SHOWN_PAIRS.map(([on, ink]) => (
                <tr key={`${on}-${ink}`} className="shadow-[inset_0_1px_0_var(--hairline)]">
                  <td className="py-2.5 text-ink-2">{on}</td>
                  <td className="py-2.5 text-ink-2">{ink}</td>
                  <td className="py-2.5">
                    <span
                      aria-hidden
                      className="inline-flex h-10 items-center rounded-md px-3 text-2xl"
                      style={{ background: `var(--${on})`, color: `var(--${ink})` }}
                    >
                      Opslaan
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-ink">
                    <Ratio on={on} ink={ink} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="signalen"
        status="Alleen in het product"
        body={
          <>
            <p>
              Drie staten, elk een inkt op zijn eigen tint en altijd met een woord. Ze horen in het product, waar een
              bestelling echt te laat is. Op merkvlakken is status merkblauw met de inktreeks, zoals de site het doet.
            </p>
            <p>
              De personenkleuren (zes velden voor een gezichtsschijf) zijn ook alleen voor het product, en staan daarom
              niet in dit boek.
            </p>
          </>
        }
        use={["Een status in een tabel, een melding, een badge in de console."]}
        avoid={["Signaalkleur op een merkpagina, een kop of een achtergrond."]}
      >
        <p className="flex flex-wrap items-center justify-center gap-2 text-ink-3 text-xs">
          Alleen in het product:
          <span className="inline-flex h-5 items-center rounded-full bg-signal-amber-bg px-2 text-2xs text-signal-amber">
            Vertraagd
          </span>
          <span className="inline-flex h-5 items-center rounded-full bg-signal-red-bg px-2 text-2xs text-signal-red">
            Betwist
          </span>
          <span className="inline-flex h-5 items-center rounded-full bg-signal-green-bg px-2 text-2xs text-signal-green">
            Bezorgd
          </span>
        </p>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="regels"
        ground="glacier"
        body={<p>De regels uit DESIGN.md, en die van de eigenaar. Ze gelden voor elk vlak van het merk.</p>}
      >
        <div className="flex w-full flex-col items-center gap-8">
          <RuleSheet rules={RULES} />
          <Pair
            wel={<>Een kaart op abyss in krijt: mesh-ink op 8 procent, met een krijtlijn.</>}
            niet={<>Een witte kaart op abyss, een zwarte achtergrond, of een verloop als grond.</>}
          />
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="nacht"
        ground="mist"
        status="Live"
        source="tokens.ts · darkColors"
        tools={<Seg label="Thema" value={night} options={["Dag", "Nacht"] as const} onChange={setNight} />}
        body={
          <p>
            Het donkere thema gebruikt dezelfde namen in een tweede kaart. Vlakken en inkt draaien om; het merk niet.
            Arc en abyss houden hun waarde, omdat een merk dat 's avonds van kleur verandert twee merken is.
          </p>
        }
        use={["De tokennaam. Het thema kiest de waarde."]}
        avoid={["Een eigen donkere waarde naast het token."]}
      >
        <div className="grid w-full max-w-[880px] grid-cols-3 gap-2 sm:grid-cols-6">
          {([
            "glacier",
            "mist",
            "paper",
            "ink",
            "ink-3",
            "hairline",
            "arc",
            "arc-ink",
            "arc-tint",
            "abyss",
            "abyss-2",
            "mesh-ink"
          ] as const)
            .map((k) => {
              const value = map[k] ?? colors[k]
              const fixed = value === colors[k] && darkColors[k] === colors[k]
              return (
                <div key={k} className="flex flex-col gap-2">
                  <span className="block h-20 rounded-md hairline" style={{ background: value }} />
                  <span className="text-ink text-xs">{k}</span>
                  <span className="text-ink-3 text-xs tabular-nums">
                    {oklchToHex(value).toUpperCase()}
                    {fixed ? " · vast" : ""}
                  </span>
                </div>
              )
            })}
        </div>
      </SectionPage>
    </>
  )
}
