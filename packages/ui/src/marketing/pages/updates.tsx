import { motion, useReducedMotion, useScroll, useSpring } from "motion/react"
import { type ReactNode, useRef } from "react"
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  Calendar,
  Check,
  ClipboardCheck,
  Database,
  Filter,
  GitMerge,
  Globe,
  Key,
  MessagesSquare,
  Plug,
  Receipt,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Truck,
  Undo2,
  Users,
  Wallet
} from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Person } from "../chrome.tsx"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { Reveal, RevealItem } from "../motion.tsx"
import { Logo, type Vendor } from "../parts.tsx"
import { ShipMoment } from "./moments.tsx"
import { InboxMoment } from "./product-moments.tsx"
import { MarketingPage, PageHero, SectionHead } from "./shell.tsx"
import { MomentFrame } from "./steps.tsx"

/*
 * /changelog and /roadmap.
 *
 * The changelog is the console's own "Nieuw in Insyte" dialog (`components/marketing-sections/
 * changelog.tsx`), entry for entry, newest first: a dated timeline whose rail draws down as you read
 * and whose dots fill as each entry passes, every entry with a moment of what it added and a way
 * into the console where it lives.
 *
 * The roadmap is what `docs/backend/*.md` marks "Later", plus English (PRODUCT.md), as plans: no
 * dates and no promises. Each plan is a construction outline, its dashed edge drawn in as it
 * arrives, the way the builder draws a step it has not made yet.
 */

/* ── Changelog ────────────────────────────────────────────────────────────────────────────────── */

function FilterMini() {
  return (
    <MomentFrame>
      <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-lg bg-paper text-left window-lift">
        <div className="flex flex-wrap items-center gap-1.5 p-4 text-sm">
          <Filter size={14} className="text-ink-3" />
          <span className="text-ink-2">Bestellingen waar</span>
          <span className="rounded-sm bg-arc-tint px-2 py-0.5 text-arc-ink">status is Vertraagd</span>
          <span className="text-ink-3">en</span>
          <span className="rounded-sm bg-arc-tint px-2 py-0.5 text-arc-ink">leverancier is Allure</span>
          <span className="text-ink-3">of</span>
          <span className="rounded-sm bg-arc-tint px-2 py-0.5 text-arc-ink">winkel is Northwind EU</span>
        </div>
        <div className="flex items-center gap-1 bg-mist px-4 py-2.5 text-xs">
          {["Alle", "Vertraagd bij Allure", "Te verwerken"].map((v, i) => (
            <span key={v} className={cn("rounded-md px-2.5 py-1", i === 1 ? "bg-abyss text-mesh-ink" : "text-ink-2")}>
              {v}
            </span>
          ))}
          <span className="ml-auto text-ink-3">Opgeslagen als weergave</span>
        </div>
      </div>
    </MomentFrame>
  )
}

