import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Glyph } from "../../fixtures/agents.ts"
import { OFFLINE_ACTIONS, OFFLINE_WINDOWS, PREPARED, PREPARED_KIND, QUESTIONS, READS } from "../../fixtures/auth.ts"
import type { AnalysisSeed, Finding, OfflineLevel, Prediction, PreparedId, Watch } from "../../fixtures/auth.ts"
import { buttonClass } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Bot, Check, Lock, Sheet, Workflow } from "../../ui/icons.tsx"
import { FieldLabel } from "../../ui/input.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Spinner } from "../../ui/spinner.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { pause } from "./frame.tsx"

/*
 * The pieces of the setup steps (`/app/onboarding`'s step builders): a choice of a few rows, the
 * Shopify hand-off, the first import counted in, the first analysis, the offline plan and the ready
 * summary. Each draws in the kit's terms: tonal rows, no boxes in boxes, figures in proportional
 * numerals.
 */

/* ── a choice of a few ─────────────────────────────────────────────────────────────────────────── */

export type ChoiceOption = {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly meta?: ReactNode
  readonly glyph?: Glyph
}

/**
 * A short list to pick from, one or several: each option a row on the well that takes the accent's
 * tint when it is chosen, with a round mark (one) or a square tick (several). The arrow keys and the
 * space bar work as for radios and checkboxes, because they are those.
 */
