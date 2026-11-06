import { type ComponentType, useMemo, useState } from "react"
import { NODE_VARIANTS, type NodeVariant } from "../../../app/automations/node-types.ts"
import { StepTile } from "../../../app/automations/step-tile.tsx"
import { EmptyIcon, type EmptyKind } from "../../../app/common/empty-icon.tsx"
import { HatchBand } from "../../../app/common/empty-page.tsx"
import { Glyph, type GlyphMotion } from "../../../app/common/glyph.tsx"
import { Steps } from "../../../app/dashboard/setup-steps.tsx"
import { BrandLogo } from "../../../app/marketplace/brand-logos.tsx"
import * as Icons from "../../../icons.tsx"
import type { IconComponent } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import { Star } from "../../../marketing/ai.tsx"
import { ChainRow, ROW_A, ROW_B } from "../../../marketing/integrations.tsx"
import { ConnectionsTile } from "../../../marketing/nav.tsx"
import { Constellation } from "../../../marketing/pages/koppelingen.tsx"
import { GridPerspective } from "../../../marketing/pages/variants/grid-perspective.tsx"
import { GridShimmer } from "../../../marketing/pages/variants/grid-shimmer.tsx"
import { HatchDrift } from "../../../marketing/pages/variants/hatch-drift.tsx"
import { LogoConstellation } from "../../../marketing/pages/variants/logo-constellation.tsx"
import { NodesToMark } from "../../../marketing/pages/variants/nodes-to-mark.tsx"
import { ScanLine } from "../../../marketing/pages/variants/scan-line.tsx"
import { Schematic } from "../../../marketing/pages/variants/schematic.tsx"
import type { Tone } from "../../../marketing/pages/variants/shared.tsx"
import { StaticControl } from "../../../marketing/pages/variants/static-control.tsx"
import { Logo } from "../../../marketing/parts.tsx"
import { Orbit } from "../../../marketing/statement.tsx"
import { InsyteMark } from "../../mark.tsx"
import { PillBar, SectionPage, Seg, type Status } from "../page.tsx"
import { useSpecimen } from "../state.tsx"

/*
 * 06 Iconen & illustraties, worked in full: every drawn mark in the product and on the site, live.
 *
 * The pen's rules on one glyph; the whole house set, searchable; the glyph's draw-in and its seven
 * gestures; the sixteen empty-state marks and the hatch band; the step tiles and the automation
 * node icons; the marks drawn from the mark (the setup squares, the AI star tile); the site's three
 * illustrations (the orbit, the koppelingen ring, the connections tile) and the integrations chain;
 * the eight hero backgrounds from the /variants lab, as a gallery; and the vendors' own marks with
 * where each file came from. Every moving piece has Pauzeren and Zonder beweging.
 *
 * Not here, on purpose: the stage miniatures, bento tiles, tours and moments. They are driven by the
 * page's scroll (`local` motion values) and are renders of the product, which the reference shows.
 */

const C = "iconen" as const

/* ── The house set ───────────────────────────────────────────────────────────────────────────── */

const SET: ReadonlyArray<readonly [string, IconComponent]> = Object.entries(Icons)
  .filter((e): e is [string, IconComponent] => e[0] !== "glyphs" && typeof e[1] === "object" && e[1] !== null)
  .toSorted(([a], [b]) => a.localeCompare(b))

