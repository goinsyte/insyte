import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"
import {
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  FlaskConical,
  Inbox,
  Search,
  Sparkles,
  Split,
  Truck,
  X
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { Chip, Person } from "./chrome.tsx"
import { type ProductKey, PRODUCTS, thumb } from "./demo-data.ts"
import { useTyped } from "./motion.tsx"
import { Logo, type Vendor } from "./parts.tsx"

/*
 * The two tours' screens, drawn at 880px and zoomed by `.tour-canvas`, each driven by the step its
 * tour has open: the ticket arriving, Insyte reading the order, the draft writing itself; and the
 * builder taking a sentence, laying out its steps, and passing a test run. Records are the demo
 * workspace's (tickets.ts, orders.ts, the late-delivery template). Pictures: `aria-hidden`, `inert`.
 * `run` is false on the server and under reduced motion, which shows every step finished.
 */

const EASE = [0.16, 1, 0.3, 1] as const

function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <div aria-hidden inert className="tour-canvas select-none overflow-hidden bg-glacier text-left">
      {children}
    </div>
  )
}

/* ── Tickets ───────────────────────────────────────────────────────────────────────────────── */

const THREADS: ReadonlyArray<{
  id: string
  who: string
  name: string
  via: Vendor
  title: string
  order: string
  at: string
}> = [
  {
    id: "TKT-0905",
    who: "SK",
    name: "Sarah K.",
    via: "gmail",
    title: "Twee artikelen ontbreken",
    order: "SO-12224",
    at: "09:02"
  },
  {
    id: "TKT-0902",
    who: "EJ",
    name: "Ethan J.",
    via: "shopify",
    title: "Leverancier wacht op bevestiging",
    order: "SO-12943",
    at: "08:41"
  },
  {
    id: "TKT-0903",
    who: "DB",
    name: "Daniel B.",
    via: "klarna",
    title: "Bewijs voor Klarna-chargeback",
    order: "DSP-2204",
    at: "08:15"
  },
  {
    id: "TKT-0900",
    who: "HS",
    name: "Hannah S.",
    via: "gmail",
    title: "Feedback op SO-12345",
    order: "SO-12345",
    at: "gisteren"
  }
]

const LINES: ReadonlyArray<{ product: ProductKey; qty: number; missing?: true }> = [
  { product: "fleece", qty: 1 },
  { product: "beanie", qty: 1, missing: true },
  { product: "tote", qty: 1 },
  { product: "cap", qty: 1, missing: true }
]

const DRAFT =
  "Hoi Sarah, sorry daarvoor. Volgens de pakbon van SO-12224 zijn de muts en de pet niet meegestuurd. Ze gaan vandaag opnieuw op weg, zodat je ze vrijdag hebt; je krijgt de track & trace zodra DHL het pakket scant."

