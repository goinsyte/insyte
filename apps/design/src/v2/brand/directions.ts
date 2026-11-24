import { mix, ring } from "./color.ts"
import type { Okl } from "./color.ts"

/**
 * Six palette directions for the three marks (Insyte, Blended data, Magnus), each a small named token
 * set: the brand hues, how the marks take them so the family matches, which of them a customer can
 * pick as the accent of the neutral product, and a hero ground. Nothing here is chosen; `/v2/merk`
 * puts them side by side. Values are OKLCH. Every accent's ink holds 4.5:1 on white and on the panel,
 * and its `onFill` 4.5:1 on the fill; a light fill (yellow, lime) does not reach 3:1 against white,
 * so its focus ring and edges take the ink. `brand-screen.tsx` computes and shows every ratio.
 */

type Hue = { readonly name: string; readonly value: Okl }

/**
 * A customer theme on the neutral base. `fill` is the field (button, selection, the chart's one bar),
 * `ink` the same hue as text, `tint` the wash under a selected row, `onFill` the text on the field.
 */
export type Accent = {
  readonly name: string
  readonly fill: Okl
  readonly ink: Okl
  readonly tint: Okl
  readonly onFill: Okl
}

type MarkColours = {
  /** Back, middle, front square. `lines`: the front square's three lines; knocked out when absent. */
  readonly insyte: { readonly squares: readonly [Okl, Okl, Okl]; readonly lines?: Okl }
  /** The six pills, clockwise from the long one at the upper left. */
  readonly blend: readonly [Okl, Okl, Okl, Okl, Okl, Okl]
  /** Eight petals clockwise from the top, the disc behind the star, and the star. */
  readonly magnus: { readonly petals: ReadonlyArray<Okl>; readonly core: Okl; readonly star: Okl }
  /** Overlaps print through (multiply) instead of stacking, on a light ground only. */
  readonly overprint?: boolean
}

type Hero = {
  readonly ground: Okl
  readonly ink: Okl
  readonly soft: Okl
  readonly cta: Okl
  readonly ctaInk: Okl
  /** Which of the hero's drawings this direction takes. */
  readonly art: "family" | "blocks" | "highlight" | "field" | "overprint"
  /** The marker under one word of the headline (Markeerstift only). */
  readonly highlight?: Okl
}

export type Direction = {
  readonly id: string
  readonly name: string
  /** One line: the character. */
  readonly character: string
  readonly hues: ReadonlyArray<Hue>
  readonly marks: MarkColours
  /** How each mark takes the hues, one sentence each. */
  readonly assignment: { readonly insyte: string; readonly blend: string; readonly magnus: string }
  readonly accents: ReadonlyArray<Accent>
  /** Why the accents are these and not every hue, when that needs saying. */
  readonly accentNote?: string
  readonly hero: Hero
  readonly says: string
  readonly risk: string
}

const WHITE: Okl = [1, 0, 0]
const INK: Okl = [0.225, 0.006, 250]

/* ── 1 · Spectrum ─────────────────────────────────────────────────────────────────────────────── */

const sky: Okl = [0.82, 0.095, 232]
const indigo: Okl = [0.43, 0.2, 272]
const violet: Okl = [0.57, 0.22, 302]
const magenta: Okl = [0.64, 0.23, 357]
const orange: Okl = [0.76, 0.16, 58]