function MergeMini() {
  return (
    <MomentFrame>
      <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-lg bg-paper text-left window-lift">
        <div className="flex items-center gap-2 px-4 pt-4 text-ink-3 text-xs">
          <GitMerge size={13} />
          Waarschijnlijk dezelfde persoon
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {[["Sarah Kowalski", "sarah.k@example.com", "4 bestellingen"], [
            "Sarah K.",
            "sarah.k@example.com",
            "1 ticket"
          ]].map((
            [n, e, c]
          ) => (
            <div key={n} className="flex items-center gap-2.5 rounded-md p-3 field">
              <Person initials="SK" size={28} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ink text-sm">{n}</span>
                <span className="truncate text-ink-3 text-xs">{e} · {c}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 bg-mist px-4 py-3 text-xs">
          <span className="rounded-md px-2.5 py-1 text-ink-2">Verschillende mensen</span>
          <span className="rounded-md bg-abyss px-2.5 py-1 font-medium text-mesh-ink">Samenvoegen</span>
        </div>
      </div>
    </MomentFrame>
  )
}

function AgendaMini() {
  const rows = [
    { at: "09:00", what: "DSP-2214 · bewijs indienen bij Klarna", now: false },
    { at: "11:30", what: "Allure · nieuwe overdrachtsdatum bevestigen", now: true },
    { at: "14:00", what: "TKT-0902 · terugbellen", now: false }
  ]
  return (
    <MomentFrame>
      <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-lg bg-paper text-left window-lift">
        <div className="flex items-center gap-1 px-4 pt-4 text-sm">
          {["Overzicht", "Mijn werk", "Agenda"].map((t, i) => (
            <span key={t} className={cn("rounded-md px-2.5 py-1", i === 2 ? "bg-abyss text-mesh-ink" : "text-ink-2")}>
              {t}
            </span>
          ))}
        </div>
        <ul className="relative flex flex-col p-4">
          {rows.map((r) => (
            <li key={r.at} className="relative flex items-center gap-3 py-2.5">
              <span className="w-12 text-ink-3 text-xs tabular-nums">{r.at}</span>
              <span
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm",
                  r.now ? "bg-arc-tint text-arc-ink" : "bg-mist text-ink"
                )}
              >
                {r.what}
              </span>
              {r.now ? <span aria-hidden className="absolute right-0 left-12 -top-px h-px bg-arc" /> : null}
            </li>
          ))}
        </ul>
      </div>
    </MomentFrame>
  )
}

const ENTRIES: ReadonlyArray<{
  readonly at: string
  readonly title: string
  readonly body: string
  readonly to: string
  readonly render: () => ReactNode
}> = [
  {
    at: "2026-10-27",
    title: "Filters die je bewaart",
    body: "Regels die lezen als een zin, groepen met en/of, en elke filter op te slaan als weergave boven de lijst.",
    to: "/orders",
    render: () => <FilterMini />
  },
  {
    at: "2026-10-22",
    title: "Dubbele klanten samenvoegen",
    body: "Insyte vindt profielen van dezelfde persoon en vraagt per groep of ze samen moeten. Met Ongedaan maken.",
    to: "/customers",
    render: () => <MergeMini />
  },
  {
    at: "2026-10-16",
    title: "Het leveranciersportaal",
    body:
      "Leveranciers accepteren bestellingen, verzenden met track & trace en melden problemen, in je eigen werkruimte.",
    to: "/suppliers",
    render: () => <ShipMoment on />
  },
  {
    at: "2026-10-09",
    title: "Mijn werk en Agenda op Start",
    body: "Je to-do's, toegewezen tickets en deadlines op één lijst, en alles met een tijd op één klok.",
    to: "/dashboard",
    render: () => <AgendaMini />
  },
  {
    at: "2026-10-02",
    title: "Mailboxen in de inbox",
    body:
      "Gesprekken per gekoppelde mailbox, toe te wijzen aan een collega, met een melding als een koppeling verloopt.",
    to: "/inbox",
    render: () => <InboxMoment on />
  }
]

const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
const fmt = (iso: string) => day.format(new Date(`${iso}T12:00:00Z`))

function Entry({ entry, index }: { readonly entry: (typeof ENTRIES)[number]; readonly index: number }) {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  return (
    <li className="relative grid gap-6 pb-20 pl-8 last:pb-0 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10 md:pl-0">
      <div className="md:sticky md:top-28 md:self-start md:pl-8">
        <motion.span
          aria-hidden
          className="absolute top-1.5 left-[-4px] size-[9px] bg-abyss md:left-[-4px]"
          initial={reduced ? false : { scale: 0, rotate: 45 }}
          whileInView={{ scale: 1, rotate: 0 }}
          viewport={{ once: true, margin: "0px 0px -45% 0px" }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <time dateTime={entry.at} className="font-medium text-ink text-md">{fmt(entry.at)}</time>
        <span className="mt-0.5 block text-ink-3 text-sm">
          {index === 0 ? "Nieuwste" : `${index + 1} van ${ENTRIES.length}`}
        </span>
      </div>
      <article className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="font-medium text-3xl text-ink">{entry.title}</h2>
          <p className="max-w-[56ch] text-ink-2 text-lg">{entry.body}</p>
          <a
            href={links.inApp(entry.to)}
            className="mt-1 inline-flex w-fit items-center gap-1.5 font-medium text-arc-ink text-base hover:text-abyss"
          >
            Openen in de console
            <ArrowUpRight size={15} />
          </a>
        </div>
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {entry.render()}
        </motion.div>
      </article>
    </li>
  )
}

export function ChangelogPage({ links }: { readonly links: MarketingLinks }) {
  const list = useRef<HTMLOListElement | null>(null)
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 0.4", "end 0.6"] })
  const scaleY = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.4 })
  return (
    <MarketingPage links={links}>
      <PageHero
        ground="glacier"
        title="Changelog."
        second="Wat er bij kwam."
        lede="Wat er de afgelopen weken in de console bij kwam, het nieuwste eerst. Elke regel opent de plek waar het woont."
        fields={[
          { label: "Laatste update", value: <time dateTime={ENTRIES[0]!.at}>{fmt(ENTRIES[0]!.at)}</time> },
          { label: "Updates", value: ENTRIES.length }
        ]}
      />
      <section aria-label="Updates" className="bg-paper">
        <Frame top={false} inner="pt-16 pb-24 sm:pt-24 sm:pb-32">
          <ol ref={list} className="relative">
            <span aria-hidden className="absolute top-2 bottom-0 left-0 w-px dash-y" />
            <motion.span
              aria-hidden
              className="absolute top-2 bottom-0 left-0 w-px origin-top bg-abyss"
              style={{ scaleY }}
            />
            {ENTRIES.map((e, i) => <Entry key={e.at} entry={e} index={i} />)}
          </ol>
        </Frame>
      </section>
    </MarketingPage>
  )
}