export function TicketsScreen({ step, run }: { readonly step: number; readonly run: boolean }) {
  const shown = run ? step : 2
  const typed = useTyped(DRAFT, run && step === 2, 350)
  return (
    <Screen>
      <div className="flex h-[540px]">
        <div className="flex w-[270px] shrink-0 flex-col gap-1 bg-mist p-3">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="flex items-center gap-2 font-medium text-base text-ink">
              <Inbox size={15} className="text-ink-3" />
              Inbox
            </span>
            <span className="text-ink-3 text-xs tabular-nums">12 open</span>
          </div>
          <div className="mb-1 flex h-8 items-center gap-2 rounded-md px-2.5 text-ink-3 text-sm field">
            <Search size={13} />
            Zoek in tickets
          </div>
          <div className="mb-1 flex gap-1 text-xs">
            <span className="rounded-sm bg-paper px-2 py-1 font-medium text-ink hairline">Alle 12</span>
            <span className="flex items-center gap-1 rounded-sm px-2 py-1 text-ink-2">
              <Logo vendor="gmail" size={12} />9
            </span>
            <span className="flex items-center gap-1 rounded-sm px-2 py-1 text-ink-2">
              <Logo vendor="shopify" size={12} />2
            </span>
            <span className="flex items-center gap-1 rounded-sm px-2 py-1 text-ink-2">
              <Logo vendor="klarna" size={12} />1
            </span>
          </div>
          {THREADS.map((t, i) => {
            const on = i === 0
            return (
              <motion.div
                key={t.id}
                initial={false}
                animate={on && run && step === 0 ? { backgroundColor: ["var(--arc-tint)", "var(--paper)"] } : {}}
                transition={{ duration: 1.6, ease: "easeOut" }}
                className={cn("flex gap-2.5 rounded-md p-2.5", on ? "bg-paper hairline" : "")}
              >
                <span className="relative">
                  <Person initials={t.who} size={28} tone={on ? "tint" : "mist"} />
                  <span className="absolute -right-1 -bottom-1">
                    <Logo vendor={t.via} size={14} />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", on ? "font-medium text-ink" : "text-ink-2")}>{t.name}</span>
                    <span className="shrink-0 text-ink-3 text-xs">{t.at}</span>
                  </span>
                  <span className={cn("truncate text-sm", on ? "text-ink" : "text-ink-2")}>{t.title}</span>
                  <span className="text-ink-3 text-xs">
                    {t.id} · {t.order}
                  </span>
                </span>
              </motion.div>
            )
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-5">
          <div className="flex items-center gap-3">
            <Person initials="SK" size={36} tone="tint" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-ink text-lg">Twee artikelen ontbreken</span>
              <span className="flex items-center gap-1.5 text-ink-3 text-sm">
                Sarah K. · via <Logo vendor="gmail" size={14} /> Gmail · TKT-0905
              </span>
            </span>
            <Chip tone="attention" icon={Clock}>Wacht op antwoord</Chip>
          </div>

          <div className="max-w-[88%] rounded-lg bg-paper p-3.5 hairline">
            <div className="mb-1 flex justify-between text-ink-3 text-xs">
              <span className="font-medium text-ink-2">Sarah K.</span>
              <time>09:02</time>
            </div>
            <p className="text-base text-ink-2">
              Mijn bestelling is binnen, maar twee van de vier artikelen ontbreken. Kunnen jullie dit oplossen? Ik heb
              ze vrijdag nodig.
            </p>
          </div>

          <div
            className={cn(
              "flex flex-col gap-2.5 rounded-lg p-3.5 transition-[background-color,box-shadow,opacity] duration-500",
              "bg-paper hairline",
              run && step === 1 && "shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--abyss)_35%,transparent)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-ink text-sm">
                <Logo vendor="shopify" size={16} />
                Bestelling SO-12224 · Northwind EU
              </span>
              <span className="text-ink-3 text-xs tabular-nums">€ 211,00 · 4 artikelen</span>
            </div>
            <div className="flex gap-2">
              {LINES.map((l, i) => (
                <motion.span
                  key={l.product}
                  initial={false}
                  animate={{ y: run && step === 1 ? [0, -3, 0] : 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: run && step === 1 ? 0.1 + i * 0.1 : 0 }}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5",
                    l.missing === true && shown >= 1 ? "bg-arc-tint" : "bg-mist"
                  )}
                >
                  <img
                    src={thumb(PRODUCTS[l.product].img)}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    className="size-8 shrink-0 rounded-sm bg-mist object-cover"
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-ink text-xs">{PRODUCTS[l.product].title}</span>
                    <span className={cn("text-xs", l.missing === true && shown >= 1 ? "text-arc-ink" : "text-ink-3")}>
                      {l.missing === true && shown >= 1 ? "niet in de doos" : `${l.qty} × geleverd`}
                    </span>
                  </span>
                </motion.span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([[FileText, "Pakbon SO-12224"], [Truck, "DHL-scan 18 mei"], [Inbox, "Ticket #4081"]] as const).map((
                [Icon, s]
              ) => (
                <span key={s} className="flex items-center gap-1 rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs">
                  <Icon size={11} />
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col gap-2.5 rounded-lg bg-arc-tint p-3.5"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-arc-ink text-sm">
                <Sparkles size={14} />
                Concept van Insyte, in jouw toon
              </span>
              <span className="text-ink-3 text-xs">1,8 s · 3 bronnen</span>
            </div>
            {shown < 2
              ? (
                <div className="flex min-h-[4.6em] flex-col justify-center gap-2" aria-hidden>
                  <span className="text-arc-ink text-sm">
                    {shown === 0 ? "Insyte leest het bericht…" : "Insyte vergelijkt de pakbon met de scan…"}
                  </span>
                  <span className="h-2 w-[86%] motion-safe:animate-pulse rounded-full bg-paper/80" />
                  <span className="h-2 w-[64%] motion-safe:animate-pulse rounded-full bg-paper/80" />
                </div>
              )
              : null}
            <p className={cn("text-base text-ink", shown >= 2 ? "min-h-[4.6em]" : "hidden")}>
              {shown >= 2 ? typed : ""}
              {run && step === 2 && typed.length < DRAFT.length
                ? <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-arc-ink" />
                : null}
            </p>
            <div className="flex gap-1.5">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm">
                <Check size={14} />
                Versturen
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-ink text-sm">
                <Edit3 size={14} />
                Bewerken
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium text-ink-2 text-sm">
                <X size={14} />
                Negeren
              </span>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  )
}

/* ── Automation builder ────────────────────────────────────────────────────────────────────── */

const PROMPT = "Als een levering twee dagen te laat is, vraag de leverancier om een datum en stuur de klant excuses."

function Node(
  { head, title, line, lit, shown, passed, delay }: {
    readonly head: ReactNode
    readonly title: string
    readonly line: ReactNode
    readonly lit: boolean
    readonly shown: boolean
    readonly passed: boolean
    readonly delay: number
  }
) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: shown ? 1 : 0.45, y: shown ? 0 : 6, scale: lit ? 1.02 : 1 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className={cn(
        "relative w-[300px] overflow-hidden rounded-md bg-paper transition-shadow duration-300",
        lit ? "shadow-[0_10px_28px_-14px_color-mix(in_oklch,var(--abyss)_45%,transparent)] hairline" : "hairline"
      )}
    >
      {head}
      <div className="px-3 py-2">
        <div className="font-medium text-ink text-sm">{title}</div>
        <div className="truncate text-ink-3 text-xs">{line}</div>
      </div>
      <AnimatePresence>
        {passed
          ? (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay }}
              className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-abyss text-mesh-ink"
            >
              <Check size={11} />
            </motion.span>
          )
          : null}
      </AnimatePresence>
    </motion.div>
  )
}

const Field = ({ children }: { readonly children: ReactNode }) => (
  <span className="rounded-sm bg-arc-tint px-1 text-arc-ink">{children}</span>
)

const Stem = ({ shown }: { readonly shown: boolean }) => (
  <span className={cn("h-5 w-px bg-ink-4 transition-opacity duration-300", shown ? "opacity-100" : "opacity-30")} />
)

function Strip(
  { tone, icon, label, vendor }: {
    readonly tone: "tint" | "abyss" | "mist"
    readonly icon?: ReactNode
    readonly label: string
    readonly vendor?: Vendor
  }
) {
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 px-3 font-medium text-xs",
        tone === "tint" && "bg-arc-tint text-arc-ink",
        tone === "abyss" && "bg-abyss text-mesh-ink",
        tone === "mist" && "bg-mist text-ink-2"
      )}
    >
      {vendor === undefined ? icon : <Logo vendor={vendor} size={16} />}
      {label}
    </div>
  )
}

export function BuilderScreen({ step, run }: { readonly step: number; readonly run: boolean }) {
  const s = run ? step : 2
  const typed = useTyped(PROMPT, run && step === 0, 300)
  const laid = s >= 1
  const tested = s >= 2
  const d = (i: number) => (run && step === 1 ? 0.15 + i * 0.16 : run && step === 2 ? i * 0.22 : 0)
  return (
    <Screen>
      <div className="flex items-center gap-3 bg-paper px-5 py-3">
        <span className="whitespace-nowrap font-medium text-base text-ink">Late levering → leverancier en excuses</span>
        <Chip>Concept</Chip>
        <span className="mx-auto flex gap-1 rounded-md p-0.5 text-sm field">
          <span className="rounded-sm px-2.5 py-1 text-ink-2">Overzicht</span>
          <span className="rounded-sm bg-paper px-2.5 py-1 font-medium text-ink">Workflow</span>
          <span className="whitespace-nowrap rounded-sm px-2.5 py-1 text-ink-2">Runs</span>
        </span>
        <span
          className={cn(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors duration-300",
            tested ? "bg-arc-tint text-arc-ink" : "text-ink field"
          )}
        >
          <FlaskConical size={14} />
          Test met voorbeeld
        </span>
        <span className="inline-flex h-8 items-center rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm">
          Publiceren
        </span>
      </div>
      <div
        className="relative flex h-[560px] flex-col items-center gap-0 pt-4"
        style={{
          backgroundColor: "var(--mist)",
          backgroundImage:
            "repeating-linear-gradient(0deg, color-mix(in oklch, var(--ink) 5%, transparent) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, color-mix(in oklch, var(--ink) 5%, transparent) 0 1px, transparent 1px 32px)"
        }}
      >
        <div className="mb-4 flex w-[640px] items-center gap-2.5 rounded-lg bg-paper px-3 py-2.5 hairline">
          <Sparkles size={15} className="shrink-0 text-arc-ink" />
          <span className="min-w-0 flex-1 text-ink text-sm">
            {s === 0 ? typed : PROMPT}
            {run && step === 0 && typed.length < PROMPT.length
              ? <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-arc-ink" />
              : null}
          </span>
          <span className="shrink-0 rounded-sm bg-abyss px-2 py-1 font-medium text-mesh-ink text-xs">Opstellen</span>
        </div>
        <Node
          delay={d(0)}
          shown
          lit={run && step === 0}
          passed={tested}
          head={<Strip tone="tint" vendor="shopify" label="Trigger · als" />}
          title="Levering later dan verwacht"
          line="Shopify · 2 dagen na de verwachte datum"
        />
        <Stem shown={laid} />
        <Node
          delay={d(1)}
          shown={laid}
          lit={run && step === 1}
          passed={tested}
          head={<Strip tone="mist" icon={<Truck size={12} />} label="Leverancier" />}
          title="Leverancier vragen de verzending te bevestigen"
          line={
            <>
              aan <Field>bestelling.leverancier</Field>
            </>
          }
        />
        <Stem shown={laid} />
        <Node
          delay={d(2)}
          shown={laid}
          lit={run && step === 1}
          passed={tested}
          head={<Strip tone="abyss" icon={<Sparkles size={12} />} label="AI-stap" />}
          title="Excuses in de stem van het merk"
          line="Toon warm · noemt de nieuwe datum"
        />
        <Stem shown={laid} />
        <Node
          delay={d(3)}
          shown={laid}
          lit={false}
          passed={tested}
          head={<Strip tone="mist" icon={<Split size={12} />} label="Splitsing" />}
          title="Klant heeft een e-mailadres"
          line={
            <>
              als <Field>klant.email</Field> bestaat
            </>
          }
        />
        <div
          className={cn(
            "flex h-5 w-[340px] border-ink-4 border-x border-t transition-opacity",
            laid ? "opacity-100" : "opacity-30"
          )}
        />
        <div className="flex w-[660px] justify-between">
          {([["gmail", "Gmail", "Excuses + kortingscode van 10%", "klant.email"], [
            "slack",
            "Slack",
            "Melding in #support",
            "bestelling.nummer"
          ]] as const).map(([v, name, title, field], i) => (
            <Node
              key={v}
              delay={d(4 + i)}
              shown={laid}
              lit={false}
              passed={tested}
              head={<Strip tone="mist" vendor={v} label={name} />}
              title={title}
              line={
                <>
                  met <Field>{field}</Field>
                </>
              }
            />
          ))}
        </div>
        <AnimatePresence>
          {tested
            ? (
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: run ? 1.4 : 0 }}
                className="mt-5 flex items-center gap-2 rounded-md bg-abyss px-3 py-2 text-mesh-ink text-sm"
              >
                <CheckCircle2 size={14} />
                Test geslaagd met SO-12231 · er is niets verstuurd
              </motion.span>
            )
            : null}
        </AnimatePresence>
      </div>
    </Screen>
  )
}
