import type { CSSProperties } from "react"
import {
  ArrowUpRight,
  ClipboardCheck,
  type IconComponent,
  Key,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Webhook,
  Workflow
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { Chapter } from "./chapter.tsx"
import { MORE_TEMPLATES, TEMPLATES } from "./demo-data.ts"
import { useMarketingLinks } from "./links.tsx"
import { Reveal, RevealItem } from "./motion.tsx"
import { ArrowLink, Logo, type Vendor } from "./parts.tsx"

/*
 * The abyss band, one composed section in three movements under one headline: what Insyte works
 * with (Calendly's chain of large tiles, then four suites), the automation library as a marquee with
 * each template's services (automation-templates.ts), and who may do what — one translucent sheet
 * ruled into six cells by dashed chalk lines, each
 * a control the console really has (Settings → Rollen, Beveiliging, API-sleutels, Webhooks,
 * Winkels), over a faint chart axis in chalk.
 */

const CONTROLS: ReadonlyArray<{ readonly Icon: IconComponent; readonly title: string; readonly body: string }> = [
  {
    Icon: Users,
    title: "Rollen en rechten",
    body:
      "Eigen rollen per gebied en per winkel, met een terugbetaallimiet. Leveranciers en partners zien alleen hun deel."
  },
  {
    Icon: ClipboardCheck,
    title: "Auditlog",
    body:
      "Een alleen-lezen spoor van elke gevoelige beheeractie, te exporteren. Automatiseringen staan onder hun eigen naam."
  },
  {
    Icon: ShieldCheck,
    title: "Google SSO en 2FA",
    body: "Inloggen met Google Workspace, en tweestapsverificatie die je voor het hele team kunt verplichten."
  },
  {
    Icon: Key,
    title: "API-sleutels",
    body: "Sleutels met hun eigen scopes, winkels, looptijd en toegestane adressen. Het geheim zie je één keer."
  },
  {
    Icon: Webhook,
    title: "Webhooks",
    body: "Gebeurtenissen naar je eigen endpoints, ondertekend, met nieuwe pogingen en een leveringslog."
  },
  {
    Icon: Store,
    title: "Meerdere winkels",
    body: "Al je Shopify-winkels in één werkruimte, elk in zijn eigen valuta, met rechten per winkel."
  }
]

/* A chart's axis and one rising line, in chalk, behind the sheet: the ground of a drawing that
   measures something. Decoration only. */
function Axis() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1180 560"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full text-mesh-ink"
      fill="none"
    >
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line
            x1="0"
            x2="1180"
            y1={100 + i * 120}
            y2={100 + i * 120}
            stroke="currentColor"
            strokeOpacity="0.07"
            strokeDasharray="4 6"
          />
          <text x="4" y={94 + i * 120} fill="currentColor" fillOpacity="0.28" fontSize="12">
            € {(80 - i * 20).toString()}k
          </text>
        </g>
      ))}
      <path
        d="M0 470 C 260 466, 420 452, 600 400 S 940 230, 1180 40"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
    </svg>
  )
}

type Template = (typeof TEMPLATES)[number]

/** One automation as a chip: its name and the chain of services its steps run on. */
function AutomationChip({ t }: { readonly t: Template }) {
  return (
    <li className="flex shrink-0 items-center gap-3 rounded-lg bg-mesh-ink/[0.06] py-2.5 pr-4 pl-2.5 chalk-line">
      <span className="flex items-center gap-1">
        {t.steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 ? <span className="h-px w-2 bg-mesh-ink/30" /> : null}
            {s.vendor !== undefined
              ? <Logo vendor={s.vendor} size={22} />
              : (
                <span className="flex size-[22px] items-center justify-center rounded-sm bg-mesh-ink/12 text-mesh-ink-2">
                  {s.ai === true ? <Sparkles size={12} /> : <Workflow size={12} />}
                </span>
              )}
          </span>
        ))}
      </span>
      <span className="whitespace-nowrap text-base text-mesh-ink">{t.name}</span>
    </li>
  )
}