/* ── Roadmap ──────────────────────────────────────────────────────────────────────────────────── */

type Plan = {
  readonly title: string
  readonly body: string
  readonly Icon: (typeof ICONS)[number]
  readonly vendors?: ReadonlyArray<Vendor>
}

const ICONS = [
  Shield,
  Key,
  Truck,
  Receipt,
  Plug,
  Database,
  Search,
  Sparkles,
  Globe,
  Wallet,
  Users,
  Calendar,
  Bot,
  Undo2,
  BookOpen,
  MessagesSquare,
  RotateCcw,
  ClipboardCheck
] as const

const GROUPS: ReadonlyArray<{ readonly title: string; readonly plans: ReadonlyArray<Plan> }> = [
  {
    title: "Inloggen en beveiliging",
    plans: [
      {
        title: "SAML en OIDC",
        body: "Inloggen via je eigen identiteitsprovider, naast Google Workspace.",
        Icon: Shield
      },
      {
        title: "Virusscan op bijlagen",
        body: "Bijlagen in de inbox en tickets gescand voordat iemand ze opent.",
        Icon: Shield
      },
      { title: "Een dataregio in de VS", body: "Naast de EU een tweede regio, per werkruimte te kiezen.", Icon: Globe }
    ]
  },
  {
    title: "Koppelingen",
    plans: [
      {
        title: "Vervoerders rechtstreeks",
        body: "Retourlabels en tracking bij DHL en PostNL zelf, en verzendlabels via Sendcloud.",
        Icon: Truck,
        vendors: ["dhl", "postnl", "sendcloud"]
      },
      {
        title: "Boekhouding",
        body: "Verkoopfacturen en creditnota's in Exact Online, en e-facturen via Peppol.",
        Icon: Receipt,
        vendors: ["exact"]
      },
      {
        title: "Spreadsheets, Teams en 365",
        body: "Rijen in Google Sheets en Excel, berichten in Teams, afspraken in de agenda.",
        Icon: Plug,
        vendors: ["sheets", "teams", "microsoft"]
      },
      {
        title: "Leveranciersplatforms",
        body:
          "Bestellingen doorzetten en tracking ophalen bij CJ Dropshipping en AliExpress; Spocket en Modalyst worden onderzocht.",
        Icon: Database
      },
      {
        title: "Gorgias",
        body: "Een ticket doorzetten naar Gorgias als stap in een flow.",
        Icon: Plug,
        vendors: ["gorgias"]
      },
      {
        title: "Advertenties pauzeren",
        body: "Advertenties voor een product stilzetten bij lage voorraad, via Meta.",
        Icon: Plug
      }
    ]
  },
  {
    // ADR-0027, docs/PLAN.md items 28–31.
    title: "De Insyte-agent",
    plans: [
      {
        title: "Zelfstandigheid per actie",
        body:
          "Per soort actie kiezen: Zelf doen, Eerst vragen of Nooit. Geld en klantcontact vragen standaard eerst; wat niet terug kan, vraagt altijd.",
        Icon: Bot
      },
      {
        title: "Logboek van de agent",
        body:
          "Elke actie met wat de agent las en waarom, met Ongedaan maken zolang het venster open staat, en een maandlimiet.",
        Icon: Undo2
      },
      {
        title: "Klantagent op je winkelchat",
        body:
          "Beantwoordt klanten binnen je openingstijden en draagt over aan je inbox als hij twijfelt of als het om geld gaat.",
        Icon: MessagesSquare
      },
      {
        title: "Kennisbank",
        body:
          "De antwoorden van je winkel, met versies, als bron voor de agent. Wat hij niet wist, zie je als open vraag.",
        Icon: BookOpen
      },
      {
        title: "MCP-server",
        body: "Je eigen AI-tools lezen en werken in Insyte, met dezelfde rechten als een API-sleutel.",
        Icon: Plug
      },
      {
        title: "Zoeken op betekenis",
        body: "Vergelijkbare tickets en gesprekken vinden, ook als de woorden verschillen.",
        Icon: Search
      },
      {
        title: "Je eigen AI-sleutel",
        body: "Insyte laten werken met de sleutel van je eigen account bij de aanbieder.",
        Icon: Key
      }
    ]
  },
  {
    // docs/PLAN.md items 24–27.
    title: "Bestellingen en klantenservice",
    plans: [
      {
        title: "Retouren en claims",
        body:
          "Retouren en klachten op één lijst, met redenen, oplossingen en een retourportaal waar je klant zelf begint.",
        Icon: RotateCcw
      },
      {
        title: "Doorsturen naar leveranciers",
        body: "Een wachtrij voor bestellingen die nog naar de leverancier moeten, met de bevestiging of de fout erbij.",
        Icon: Truck
      },
      {
        title: "Kwaliteitscontroles",
        body: "Een controle of monster aanvragen bij de leverancier, goedkeuren of afkeuren, en klachten per product.",
        Icon: ClipboardCheck
      },
      {
        title: "WhatsApp, Instagram en websitechat",
        body: "Berichten uit elk kanaal in dezelfde inbox als je e-mail, met de klant en zijn bestelling erbij.",
        Icon: MessagesSquare
      }
    ]
  },
  {
    title: "Partners en taal",
    plans: [
      {
        title: "Uitbetalen via Stripe Connect",
        body: "Partners rechtstreeks uitbetalen in plaats van via een export.",
        Icon: Wallet
      },
      { title: "Engels", body: "Engels als tweede taal van de console, naast het Nederlands.", Icon: Globe }
    ]
  }
]

