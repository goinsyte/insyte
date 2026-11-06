import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion } from "motion/react"
import { type CSSProperties, type ReactNode, useRef, useState } from "react"
import {
  Check,
  Download,
  type IconComponent,
  Key,
  Lock,
  MonitorSmartphone,
  Shield,
  ShieldCheck,
  Smartphone,
  Webhook
} from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { SoonTag } from "../agent-panels.tsx"
import { Person } from "../chrome.tsx"
import { STORES } from "../demo-data.ts"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { Reveal, RevealItem } from "../motion.tsx"
import { ArrowLink, Logo, Mark } from "../parts.tsx"
import { useScrollVar } from "../scroll.ts"
import { useRunning, useTicker } from "./hooks.ts"
import { MarketingPage, PageHero, PageSection, SectionHead } from "./shell.tsx"

/*
 * /beveiliging: the controls a team has, drawn with the console's own records, and where the data
 * lives as docs/backend/security.md states it. No certifications, service levels or uptime: there
 * are none. SAML and OIDC are "Later" there, so they appear only as binnenkort.
 *
 * Its moments: the role matrix fills role by role as the page scrolls, then a team's own role is
 * drawn from Klantenservice and its changed cells re-set (scrubbed, reversible); the audit log
 * takes new lines while it is on screen; a webhook delivery runs from the mark to the endpoint.
 */

/* ── Roles, as `packages/ui/src/app/lib/permissions.ts` defines them ─────────────────────────────── */

type Level = 0 | 1 | 2 | 3

const AREAS = [
  { id: "orders", label: "Bestellingen" },
  { id: "customers", label: "Klanten" },
  { id: "products", label: "Producten" },
  { id: "support", label: "Klantenservice" },
  { id: "chargebacks", label: "Chargebacks" },
  { id: "suppliers", label: "Leveranciers" },
  { id: "affiliates", label: "Affiliates" },
  { id: "automations", label: "Automatiseringen" },
  { id: "analytics", label: "Analyse" },
  { id: "data", label: "Data en export" },
  { id: "settings", label: "Instellingen" },
  { id: "team", label: "Team en rollen" },
  { id: "billing", label: "Facturatie" },
  { id: "integrations", label: "Koppelingen en API" }
] as const

type AreaId = (typeof AREAS)[number]["id"]

/** The levels an area offers (Analyse stops at Bekijken; Facturatie has no Bewerken). */
const OFFERS: Partial<Record<AreaId, ReadonlyArray<Level>>> = { analytics: [0, 1], billing: [0, 1, 3] }

const clamp = (a: AreaId, want: Level): Level => {
  let best: Level = 0
  for (const l of OFFERS[a] ?? [0, 1, 2, 3]) if (l <= want) best = l as Level
  return best
}

const levels = (map: Partial<Record<AreaId, Level>>, fill: Level = 0) =>
  Object.fromEntries(AREAS.map(({ id }) => [id, clamp(id, map[id] ?? fill)])) as Record<AreaId, Level>

type Role = {
  readonly id: string
  readonly label: string
  readonly levels: Record<AreaId, Level>
  readonly refund: string
}

const ROLES: ReadonlyArray<Role> = [
  { id: "owner", label: "Eigenaar", levels: levels({}, 3), refund: "Geen grens" },
  { id: "admin", label: "Beheerder", levels: levels({ billing: 1 }, 3), refund: "Geen grens" },
  {
    id: "service",
    label: "Klantenservice",
    levels: levels({
      orders: 2,
      customers: 2,
      products: 1,
      support: 3,
      chargebacks: 2,
      suppliers: 1,
      automations: 1,
      team: 1
    }),
    refund: "€ 100"
  },
  {
    id: "finance",
    label: "Financiën",
    levels: levels({
      orders: 2,
      customers: 1,
      products: 1,
      chargebacks: 3,
      suppliers: 1,
      affiliates: 2,
      analytics: 1,
      data: 1,
      billing: 3,
      team: 1
    }),
    refund: "Geen grens"
  },
  {
    id: "view",
    label: "Alleen lezen",
    levels: levels({ billing: 0 }, 1),
    refund: "Geen recht"
  }
]

/** The team's own role, made from Klantenservice: the seeded CX-lead. */
const CUSTOM: Role = {
  id: "cx-lead",
  label: "CX-lead",
  levels: levels({
    orders: 2,
    customers: 3,
    products: 1,
    support: 3,
    chargebacks: 2,
    suppliers: 1,
    automations: 1,
    analytics: 1,
    team: 2
  }),
  refund: "€ 250"
}