/** A row of the marquee: the list twice, the copy silent, drifting left or right. */
function MarqueeRow(
  { items, reverse, duration }: {
    readonly items: ReadonlyArray<Template>
    readonly reverse: boolean
    readonly duration: number
  }
) {
  return (
    <div className="marquee overflow-hidden">
      <div
        className="marquee-track flex gap-3"
        data-reverse={reverse}
        style={{ "--marquee-duration": `${duration}s` } as CSSProperties}
      >
        <ul className="flex shrink-0 gap-3">
          {items.map((t) => <AutomationChip key={t.id} t={t} />)}
        </ul>
        <ul aria-hidden className="marquee-copy flex shrink-0 gap-3">
          {items.map((t) => <AutomationChip key={t.id} t={t} />)}
        </ul>
      </div>
    </div>
  )
}

const LIBRARY: ReadonlyArray<Template> = [...TEMPLATES, ...MORE_TEMPLATES]

/* The chain of services: two rows of large tiles joined by short necks, the second row set half a
   tile in, both drifting slowly in opposite directions. */
export const ROW_A: ReadonlyArray<Vendor> = [
  "shopify",
  "gmail",
  "stripe",
  "klarna",
  "slack",
  "dhl",
  "aftership",
  "sheets"
]
export const ROW_B: ReadonlyArray<Vendor> = [
  "outlook",
  "paypal",
  "klaviyo",
  "teams",
  "postnl",
  "zapier",
  "microsoft",
  "google"
]
/* Each list twice over, so one copy is always wider than the widest screen and the loop never shows
   its end. */
const CHAIN_A = [...ROW_A, ...ROW_A]
const CHAIN_B = [...ROW_B, ...ROW_B]

function Chain({ vendors, label }: { readonly vendors: ReadonlyArray<Vendor>; readonly label: boolean }) {
  return (
    <ul aria-hidden={!label} className={cn("flex shrink-0 items-center", !label && "marquee-copy")}>
      {vendors.map((v, i) => (
        <li key={`${v}-${i}`} className="flex items-center">
          <span className="group/tile flex size-[112px] items-center justify-center rounded-xl bg-mesh-ink/[0.08] chalk-line transition-transform duration-[240ms] ease-[var(--ease-out-expo)] hover:-translate-y-1.5 max-sm:size-[84px]">
            <Logo vendor={v} size={48} label={label} />
          </span>
          <span aria-hidden className="h-4 w-5 bg-mesh-ink/[0.08]" />
        </li>
      ))}
    </ul>
  )
}

export function ChainRow(
  { vendors, reverse, offset }: {
    readonly vendors: ReadonlyArray<Vendor>
    readonly reverse: boolean
    readonly offset: boolean
  }
) {
  return (
    <div className="marquee overflow-hidden py-1.5">
      <div
        className={cn("marquee-track flex", offset && "pl-[66px] max-sm:pl-[52px]")}
        data-reverse={reverse}
        style={{ "--marquee-duration": "90s" } as CSSProperties}
      >
        <Chain vendors={vendors} label />
        <Chain vendors={vendors} label={false} />
      </div>
    </div>
  )
}

/* The suites, each a set of services the console connects (workspace-store.ts, security.tsx). */
const SUITES: ReadonlyArray<
  { readonly vendors: ReadonlyArray<Vendor>; readonly title: string; readonly body: string; readonly path: string }
> = [
  {
    vendors: ["shopify"],
    title: "Shopify",
    body: "Bestellingen, producten, klanten en verzendingen, uit al je winkels. Koppelen met OAuth.",
    path: "/settings/stores"
  },
  {
    vendors: ["gmail", "google"],
    title: "Google",
    body: "Gmail als inbox voor klantenservice, en inloggen met Google Workspace voor je team.",
    path: "/settings/integrations"
  },
  {
    vendors: ["outlook", "teams"],
    title: "Microsoft",
    body: "Outlook als inbox, Teams en Microsoft 365 als stap in je automatiseringen.",
    path: "/settings/integrations"
  },
  {
    vendors: ["stripe", "klarna", "paypal"],
    title: "Betalingen",
    body: "Stripe, Klarna en PayPal: betalingen, terugbetalingen en geschillen met hun deadlines.",
    path: "/settings/integrations"
  }
]