const spectrum: Direction = {
  id: "spectrum",
  name: "Spectrum",
  character: "Je eigen kleuren, opgeschoond tot vijf tinten die alle drie de tekens delen.",
  hues: [
    { name: "Hemelsblauw", value: sky },
    { name: "Indigo", value: indigo },
    { name: "Violet", value: violet },
    { name: "Magenta", value: magenta },
    { name: "Oranje", value: orange }
  ],
  marks: {
    insyte: { squares: [sky, [0.63, 0.17, 256], indigo] },
    blend: [magenta, orange, orange, magenta, violet, violet],
    magnus: { petals: ring([magenta, orange, violet, sky]), core: [0.48, 0.21, 318], star: WHITE }
  },
  assignment: {
    insyte: "Hemelsblauw naar indigo: de koele kant van het spectrum, het product.",
    blend: "Violet, magenta en oranje: het midden, waar de bronnen mengen.",
    magnus: "Alle vijf rond de bloem: de assistent kent alles."
  },
  accents: [
    { name: "Indigo", fill: [0.5, 0.2, 272], ink: [0.47, 0.19, 272], tint: [0.955, 0.025, 272], onFill: WHITE },
    { name: "Violet", fill: [0.53, 0.22, 302], ink: [0.5, 0.21, 302], tint: [0.955, 0.03, 302], onFill: WHITE },
    { name: "Magenta", fill: [0.57, 0.22, 357], ink: [0.53, 0.2, 357], tint: [0.958, 0.025, 357], onFill: WHITE }
  ],
  accentNote: "Oranje en hemelsblauw zijn te licht voor tekst en blijven merk.",
  hero: {
    ground: WHITE,
    ink: INK,
    soft: [0.45, 0.01, 260],
    cta: [0.5, 0.2, 272],
    ctaInk: WHITE,
    art: "family"
  },
  says:
    "Continuïteit: wat je al tekende, maar strakker. Drie tekens die duidelijk familie zijn omdat ze dezelfde vijf tinten delen.",
  risk:
    "Paars-blauw met een verloop is de standaardkleur van AI-producten; Insyte valt er weinig mee op. Verdedigbaar omdat het je eigen kleuren zijn, niet omdat het opvalt."
}

/* ── 2 · Primair ──────────────────────────────────────────────────────────────────────────────── */

const blue: Okl = [0.6, 0.19, 258]
const red: Okl = [0.64, 0.21, 27]
const yellow: Okl = [0.86, 0.165, 88]
const green: Okl = [0.66, 0.16, 152]

const primair: Direction = {
  id: "primair",
  name: "Primair",
  character: "Vier heldere primaire kleuren, elk teken krijgt ze allemaal: het Slack- en Google-model.",
  hues: [
    { name: "Blauw", value: blue },
    { name: "Rood", value: red },
    { name: "Geel", value: yellow },
    { name: "Groen", value: green }
  ],
  marks: {
    insyte: { squares: [yellow, green, blue] },
    blend: [red, yellow, green, blue, red, blue],
    magnus: { petals: ring([red, yellow, green, blue]), core: [0.97, 0.01, 90], star: blue }
  },
  assignment: {
    insyte: "Geel, groen, blauw van achter naar voor: drie bronnen, één overzicht.",
    blend: "Alle vier door elkaar: elke bron zijn eigen kleur.",
    magnus: "Rood, geel, groen, blauw rond: de bloem is het kleurenwiel van het merk."
  },
  accents: [
    { name: "Blauw", fill: [0.54, 0.19, 258], ink: [0.5, 0.18, 258], tint: [0.955, 0.025, 258], onFill: WHITE },
    { name: "Groen", fill: [0.52, 0.13, 152], ink: [0.48, 0.12, 152], tint: [0.958, 0.03, 152], onFill: WHITE },
    { name: "Geel", fill: [0.86, 0.165, 88], ink: [0.5, 0.11, 75], tint: [0.968, 0.045, 92], onFill: INK }
  ],
  accentNote: "Rood is geen thema: het is al de kleur van een fout.",
  hero: {
    ground: WHITE,
    ink: INK,
    soft: [0.45, 0.01, 260],
    cta: [0.54, 0.19, 258],
    ctaInk: WHITE,
    art: "blocks"
  },
  says:
    "Vriendelijk, open en zelfverzekerd: een platform met veel onderdelen die samenwerken. Elke klantkleur is meteen een merkkleur.",
  risk:
    "Lijkt snel op Google of Slack. Groen en rood botsen met goed en fout in het product, dus in het scherm moeten ze altijd een woord bij zich hebben."
}

/* ── 3 · Markeerstift ─────────────────────────────────────────────────────────────────────────── */

const graphite: Okl = [0.27, 0.012, 255]
const steel: Okl = [0.56, 0.01, 255]
const silver: Okl = [0.8, 0.006, 255]
const marker: Okl = [0.9, 0.175, 102]
const gold: Okl = [0.82, 0.165, 85]

