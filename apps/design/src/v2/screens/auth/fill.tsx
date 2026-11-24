import { animate, AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { ANALYSIS, OFFLINE_ACTIONS } from "../../fixtures/auth.ts"
import type { BrandLine } from "../../fixtures/auth.ts"
import { WAITING } from "../../fixtures/home.ts"
import { ORDERS } from "../../fixtures/orders.ts"
import { LogoMark } from "../../shell/variants.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { cx } from "../../ui/cx.ts"
import { Check } from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { useVariant } from "../../variants.ts"
import type { Logo } from "../../variants.ts"

/*
 * What fills the space beside the task while signing in and setting up (Varianten, `fill`):
 *
 *   voorbeeld  the morning you are setting up, building itself: the workspace's name as you type it,
 *              the plan, the store, the orders streaming in, Magnus's first finding, the night rules
 *   gesprek    the steps already answered, as a conversation with Magnus above the current question
 *   vlak       the warm grey of the menu with the task on a white sheet, and beside it the step's mark
 *              (Insyte, Blended data, Magnus) with the line about why the step matters
 */

/** How far the workspace is: the preview shows everything up to and including the phase. */
export type Phase = "leeg" | "naam" | "plan" | "winkel" | "import" | "analyse" | "nacht" | "klaar"
const PHASES: ReadonlyArray<Phase> = ["leeg", "naam", "plan", "winkel", "import", "analyse", "nacht", "klaar"]

export type Stage = {
  readonly phase: Phase
  /** Whose morning it is: a store owner's, or a supplier's or affiliate's portal. */
  readonly side?: "winkel" | "leverancier" | "affiliate"
  readonly workspace?: string
  readonly person?: string
  readonly plan?: string
  /** The connected store, or null when the step was skipped. */
  readonly store?: string | null
  /** Instead of "Goedemorgen, …": "Welkom terug, Elena". */
  readonly greeting?: string
}

export type Exchange = { readonly q: string; readonly a: string }

const spring = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const
const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

/* ── voorbeeld ────────────────────────────────────────────────────────────────────────────────── */

export function Preview({ stage }: { readonly stage: Stage }) {
  const at = (p: Phase) => PHASES.indexOf(stage.phase) >= PHASES.indexOf(p)
  const side = stage.side ?? "winkel"
  const first = stage.person?.trim().split(" ")[0]
  const greeting = stage.greeting ?? (first === undefined || first === "" ? "Goedemorgen" : `Goedemorgen, ${first}`)
  const named = stage.workspace !== undefined && stage.workspace.trim() !== ""
  const connected = stage.store !== undefined && stage.store !== null
  // The store step was skipped: nothing to import or read, and the preview says so instead of pretending.
  const skipped = stage.store === null && at("import")

  return (
    <div className="flex w-full max-w-[520px] flex-col gap-3">
      <LayoutGroup>
        <motion.div
          layout
          transition={spring}
          className="flex flex-col gap-6 overflow-hidden rounded-xl bg-canvas p-6 shadow-pop ring-1 ring-line"
        >
          {/* The morning's head: the greeting, the workspace as it is typed, the plan once chosen. */}
          <motion.header layout="position" className="flex flex-col gap-1.5">
            <p className="text-lg font-semibold text-ink">{greeting}</p>
            <div className="flex min-h-5 items-center gap-2 text-sm text-ink-2">
              {named ? <span className="truncate">{stage.workspace}</span> : <Bar w="w-36" />}
              <AnimatePresence initial={false}>
                {at("plan") && stage.plan !== undefined && (
                  <motion.span
                    key="plan"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={spring}
                    className="rounded-full bg-accent-tint px-2 py-0.5 text-2xs font-medium text-accent-ink"
                  >
                    {stage.plan}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.header>

          {side === "winkel" && (
            <Block title="Wacht op jou">
              {at("import") && !skipped
                ? WAITING.slice(0, 3).map((w, i) => {
                  const G = w.glyph
                  return (
                    <Row key={w.id} index={i}>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-well text-ink-2">
                        <G size={15} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{w.title}</span>
                      <span className="figure shrink-0 text-xs text-ink-3">{w.due}</span>
                    </Row>
                  )
                })
                : [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
            </Block>
          )}

          {side !== "affiliate" && (
            <Block
              title={side === "leverancier" ? "Aan jou toegewezen" : "Bestellingen"}
              aside={connected && at("winkel")
                ? (
                  <span className="flex items-center gap-1.5 text-2xs text-ink-3">
                    <motion.span
                      className="size-1.5 rounded-full bg-good"
                      animate={at("import") ? { opacity: 1 } : { opacity: [1, 0.3, 1] }}
                      transition={at("import") ? { duration: 0.2 } : { duration: 1.4, repeat: Infinity }}
                    />
                    <ServiceLogo service="shopify" name="Shopify" size={12} bare />
                    {stage.store}
                  </span>
                )
                : undefined}
            >
              {skipped
                ? <p className="py-2 text-sm text-ink-3">Koppel een winkel, dan staan je bestellingen hier.</p>
                : at("import")
                ? (
                  <>
                    {ORDERS.slice(0, 4).map((o, i) => (
                      <Row key={o.id} index={i} stagger={0.14}>
                        <span className="figure w-12 shrink-0 text-xs text-ink-3">#{o.number}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{o.customer}</span>
                        <span className="hidden min-w-0 flex-1 truncate text-xs text-ink-3 xl:inline">{o.product}</span>
                        <span className="figure shrink-0 text-sm text-ink">{euro.format(o.total)}</span>
                      </Row>
                    ))}
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      className="pt-1 text-xs text-ink-3"
                    >
                      <Count to={ANALYSIS.settled.store.orders} /> bestellingen van de laatste 90 dagen opgehaald
                    </motion.p>
                  </>
                )
                : [0, 1, 2, 3].map((i) => <SkeletonRow key={i} shimmer={at("winkel") && connected} />)}
            </Block>
          )}

          <AnimatePresence initial={false}>
            {side === "winkel" && at("analyse") && !skipped && ANALYSIS.settled.finding !== undefined && (
              <motion.section
                key="analysis"
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="flex flex-col gap-2 rounded-lg bg-well p-4"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-ink">
                  <MagnusMark size={16} />
                  {ASSISTANT} · eerste analyse
                </span>
                <p className="text-sm font-medium text-pretty text-ink">{ANALYSIS.settled.finding.headline}</p>
                <p className="text-xs text-ink-2">
                  <span className="figure font-medium text-ink">{ANALYSIS.settled.finding.evidence[0]?.figure}</span>
                  {" "}
                  {ANALYSIS.settled.finding.evidence[0]?.says}
                </p>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {side === "winkel" && at("nacht") && (
              <motion.div key="night" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Block title="Vannacht">
                  {OFFLINE_ACTIONS.slice(0, 3).map((a, i) => (
                    <Row key={a.id} index={i}>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.night}</span>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium",
                          a.initial === "auto" ? "bg-good-tint text-good-ink" : "bg-selected text-ink-2"
                        )}
                      >
                        {a.initial === "auto" ? "Zelf doen" : "Eerst vragen"}
                      </span>
                    </Row>
                  ))}
                </Block>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {at("klaar") && (
              <motion.p
                key="ready"
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.2 }}
                className="flex items-center gap-2 text-sm font-medium text-good-ink"
              >
                <Check size={15} />
                Klaar voor morgenochtend
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </div>
  )
}

function Block({ title, aside, children }: {
  readonly title: string
  readonly aside?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <motion.section layout="position" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 pb-1">
        <h3 className="text-xs font-medium text-ink-3">{title}</h3>
        {aside}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.ul layout="position" className="flex flex-col">{children}</motion.ul>
      </AnimatePresence>
    </motion.section>
  )
}

function Row({ index, stagger = 0.08, children }: {
  readonly index: number
  readonly stagger?: number
  readonly children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ ...spring, delay: index * stagger }}
      className="flex h-9 items-center gap-3"
    >
      {children}
    </motion.li>
  )
}

function Bar({ w, className }: { readonly w: string; readonly className?: string }) {
  return <span aria-hidden="true" className={cx("block h-2.5 rounded-full bg-well", w, className)} />
}

function SkeletonRow({ shimmer = false }: { readonly shimmer?: boolean }) {
  return (
    <li aria-hidden="true" className="flex h-9 items-center gap-3">
      <span className={cx("size-7 shrink-0 rounded-md bg-well", shimmer && "animate-pulse")} />
      <Bar w="w-2/5" className={shimmer ? "animate-pulse" : undefined} />
      <Bar w="w-10" className={cx("ml-auto", shimmer && "animate-pulse")} />
    </li>
  )
}

/** A figure that counts up once, in Dutch digits. */
function Count({ to }: { readonly to: number }) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? to : 0)
  useEffect(() => {
    if (reduce) return
    const controls = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v))
    })
    return () => controls.stop()
  }, [to, reduce])
  return <span className="figure font-medium text-ink">{value.toLocaleString("nl-NL")}</span>
}

