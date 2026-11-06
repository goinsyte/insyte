import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useRef } from "react"
import {
  AlertTriangle,
  Archive,
  AtSign,
  Check,
  CheckCircle2,
  Clock,
  Hash,
  Inbox,
  Package,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  XCircle
} from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Chip, Person } from "../chrome.tsx"
import { type ProductKey, PRODUCTS, TEMPLATES, thumb } from "../demo-data.ts"
import { Logo, type Vendor } from "../parts.tsx"
import { useRunning, useTicker } from "./hooks.ts"
import { MomentFrame } from "./steps.tsx"

/*
 * The product pages' own moments, on the same rules as `moments.tsx`: drawn with the console's
 * parts on the demo workspace, one short loop each while it is the moment read and on screen, the
 * last frame everywhere else.
 */

const EASE = [0.16, 1, 0.3, 1] as const

function useFrame(on: boolean, frames: number, ms: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.35) && on
  const tick = useTicker(run, ms)
  return { ref, run, f: run ? tick % frames : frames - 1 }
}

function Panel(
  { title, meta, children }: { readonly title: ReactNode; readonly meta?: ReactNode; readonly children: ReactNode }
) {
  return (
    <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-lg bg-paper text-left window-lift">
      <div className="flex h-11 items-center gap-2 px-4 shadow-[inset_0_-1px_0_var(--hairline)]">
        <span className="font-medium text-ink text-sm">{title}</span>
        {meta === undefined ? null : <span className="ml-auto text-ink-3 text-xs">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

const Thumb = ({ product, size = 28 }: { readonly product: ProductKey; readonly size?: number }) => (
  <img
    src={thumb(PRODUCTS[product].img, 96)}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    className="shrink-0 rounded-sm bg-mist object-cover"
    style={{ width: size, height: size }}
  />
)

function Toast({ show, children }: { readonly show: boolean; readonly children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show
        ? (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="absolute inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-3 rounded-md bg-abyss px-3.5 py-2 text-mesh-ink text-xs window-lift"
          >
            {children}
          </motion.div>
        )
        : null}
    </AnimatePresence>
  )
}

/* ── Orders ───────────────────────────────────────────────────────────────────────────────────── */

/** The proposal to nudge Allure: the drafted message, Versturen, and the toast with Undo. */
export function NudgeMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 8, 850)
  const pressed = f >= 3 && f < 4
  const sent = f >= 4
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="relative pb-14">
          <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-lg bg-abyss text-mesh-ink window-lift">
            <div aria-hidden className="absolute inset-0 drafting-chalk" />
            <div className="relative flex flex-col gap-3 p-5">
              <span className="flex items-center gap-2 text-mesh-ink-2 text-xs">
                <Sparkles size={13} />
                Voorstel · 2 bestellingen bij Allure lopen achter
              </span>
              <span className="font-medium text-lg">Allure vragen de verzending te bevestigen</span>
              <p className="rounded-md bg-mesh-ink/8 p-3 text-mesh-ink-2 text-sm leading-relaxed chalk-line">
                Hoi Marco, SO-12204 en SO-12222 staan sinds vrijdag op Geaccepteerd zonder track & trace. Kun je de
                verzending vandaag bevestigen, of een nieuwe overdrachtsdatum doorgeven?
              </p>
              <span className="flex flex-wrap items-center gap-1.5 text-2xs text-mesh-ink-3">
                Bronnen
                {["SO-12204", "SO-12222", "#allure-fulfillment"].map((s) => (
                  <span key={s} className="rounded-sm bg-mesh-ink/10 px-1.5 py-0.5 text-mesh-ink-2">{s}</span>
                ))}
              </span>
              <span className="flex gap-1.5 pt-1">
                <motion.span
                  animate={{ scale: pressed ? 0.95 : 1 }}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium text-xs transition-colors",
                    sent ? "bg-mesh-ink/15 text-mesh-ink-2" : "bg-paper text-abyss"
                  )}
                >
                  {sent ? "Verstuurd" : "Versturen"}
                </motion.span>
                <span className="rounded-md bg-mesh-ink/10 px-3 py-1.5 text-mesh-ink text-xs">Bewerken</span>
                <span className="rounded-md px-3 py-1.5 text-mesh-ink-2 text-xs">Negeren</span>
              </span>
            </div>
          </div>
          <Toast show={sent}>
            Bericht aan Allure verstuurd
            <span className="font-medium underline underline-offset-2">Ongedaan maken</span>
          </Toast>
        </div>
      </MomentFrame>
    </div>
  )
}