const markeerstift: Direction = {
  id: "markeerstift",
  name: "Markeerstift",
  character: "Grafiet en één markeergeel: Insyte streept aan wat vandaag telt.",
  hues: [
    { name: "Grafiet", value: graphite },
    { name: "Staal", value: steel },
    { name: "Zilver", value: silver },
    { name: "Markeergeel", value: marker }
  ],
  marks: {
    insyte: { squares: [silver, steel, marker], lines: graphite },
    blend: [graphite, marker, silver, steel, graphite, steel],
    magnus: { petals: ring([marker, gold, marker, gold]), core: graphite, star: marker }
  },
  assignment: {
    insyte: "Zilver en staal achter, het bovenste blad aangestreept in geel.",
    blend: "Grijze bronnen, één in het geel: wat ertoe doet springt eruit.",
    magnus: "De enige gele bloem, met een grafiet hart: de assistent mag kleur dragen."
  },
  accents: [
    { name: "Geel", fill: marker, ink: [0.5, 0.1, 95], tint: [0.97, 0.06, 102], onFill: graphite },
    { name: "Grafiet", fill: graphite, ink: graphite, tint: [0.95, 0.004, 255], onFill: WHITE }
  ],
  accentNote: "Eén merkkleur, dus twee thema's. Meer thema's komen van buiten het merk.",
  hero: {
    ground: graphite,
    ink: [0.98, 0.003, 255],
    soft: [0.8, 0.006, 255],
    cta: marker,
    ctaInk: graphite,
    art: "highlight",
    highlight: marker
  },
  says: "Rustig, precies, werkgericht: de tool die je de hele dag openhoudt. Het geel heeft één betekenis, kijk hier.",
  risk:
    "Geel kan nooit tekst zijn en grenst aan de waarschuwingskleur. Met maar één kleur zijn er weinig klantthema's binnen het merk."
}

/* ── 4 · Koraal ───────────────────────────────────────────────────────────────────────────────── */

const apricot: Okl = [0.83, 0.115, 68]
const coral: Okl = [0.69, 0.175, 33]
const rose: Okl = [0.74, 0.13, 8]
const plum: Okl = [0.37, 0.12, 342]

const koraal: Direction = {
  id: "koraal",
  name: "Koraal",
  character: "Abrikoos, koraal, roos en een diepe pruim: warm zonder zacht te worden.",
  hues: [
    { name: "Abrikoos", value: apricot },
    { name: "Koraal", value: coral },
    { name: "Roos", value: rose },
    { name: "Pruim", value: plum }
  ],
  marks: {
    insyte: { squares: [apricot, coral, plum] },
    blend: [plum, apricot, apricot, coral, rose, plum],
    magnus: { petals: ring([rose, apricot, coral, plum]), core: plum, star: WHITE }
  },
  assignment: {
    insyte: "Abrikoos naar pruim: van licht naar donker, net als nu, maar warm.",
    blend: "Pruim, roos, koraal en abrikoos: een warme menging.",
    magnus: "Alle vier rond de bloem, het dichtst bij je huidige Magnus."
  },
  accents: [
    { name: "Pruim", fill: [0.42, 0.13, 342], ink: [0.42, 0.13, 342], tint: [0.955, 0.02, 342], onFill: WHITE },
    { name: "Koraal", fill: [0.57, 0.17, 33], ink: [0.53, 0.16, 33], tint: [0.96, 0.025, 33], onFill: WHITE },
    { name: "Roos", fill: [0.55, 0.17, 5], ink: [0.53, 0.16, 5], tint: [0.958, 0.022, 5], onFill: WHITE }
  ],
  hero: {
    ground: plum,
    ink: [0.97, 0.012, 60],
    soft: [0.85, 0.04, 30],
    cta: apricot,
    ctaInk: [0.3, 0.1, 342],
    art: "field"
  },
  says:
    "Menselijk en uitnodigend: een team dat met je meewerkt, niet een dashboard. Valt op tussen de blauwe software.",
  risk:
    "Te veel warmte leest als Mailchimp, wat het merk uitdrukkelijk niet wil. Koraal en roos liggen dicht bij de foutkleur."
}

/* ── 5 · Lagune ───────────────────────────────────────────────────────────────────────────────── */

const lime: Okl = [0.89, 0.17, 125]
const mint: Okl = [0.84, 0.105, 172]
const teal: Okl = [0.63, 0.12, 196]
const petrol: Okl = [0.38, 0.075, 222]