/** A plan as a construction outline: its dashed edge drawn in once it arrives. */
function Outline({ plan, i }: { readonly plan: Plan; readonly i: number }) {
  const reduced = useReducedMotion() === true
  return (
    <RevealItem className="relative">
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <motion.rect
          x="0.5"
          y="0.5"
          style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }}
          rx="12"
          fill="none"
          stroke="color-mix(in oklch, var(--ink) 28%, transparent)"
          strokeWidth="1"
          strokeDasharray="5 5"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.1, delay: 0.06 * i, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
      <div className="flex h-full flex-col gap-4 p-6">
        <span className="flex items-center justify-between">
          <span className="flex size-9 items-center justify-center rounded-md bg-ink/5 text-ink-2">
            <plan.Icon size={17} />
          </span>
          <span className="rounded-full border border-dashed border-ink/25 px-2 py-0.5 text-ink-3 text-xs">
            Gepland
          </span>
        </span>
        <span className="flex flex-col gap-1.5">
          <h3 className="font-medium text-ink text-lg">{plan.title}</h3>
          <p className="text-ink-2 text-sm">{plan.body}</p>
        </span>
        {plan.vendors === undefined ? null : (
          <span className="mt-auto flex gap-1.5">
            {plan.vendors.map((v) => <Logo key={v} vendor={v} size={24} label />)}
          </span>
        )}
      </div>
    </RevealItem>
  )
}

export function RoadmapPage({ links }: { readonly links: MarketingLinks }) {
  const total = GROUPS.reduce((n, g) => n + g.plans.length, 0)
  let k = 0
  return (
    <MarketingPage links={links}>
      <PageHero
        align="center"
        title="Roadmap."
        second="Plannen, geen beloftes."
        lede="Wat er gepland staat na wat Insyte nu doet. Zonder datums: een plan verschuift als iets anders eerst moet. Wat al kan, staat in de changelog."
        fields={[
          { label: "Plannen", value: total },
          { label: "Datums", value: "Geen" },
          { label: "Status", value: "Gepland" }
        ]}
      />
      {GROUPS.map((g, gi) => (
        <section key={g.title} aria-labelledby={`plan-${gi}`} className={gi % 2 === 0 ? "bg-paper" : "bg-glacier"}>
          <Frame top={gi > 0} inner="py-16 sm:py-20">
            <SectionHead id={`plan-${gi}`} title={g.title} />
            <Reveal className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.plans.map((p) => <Outline key={p.title} plan={p} i={k++} />)}
            </Reveal>
          </Frame>
        </section>
      ))}
      <section aria-labelledby="al-kan" className="bg-paper">
        <Frame inner="py-16 sm:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="al-kan" className="flex items-center gap-3 font-medium text-2xl text-ink">
              <span className="flex size-8 items-center justify-center rounded-md bg-abyss text-mesh-ink">
                <Check size={16} />
              </span>
              Wat al kan, staat in de changelog.
            </h2>
            <a href={links.page("/changelog")} className="font-medium text-arc-ink text-md hover:text-abyss">
              Naar de changelog
            </a>
          </div>
        </Frame>
      </section>
    </MarketingPage>
  )
}