function Pen() {
  const Icon = Icons.Workflow
  const ink = "var(--ink-3)"
  return (
    <div className="grid w-full max-w-[960px] items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-[400px]">
        <svg viewBox="0 0 24 24" className="absolute inset-0 size-full" aria-hidden>
          {Array.from({ length: 25 }, (_, i) => (
            <g key={i}>
              <line x1={i} y1="0" x2={i} y2="24" stroke="var(--hairline)" strokeWidth="0.04" />
              <line x1="0" y1={i} x2="24" y2={i} stroke="var(--hairline)" strokeWidth="0.04" />
            </g>
          ))}
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            fill="none"
            stroke={ink}
            strokeWidth="0.05"
            strokeDasharray="0.3 0.3"
          />
        </svg>
        <Icon size="100%" className="absolute inset-0 text-ink" />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        {[
          ["Veld", "24 eenheden, levend gebied 18"],
          ["Lijn", "1,75, voor de hele set gelijk"],
          ["Uiteinden", "Vierkant, hoeken in verstek"],
          ["Hoek", "2 eenheden: het Drift-vierkant"],
          ["Punten", "Gevulde vierkantjes, nooit rond"],
          ["Meervoud", "Het verspringende vierkant van het merk"]
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1">
            <dt className="font-medium text-ink">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const SIZES = ["12", "14", "16", "20", "24"] as const

function IconGrid() {
  const { ground } = useSpecimen()
  const dark = ground === "abyss"
  const [q, setQ] = useState("")
  const [size, setSize] = useState<(typeof SIZES)[number]>("20")
  const [copied, setCopied] = useState<string | null>(null)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t === "" ? SET : SET.filter(([n]) => n.toLowerCase().includes(t))
  }, [q])
  const copy = (name: string) => {
    void navigator.clipboard?.writeText(`import { ${name} } from "@insyte/ui/icons"`).then(() => {
      setCopied(name)
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1600)
    })
  }
  return (
    <div className="flex w-full flex-col gap-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-[240px] flex-1 items-center">
          <Icons.Search size={16} className={cn("absolute left-3", dark ? "text-mesh-ink-2" : "text-ink-3")} />
          <span className="sr-only">Zoek een icoon</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek een icoon, bijvoorbeeld truck"
            className={cn(
              "h-9 w-full rounded-md pr-3 pl-9 text-sm outline-none",
              dark
                ? "bg-mesh-ink/10 text-mesh-ink chalk-line placeholder:text-mesh-ink-3"
                : "field placeholder:text-ink-3"
            )}
          />
        </label>
        <Seg
          label="Grootte"
          value={size}
          options={SIZES}
          onChange={setSize}
          dark={dark}
          names={{ "12": "12", "14": "14", "16": "16", "20": "20", "24": "24 px" }}
        />
        <span aria-live="polite" className={cn("text-sm tabular-nums", dark ? "text-mesh-ink-2" : "text-ink-3")}>
          {shown.length} van {SET.length}
        </span>
      </div>
      {shown.length === 0
        ? (
          <p className={cn("py-16 text-center text-md", dark ? "text-mesh-ink-2" : "text-ink-2")}>
            Geen icoon met die naam.
          </p>
        )
        : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))] sm:gap-1.5">
            {shown.map(([name, Icon]) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => copy(name)}
                  title={`Kopieer de import van ${name}`}
                  className={cn(
                    "flex h-20 w-full flex-col items-center justify-center gap-2 rounded-md px-1 transition-colors sm:h-24 sm:gap-2.5",
                    dark ? "text-mesh-ink hover:bg-mesh-ink/10" : "text-ink hover:bg-ink/5"
                  )}
                >
                  <Icon size={Number(size)} />
                  <span className={cn("max-w-full truncate text-xs", dark ? "text-mesh-ink-2" : "text-ink-3")}>
                    {copied === name ? "Import gekopieerd" : name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

const GESTURES: ReadonlyArray<{ readonly motion: GlyphMotion; readonly icon: IconComponent; readonly label: string }> =
  [
    { motion: "drive", icon: Icons.Truck, label: "Rijdt: verzending" },
    { motion: "swing", icon: Icons.Bell, label: "Slingert: melding" },
    { motion: "lift", icon: Icons.Rocket, label: "Tilt: lancering" },
    { motion: "turn", icon: Icons.RefreshCcw, label: "Draait: opnieuw" },
    { motion: "pop", icon: Icons.Check, label: "Springt: klaar" },
    { motion: "nudge", icon: Icons.ArrowUpRight, label: "Duwt: openen" },
    { motion: "blink", icon: Icons.MoreHorizontal, label: "Knippert: bezig" }
  ]

/* ── Empty states ────────────────────────────────────────────────────────────────────────────── */

const KINDS: ReadonlyArray<readonly [EmptyKind, string]> = [
  ["orders", "Bestellingen"],
  ["customers", "Klanten"],
  ["products", "Producten"],
  ["automations", "Automatiseringen"],
  ["chargebacks", "Chargebacks"],
  ["tickets", "Tickets"],
  ["people", "Mensen"],
  ["notifications", "Meldingen"],
  ["locked", "Geen toegang"],
  ["inbox", "Inbox"],
  ["chats", "Chats"],
  ["suppliers", "Leveranciers"],
  ["analytics", "Analyse"],
  ["tasks", "Taken"],
  ["calendar", "Agenda"],
  ["activity", "Activiteit"]
]

function EmptyMarks() {
  const { still } = useSpecimen()
  const [size, setSize] = useState<"Volledig" | "Compact">("Volledig")
  return (
    <div className="flex w-full max-w-[1080px] flex-col gap-6 py-4">
      <div className="flex justify-end">
        <Seg label="Grootte" value={size} options={["Volledig", "Compact"] as const} onChange={setSize} />
      </div>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
        {KINDS.map(([kind, label]) => (
          <li key={kind} className="flex flex-col items-center gap-2 rounded-md py-3">
            <span className="flex size-[72px] items-center justify-center">
              <EmptyIcon kind={kind} size={size === "Volledig" ? 72 : 48} still={still} />
            </span>
            <span className="text-ink-2 text-xs">{label}</span>
          </li>
        ))}
      </ul>
      <HatchBand kind="orders" count="0 bestellingen" still={still} />
    </div>
  )
}

/* ── Step tiles ──────────────────────────────────────────────────────────────────────────────── */

const KIND_LABEL: Record<NodeVariant["kind"], string> = {
  trigger: "Triggers",
  condition: "Voorwaarden",
  delay: "Wachten",
  action: "Acties",
  branch: "Splitsingen"
}

function StepTiles() {
  const own = NODE_VARIANTS.filter((v) => v.kind === "action" && v.brand === undefined).slice(0, 3)
  const logic = NODE_VARIANTS.filter((v) => v.kind === "delay" || v.kind === "condition" || v.kind === "branch").slice(
    0,
    3
  )
  const vendor = NODE_VARIANTS.filter((v) => v.kind === "action" && v.brand !== undefined).slice(0, 3)
  const groups = (["trigger", "condition", "delay", "branch", "action"] as const).map((k) => ({
    k,
    items: NODE_VARIANTS.filter((v) => v.kind === k)
  }))
  return (
    <div className="flex w-full max-w-[1040px] flex-col gap-10 py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { name: "Insyte doet het", note: "Abyss, met een krijtglyph: het product aan het werk.", items: own },
          { name: "Logica", note: "Een stille put: wachten, voorwaarde, splitsing.", items: logic },
          { name: "Een gekoppelde dienst", note: "Het eigen merk van de dienst, op zijn tegel.", items: vendor }
        ].map((g) => (
          <figure key={g.name} className="flex flex-col gap-4 bg-paper p-5 ruled">
            <div className="flex items-end gap-4">
              {g.items.map((v) => (
                <span key={v.id} className="flex items-end gap-2">
                  <StepTile variant={v} size={32} />
                  <StepTile variant={v} size={20} />
                </span>
              ))}
            </div>
            <figcaption className="flex flex-col gap-1">
              <span className="font-medium text-ink text-sm">{g.name}</span>
              <span className="text-ink-2 text-sm">{g.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.k} className="flex flex-col gap-2">
            <span className="font-medium text-ink text-sm">{KIND_LABEL[g.k]}</span>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map((v) => {
                const I = v.icon
                return (
                  <li
                    key={v.id}
                    className="flex h-8 items-center gap-2 rounded-md bg-paper px-2.5 text-ink-2 text-xs hairline"
                  >
                    <I size={14} />
                    {v.label}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Marks drawn from the mark ───────────────────────────────────────────────────────────────── */

function DerivedMarks() {
  const { still } = useSpecimen()
  const [done, setDone] = useState(3)
  return (
    <div className="grid w-full max-w-[1040px] gap-3 md:grid-cols-3">
      <figure data-ground="dark" className="flex flex-col gap-5 rounded-lg bg-abyss p-6 text-mesh-ink">
        <div className="flex h-44 items-center justify-center">
          <Steps key={done} done={done} total={7} still={still} className="block shrink-0" />
        </div>
        <label className="flex flex-col gap-2 text-mesh-ink-2 text-sm">
          <span>
            {done} van 7 stappen gedaan
          </span>
          <input
            type="range"
            min={0}
            max={7}
            value={done}
            onChange={(e) => setDone(Number(e.target.value))}
            className="accent-mesh-ink"
          />
        </label>
        <figcaption className="text-mesh-ink-2 text-sm">
          De stappen van de eerste dag: gedaan vol, de volgende omlijnd en ademend, de rest gestippeld.
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-5 bg-mist p-6 ruled">
        <div className="flex h-44 items-center justify-center gap-6">
          <Star working={!still} size={56} />
          <Star working={false} size={32} />
        </div>
        <figcaption className="text-ink-2 text-sm">
          De AI-ster op een abyss-tegel. Ademt alleen terwijl Insyte werkt; anders staat hij stil.
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-5 bg-paper p-6 ruled">
        <div className="flex h-44 items-center justify-center gap-6">
          <span className="flex size-[52px] items-center justify-center rounded-md bg-abyss">
            <InsyteMark size={34} tone="white" />
          </span>
          <span className="block size-28 rounded-lg bg-mist hatch" />
        </div>
        <figcaption className="text-ink-2 text-sm">
          Het merk op zijn tegel, zoals bovenaan de rail, en de arcering die uit het merk komt.
        </figcaption>
      </figure>
    </div>
  )
}

/* ── Illustrations ───────────────────────────────────────────────────────────────────────────── */

function Illustrations() {
  const { paused } = useSpecimen()
  return (
    <div className="grid w-full max-w-[1120px] gap-3 lg:grid-cols-3">
      <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
        <div className="flex min-h-[300px] items-center justify-center">
          <Orbit />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="font-medium text-ink text-sm">De baan</span>
          <span className="text-ink-2 text-sm">
            Acht diensten op een gestippelde ring rond het merk; één omwenteling per minuut.
          </span>
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-4 bg-mist p-5 ruled">
        <div className="flex min-h-[300px] items-center justify-center">
          <Constellation paused={paused} />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="font-medium text-ink text-sm">De koppelingenring</span>
          <span className="text-ink-2 text-sm">
            Twaalf merken trekken om de beurt hun lijn naar het merk. /koppelingen.
          </span>
        </figcaption>
      </figure>
      <figure className="flex flex-col gap-4 bg-paper p-5 ruled">
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="w-full max-w-[320px] rounded-lg bg-mist">
            <ConnectionsTile />
          </div>
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="font-medium text-ink text-sm">De verbindingstegel</span>
          <span className="text-ink-2 text-sm">
            Vier diensten trekken een lijn naar het merk als het menu Oplossingen opengaat.
          </span>
        </figcaption>
      </figure>
    </div>
  )
}

/* ── Backgrounds ─────────────────────────────────────────────────────────────────────────────── */

const BACKGROUNDS: ReadonlyArray<
  {
    readonly name: string
    readonly line: string
    readonly status: Status
    readonly C: ComponentType<{ readonly tone: Tone }>
  }
> = [
  {
    name: "Controle",
    line: "Het tekenraster en de Drift-arcering, stil. Wat de pagina's nu tekenen.",
    status: "Live",
    C: StaticControl
  },
  {
    name: "Schema met pulsen",
    line: "Componenten, verbindingen en knooppunten; korte pulsen lopen over de lijnen.",
    status: "Lab",
    C: ({ tone }) => <Schematic tone={tone} parallax={0} />
  },
  {
    name: "Raster met lichtband",
    line: "Een trage band licht schuift schuin over het raster.",
    status: "Lab",
    C: GridShimmer
  },
  { name: "Drijvende arcering", line: "De Drift-arcering drijft langzaam schuin weg.", status: "Lab", C: HatchDrift },
  {
    name: "Knooppunten naar het merk",
    line: "Punten trekken om de beurt een lijn naar het merk.",
    status: "Lab",
    C: NodesToMark
  },
  {
    name: "Raster in perspectief",
    line: "Het raster als vloer; scrollen kantelt het plat.",
    status: "Lab",
    C: GridPerspective
  },
  { name: "Scanlijn", line: "Eén haarlijn veegt om de paar seconden over het raster.", status: "Lab", C: ScanLine },
  {
    name: "Sterrenbeeld van koppelingen",
    line: "De diensten aan de randen; lijnen lichten één voor één op.",
    status: "Lab",
    C: LogoConstellation
  }
]

function Backgrounds() {
  const [i, setI] = useState(0)
  const [tone, setTone] = useState<Tone>("dark")
  const v = BACKGROUNDS[i] ?? BACKGROUNDS[0]
  if (v === undefined) return null
  const dark = tone === "dark"
  const V = v.C
  return (
    <div className="flex w-full flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Achtergronden">
          {BACKGROUNDS.map((b, n) => (
            <li key={b.name}>
              <button
                type="button"
                aria-pressed={n === i}
                onClick={() => setI(n)}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-xs transition-colors",
                  n === i ? "bg-abyss text-mesh-ink" : "bg-paper text-ink-2 hairline hover:text-ink"
                )}
              >
                <span className="tabular-nums">{n + 1}</span>
                {b.name}
              </button>
            </li>
          ))}
        </ol>
        <Seg
          label="Ondergrond"
          value={tone}
          options={["dark", "light"] as const}
          onChange={setTone}
          names={{ dark: "Abyss", light: "Licht" }}
        />
      </div>
      <div
        data-ground={dark ? "dark" : undefined}
        className={cn(
          "relative isolate aspect-[16/9] w-full overflow-hidden rounded-lg",
          dark ? "bg-abyss" : "bg-mist hairline"
        )}
      >
        <div className="absolute inset-0 -z-10">
          <V key={`${i}-${tone}`} tone={tone} />
        </div>
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <span
            className={cn("max-w-[20ch] font-medium text-3xl sm:text-display-sm", dark ? "text-mesh-ink" : "text-ink")}
          >
            De back-end van je dropshipstore.
          </span>
          <PillBar
            dark={dark}
            primary={{ href: "/site/toegang", label: "Toegang aanvragen" }}
            secondary={{ href: "/site/variants", label: "Naar het lab" }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">
          <span className="font-medium text-ink">{i + 1}. {v.name}.</span> {v.line}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs",
            v.status === "Live" ? "bg-arc-tint text-arc-ink" : "bg-ink/6 text-ink-2"
          )}
        >
          {v.status}
        </span>
      </div>
    </div>
  )
}

/* ── Vendors ─────────────────────────────────────────────────────────────────────────────────── */

const PROVENANCE: ReadonlyArray<
  { readonly source: string; readonly brands: ReadonlyArray<readonly [string, string]> }
> = [
  {
    source: "gilbarbara/logos, CC0",
    brands: [
      ["shopify", "Shopify"],
      ["paypal", "PayPal"],
      ["gmail", "Gmail"],
      ["google-ads", "Google Ads"],
      ["meta", "Meta"],
      ["anthropic", "Anthropic"],
      ["slack", "Slack"],
      ["microsoft", "Microsoft 365"],
      ["microsoft-teams", "Microsoft Teams"]
    ]
  },
  {
    source: "Simple Icons 15.22.0, CC0",
    brands: [
      ["stripe", "Stripe"],
      ["klarna", "Klarna"],
      ["wise", "Wise"],
      ["dhl", "DHL"],
      ["zapier", "Zapier"],
      ["aftership", "AfterShip"],
      ["resend", "Resend"],
      ["whatsapp", "WhatsApp"],
      ["google-sheets", "Google Sheets"]
    ]
  },
  {
    source: "Het eigen site-icoon van de dienst, via Googles faviconservice",
    brands: [
      ["klaviyo", "Klaviyo"],
      ["recharge", "Recharge"],
      ["yotpo", "Yotpo"],
      ["shipbob", "ShipBob"],
      ["gorgias", "Gorgias"],
      ["signifyd", "Signifyd"],
      ["okendo", "Okendo"],
      ["postscript", "Postscript"],
      ["loop-returns", "Loop Returns"],
      ["outlook", "Outlook"],
      ["postnl", "PostNL"],
      ["exact", "Exact Online"],
      ["sendcloud", "Sendcloud"]
    ]
  }
]

function Vendors() {
  return (
    <div className="flex w-full max-w-[1080px] flex-col gap-8 py-4">
      {PROVENANCE.map((g) => (
        <div key={g.source} className="flex flex-col gap-3">
          <span className="font-medium text-ink text-sm">{g.source}</span>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
            {g.brands.map(([key, name]) => (
              <li key={key} className="flex flex-col items-center gap-2 rounded-md bg-paper px-1 py-3 hairline">
                <BrandLogo brand={key} name={name} size={40} />
                <span className="max-w-full truncate text-ink-2 text-xs">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex flex-col gap-3">
        <span className="font-medium text-ink text-sm">Uit de eigen inlogknop van het product</span>
        <ul className="flex gap-1.5">
          <li className="flex w-24 flex-col items-center gap-2 rounded-md bg-paper px-1 py-3 hairline">
            <Logo vendor="google" size={40} label />
            <span className="text-ink-2 text-xs">Google</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

/* ── The chapter ─────────────────────────────────────────────────────────────────────────────── */

export function IconenChapter() {
  return (
    <>
      <SectionPage
        chapter={C}
        id="pen"
        ground="paper"
        status="Live"
        source="icons.tsx"
        body={
          <p>
            Elk icoon is met de tekenpen van de plaat getekend, niet uit een set genomen. Rechte lijnen en rechte hoeken
            voor bochten; een automatisering is twee knopen en een getrokken verbinding.
          </p>
        }
        use={["De maat voor wie een nieuw teken tekent."]}
        avoid={["Ronde uiteinden, Lucide, een gevuld teken."]}
      >
        <Pen />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="huisiconen"
        ground="paper"
        grounds={["paper", "abyss"]}
        status="Live"
        source="icons.tsx"
        tall
        body={
          <>
            <p>
              De hele set, {SET.length}{" "}
              tekens, onder de naam die Lucide hetzelfde onderwerp gaf. Zoek op naam, wissel van grootte en grond, en
              klik om de import te kopiëren.
            </p>
            <p>
              Let op Settings (schuifjes, geen tandwiel), Workflow (twee knopen en een verbinding) en Sparkle (de
              AI-ster).
            </p>
          </>
        }
        use={["Een icoon naast een label, in een knop, in een rij."]}
        avoid={["Een icoon in een grijze schijf.", "Een arc-icoon dat geen knop is."]}
      >
        <IconGrid />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="glyph"
        ground="mist"
        status="Live"
        source="app/common/glyph.tsx"
        motion
        replay
        body={
          <p>
            Elke lijn in de set heeft lengte 1, dus elk icoon kan zichzelf intekenen: de pen gaat één keer over de
            lijnen ({420}
            ms), de punten schalen erna in. Wijs een tegel aan en het icoon speelt zijn ene gebaar.
          </p>
        }
        use={["De veldkiezer in een filter, meldingen, de eerste dag."]}
        avoid={["Op het startbord: een bord vol bewegende iconen is ruis."]}
      >
        {(s) => (
          <ul className="grid w-full max-w-[1000px] grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {GESTURES.map((g, i) => (
              <li
                key={g.motion}
                className="glyph-host flex flex-col items-center gap-3 rounded-lg bg-paper px-3 py-6 hairline"
              >
                <Glyph icon={g.icon} motion={g.motion} tile="mist" size={28} delay={i * 60} draw={!s.still} />
                <span className="text-center text-ink-2 text-xs">{g.label}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionPage>

      <SectionPage
        chapter={C}
        id="leeg"
        ground="paper"
        grounds={["paper", "mist"]}
        status="Live"
        source="app/common/empty-icon.tsx · empty-page.tsx"
        motion
        tall
        body={
          <>
            <p>
              Zestien getekende tekens, één grammatica: een gestippeld vak waar de records zouden staan, het eigen teken
              van het record erin, en één arc-punt. De beweging is het vak, een trage mars langs de rand.
            </p>
            <p>
              Daaronder de band van een eerste-dagpagina: de arcering, het teken op papier, en één arc-punt dat over de
              arcering reist.
            </p>
          </>
        }
        use={["Een gebied dat nog nooit iets had."]}
        avoid={["Een filter zonder resultaat: gebruik dan compact.", "Een Lucide-teken in een grijze schijf."]}
      >
        <EmptyMarks />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="staptegels"
        ground="mist"
        status="Live"
        source="app/automations/step-tile.tsx · node-types.ts"
        tall
        body={
          <>
            <p>
              Het teken van een stap in een automatisering, op 32 en 20 px. Insyte zelf staat donker op abyss, logica is
              een stille put, een gekoppelde dienst draagt zijn eigen merk. Daaronder de iconen van alle stappen.
            </p>
            <p>
              De trigger draagt in het product de groene signaaltint en staat daarom hier niet als tegel: alleen in het
              product, een open punt.
            </p>
          </>
        }
        use={["Het palet, de knoopkaarten, de inspector en de uitvoeringen."]}
        avoid={["Een stap zonder tegel of met een verzonnen merk."]}
      >
        <StepTiles />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="merktekens"
        ground="glacier"
        status="Live"
        source="app/dashboard/setup-steps.tsx · marketing/ai.tsx"
        motion
        body={
          <p>
            Tekeningen die uit het merk komen: de stappen van de eerste dag als de verspringende vierkanten, de AI-ster
            op zijn tegel, het merk op de rail en de arcering. Schuif om de stappen te vullen.
          </p>
        }
        use={["Voortgang die het merk zelf tekent, en wat Insyte op dit moment doet."]}
        avoid={["Een voortgangsbalk of een draaiend wiel ernaast."]}
      >
        <DerivedMarks />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="merkbeeld"
        ground="glacier"
        status="Live"
        source="marketing/statement.tsx · pages/koppelingen.tsx · nav.tsx"
        motion
        replay
        body={
          <p>
            De drie illustraties van de site, elk een product-tekening en geen achtergrond: de baan van diensten, de
            ring van koppelingen en de verbindingstegel in het menu.
          </p>
        }
        use={["Eén per pagina, als het beeld van die pagina."]}
        avoid={["Achter tekst, als achtergrond.", "Een stockillustratie."]}
      >
        <Illustrations />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="keten"
        ground="abyss"
        startStill
        status="Live"
        source="marketing/integrations.tsx"
        motion
        body={
          <p>
            Twee rijen krijttegels, verbonden door een nek, die langzaam in tegengestelde richting drijven. Wijs een
            tegel aan en hij komt een stukje omhoog; onder de aanwijzer staat de rij stil. Hier staat de band stil tot
            je op Afspelen drukt.
          </p>
        }
        use={["De koppelingenband op de homepage."]}
        avoid={["Witte tegels op abyss: het zijn krijtvlakken."]}
      >
        <div className="-mx-5 w-[calc(100%+40px)] sm:-mx-10 sm:w-[calc(100%+80px)] lg:-mx-14 lg:w-[calc(100%+112px)]">
          <ChainRow vendors={[...ROW_A, ...ROW_A]} reverse={false} offset={false} />
          <ChainRow vendors={[...ROW_B, ...ROW_B]} reverse offset />
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="achtergronden"
        ground="glacier"
        status="Lab"
        source="marketing/pages/variants/"
        motion
        tall
        body={
          <>
            <p>
              De acht hero-achtergronden uit het lab (/site/variants), achter dezelfde kop en pillenbalk. Alleen de
              controle is live; de rest wordt daar getest.
            </p>
            <p>Op een live pagina beweegt niets in de achtergrond, tot een variant gekozen is.</p>
          </>
        }
        use={["Kijken en vergelijken. Kiezen gebeurt in het lab."]}
        avoid={["Een lab-variant op een live pagina zetten zonder dat hij gekozen is."]}
      >
        <Backgrounds />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="derden"
        ground="mist"
        status="Live"
        source="public/logos/BRON.md · marketplace/brand-logos.tsx"
        tall
        body={
          <>
            <p>
              De echte merken van de diensten waar Insyte mee koppelt, elk op dezelfde lichte tegel. Ze zijn van hun
              eigenaar en staan hier alleen om de dienst te noemen; Insyte is niet aan hen verbonden.
            </p>
            <p>Voor een echte lancering vervang je elk bestand door het officiële partnermateriaal van de dienst.</p>
          </>
        }
        use={["De dienst noemen die je echt koppelt."]}
        avoid={["Herkleuren, een merk op kale abyss zonder tegel, of een verzonnen partner."]}
      >
        <Vendors />
      </SectionPage>
    </>
  )
}