const lagune: Direction = {
  id: "lagune",
  name: "Lagune",
  character: "Limoen, munt, teal en petrol: helder water, rustig en fris.",
  hues: [
    { name: "Limoen", value: lime },
    { name: "Munt", value: mint },
    { name: "Teal", value: teal },
    { name: "Petrol", value: petrol }
  ],
  marks: {
    insyte: { squares: [mint, teal, petrol] },
    blend: [petrol, lime, mint, teal, teal, petrol],
    magnus: { petals: ring([lime, mint, teal, petrol]), core: petrol, star: WHITE }
  },
  assignment: {
    insyte: "Munt naar petrol: dieper water naar voren.",
    blend: "Limoen tot petrol: de bronnen lopen in elkaar over.",
    magnus: "Het hele verloop rond de bloem, limoen als de vonk."
  },
  accents: [
    { name: "Petrol", fill: [0.42, 0.08, 222], ink: [0.42, 0.08, 222], tint: [0.955, 0.015, 222], onFill: WHITE },
    { name: "Teal", fill: [0.52, 0.1, 196], ink: [0.49, 0.095, 196], tint: [0.96, 0.025, 196], onFill: WHITE },
    { name: "Limoen", fill: lime, ink: [0.5, 0.11, 130], tint: [0.97, 0.06, 125], onFill: petrol }
  ],
  hero: {
    ground: petrol,
    ink: [0.98, 0.01, 180],
    soft: [0.86, 0.04, 190],
    cta: lime,
    ctaInk: [0.3, 0.07, 222],
    art: "field"
  },
  says: "Kalm, gezond, groeiend: geld en voorraad onder controle. Anders dan alles wat blauw of paars is.",
  risk: "Teal en limoen lezen als fintech of zorg. Groen grenst aan de kleur voor goed, en limoen kan nooit tekst zijn."
}

/* ── 6 · Drukinkt ─────────────────────────────────────────────────────────────────────────────── */

const cyan: Okl = [0.72, 0.135, 228]
const process: Okl = [0.62, 0.245, 356]
const proofYellow: Okl = [0.93, 0.18, 104]
const key: Okl = [0.24, 0.01, 255]

const drukinkt: Direction = {
  id: "drukinkt",
  name: "Drukinkt",
  character: "Cyaan, magenta, geel en zwart: bronnen die over elkaar drukken tot één beeld.",
  hues: [
    { name: "Cyaan", value: cyan },
    { name: "Magenta", value: process },
    { name: "Geel", value: proofYellow },
    { name: "Zwart", value: key }
  ],
  marks: {
    insyte: { squares: [proofYellow, process, cyan] },
    blend: [process, proofYellow, proofYellow, cyan, process, cyan],
    magnus: {
      petals: ring([process, proofYellow, cyan, mix(cyan, process)]),
      core: key,
      star: WHITE
    },
    overprint: true
  },
  assignment: {
    insyte: "Geel, magenta, cyaan, over elkaar gedrukt: waar ze overlappen ontstaat een nieuwe kleur.",
    blend: "De drie inkten los, nog niet gemengd: de bronnen.",
    magnus: "De inkten drukken over elkaar rond een zwart hart: alles gemengd."
  },
  accents: [
    { name: "Cyaan", fill: [0.52, 0.12, 236], ink: [0.49, 0.115, 236], tint: [0.955, 0.022, 230], onFill: WHITE },
    { name: "Magenta", fill: [0.55, 0.22, 356], ink: [0.52, 0.21, 356], tint: [0.958, 0.025, 356], onFill: WHITE },
    { name: "Zwart", fill: key, ink: key, tint: [0.95, 0.004, 255], onFill: WHITE }
  ],
  accentNote: "Geel blijft inkt: als thema zou het nergens tekst kunnen zijn.",
  hero: {
    ground: WHITE,
    ink: key,
    soft: [0.45, 0.01, 255],
    cta: key,
    ctaInk: WHITE,
    art: "overprint"
  },
  says:
    "Blended data letterlijk: de kleuren van Insyte ontstaan uit menging. Eigenzinnig en herkenbaar, met een verhaal dat alle drie de tekens verbindt.",
  risk:
    "Drukwerk-nostalgie is een trend die kan verouderen. Het overdrukken werkt alleen op licht, en op 16 px wordt de menging modder."
}

export const DIRECTIONS: ReadonlyArray<Direction> = [spectrum, primair, markeerstift, koraal, lagune, drukinkt]