/** Three rows selected, a label added to all of them at once. */
export function TagMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 8, 700)
  const rows: ReadonlyArray<{ n: string; product: ProductKey }> = [
    { n: "SO-12204", product: "raincoat" },
    { n: "SO-12222", product: "fleece" },
    { n: "SO-12240", product: "crewneck" },
    { n: "SO-12241", product: "tote" }
  ]
  const picked = Math.min(3, f)
  const tagged = f >= 5
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Bestellingen" meta={picked > 0 ? `${picked} geselecteerd` : "Vertraagd"}>
          <AnimatePresence initial={false}>
            {picked === 3
              ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 bg-abyss px-4 py-2 text-mesh-ink text-xs">
                    3 geselecteerd
                    <span className="ml-auto flex items-center gap-1.5 rounded-sm bg-mesh-ink/15 px-2 py-1">
                      <Tag size={11} />
                      Label toevoegen
                    </span>
                  </div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <ul className="p-1.5">
            {rows.map((r, i) => {
              const sel = i < picked
              return (
                <li
                  key={r.n}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors",
                    sel && "bg-arc-tint/60"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-[4px] transition-colors",
                      sel ? "bg-abyss text-mesh-ink" : "bg-ink/8 text-transparent"
                    )}
                  >
                    <Check size={10} />
                  </span>
                  <Thumb product={r.product} />
                  <span className="font-medium text-ink text-sm tabular-nums">{r.n}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <AnimatePresence initial={false}>
                      {tagged && sel
                        ? (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="rounded-sm bg-arc-tint px-1.5 py-0.5 text-arc-ink text-xs"
                          >
                            Allure navragen
                          </motion.span>
                        )
                        : null}
                    </AnimatePresence>
                    <span className="rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs">Vertraagd</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const TIMELINE: ReadonlyArray<{ what: string; who: string; Icon: typeof Package; vendor?: Vendor }> = [
  { what: "Geplaatst in Northwind EU", who: "Shopify", Icon: Package, vendor: "shopify" },
  { what: "Betaald met Klarna", who: "Klarna", Icon: CheckCircle2, vendor: "klarna" },
  { what: "Geaccepteerd door Allure Fulfillment", who: "Leveranciersportaal", Icon: Check },
  { what: "Verzonden met DHL, 2 pakketten", who: "Allure Fulfillment", Icon: Truck, vendor: "dhl" }
]

/** One order's timeline, the supplier's hand-offs landing in it as they happen. */
export function TimelineMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 7, 800)
  const shown = Math.min(TIMELINE.length, f + 1)
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title={<span className="tabular-nums">SO-12205</span>} meta="Tijdlijn">
          <ol className="relative flex flex-col gap-0 p-4">
            <span aria-hidden className="absolute top-6 bottom-6 left-[29px] w-px bg-ink/10" />
            {TIMELINE.map((t, i) => (
              <motion.li
                key={t.what}
                initial={false}
                animate={{ opacity: i < shown ? 1 : 0, y: i < shown ? 0 : 8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="relative flex items-center gap-3 py-2.5"
              >
                <span
                  className={cn(
                    "relative z-10 flex size-7 items-center justify-center rounded-md",
                    i === shown - 1 ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2"
                  )}
                >
                  <t.Icon size={14} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-ink text-sm">{t.what}</span>
                  <span className="text-ink-3 text-xs">{t.who}</span>
                </span>
                {t.vendor === undefined ? null : <Logo vendor={t.vendor} size={20} />}
              </motion.li>
            ))}
          </ol>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/* ── Customer service ─────────────────────────────────────────────────────────────────────────── */

const MAIL: ReadonlyArray<{ box: Vendor; who: string; initials: string; subject: string }> = [
  { box: "gmail", who: "Sarah K.", initials: "SK", subject: "Twee artikelen ontbreken" },
  { box: "outlook", who: "Hannah S.", initials: "HS", subject: "Retour van de Harbor regenjas" },
  { box: "gmail", who: "Mateo R.", initials: "MR", subject: "Waar blijft mijn bestelling?" }
]

/** Gmail and Outlook in one inbox, grouped per mailbox; a thread assigned to a teammate. */
export function InboxMoment({ on, bare = false }: { readonly on: boolean; readonly bare?: boolean }) {
  const { f, ref } = useFrame(on, 7, 850)
  const assigned = f >= 3
  return (
    <div ref={ref}>
      <MomentFrame tone={bare ? "none" : "glacier"}>
        <Panel title="Inbox" meta="2 mailboxen gekoppeld">
          <div className="flex gap-1 px-3 pt-3">
            {(["gmail", "outlook"] as const).map((b) => (
              <span key={b} className="flex items-center gap-1.5 rounded-md bg-mist px-2.5 py-1 text-ink-2 text-xs">
                <Logo vendor={b} size={14} />
                {b === "gmail" ? "support@northwind" : "retouren@northwind"}
              </span>
            ))}
          </div>
          <ul className="p-1.5">
            {MAIL.map((m, i) => (
              <li
                key={m.subject}
                className={cn("flex items-center gap-3 rounded-md px-2.5 py-2.5", i === 0 && "bg-glacier")}
              >
                <Person initials={m.initials} size={28} tone="mist" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-ink text-sm">
                    <span className="font-medium">{m.who}</span>
                    <Logo vendor={m.box} size={14} />
                  </span>
                  <span className="truncate text-ink-3 text-xs">{m.subject}</span>
                </span>
                {i === 0
                  ? (
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span
                        key={assigned ? "toegewezen" : "open"}
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        {assigned
                          ? (
                            <>
                              <Person initials="SK" size={20} />
                              <span className="text-ink-2">Sofía</span>
                            </>
                          )
                          : <span className="rounded-sm bg-arc-tint px-1.5 py-0.5 text-arc-ink">Toewijzen</span>}
                      </motion.span>
                    </AnimatePresence>
                  )
                  : <span className="text-ink-3 text-xs">{["", "08:41", "08:15"][i]}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const VIEWS: ReadonlyArray<{ label: string; n: number; Icon: typeof Inbox }> = [
  { label: "Open", n: 12, Icon: Inbox },
  { label: "Aan mij toegewezen", n: 4, Icon: AtSign },
  { label: "Uitgesteld", n: 3, Icon: Clock },
  { label: "Gearchiveerd", n: 128, Icon: Archive },
  { label: "Prullenbak", n: 6, Icon: Trash2 },
  { label: "Spam", n: 2, Icon: XCircle }
]

/** The ticket views; a ticket snoozed slides from Open to Uitgesteld and the counts follow. */
export function ViewsMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 900)
  const moved = f >= 2
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Tickets" meta="Weergaven">
          <ul className="grid grid-cols-2 gap-1.5 p-3">
            {VIEWS.map((v) => {
              const n = moved ? (v.label === "Open" ? v.n - 1 : v.label === "Uitgesteld" ? v.n + 1 : v.n) : v.n
              const hit = moved && v.label === "Uitgesteld"
              return (
                <li
                  key={v.label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2.5 transition-colors duration-500",
                    hit ? "bg-arc-tint" : "bg-mist/70"
                  )}
                >
                  <v.Icon size={14} className={hit ? "text-arc-ink" : "text-ink-3"} />
                  <span className={cn("flex-1 text-sm", hit ? "text-arc-ink" : "text-ink")}>{v.label}</span>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={n}
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -8, opacity: 0 }}
                      className="text-ink-3 text-xs tabular-nums"
                    >
                      {n}
                    </motion.span>
                  </AnimatePresence>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-2 bg-mist px-4 py-3 text-ink-2 text-xs">
            <Clock size={13} />
            {moved ? "TKT-0900 uitgesteld tot maandag 09:00" : "TKT-0900 · Feedback op SO-12345"}
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const CHAT: ReadonlyArray<{ who: string; initials: string; text: ReactNode }> = [
  {
    who: "Sofía K.",
    initials: "SK",
    text: (
      <>
        De klant van <span className="rounded-sm bg-arc-tint px-1 text-arc-ink">SO-12224</span>{" "}
        vraagt waar haar pakket blijft.
      </>
    )
  },
  {
    who: "Marco · Allure",
    initials: "MA",
    text: <>Muts en pet gaan vandaag opnieuw de deur uit, track & trace volgt.</>
  },
  {
    who: "Elena H.",
    initials: "EH",
    text: (
      <>
        <span className="font-medium text-arc-ink">@Sofía</span> kun je het ticket bijwerken?
      </>
    )
  }
]

/** The team's channel with the supplier: order references as chips, a mention. */
export function ChatMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 1000)
  const shown = Math.min(CHAT.length, f + 1)
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Hash size={13} className="text-ink-3" />
              allure-fulfillment
            </span>
          }
          meta="Extern kanaal"
        >
          <ul className="flex min-h-[220px] flex-col gap-3 p-4">
            {CHAT.map((m, i) => (
              <motion.li
                key={m.who}
                initial={false}
                animate={{ opacity: i < shown ? 1 : 0, y: i < shown ? 0 : 10 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="flex items-start gap-2.5"
              >
                <Person initials={m.initials} size={26} tone={m.initials === "MA" ? "mist" : "tint"} />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-ink text-xs">{m.who}</span>
                  <span className="text-ink-2 text-sm">{m.text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/* ── Chargebacks ──────────────────────────────────────────────────────────────────────────────── */

const DISPUTES: ReadonlyArray<
  { id: string; vendor: Vendor; amount: string; left: number; total: number; reason: string }
> = [
  { id: "DSP-2214", vendor: "klarna", amount: "€ 248,00", left: 0.18, total: 4, reason: "Niet ontvangen" },
  { id: "DSP-2204", vendor: "klarna", amount: "€ 89,95", left: 0.42, total: 4, reason: "Anders dan beschreven" },
  { id: "DSP-2197", vendor: "paypal", amount: "€ 134,00", left: 0.7, total: 3, reason: "Niet ontvangen" },
  { id: "DSP-2190", vendor: "stripe", amount: "€ 59,00", left: 0.86, total: 3, reason: "Fraude vermoed" }
]

/** Every dispute with its deadline as a ring that runs down, the nearest first. */
export function DeadlineMoment({ on }: { readonly on: boolean }) {
  const { f, ref, run } = useFrame(on, 6, 900)
  const drain = run ? f * 0.015 : 0
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Chargebacks" meta="Op deadline">
          <ul className="p-1.5">
            {DISPUTES.map((d) => {
              const left = Math.max(0.02, d.left - drain)
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-md px-2.5 py-2.5">
                  <Logo vendor={d.vendor} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-ink text-sm tabular-nums">{d.id} · {d.amount}</span>
                    <span className="truncate text-ink-3 text-xs">{d.reason}</span>
                  </span>
                  <svg width="30" height="30" viewBox="0 0 36 36" aria-hidden className="-rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="var(--ink-5)" strokeWidth="3" />
                    <motion.circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="var(--abyss)"
                      strokeWidth="3"
                      initial={false}
                      animate={{ pathLength: left }}
                      transition={{ duration: 0.8, ease: EASE }}
                    />
                  </svg>
                  <span className="w-12 text-right text-ink-2 text-xs tabular-nums">
                    {Math.max(1, Math.round(left * 14))} d
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/** What cannot be undone asks first, naming the consequence and the amount. */
export function ConfirmMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 900)
  const open = f >= 1
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="relative mx-auto flex min-h-[300px] w-full max-w-[560px] items-center justify-center">
          <div className="absolute inset-0 rounded-lg bg-paper/70 hairline" />
          <AnimatePresence initial={false}>
            {open
              ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="relative w-[88%] overflow-hidden rounded-xl bg-paper text-left window-lift"
                >
                  <div className="flex flex-col gap-2 p-5">
                    <span className="flex items-center gap-2 font-semibold text-ink text-md">
                      <AlertTriangle size={16} className="text-ink-2" />
                      Bewijs indienen bij Klarna?
                    </span>
                    <span className="text-ink-2 text-sm">
                      DSP-2204 · € 89,95. Na indienen kun je het bewijspakket niet meer aanpassen of terugtrekken.
                    </span>
                  </div>
                  <div className="flex justify-end gap-2 bg-mist px-5 py-3">
                    <span className="rounded-md px-3 py-1.5 text-ink-2 text-xs">Annuleren</span>
                    <motion.span
                      animate={{ scale: f === 4 ? 0.95 : 1 }}
                      className="rounded-md bg-abyss px-3 py-1.5 font-medium text-mesh-ink text-xs"
                    >
                      {f >= 5 ? "Ingediend" : "Indienen"}
                    </motion.span>
                  </div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
        </div>
      </MomentFrame>
    </div>
  )
}

/** Outcomes as the providers report them back: ingediend, gewonnen, verloren. */
export function OutcomeMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 900)
  const rows = [
    { id: "DSP-2190", vendor: "stripe" as Vendor, now: f >= 2 ? "Gewonnen" : "Ingediend" },
    { id: "DSP-2187", vendor: "klarna" as Vendor, now: "Gewonnen" },
    { id: "DSP-2179", vendor: "paypal" as Vendor, now: f >= 4 ? "Verloren" : "Ingediend" },
    { id: "DSP-2171", vendor: "klarna" as Vendor, now: "Gewonnen" }
  ]
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Afgerond" meta="Laatste 30 dagen">
          <ul className="p-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-md px-2.5 py-2.5">
                <Logo vendor={r.vendor} size={24} />
                <span className="flex-1 font-medium text-ink text-sm tabular-nums">{r.id}</span>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={r.now}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <Chip tone={r.now === "Gewonnen" ? "done" : r.now === "Ingediend" ? "attention" : "quiet"}>
                      {r.now}
                    </Chip>
                  </motion.span>
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/* ── Automations ──────────────────────────────────────────────────────────────────────────────── */

/** The library: templates with their services' marks, the recommended one lifting into place. */
export function TemplatesMoment({ on, bare = false }: { readonly on: boolean; readonly bare?: boolean }) {
  const { f, ref } = useFrame(on, TEMPLATES.length + 2, 1000)
  const pick = Math.min(TEMPLATES.length - 1, f)
  return (
    <div ref={ref}>
      <MomentFrame tone={bare ? "none" : "glacier"}>
        <Panel title="Sjablonen" meta="Bibliotheek">
          <ul className="flex flex-col gap-1 p-2">
            {TEMPLATES.slice(0, 5).map((t, i) => {
              const vendors = [...new Set(t.steps.flatMap((s) => (s.vendor === undefined ? [] : [s.vendor])))]
              const ai = t.steps.some((s) => s.ai === true)
              const on2 = i === pick % 5
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-300",
                    on2 && "bg-arc-tint/70"
                  )}
                >
                  <span className="flex -space-x-1">
                    {vendors.slice(0, 3).map((v) => (
                      <Logo key={v} vendor={v} size={22} className="ring-2 ring-paper" />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink text-sm">{t.name}</span>
                  {ai ? <Sparkles size={13} className="shrink-0 text-arc-ink" /> : null}
                  <span className="text-ink-3 text-xs tabular-nums">{t.steps.length} stappen</span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/** Versions and runs: a run passing its steps one by one, kept in the history. */
export function RunsMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 7, 700)
  const steps = TEMPLATES[1]!.steps
  const passed = Math.min(steps.length, f)
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Late levering → leverancier, excuses en korting" meta="Versie 4 · live">
          <ol className="flex flex-col gap-1 p-3">
            {steps.map((s, i) => {
              const ok = i < passed
              return (
                <li key={s.summary} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-sm transition-colors duration-300",
                      ok
                        ? "bg-abyss text-mesh-ink"
                        : i === passed
                        ? "bg-arc-tint text-arc-ink"
                        : "bg-ink/6 text-transparent"
                    )}
                  >
                    {i === passed && !ok ? <Clock size={11} /> : <Check size={11} />}
                  </span>
                  <span className={cn("flex-1 text-sm", ok ? "text-ink" : "text-ink-3")}>{s.summary}</span>
                  {s.vendor === undefined
                    ? s.ai === true ? <Sparkles size={13} className="text-arc-ink" /> : null
                    : <Logo vendor={s.vendor} size={18} />}
                </li>
              )
            })}
          </ol>
          <div className="flex flex-col gap-1.5 bg-mist px-4 py-3">
            {[
              { at: "zojuist", what: passed === steps.length ? "Uitvoering geslaagd · SO-12204" : "Bezig · SO-12204" },
              { at: "09:12", what: "Uitvoering geslaagd · SO-12222" },
              { at: "gisteren", what: "Versie 4 gepubliceerd door Elena H." }
            ].map((r) => (
              <span key={r.what + r.at} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-2">{r.what}</span>
                <span className="text-ink-3">{r.at}</span>
              </span>
            ))}
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}