const BASE = ROLES[2]!

const LEVEL_LABEL = ["Geen", "Bekijken", "Bewerken", "Beheren"] as const

/** A scrubbed amount, 0 → 1, of the matrix's progress `--p` between `from` and `from + span`. */
const amt = (from: number, span = 0.08) => `clamp(0, calc((var(--p, 1) - ${from}) / ${span}), 1)`

function Squares({ level }: { readonly level: Level }) {
  return (
    <span aria-hidden className="flex gap-[3px]">
      {[1, 2, 3].map((i) => <span key={i} className={cn("size-[7px]", i <= level ? "bg-abyss" : "bg-ink/10")} />)}
    </span>
  )
}

function LevelCell({ level }: { readonly level: Level }) {
  return (
    <span className="flex items-center justify-center">
      <Squares level={level} />
      <span className="sr-only">{LEVEL_LABEL[level]}</span>
    </span>
  )
}

const START = (j: number) => 0.04 + j * 0.07
const CUSTOM_IN = 0.44
const MORPH = 0.58

function RoleMatrix() {
  const runway = useRef<HTMLDivElement | null>(null)
  const p = useScrollVar(runway, { offset: ["start 0.2", "end end"] })
  const [phase, setPhase] = useState(1)
  const reduced = useReducedMotion() === true
  useMotionValueEvent(p, "change", (v) => {
    if (reduced) return
    const next = v < CUSTOM_IN ? 0 : 1
    if (next !== phase) setPhase(next)
  })

  const fade = (s: number): CSSProperties => ({
    opacity: amt(s),
    transform: `translateY(calc((1 - ${amt(s)}) * 6px))`
  })

  return (
    <section aria-labelledby="rollen-kop" className="bg-paper">
      <Frame inner="py-0">
        <div ref={runway} className="role-matrix relative md:h-[240vh]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 py-20 sm:py-28 md:sticky md:top-16 md:flex md:h-[calc(100svh-4rem)] md:items-center md:gap-12 md:py-0 lg:gap-16">
            <div className="flex flex-col gap-6 md:w-[300px] md:shrink-0 lg:w-[340px]">
              <SectionHead
                id="rollen-kop"
                title="Wie wat mag."
                second="Per onderdeel, per rol."
                lede="Een rol geeft per onderdeel een niveau. Een werkruimte begint met vijf rollen; een team maakt er eigen rollen bij."
              />
              <div className="relative min-h-[5.5rem]">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.p
                    key={phase}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    className="max-w-[38ch] text-ink-2 text-md"
                  >
                    {phase === 0
                      ? "Eigenaar, Beheerder, Klantenservice, Financiën en Alleen lezen: elk met een niveau per onderdeel en een grens voor terugbetalen."
                      : "Een eigen rol begint als kopie. CX-lead is gemaakt van Klantenservice, met meer rechten op klanten en het team en een hogere terugbetaalgrens."}
                  </motion.p>
                </AnimatePresence>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-ink-3 text-sm">
                {([0, 1, 2, 3] as const).map((l) => (
                  <li key={l} className="flex items-center gap-2">
                    <Squares level={l} />
                    {LEVEL_LABEL[l]}
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 flex-1">
              <div className="no-scrollbar overflow-x-auto rounded-lg panel">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <caption className="sr-only">
                    Niveaus per onderdeel voor de vijf standaardrollen en de eigen rol CX-lead
                  </caption>
                  <thead>
                    <tr className="bg-mist">
                      <th scope="col" className="w-[170px] px-4 py-3 font-normal text-ink-3 text-xs">Onderdeel</th>
                      {ROLES.map((r, j) => (
                        <th
                          key={r.id}
                          scope="col"
                          className="px-2 py-3 text-center font-medium text-ink text-xs"
                          style={fade(START(j))}
                        >
                          {r.label}
                        </th>
                      ))}
                      <th
                        scope="col"
                        className="relative bg-arc-tint px-2 py-3 text-center font-medium text-arc-ink text-xs"
                        style={fade(CUSTOM_IN)}
                      >
                        {CUSTOM.label}
                        <span className="block font-normal text-2xs text-arc-ink/80">van Klantenservice</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {AREAS.map((a, i) => {
                      const changed = CUSTOM.levels[a.id] !== BASE.levels[a.id]
                      return (
                        <tr key={a.id} className="border-hairline border-t">
                          <th scope="row" className="px-4 py-[7px] font-normal text-ink-2 text-xs">{a.label}</th>
                          {ROLES.map((r, j) => (
                            <td key={r.id} className="px-2 py-[7px]" style={fade(START(j) + i * 0.004)}>
                              <LevelCell level={r.levels[a.id]} />
                            </td>
                          ))}
                          <td className="relative bg-arc-tint/40 px-2 py-[7px]" style={fade(CUSTOM_IN + i * 0.003)}>
                            {changed
                              ? (
                                <>
                                  <span
                                    aria-hidden
                                    className="absolute inset-0.5 rounded-sm bg-arc-tint"
                                    style={{ opacity: amt(MORPH + 0.04, 0.1) }}
                                  />
                                  <span
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{ opacity: `calc(1 - ${amt(MORPH, 0.1)})` }}
                                  >
                                    <Squares level={BASE.levels[a.id]} />
                                  </span>
                                  <span
                                    className="relative flex items-center justify-center"
                                    style={{ opacity: amt(MORPH, 0.1) }}
                                  >
                                    <Squares level={CUSTOM.levels[a.id]} />
                                  </span>
                                  <span className="sr-only">{LEVEL_LABEL[CUSTOM.levels[a.id]]}</span>
                                </>
                              )
                              : <LevelCell level={CUSTOM.levels[a.id]} />}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-hairline border-t bg-mist/60">
                      <th scope="row" className="px-4 py-2.5 font-medium text-ink text-xs">Terugbetalen tot</th>
                      {ROLES.map((r, j) => (
                        <td
                          key={r.id}
                          className="px-2 py-2.5 text-center text-ink-2 text-xs tabular-nums"
                          style={fade(START(j) + 0.06)}
                        >
                          {r.refund}
                        </td>
                      ))}
                      <td
                        className="relative bg-arc-tint px-2 py-2.5 text-center text-xs tabular-nums"
                        style={fade(CUSTOM_IN)}
                      >
                        <span
                          className="absolute inset-0 flex items-center justify-center text-ink-2"
                          style={{ opacity: `calc(1 - ${amt(MORPH + 0.08, 0.1)})` }}
                        >
                          {BASE.refund}
                        </span>
                        <span className="relative font-medium text-arc-ink" style={{ opacity: amt(MORPH + 0.08, 0.1) }}>
                          {CUSTOM.refund}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-ink-3 text-sm">
                Uit de demowerkruimte. Een rol kan ook worden beperkt tot bepaalde winkels.
              </p>
            </div>
          </div>
        </div>
      </Frame>
    </section>
  )
}

/* ── Signing in ───────────────────────────────────────────────────────────────────────────────── */

function Toggle({ on }: { readonly on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-[320ms]",
        on ? "bg-abyss" : "bg-ink/15"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-paper shadow-sm transition-transform duration-[320ms] ease-[var(--ease-out-expo)]",
          on && "translate-x-4"
        )}
      />
    </span>
  )
}

const CODE = "482915"

function Cell(
  { title, line, children }: { readonly title: string; readonly line: string; readonly children: ReactNode }
) {
  return (
    <RevealItem className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h3 className="font-medium text-ink text-xl">{title}</h3>
        <p className="max-w-[40ch] text-ink-3 text-md">{line}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </RevealItem>
  )
}

function SignIn() {
  const links = useMarketingLinks()
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.35)
  const tick = useTicker(run, 420)
  const reduced = useReducedMotion() === true
  // One cycle of 16 ticks: the policy switches on, the code types, the check lands, a pause.
  const t = run ? tick % 16 : 15
  const policy = reduced || !run ? true : t >= 2
  const typed = reduced || !run ? 6 : Math.max(0, Math.min(6, t - 4))
  const done = typed === 6
  return (
    <section aria-labelledby="inloggen-kop" className="bg-glacier">
      <Frame inner="py-20 sm:py-28">
        <SectionHead
          id="inloggen-kop"
          title="Inloggen zoals je team dat wil."
          second="Met Google, en met een tweede stap."
          lede="Inloggen met Google kan voor iedereen. Een werkruimte kan Google Workspace verplichten en tweestapsverificatie voor het hele team aanzetten."
        />
        <div ref={ref} className="mt-12 rounded-lg bg-paper hairline">
          <Reveal className="grid divide-y divide-dashed divide-ink/15 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <Cell title="Inloggen met Google" line="Je team logt in met het Google-account dat het al heeft.">
              <div className="flex flex-col gap-2 rounded-lg bg-glacier p-4">
                <span className="flex h-10 items-center justify-center gap-2.5 rounded-md bg-paper font-medium text-ink text-sm hairline">
                  <img src="/logos/google.svg" alt="" width={16} height={16} loading="lazy" />
                  Doorgaan met Google
                </span>
                <span className="text-center text-ink-3 text-xs">of met e-mail en wachtwoord</span>
              </div>
            </Cell>
            <Cell
              title="Google Workspace verplicht"
              line="Voor gekozen domeinen kan alleen nog worden ingelogd met een Workspace-account van dat domein."
            >
              <div className="flex flex-col gap-3 rounded-lg bg-glacier p-4">
                <span className="flex items-center justify-between gap-3 text-ink text-sm">
                  Alleen Google Workspace
                  <Toggle on={policy} />
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-ink-3 text-xs">
                  Domein
                  <span className="rounded-sm bg-paper px-2 py-1 text-ink-2 hairline">northwindclothing.co</span>
                </span>
              </div>
            </Cell>
            <Cell
              title="Tweestapsverificatie"
              line="Een code uit een authenticator-app, met back-upcodes. Te verplichten voor alle teamleden."
            >
              <div className="flex flex-col gap-3 rounded-lg bg-glacier p-4">
                <span className="flex gap-1.5" aria-label="Zescijferige code">
                  {CODE.split("").map((d, i) => (
                    <span
                      key={i}
                      className={cn(
                        "flex h-10 flex-1 items-center justify-center rounded-md bg-paper font-medium text-ink text-lg tabular-nums transition-shadow",
                        i === typed && !done ? "shadow-[inset_0_0_0_1px_var(--arc)]" : "hairline"
                      )}
                    >
                      {i < typed ? d : ""}
                    </span>
                  ))}
                </span>
                <span className="flex h-5 items-center gap-1.5 text-sm">
                  <AnimatePresence initial={false}>
                    {done
                      ? (
                        <motion.span
                          key="ok"
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-arc-ink"
                        >
                          <Check size={14} />
                          Code klopt
                        </motion.span>
                      )
                      : null}
                  </AnimatePresence>
                </span>
              </div>
            </Cell>
          </Reveal>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="rounded-lg bg-paper p-6 hairline sm:p-8">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-medium text-ink text-xl">Actieve sessies</h3>
              <span className="text-ink-3 text-sm">Uit de demowerkruimte</span>
            </div>
            <ul className="mt-5 flex flex-col">
              {[
                {
                  Icon: MonitorSmartphone,
                  device: "MacBook Pro · Chrome",
                  where: "Amsterdam, NL",
                  last: "Nu actief",
                  me: true
                },
                {
                  Icon: Smartphone,
                  device: "iPhone 15 · Safari",
                  where: "Amsterdam, NL",
                  last: "2 uur geleden",
                  me: false
                },
                { Icon: MonitorSmartphone, device: "Linux · Firefox", where: "Berlin, DE", last: "Gisteren", me: false }
              ].map((s) => (
                <li key={s.device} className="flex items-center gap-3 border-hairline border-t py-3 first:border-t-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-mist text-ink-2">
                    <s.Icon size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-ink text-sm">{s.device}</span>
                    <span className="text-ink-3 text-xs">{s.where} · {s.last}</span>
                  </span>
                  {s.me
                    ? <span className="rounded-sm bg-arc-tint px-2 py-1 text-arc-ink text-xs">Dit apparaat</span>
                    : <span className="rounded-md px-2.5 py-1.5 text-ink-2 text-xs field">Afmelden</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-6 rounded-lg border border-dashed border-ink/20 p-6 sm:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 font-medium text-ink text-xl">
                SAML en OIDC
                <span className="rounded-full border border-dashed border-ink/25 px-2 py-0.5 font-normal text-ink-3 text-xs">
                  binnenkort
                </span>
              </h3>
              <p className="max-w-[44ch] text-ink-3 text-md">
                Inloggen via je eigen identiteitsprovider staat gepland, niet gebouwd. Tot dan is Google Workspace
                verplichten de manier om inloggen aan je domein te binden.
              </p>
            </div>
            <ArrowLink href={links.page("/roadmap")}>Op de roadmap</ArrowLink>
          </div>
        </div>
      </Frame>
    </section>
  )
}

/* ── The audit log ────────────────────────────────────────────────────────────────────────────── */

type Entry = { readonly who: string; readonly initials: string; readonly what: string; readonly detail: string }

/* The console's seeded trail (`settings/security.tsx`), newest last so the loop replays it in order. */
const TRAIL: ReadonlyArray<Entry> = [
  { who: "Elena Hart", initials: "EH", what: "Winkel gekoppeld", detail: "Northwind EU" },
  { who: "Ethan Jeppesen", initials: "EJ", what: "Klanten geëxporteerd", detail: "1.284 rijen" },
  { who: "Elena Hart", initials: "EH", what: "Tweestapsverificatie ingeschakeld", detail: "Hele werkruimte" },
  {
    who: "Sofía Kim",
    initials: "SK",
    what: "Teamlid uitgenodigd",
    detail: "liam@northwindclothing.co als Klantenservice"
  },
  { who: "Elena Hart", initials: "EH", what: "App geïnstalleerd", detail: "Klaviyo" },
  { who: "Ethan Jeppesen", initials: "EJ", what: "Bestelling terugbetaald", detail: "Bestelling #1042, US$ 89,00" },
  { who: "Elena Hart", initials: "EH", what: "API-sleutel aangemaakt", detail: "Magazijnsynchronisatie" },
  { who: "Elena Hart", initials: "EH", what: "Rol gewijzigd", detail: "Financiën kan nu chargeback-bewijs indienen" }
]

const SHOWN = 5

function AuditLog() {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.4)
  const tick = useTicker(run, 2600)
  const reduced = useReducedMotion() === true
  const head = (TRAIL.length - 1 + tick) % TRAIL.length
  const rows = Array.from({ length: SHOWN }, (_, i) => {
    const k = (head - i + TRAIL.length * 4) % TRAIL.length
    return {
      key: tick - i,
      entry: TRAIL[k]!,
      ago: i === 0 && tick > 0 ? "zojuist" : `${(i + 1) * (i + 2)} min geleden`
    }
  })
  return (
    <PageSection ground="paper" labelledBy="audit-kop">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHead
            id="audit-kop"
            title="Elke gevoelige actie op een regel."
            second="Die niemand kan wijzigen."
            lede="Het auditlog legt terugbetalingen, ingediend bewijs, rollen en leden, API-sleutels, webhooks, exports en gepubliceerde automatiseringen vast, in dezelfde stap als de wijziging zelf."
          />
          <ul className="flex flex-col gap-2.5 text-base text-ink-2">
            {[
              "Filteren op persoon, actie en datum",
              "Exporteren als CSV",
              "Alleen-lezen: een regel gaat er niet meer af"
            ].map((l) => (
              <li key={l} className="flex items-center gap-2.5">
                <Check size={16} className="text-arc-ink" />
                {l}
              </li>
            ))}
          </ul>
        </div>
        <div ref={ref} className="overflow-hidden rounded-lg bg-paper window-lift">
          <div className="flex flex-wrap items-center gap-2 bg-mist px-4 py-3">
            <span className="mr-auto font-medium text-ink text-sm">Auditlog</span>
            {["Alle teamleden", "Alle acties", "30 dagen"].map((f) => (
              <span key={f} className="rounded-md bg-paper px-2.5 py-1 text-ink-2 text-xs hairline">{f}</span>
            ))}
            <span className="flex items-center gap-1.5 rounded-md bg-abyss px-2.5 py-1 text-mesh-ink text-xs">
              <Download size={12} />
              CSV
            </span>
          </div>
          <ul aria-label="Voorbeeld van het auditlog" className="relative">
            <AnimatePresence initial={false}>
              {rows.map(({ ago, entry, key }, i) => (
                <motion.li
                  key={key}
                  layout={reduced ? false : "position"}
                  initial={{ opacity: 0, y: -12, backgroundColor: "var(--arc-tint)" }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    backgroundColor: i === 0 && tick > 0 ? "var(--arc-tint)" : "var(--paper)"
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
                  className="flex items-center gap-3 border-hairline border-t px-4 py-3"
                >
                  <Person initials={entry.initials} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-ink text-sm">
                      <span className="font-medium">{entry.who}</span> · {entry.what}
                    </span>
                    <span className="truncate text-ink-3 text-xs">{entry.detail}</span>
                  </span>
                  <span className="shrink-0 text-ink-3 text-xs">{ago}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </PageSection>
  )
}

/* ── The agent's limits (ADR-0027: designed, not built, so the whole section is binnenkort) ──────── */

const AGENT_RULES: ReadonlyArray<{ readonly title: string; readonly line: string }> = [
  {
    title: "Per actie een regel",
    line:
      "Zelf doen, Eerst vragen of Nooit. Alleen een eigenaar of beheerder past het aan, en elke wijziging komt in het auditlog."
  },
  {
    title: "Een voorzichtige standaard",
    line:
      "Intern werk mag de agent zelf doen. Terugbetalen, annuleren en klanten of leveranciers mailen vraagt hij eerst."
  },
  {
    title: "Onomkeerbaar vraagt altijd",
    line:
      "Bewijs indienen bij Klarna of een geschil accepteren staat nooit op Zelf doen. Rollen, sleutels en facturatie blijven buiten bereik."
  },
  {
    title: "Een logboek met bronnen",
    line: "Elke actie met wat de agent las, waarom en onder welke regel, en dezelfde regel in het auditlog."
  },
  {
    title: "Ongedaan maken",
    line:
      "Wat terug kan, draai je terug binnen het venster. Een bericht naar buiten wacht dat venster af voordat het vertrekt."
  },
  {
    title: "Een maandlimiet",
    line:
      "Voor de werkruimte en per persoon, met een melding bij 80%. Bij de limiet legt de agent alles eerst aan je voor."
  }
]

function AgentLimits() {
  return (
    <PageSection ground="glacier" labelledBy="agent-kop">
      <div className="flex flex-col gap-4">
        <SoonTag />
        <SectionHead
          id="agent-kop"
          title="Grenzen voor de agent."
          second="Vastgelegd en omkeerbaar."
          lede="De Insyte-agent krijgt binnenkort meer zelf te doen. Hoe ver hij gaat, bepaal jij, en wat hij deed, staat op een regel."
        />
      </div>
      <Reveal className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENT_RULES.map((r) => (
          <RevealItem
            key={r.title}
            className="flex flex-col gap-2 rounded-lg border border-dashed border-ink/20 bg-paper/60 p-6"
          >
            <h3 className="font-medium text-ink text-lg">{r.title}</h3>
            <p className="text-ink-2 text-md">{r.line}</p>
          </RevealItem>
        ))}
      </Reveal>
    </PageSection>
  )
}

/* ── API keys and webhooks ────────────────────────────────────────────────────────────────────── */

function Sheet(
  { Icon, title, children }: { readonly Icon: IconComponent; readonly title: string; readonly children: ReactNode }
) {
  return (
    <RevealItem className="flex flex-col gap-6 rounded-lg bg-mesh-ink/[0.06] p-6 chalk-line sm:p-8">
      <h3 className="flex items-center gap-3 font-medium text-mesh-ink text-xl">
        <span className="flex size-9 items-center justify-center rounded-md bg-mesh-ink/10 chalk-line">
          <Icon size={18} />
        </span>
        {title}
      </h3>
      {children}
    </RevealItem>
  )
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-mesh-ink/12 border-t py-3 text-sm first:border-t-0">
      <dt className="text-mesh-ink-3">{label}</dt>
      <dd className="flex flex-wrap gap-1.5 text-mesh-ink">{children}</dd>
    </div>
  )
}

const Tag = ({ children }: { readonly children: ReactNode }) => (
  <span className="rounded-sm bg-mesh-ink/10 px-2 py-0.5 text-mesh-ink text-xs">{children}</span>
)

function Delivery() {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.4)
  const tick = useTicker(run, 600)
  const t = run ? tick % 9 : 8
  const sent = t >= 1
  const signed = t >= 3
  const ok = t >= 5
  return (
    <div ref={ref} className="flex flex-col gap-4 rounded-md bg-abyss/60 p-4 chalk-line">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-mesh-ink/10">
          <Mark size={16} tone="white" />
        </span>
        <span className="relative h-px flex-1">
          <span className="absolute inset-0 dash-x-chalk" />
          <motion.span
            className="absolute -top-[3px] size-[7px] bg-mesh-ink"
            initial={false}
            animate={{ left: sent ? (ok ? "calc(100% - 7px)" : "55%") : "0%", opacity: sent ? 1 : 0 }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          />
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-mesh-ink/10">
          <Logo vendor="zapier" size={22} />
        </span>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="flex items-center justify-between gap-2 text-mesh-ink-2">
          <span>POST · Ticket aangemaakt</span>
          <span className="tabular-nums text-mesh-ink-3">TKT-0902</span>
        </span>
        <span className={cn("transition-opacity duration-300", signed ? "opacity-100" : "opacity-30")}>
          <span className="text-mesh-ink-3">Insyte-Signature</span>{" "}
          <span className="text-mesh-ink">HMAC van de body met het geheim van het endpoint</span>
        </span>
        <span className="flex h-5 items-center">
          <AnimatePresence initial={false}>
            {ok
              ? (
                <motion.span
                  key="ok"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-mesh-ink/12 px-2 py-0.5 text-mesh-ink"
                >
                  <Check size={12} />
                  200 · 142 ms
                </motion.span>
              )
              : null}
          </AnimatePresence>
        </span>
      </div>
    </div>
  )
}

function Developers() {
  return (
    <PageSection ground="abyss" labelledBy="api-kop">
      <SectionHead
        id="api-kop"
        dark
        title="Sleutels met grenzen."
        second="Webhooks met een handtekening."
        lede="Code die met Insyte praat, krijgt alleen wat hij nodig heeft, en wat Insyte verstuurt is te controleren."
      />
      <Reveal className="mt-12 grid gap-4 lg:grid-cols-2">
        <Sheet Icon={Key} title="API-sleutels">
          <dl className="flex flex-col">
            <Fact label="Naam">Magazijnsynchronisatie</Fact>
            <Fact label="Sleutel">
              <span className="tabular-nums">ins_live_7Hq2••••••••</span>
              <span className="text-mesh-ink-3">één keer getoond</span>
            </Fact>
            <Fact label="Toegang">
              <Tag>Bestellingen · bewerken</Tag>
              <Tag>Producten · bewerken</Tag>
              <Tag>Leveranciers · bekijken</Tag>
            </Fact>
            <Fact label="Winkels">
              {STORES.filter((s) => s.connected).map((s) => <Tag key={s.name}>{s.name}</Tag>)}
            </Fact>
            <Fact label="IP-adressen">Alleen de adressen op de lijst</Fact>
            <Fact label="Verloopt">Op een datum die je kiest, of nooit</Fact>
          </dl>
          <p className="text-mesh-ink-2 text-sm">
            Een sleutel volgt een rol of krijgt eigen scopes. Roteren kan met een overgang waarin het oude geheim nog
            werkt; intrekken werkt meteen.
          </p>
        </Sheet>
        <Sheet Icon={Webhook} title="Webhooks">
          <Delivery />
          <dl className="flex flex-col">
            <Fact label="Endpoint">https://hooks.zapier.com/…</Fact>
            <Fact label="Gebeurtenissen">
              <Tag>Ticket aangemaakt</Tag>
              <Tag>Ticket toegewezen</Tag>
              <Tag>Ticket gesloten</Tag>
            </Fact>
            <Fact label="Opnieuw">3 pogingen: na 1 min, 10 min en 1 uur</Fact>
            <Fact label="Uitzetten">Na 5 mislukte leveringen op rij</Fact>
          </dl>
          <p className="text-mesh-ink-2 text-sm">
            Elke levering is een POST met JSON, ondertekend met het geheim van het endpoint. Het geheim zie je alleen
            via een actie die in het auditlog komt.
          </p>
        </Sheet>
      </Reveal>
      <p className="mt-6 flex max-w-[72ch] flex-wrap items-center gap-x-2 gap-y-1 text-mesh-ink-2 text-sm">
        <SoonTag dark label="MCP binnenkort" />
        Gebouwd voor agents: een AI-tool die MCP spreekt, krijgt een sleutel met dezelfde scopes, winkels en vervaldatum
        als hierboven, en zijn acties volgen de regels van de Insyte-agent.
      </p>
    </PageSection>
  )
}

/* ── Where the data lives ─────────────────────────────────────────────────────────────────────── */

const RESIDENCY = [
  { what: "Database", where: "EU, Frankfurt" },
  { what: "Bestanden en bijlagen", where: "EU" },
  { what: "Achtergrondtaken en realtime", where: "EU" }
] as const

const SUBPROCESSORS = [
  {
    name: "Anthropic",
    why: "AI: concepten, voorstellen en antwoorden",
    where: "Buiten de EU, EU-verwerking waar die wordt aangeboden"
  },
  { name: "Resend", why: "E-mail versturen", where: "Verzending in de EU; metadata en logs in de VS" },
  { name: "Cloudflare", why: "Hosting en netwerk", where: "Verwerking aan de rand wereldwijd; opslag in de EU" },
  { name: "Stripe", why: "Betalingen en geschillen", where: "Je eigen account bij Stripe" },
  { name: "Google en Microsoft", why: "Inloggen en e-mail", where: "Je eigen accounts" }
] as const

function DataResidency() {
  const links = useMarketingLinks()
  return (
    <PageSection ground="paper" labelledBy="data-kop">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHead
            id="data-kop"
            title="Verwerker, in de EU."
            second="Met de lijst erbij."
            lede="Voor de klantgegevens uit je winkel is Insyte verwerker en ben jij verantwoordelijke. Voor de accounts van je team is Insyte zelf verantwoordelijke."
          />
          <div className="flex flex-col gap-3">
            <ArrowLink href={links.page("/verwerkersovereenkomst")}>Verwerkersovereenkomst</ArrowLink>
            <ArrowLink href={links.page("/privacy")}>Privacyverklaring</ArrowLink>
          </div>
        </div>
        <div className="flex flex-col gap-10">
          <Reveal as="ul" className="grid gap-px overflow-hidden rounded-lg bg-hairline sm:grid-cols-3">
            {RESIDENCY.map((r) => (
              <RevealItem as="li" key={r.what} className="flex flex-col gap-3 bg-glacier p-5">
                <Lock size={16} className="text-ink-3" />
                <span className="text-ink-3 text-sm">{r.what}</span>
                <span className="font-medium text-ink text-lg">{r.where}</span>
              </RevealItem>
            ))}
          </Reveal>
          <div>
            <h3 className="font-medium text-ink text-xl">Subverwerkers</h3>
            <p className="mt-1 text-ink-3 text-md">Wie buiten Insyte iets met je gegevens doet, en waar.</p>
            <table className="mt-5 w-full border-collapse text-left">
              <thead>
                <tr className="border-hairline border-b text-ink-3 text-xs">
                  <th scope="col" className="py-2 pr-4 font-normal">Dienst</th>
                  <th scope="col" className="py-2 pr-4 font-normal max-sm:hidden">Waarvoor</th>
                  <th scope="col" className="py-2 font-normal">Waar</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s) => (
                  <tr key={s.name} className="border-hairline border-b align-top">
                    <th scope="row" className="py-3.5 pr-4 font-medium text-ink text-sm">
                      {s.name}
                      <span className="mt-0.5 block font-normal text-ink-3 sm:hidden">{s.why}</span>
                    </th>
                    <td className="py-3.5 pr-4 text-ink-2 text-sm max-sm:hidden">{s.why}</td>
                    <td className="py-3.5 text-ink-2 text-sm">{s.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 max-w-[60ch] text-ink-3 text-sm">
              Zo is Insyte ingericht in de bèta. Insyte heeft geen certificeringen en doet geen beloftes over
              beschikbaarheid; verandert deze lijst, dan staat dat hier.
            </p>
          </div>
        </div>
      </div>
    </PageSection>
  )
}

export function BeveiligingPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <MarketingPage links={links}>
      <PageHero
        variant="split"
        title="Beveiliging."
        second="Met rechten die kloppen."
        lede="Wie wat ziet, wie wat mag en wat er gebeurde. Hier staan de knoppen zelf, uit de console, en waar je gegevens staan."
        fields={[
          { label: "Standaardrollen", value: ROLES.length },
          { label: "Niveaus", value: "Geen tot beheren" },
          { label: "Gegevens", value: "In de EU" }
        ]}
        panel={<HeroControls />}
      />
      <RoleMatrix />
      <SignIn />
      <AuditLog />
      <AgentLimits />
      <Developers />
      <DataResidency />
    </MarketingPage>
  )
}

/** The six controls, as the homepage's band names them, on chalk. */
function HeroControls() {
  const items: ReadonlyArray<{ Icon: IconComponent; label: string }> = [
    { Icon: Shield, label: "Rollen en eigen rollen" },
    { Icon: ShieldCheck, label: "Tweestapsverificatie" },
    { Icon: Lock, label: "Google Workspace verplicht" },
    { Icon: Key, label: "API-sleutels met scopes" },
    { Icon: Webhook, label: "Ondertekende webhooks" },
    { Icon: Download, label: "Auditlog met export" }
  ]
  return (
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-mesh-ink/12">
      {items.map(({ Icon, label }) => (
        <li key={label} className="flex items-center gap-3 bg-abyss px-4 py-4 text-mesh-ink text-sm">
          <Icon size={16} className="shrink-0 text-mesh-ink-2" />
          {label}
        </li>
      ))}
    </ul>
  )
}