/* ── gesprek ──────────────────────────────────────────────────────────────────────────────────── */

/** The steps already answered: Magnus's question, then the answer on the right, as in the chat. */
export function History({ items, person }: { readonly items: ReadonlyArray<Exchange>; readonly person?: string }) {
  if (items.length === 0) return null
  return (
    <ol aria-label="Eerder beantwoord" className="flex flex-col gap-4 pb-8">
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <motion.li
            key={`${i}-${item.q}`}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="flex flex-col gap-2"
          >
            <span className="flex items-start gap-2.5 text-sm text-ink-3">
              <span className="mt-px shrink-0 opacity-70">
                <MagnusMark size={16} />
              </span>
              {item.q}
            </span>
            <span className="flex items-center justify-end gap-2">
              <span className="max-w-[80%] truncate rounded-lg bg-selected px-3 py-1.5 text-sm text-ink">{item.a}</span>
              <Avatar name={person !== undefined && person.trim() !== "" ? person : "Jij"} size={22} />
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

/* ── vlak ─────────────────────────────────────────────────────────────────────────────────────── */

const ART: Readonly<Record<Phase, ReadonlyArray<Logo>>> = {
  leeg: ["insyte"],
  naam: ["insyte"],
  plan: ["insyte"],
  winkel: ["blend"],
  import: ["blend"],
  analyse: ["magnus"],
  nacht: ["magnus"],
  klaar: ["insyte", "blend", "magnus"]
}

/** The step's mark, large and slowly breathing, with the line about why the step matters. */
export function StepArt({ phase, line }: { readonly phase: Phase; readonly line: BrandLine }) {
  const { direction } = useVariant()
  const reduce = useReducedMotion()
  const marks = ART[phase]
  const size = marks.length > 1 ? 88 : 148
  return (
    <div className="flex flex-col gap-10">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={marks.join("-")}
          initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
          transition={spring}
          className="flex items-end gap-6"
        >
          {marks.map((logo, i) => (
            <motion.span
              key={logo}
              animate={reduce ? undefined : { y: [0, -6, 0], rotate: logo === "blend" ? [0, 4, 0] : 0 }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}
              className="inline-flex"
            >
              <LogoMark logo={logo} direction={direction} size={size} />
            </motion.span>
          ))}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${line.lead}|${line.rest}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={spring}
          className="flex flex-col gap-4"
        >
          <p className="max-w-[16ch] text-3xl font-semibold text-balance text-ink xl:text-4xl" aria-live="polite">
            {line.lead} <span className="text-ink-3">{line.rest}</span>
          </p>
          <p className="max-w-[42ch] text-md text-pretty text-ink-2">{line.body}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