export function Integrations() {
  const links = useMarketingLinks()
  return (
    <Chapter id="koppelingen" labelledBy="koppelingen-kop">
      <div className="flex flex-col items-center gap-5 pt-24 pb-14 text-center sm:pt-32">
        <h2 id="koppelingen-kop" className="max-w-[28ch] font-medium text-4xl text-mesh-ink sm:text-display-sm">
          Werkt met wat je al gebruikt.
          <span className="block text-mesh-ink-2">Eén keer koppelen, daarna op één scherm.</span>
        </h2>
        <p className="max-w-[52ch] text-lg text-mesh-ink-2">
          Je winkel, je inbox, je betaalproviders, je vervoerders en de diensten waar je team in werkt.
        </p>
        <ArrowLink href={links.page("/koppelingen")} onDark>Alle koppelingen</ArrowLink>
      </div>

      <div className="bleed flex flex-col">
        <ChainRow vendors={CHAIN_A} reverse={false} offset={false} />
        <ChainRow vendors={CHAIN_B} reverse offset />
      </div>

      <Reveal as="ul" className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUITES.map((s) => (
          <RevealItem
            as="li"
            key={s.title}
            className="relative flex flex-col gap-3 rounded-xl bg-mesh-ink/[0.06] p-5 chalk-line"
          >
            <span className="flex gap-1.5">
              {s.vendors.map((v) => <Logo key={v} vendor={v} size={32} />)}
            </span>
            <h3 className="font-medium text-lg text-mesh-ink">{s.title}</h3>
            <p className="text-base text-mesh-ink-2">{s.body}</p>
            <a
              href={links.inApp(s.path)}
              aria-label={`${s.title} in Insyte bekijken`}
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md bg-mesh-ink/10 text-mesh-ink transition-colors hover:bg-mesh-ink/18"
            >
              <ArrowUpRight size={15} />
            </a>
          </RevealItem>
        ))}
      </Reveal>

      <div className="relative mt-20 pt-14 sm:mt-24">
        <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk" />
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="max-w-[24ch] font-medium text-2xl text-mesh-ink sm:text-3xl">
            Tien sjablonen, klaar om aan te zetten.
            <span className="block text-mesh-ink-2">Elke stap op een dienst die je al hebt.</span>
          </h3>
          <ArrowLink href={links.inApp("/automations")} external onDark>Automatiseringen bekijken</ArrowLink>
        </div>
        <div aria-label="Sjablonen voor automatiseringen" role="region" className="bleed flex flex-col gap-3">
          <MarqueeRow items={LIBRARY.slice(0, 5)} reverse={false} duration={70} />
          <MarqueeRow items={LIBRARY.slice(5)} reverse duration={80} />
        </div>
      </div>

      <div id="beveiliging" className="relative mt-20 scroll-mt-24 pt-14 pb-24 sm:mt-24 sm:pb-32">
        <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk" />
        <h3 className="mb-10 max-w-[24ch] font-medium text-2xl text-mesh-ink sm:text-3xl">
          Met rechten die kloppen.
          <span className="block text-mesh-ink-2">Voor je team, je leveranciers en je code.</span>
        </h3>
        <div className="relative">
          <Axis />
          <Reveal className="relative grid overflow-hidden rounded-xl bg-mesh-ink/[0.06] text-mesh-ink chalk-line sm:grid-cols-2 lg:grid-cols-3">
            {CONTROLS.map(({ Icon, body, title }, i) => (
              <RevealItem key={title} className="relative flex flex-col gap-2 p-6 sm:p-8">
                {i % 3 !== 0
                  ? <span aria-hidden className="absolute inset-y-0 left-0 hidden w-px dash-y-chalk lg:block" />
                  : null}
                {i >= 3
                  ? <span aria-hidden className="absolute inset-x-0 top-0 hidden h-px dash-x-chalk lg:block" />
                  : null}
                {i > 0 ? <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk lg:hidden" /> : null}
                <h4 className="flex items-center gap-2.5 font-medium text-lg text-mesh-ink">
                  <Icon size={18} className="text-mesh-ink-2" />
                  {title}
                </h4>
                <p className="max-w-[42ch] text-base text-mesh-ink-2">{body}</p>
              </RevealItem>
            ))}
          </Reveal>
        </div>
        <div className="mt-8">
          <ArrowLink href={links.page("/beveiliging")} onDark>Alles over beveiliging</ArrowLink>
        </div>
      </div>
    </Chapter>
  )
}