export function ChoiceList({ options, value, onChange, label, multi = false, columns = 1 }: {
  readonly options: ReadonlyArray<ChoiceOption>
  readonly value: ReadonlyArray<string>
  readonly onChange: (next: ReadonlyArray<string>) => void
  readonly label: string
  readonly multi?: boolean
  readonly columns?: 1 | 2
}) {
  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-label={label}
      className={cx("grid gap-1.5", columns === 2 && "grid-cols-2")}
    >
      {options.map((option) => {
        const on = value.includes(option.id)
        const G = option.glyph
        return (
          <button
            key={option.id}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() =>
              onChange(multi ? (on ? value.filter((v) => v !== option.id) : [...value, option.id]) : [option.id])}
            className={cx(
              "flex min-h-11 w-full items-center gap-3 rounded-md px-3.5 py-2.5 text-left transition-colors",
              on ? "bg-accent-tint" : "bg-well hover:bg-hover"
            )}
          >
            {G !== undefined && (
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-8 shrink-0 items-center justify-center rounded-md bg-canvas shadow-xs transition-colors",
                  on ? "text-accent-ink" : "text-ink-2"
                )}
              >
                <G size={16} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-ink">{option.label}</span>
              {option.hint !== undefined && <span className="text-xs text-pretty text-ink-2">{option.hint}</span>}
            </span>
            {option.meta !== undefined && <span className="shrink-0 text-xs text-ink-2">{option.meta}</span>}
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex size-4 shrink-0 items-center justify-center",
                multi ? "rounded-xs" : "rounded-full",
                on ? "bg-accent text-on-accent" : "bg-canvas ring-1 ring-line-strong ring-inset"
              )}
            >
              {on &&
                (multi ? <Check size={11} strokeWidth={2.5} /> : <span className="size-1.5 rounded-full bg-canvas" />)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A text field with a fixed part before or after it, drawn as one field: "goinsyte.com/" + slug. */
export function AffixField({ id, before, after, value, onChange, placeholder, invalid, describedBy, disabled }: {
  readonly id: string
  readonly before?: string
  readonly after?: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly placeholder?: string
  readonly invalid?: boolean
  readonly describedBy?: string
  readonly disabled?: boolean
}) {
  return (
    <span
      className={cx(
        "flex min-h-10 items-center rounded-sm bg-canvas text-sm ring-1 ring-inset focus-within:ring-2 pointer-coarse:min-h-11",
        invalid === true ? "ring-bad-ink focus-within:ring-bad-ink" : "ring-line-strong focus-within:ring-accent",
        disabled === true && "bg-well"
      )}
    >
      {before !== undefined && <span className="pl-2.5 text-ink-3" aria-hidden="true">{before}</span>}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        aria-invalid={invalid === true ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "h-full min-w-0 flex-1 bg-transparent py-2 text-ink outline-none placeholder:text-ink-3 disabled:text-ink-3",
          before === undefined ? "pl-2.5" : "pl-0.5",
          after === undefined ? "pr-2.5" : "pr-0.5"
        )}
      />
      {after !== undefined && <span className="pr-2.5 text-ink-3" aria-hidden="true">{after}</span>}
    </span>
  )
}

/* ── Shopify ───────────────────────────────────────────────────────────────────────────────────── */

/** `je-winkel`, `je-winkel.myshopify.com` or a pasted URL, as a valid shop domain, or null. */
export function shopDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  if (host === "") return null
  const handle = host.replace(/\.myshopify\.com$/, "")
  return /^[a-z0-9][a-z0-9-]*$/.test(handle) ? `${handle}.myshopify.com` : null
}

/**
 * Connecting Shopify, the hand-off simulated with the steps the real one has: Shopify opens, waits
 * for the approval, comes back connected.
 */
export function ShopifyConnect({ handle, setHandle, connected, onConnected }: {
  readonly handle: string
  readonly setHandle: (next: string) => void
  readonly connected: boolean
  readonly onConnected: (domain: string) => void
}) {
  const [phase, setPhase] = useState<"idle" | "opening" | "approving">("idle")
  const [error, setError] = useState<string | undefined>()
  const domain = shopDomain(handle)

  const connect = async () => {
    if (domain === null) {
      setError("Vul de naam van je winkel in, zoals je-winkel.")
      return
    }
    setError(undefined)
    setPhase("opening")
    await pause(700)
    setPhase("approving")
    await pause(900)
    setPhase("idle")
    onConnected(domain)
  }

  if (connected) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="flex items-center gap-3 rounded-lg bg-well p-3"
      >
        <ServiceLogo service="shopify" name="Shopify" size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-ink">{domain ?? handle}</span>
          <span className="text-xs text-pretty text-ink-2">
            Goedgekeurd. Bestellingen, producten en klanten worden nu gesynchroniseerd.
          </span>
        </div>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.15 }}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-good text-on-accent"
          aria-label="Gekoppeld"
        >
          <Check size={13} strokeWidth={2.75} />
        </motion.span>
      </motion.div>
    )
  }

  const working = phase !== "idle"
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="shop-handle">Je Shopify-winkel</FieldLabel>
        <AffixField
          id="shop-handle"
          value={handle.replace(/\.myshopify\.com$/, "")}
          onChange={setHandle}
          after=".myshopify.com"
          placeholder="je-winkel"
          disabled={working}
          invalid={error !== undefined}
          describedBy={error === undefined ? undefined : "shop-handle-error"}
        />
        {error !== undefined && <p id="shop-handle-error" className="text-xs text-bad-ink">{error}</p>}
      </div>
      <button
        type="button"
        disabled={working}
        aria-busy={working || undefined}
        onClick={() => void connect()}
        className={cx(
          buttonClass("secondary", "md", "w-full overflow-hidden"),
          "min-h-11 gap-2.5 text-sm pointer-coarse:min-h-12"
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2.5"
          >
            {working ? <Spinner size={16} /> : <ServiceLogo service="shopify" name="Shopify" size={18} bare />}
            {phase === "opening"
              ? "Shopify wordt geopend"
              : phase === "approving"
              ? "Wacht op je goedkeuring in Shopify"
              : "Koppelen met Shopify"}
          </motion.span>
        </AnimatePresence>
      </button>
      <p className="text-sm text-pretty text-ink-2">
        Shopify vraagt je Insyte goed te keuren en stuurt je daarna direct terug. Of sla het over en koppel later via de
        instellingen.
      </p>
    </div>
  )
}

/* ── the first import ──────────────────────────────────────────────────────────────────────────── */

function useCountUp(to: number, ms: number, delay: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let frame = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms))
      setN(Math.round(to * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, ms, delay])
  return n
}

function SyncRow({ label, to, delay }: { readonly label: string; readonly to: number; readonly delay: number }) {
  const n = useCountUp(to, 1600, delay)
  const done = n === to
  return (
    <li className="relative flex min-h-11 items-center gap-3 overflow-hidden rounded-md bg-well px-3.5">
      <span
        aria-hidden="true"
        className={cx("absolute inset-y-0 left-0 bg-accent-tint transition-opacity duration-500", done && "opacity-0")}
        style={{ width: `${to === 0 ? 0 : (n / to) * 100}%` }}
      />
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        {done
          ? <Check size={16} strokeWidth={2.5} className="text-good-ink" />
          : <span className="size-3.5 animate-spin rounded-full border-2 border-accent-tint border-t-accent" />}
      </span>
      <span className="relative flex-1 text-sm font-medium text-ink">
        {label}
        <span className="sr-only">{done ? " (klaar)" : " (bezig)"}</span>
      </span>
      <span className="figure relative text-sm text-ink-2">{n.toLocaleString("nl-NL")}</span>
    </li>
  )
}

export function SyncProgress(
  { connected, store, domain }: {
    readonly connected: boolean
    readonly store: AnalysisSeed["store"]
    /** The store being read, at the head of the counts. */
    readonly domain?: string | null
  }
) {
  if (!connected) {
    return (
      <p className="rounded-md bg-well px-3.5 py-3 text-sm text-pretty text-ink-2">
        Nog geen winkel gekoppeld. Koppel Shopify wanneer je wilt via{" "}
        <span className="font-medium text-ink">Instellingen, Koppelingen</span>. De rest van de inrichting werkt gewoon.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {domain !== undefined && domain !== null && (
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <ServiceLogo service="shopify" name="Shopify" size={14} bare />
          Uit <span className="font-medium text-ink-2">{domain}</span>
        </p>
      )}
      <ul className="flex flex-col gap-1.5" aria-live="polite">
        <SyncRow label="Producten" to={store.products} delay={0} />
        <SyncRow label="Klanten" to={store.customers} delay={250} />
        <SyncRow label="Bestellingen" to={store.orders} delay={500} />
      </ul>
    </div>
  )
}

/* ── the first analysis ────────────────────────────────────────────────────────────────────────── */

export type AnalysisMode = "finding" | "early" | "none"

export const analysisMode = (connected: boolean, seed: AnalysisSeed): AnalysisMode =>
  !connected ? "none" : seed.finding !== undefined ? "finding" : "early"

export const defaultPrepared = (mode: AnalysisMode): ReadonlyArray<PreparedId> =>
  mode === "finding" ? ["automation", "agent", "sheet"] : mode === "early" ? ["automation", "agent"] : ["agent"]

const nl = (n: number) => n.toLocaleString("nl-NL")

export function analysisCopy(mode: AnalysisMode, read: boolean, seed: AnalysisSeed) {
  if (mode === "none") {
    return {
      title: "Nog niets om te lezen.",
      subtitle:
        "Zonder gekoppelde winkel kan Insyte niet kijken. Twee vragen, dan staat het juiste klaar zodra je koppelt."
    }
  }
  if (!read) {
    return {
      title: "Insyte leest je winkel.",
      subtitle: "Bestellingen, mail en je beleid. Dit duurt een paar seconden."
    }
  }
  if (mode === "early") {
    return {
      title: "Nog te vroeg om te oordelen.",
      subtitle: `${
        nl(seed.store.orders)
      } bestellingen in ${seed.store.days} dagen is te weinig om een knelpunt aan te wijzen. Insyte gokt niet, het bereidt voor.`
    }
  }
  return {
    title: "Dit pakt Insyte als eerste aan.",
    subtitle: `Gelezen: ${nl(seed.store.orders)} bestellingen en ${
      nl(seed.store.mails)
    } mails uit de laatste ${seed.store.days} dagen.`
  }
}

/** The reading: each source ticks off in turn, Magnus's mark beside the one in progress. */
export function Reading({ onDone }: { readonly onDone: () => void }) {
  const [at, setAt] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (at >= READS.length) {
      const t = window.setTimeout(() => done.current(), still ? 0 : 420)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setAt((n) => n + 1), still ? 0 : 720)
    return () => window.clearTimeout(t)
  }, [at])
  return (
    <ul className="flex flex-col gap-1.5" role="status" aria-live="polite">
      {READS.map((label, i) => {
        const finished = i < at
        const now = i === at
        return (
          <li
            key={label}
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-md px-3.5 transition-colors duration-300",
              now || finished ? "bg-well" : "bg-well/50"
            )}
          >
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              {finished
                ? <Check size={16} strokeWidth={2.5} className="text-good-ink" />
                : now
                ? <MagnusMark size={18} />
                : <span className="size-1.5 rounded-full bg-ink-4" />}
            </span>
            <span className={cx("flex-1 text-sm", finished ? "text-ink" : now ? "font-medium text-ink" : "text-ink-3")}>
              {label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function FindingView({ finding }: { readonly finding: Finding }) {
  return (
    <>
      <section aria-label="Bevinding" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <MagnusMark size={22} />
          <p className="text-md font-semibold text-balance text-ink">{finding.headline}</p>
        </div>
        <dl className="flex flex-col gap-3 pl-[34px]">
          {finding.evidence.map((e) => (
            <div key={e.figure} className="flex flex-col gap-0.5">
              <dt className="text-sm text-pretty text-ink">
                <span className="figure font-semibold">{e.figure}</span> {e.says}
              </dt>
              <dd className="text-xs text-ink-3">{e.basis}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Aanpak" className="flex flex-col gap-1.5 rounded-md bg-well px-4 py-3.5">
        <h2 className="text-sm font-semibold text-ink">{finding.fix.title}</h2>
        <p className="text-sm text-pretty text-ink-2">{finding.fix.why}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="figure text-sm font-semibold text-accent-ink">{finding.effect.figure}</span>
          <span className="text-xs text-ink-3">{finding.effect.basis}</span>
        </p>
      </section>
    </>
  )
}

function Predictions({ predictions }: { readonly predictions: ReadonlyArray<Prediction> }) {
  return (
    <section aria-labelledby="predictions" className="flex flex-col gap-2.5">
      <h2 id="predictions" className="text-sm font-semibold text-ink">Wat je inrichting al zegt</h2>
      <ul className="flex flex-col gap-3">
        {predictions.map((p) => (
          <li key={p.read} className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-ink">{p.read}</span>
            <span className="text-sm text-pretty text-ink-2">{p.expect}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Questions({ answers, onAnswer }: {
  readonly answers: Readonly<Record<string, string>>
  readonly onAnswer: (id: string, value: string) => void
}) {
  return (
    <section aria-labelledby="questions" className="flex flex-col gap-3">
      <h2 id="questions" className="text-sm font-semibold text-ink">Twee vragen, zodat het juiste klaarstaat</h2>
      {QUESTIONS.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">{q.ask}</span>
          <Segmented
            stretch
            label={q.ask}
            value={answers[q.id] ?? q.initial}
            options={q.options}
            onChange={(v) => onAnswer(q.id, v)}
          />
        </div>
      ))}
    </section>
  )
}

function WatchList({ watch }: { readonly watch: ReadonlyArray<Watch> }) {
  return (
    <section aria-labelledby="watch" className="flex flex-col gap-2.5">
      <h2 id="watch" className="text-sm font-semibold text-ink">Waar Insyte op let</h2>
      <ul className="flex flex-col gap-3">
        {watch.map((w) => (
          <li key={w.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink">
                <span className="font-medium">{w.label}</span>
                <span className="text-ink-2">, {w.after}</span>
              </span>
              <span className="figure shrink-0 text-xs text-ink-2">{w.have} van {w.need}</span>
            </div>
            <span className="h-1 overflow-hidden rounded-full bg-well" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, (w.have / w.need) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const PREPARED_GLYPH: Readonly<Record<PreparedId, typeof Bot>> = { automation: Workflow, agent: Bot, sheet: Sheet }

/** What the analysis found, or what it reads from the setup, and what Insyte prepares. */
export function AnalysisResult({ mode, seed, prepared, setPrepared, answers, setAnswer }: {
  readonly mode: AnalysisMode
  readonly seed: AnalysisSeed
  readonly prepared: ReadonlyArray<PreparedId>
  readonly setPrepared: (next: ReadonlyArray<PreparedId>) => void
  readonly answers: Readonly<Record<string, string>>
  readonly setAnswer: (id: string, value: string) => void
}) {
  return (
    <div className="flex animate-rise flex-col gap-7">
      {mode === "finding" && seed.finding !== undefined && <FindingView finding={seed.finding} />}
      {mode === "early" && seed.early !== undefined && <Predictions predictions={seed.early.predictions} />}
      {mode !== "finding" && <Questions answers={answers} onAnswer={setAnswer} />}
      {mode === "early" && seed.early !== undefined && <WatchList watch={seed.early.watch} />}
      <section aria-labelledby="prepared" className="flex flex-col gap-2.5">
        <h2 id="prepared" className="text-sm font-semibold text-ink">
          {mode === "none" ? "Staat klaar zodra je koppelt" : "Staat klaar"}
        </h2>
        <ChoiceList
          multi
          label="Wat Insyte klaarzet"
          value={prepared}
          onChange={(next) => setPrepared(next as ReadonlyArray<PreparedId>)}
          options={defaultPrepared(mode).map((id) => ({
            id,
            label: PREPARED[id].title,
            hint: PREPARED[id].does,
            glyph: PREPARED_GLYPH[id],
            meta: id === "agent" && answers.reply === "auto" ? "Zelf doen" : PREPARED_KIND[id]
          }))}
        />
        <p className="text-sm text-ink-2">Niets hiervan gaat naar een klant voordat jij het hebt gezien.</p>
      </section>
    </div>
  )
}

/* ── while you are offline ─────────────────────────────────────────────────────────────────────── */

/** What the offline plan proposes: routine work on its own, anything that speaks or pays on ask. */
export function proposedLevels(answers: Readonly<Record<string, string>>): Record<string, OfflineLevel> {
  return Object.fromEntries(
    OFFLINE_ACTIONS.map((a) => [a.id, a.id === "SendReply" && answers.reply === "auto" ? "auto" : a.initial])
  )
}

export function OfflinePlan({ answers, window: offline, setWindow, levels, setLevel, automation }: {
  readonly answers: Readonly<Record<string, string>>
  readonly window: string
  readonly setWindow: (next: string) => void
  readonly levels: Readonly<Record<string, OfflineLevel>>
  readonly setLevel: (id: string, level: OfflineLevel) => void
  /** The delivery-time update was prepared: say it waits as a draft. */
  readonly automation: boolean
}) {
  const actions = OFFLINE_ACTIONS.filter((a) => a.id !== "ForwardOrder" || answers.fulfilment !== "self")
  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby="offline-when" className="flex flex-col gap-2.5">
        <h2 id="offline-when" className="text-sm font-semibold text-ink">Wanneer ben je meestal offline?</h2>
        <ChoiceList
          label="Wanneer je offline bent"
          value={[offline]}
          onChange={(next) => setWindow(next[0] ?? offline)}
          options={OFFLINE_WINDOWS}
        />
      </section>
      <section aria-labelledby="offline-what" className="flex flex-col gap-2.5">
        <h2 id="offline-what" className="text-sm font-semibold text-ink">Wat Insyte dan doet</h2>
        <ul className="flex flex-col gap-3.5">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">{a.night}</span>
              {a.locked === undefined
                ? (
                  <Segmented
                    stretch
                    label={a.night}
                    value={levels[a.id] ?? a.initial}
                    onChange={(level) => setLevel(a.id, level)}
                    options={[{ value: "auto", label: "Zelf doen" }, { value: "ask", label: "Klaarzetten voor mij" }]}
                  />
                )
                : (
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <Lock size={13} className="shrink-0" />
                    {a.locked}
                  </span>
                )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-pretty text-ink-2">
          Wat Insyte zelf deed, staat morgenochtend op Start met een link naar waarom, en wat kan worden teruggedraaid
          heeft Ongedaan maken.
          {automation ? " De levertijd-update staat als concept klaar en draait pas als je hem aanzet." : ""}
        </p>
      </section>
    </div>
  )
}

/* ── ready ─────────────────────────────────────────────────────────────────────────────────────── */

export function ReadySummary({ connected, store, prepared }: {
  readonly connected: boolean
  readonly store: AnalysisSeed["store"]
  readonly prepared: ReadonlyArray<string>
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-well px-4 py-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Check size={16} strokeWidth={2.5} className="text-good-ink" />
        Werkruimte klaar
      </span>
      <p className="text-sm text-pretty text-ink">
        {connected
          ? "Je winkel is gekoppeld en de eerste import is binnen. Vanaf hier vult de wachtrij zich."
          : "Je werkruimte staat klaar. Koppel een winkel wanneer je wilt om te beginnen met importeren."}
      </p>
      {connected && (
        <p className="figure text-sm text-ink-2">
          {nl(store.products)} producten · {nl(store.orders)} bestellingen · {nl(store.customers)} klanten
        </p>
      )}
      {prepared.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Klaargezet door Insyte</span>
          <ul className="flex flex-col gap-0.5 text-sm text-ink-2">
            {prepared.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
