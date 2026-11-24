import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { Variants } from "motion/react"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import type { InputHTMLAttributes, ReactNode } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { SUPPORT_EMAIL } from "../../fixtures/auth.ts"
import type { BrandLine } from "../../fixtures/auth.ts"
import { Link } from "../../router.tsx"
import { SECTION_GROUPS } from "../../shell/sections.ts"
import { LogoMark } from "../../shell/variants.tsx"
import { buttonClass, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { AlertTriangle, Check, Eye, EyeOff, Mail, X } from "../../ui/icons.tsx"
import { Input } from "../../ui/input.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Spinner } from "../../ui/spinner.tsx"
import { useVariant } from "../../variants.ts"
import type { AuthFill, AuthLayout } from "../../variants.ts"
import { History, Preview, StepArt } from "./fill.tsx"
import type { Exchange, Stage } from "./fill.tsx"

/*
 * The frame of signing in, setting up and joining, in three versions the Varianten button switches
 * (`variants.ts`, `auth`):
 *
 *   schil      the product's own shell, still empty: the dark L, the werkdraad naming the steps done,
 *              and a rail whose areas light up one by one as the workspace is set up. Signing in is
 *              opening the product; setting up is watching it assemble, with Magnus asking.
 *   midden     one calm column on the work surface, the mark above it.
 *   gesplitst  the dark half (the rail's graphite, one line about why this step matters) beside a
 *              light column. On a phone the dark half folds into a strip at the top.
 *
 * The screens draw the same `FormColumn` and `Heading` in all three; the frame decides the rest. In
 * the shell and the centred frame, what fills the space beside the task is a second choice (`fill`,
 * `fill.tsx`). A flow's progress runs as one line along the bar, and its steps slide in the direction
 * you are going (motion, springs; only a cross-fade with reduced motion).
 */

/** Insyte's name, plain: the word in the text face. */
function Wordmark({ size = "md" }: { readonly size?: "sm" | "md" }) {
  return (
    <span className={cx("font-semibold tracking-tight", size === "sm" ? "text-md" : "text-lg")}>
      insyte
    </span>
  )
}

/** The mark and the name: the logo chosen in Varianten, else the Insyte squares. */
function Brand({ size = "md", onDark = false }: { readonly size?: "sm" | "md"; readonly onDark?: boolean }) {
  const { logo, direction } = useVariant()
  const shown = logo === "winkel" ? "insyte" : logo
  const px = size === "sm" ? 22 : 26
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex shrink-0 items-center justify-center rounded-sm",
          onDark && shown !== "insyte-mono" && "bg-mark-ground"
        )}
        style={{ width: px, height: px }}
      >
        <LogoMark
          logo={shown}
          direction={direction}
          size={onDark && shown !== "insyte-mono" ? Math.round(px * 0.8) : px}
        />
      </span>
      <Wordmark size={size} />
    </span>
  )
}

/** What the shell version is told about the workspace being set up. */
export type ShellState = {
  /** The workspace's name once it has one: the store switcher shows it. */
  readonly workspace?: string
  /** Under the name in the switcher: "Shopify · NL", "Wordt ingericht". */
  readonly detail?: string
  /** The werkdraad: what is done, then the step you are on (last). */
  readonly crumbs?: ReadonlyArray<string>
  /** How much of the rail is lit, 0 to 1. */
  readonly lit?: number
  /** What the bar shows on the right instead of the frame's `meta`; `null` for nothing. */
  readonly meta?: ReactNode
  /** Whether the steps are asked by Magnus (setting up) or stated plainly (signing in). */
  readonly voice?: "magnus" | "plain"
  /** The morning being set up, for the preview. */
  readonly stage?: Stage
  /** The steps already answered, for the conversation. */
  readonly history?: ReadonlyArray<Exchange>
  /** Who is answering: the conversation's avatar. */
  readonly person?: string
  /** A flow's position: the progress line, and which way the steps slide. */
  readonly index?: number
  readonly total?: number
}

type FrameCtx = {
  readonly layout: AuthLayout
  readonly fill: AuthFill
  readonly voice: "magnus" | "plain"
  readonly shell: ShellState
  readonly line: BrandLine | null
  /** 1 going forward, -1 going back. */
  readonly dir: number
}
const Frame = createContext<FrameCtx>({
  layout: "schil",
  fill: "voorbeeld",
  voice: "plain",
  shell: {},
  line: null,
  dir: 1
})

const progressOf = (shell: ShellState) =>
  shell.index === undefined || shell.total === undefined || shell.total < 2
    ? undefined
    : shell.index / (shell.total - 1)

export function AuthFrame({ line, meta, foot, shell, onClose, children }: {
  readonly line: BrandLine
  /** Beside the wordmark on a phone, and under the line on a wide screen: "Winkeleigenaar · ~6 min". */
  readonly meta?: ReactNode
  /** At the foot of the dark half, after the support address: "Rol wijzigen". */
  readonly foot?: ReactNode
  readonly shell?: ShellState
  /** The way out of a flow (setting up): the close button. */
  readonly onClose?: () => void
  readonly children: ReactNode
}) {
  const { auth, fill } = useVariant()
  const state = shell ?? {}
  // Which way the step moved: forward slides in from the right. Derived state, set during render.
  const index = state.index ?? 0
  const [moved, setMoved] = useState({ index, dir: 1 })
  if (moved.index !== index) setMoved({ index, dir: index < moved.index ? -1 : 1 })
  const dir = moved.index !== index ? (index < moved.index ? -1 : 1) : moved.dir
  const asks = auth === "schil" || (auth === "midden" && fill === "gesprek")
  const ctx: FrameCtx = {
    layout: auth,
    fill,
    voice: asks ? (state.voice ?? "plain") : "plain",
    shell: state,
    line,
    dir
  }
  return (
    <Frame.Provider value={ctx}>
      {auth === "schil"
        ? <ShellFrame shell={state} meta={meta} foot={foot} onClose={onClose}>{children}</ShellFrame>
        : auth === "midden"
        ? <CentreFrame meta={meta} foot={foot} onClose={onClose} progress={progressOf(state)}>{children}</CentreFrame>
        : <SplitFrame line={line} meta={meta} foot={foot}>{children}</SplitFrame>}
    </Frame.Provider>
  )
}

/* ── schil ────────────────────────────────────────────────────────────────────────────────────── */

/** The order the rail's areas light up in while a workspace is set up: the store first, Magnus late. */
const LIGHT_ORDER = [
  "start",
  "bestellingen",
  "klanten",
  "producten",
  "inbox",
  "retouren",
  "chargebacks",
  "leveranciers",
  "magnus",
  "analyse",
  "automatiseringen",
  "live"
] as const

function ShellFrame({ shell, meta, foot, onClose, children }: {
  readonly shell: ShellState
  readonly meta?: ReactNode
  readonly foot?: ReactNode
  readonly onClose?: () => void
  readonly children: ReactNode
}) {
  const lit = Math.round(Math.max(0, Math.min(1, shell.lit ?? 0)) * LIGHT_ORDER.length)
  const crumbs = shell.crumbs ?? []
  const barMeta = "meta" in shell ? shell.meta : meta
  const rank = (id: string) => LIGHT_ORDER.indexOf(id as (typeof LIGHT_ORDER)[number])
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <div className="flex h-(--bar-height) shrink-0 bg-bar">
        <div className="hidden w-40 shrink-0 rounded-br-lg bg-rail p-1 md:block">
          <SwitcherFace workspace={shell.workspace} detail={shell.detail} />
        </div>
        <header className="relative grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-3 md:grid-cols-[1fr_auto_1fr]">
          <span className="text-ink md:invisible">
            <Brand size="sm" />
          </span>
          <SetupThread crumbs={crumbs} />
          <div className="flex items-center justify-end gap-3 text-xs text-ink-3">
            {barMeta !== undefined && barMeta !== null && (
              <span className="figure hidden truncate lg:inline">{barMeta}</span>
            )}
            {foot !== undefined && foot !== false && <span className="hidden sm:contents">{foot}</span>}
            {onClose !== undefined && (
              <IconButton label="Inrichten stoppen" onClick={onClose} className="pointer-coarse:size-11">
                <X />
              </IconButton>
            )}
          </div>
          <ProgressLine value={progressOf(shell)} />
        </header>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <nav
          aria-label="Gebieden, nog niet ingericht"
          className="hidden w-(--rail-width) shrink-0 flex-col items-center bg-rail pt-2 pb-3 md:flex"
        >
          <ul className="flex flex-col items-center gap-4">
            {SECTION_GROUPS.map((group) => (
              <li key={group[0]?.id}>
                <ul className="flex flex-col items-center gap-1">
                  {group.map((section) => {
                    const r = rank(section.id)
                    const on = r !== -1 && r < lit
                    const G = section.glyph
                    return (
                      <li
                        key={section.id}
                        title={on ? section.label : `${section.label}, na het inrichten`}
                        className={cx(
                          "flex size-9 items-center justify-center rounded-md transition-[opacity,color,scale] duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                          on ? "scale-100 text-rail-fg opacity-100" : "scale-[0.82] text-rail-ink opacity-25"
                        )}
                        style={{ transitionDelay: on ? `${Math.max(0, r - lit + 4) * 90}ms` : "0ms" }}
                      >
                        {G === null
                          ? (
                            <span className={cx("transition-[filter] duration-700", !on && "grayscale")}>
                              <MagnusMark size={20} />
                            </span>
                          )
                          : <G size={19} strokeWidth={1.75} />}
                        <span className="sr-only">{section.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            title={`Hulp nodig? ${SUPPORT_EMAIL}`}
            aria-label={`Hulp: ${SUPPORT_EMAIL}`}
            className="mt-auto flex size-9 items-center justify-center rounded-md text-rail-ink hover:bg-rail-2 hover:text-rail-fg"
          >
            <Mail size={18} strokeWidth={1.75} />
          </a>
        </nav>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-(--rail-width) hidden size-3 md:block"
          style={{ background: "radial-gradient(circle at 100% 100%, transparent 11.5px, var(--color-rail) 12px)" }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-canvas">{children}</div>
      </div>
    </div>
  )
}

/** The head of the dark L before there is a store: the mark, or the workspace once it is named. */
function SwitcherFace({ workspace, detail }: { readonly workspace?: string; readonly detail?: string }) {
  const named = workspace !== undefined && workspace.trim() !== ""
  return (
    <div className="flex h-full w-full items-center gap-2 rounded-md px-2 text-rail-fg">
      {named
        ? (
          <span
            aria-hidden="true"
            className="inline-flex size-[26px] shrink-0 animate-rise items-center justify-center rounded-sm bg-rail-fg text-xs font-bold text-rail"
          >
            {workspace.trim().slice(0, 1).toUpperCase()}
          </span>
        )
        : <BrandTile />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-semibold">{named ? workspace : "insyte"}</span>
        <span className="truncate text-2xs text-rail-ink">
          {detail ?? (named ? "Wordt ingericht" : "Private bèta")}
        </span>
      </span>
    </div>
  )
}

function BrandTile() {
  const { logo, direction } = useVariant()
  const shown = logo === "winkel" ? "insyte" : logo
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex size-[26px] shrink-0 items-center justify-center rounded-sm",
        shown !== "insyte-mono" && "bg-mark-ground"
      )}
    >
      <LogoMark logo={shown} direction={direction} size={shown === "insyte-mono" ? 26 : 21} />
    </span>
  )
}

/**
 * The werkdraad while setting up: what is already done (the workspace's name, the plan, the store),
 * joined by the shell's short thread, ending in the step you are on. On a narrow bar only the step.
 */
function SetupThread({ crumbs }: { readonly crumbs: ReadonlyArray<string> }) {
  if (crumbs.length === 0) return <span />
  const done = crumbs.slice(0, -1)
  const current = crumbs[crumbs.length - 1]
  return (
    <nav aria-label="Werkdraad" className="flex min-w-0 justify-center">
      <ol className="flex min-w-0 items-center">
        {done.map((label, i) => (
          <li
            key={`${i}-${label}`}
            className={cx(
              "min-w-0 items-center",
              // The last three done at most, fewer as the bar narrows: the step you are on always stays.
              i < done.length - 3
                ? "hidden"
                : i === done.length - 3
                ? "hidden 2xl:flex"
                : i === done.length - 2
                ? "hidden xl:flex"
                : "hidden md:flex"
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-sm text-ink-3">
              <Check size={13} className="shrink-0 text-good" />
              <span className="truncate">{label}</span>
            </span>
            <span aria-hidden="true" className="mx-1 h-px w-3 shrink-0 bg-line-strong" />
          </li>
        ))}
        <li className="flex min-w-0 items-center">
          <span aria-current="step" className="truncate px-1.5 text-sm font-medium text-ink">{current}</span>
        </li>
      </ol>
    </nav>
  )
}

/* ── midden ───────────────────────────────────────────────────────────────────────────────────── */

function CentreFrame({ meta, foot, onClose, progress, children }: {
  readonly meta?: ReactNode
  readonly foot?: ReactNode
  readonly onClose?: () => void
  readonly progress?: number
  readonly children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="relative flex min-h-16 items-center justify-between gap-4 px-4 sm:px-8">
        <Brand />
        <span className="figure flex min-w-0 items-center gap-4 truncate text-xs text-ink-3">
          {meta}
          {foot}
          {onClose !== undefined && (
            <IconButton label="Inrichten stoppen" onClick={onClose} className="pointer-coarse:size-11">
              <X />
            </IconButton>
          )}
        </span>
        <ProgressLine value={progress} track />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="px-4 pb-6 text-center text-xs text-ink-3">
        Hulp nodig?{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-xs font-medium text-ink-2 hover:text-ink">
          {SUPPORT_EMAIL}
        </a>
      </footer>
    </div>
  )
}

/* ── gesplitst ────────────────────────────────────────────────────────────────────────────────── */

function SplitFrame({ line, meta, foot, children }: {
  readonly line: BrandLine
  readonly meta?: ReactNode
  readonly foot?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      <aside className="hidden flex-col justify-between bg-rail px-12 py-11 text-rail-fg lg:flex xl:px-16">
        <Brand onDark />
        <div key={`${line.lead}|${line.rest}`} className="flex animate-rise flex-col gap-5 py-10">
          <p className="max-w-[15ch] text-3xl font-semibold text-balance xl:text-4xl" aria-live="polite">
            {line.lead} <span className="text-rail-ink">{line.rest}</span>
          </p>
          <p className="max-w-[44ch] text-md text-pretty text-rail-ink">{line.body}</p>
          {meta !== undefined && <p className="figure text-sm text-rail-ink">{meta}</p>}
        </div>
        <div className="flex items-center justify-between gap-4 text-xs text-rail-ink">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-xs hover:text-rail-fg">{SUPPORT_EMAIL}</a>
          {foot}
        </div>
      </aside>

      <header className="flex min-h-14 items-center justify-between gap-3 bg-rail px-4 text-rail-fg sm:px-6 lg:hidden">
        <Brand size="sm" onDark />
        {meta !== undefined && (
          <span className="figure flex min-w-0 items-center gap-3 truncate text-xs text-rail-ink">{meta}{foot}</span>
        )}
      </header>

      <div className="flex flex-col">{children}</div>
    </div>
  )
}

/* ── the column ───────────────────────────────────────────────────────────────────────────────── */

/** A flow's progress: one accent line along the bar's foot, sprung to its new length. */
function ProgressLine({ value, track = false }: { readonly value?: number; readonly track?: boolean }) {
  if (value === undefined) return null
  return (
    <span
      role="progressbar"
      aria-label="Voortgang"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cx("pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden", track && "bg-well")}
    >
      <motion.span
        className="block h-full origin-left rounded-r-full bg-accent"
        initial={false}
        animate={{ scaleX: Math.max(0.02, value) }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
      />
    </span>
  )
}

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: 36 * d, filter: "blur(6px)" }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 280, damping: 30, mass: 0.9 }
  },
  exit: (d: number) => ({
    opacity: 0,
    x: -24 * d,
    filter: "blur(4px)",
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const }
  })
}

const fade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.12 } }
}

/** Brings the new question into view after a step, below the answers above it. */
function ScrollIntoView({ on, smooth }: { readonly on?: string; readonly smooth: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      if ((ref.current?.getBoundingClientRect().top ?? 0) < window.innerHeight * 0.6) return
    }
    const id = window.setTimeout(
      () => ref.current?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" }),
      180
    )
    return () => window.clearTimeout(id)
  }, [on, smooth])
  return <span ref={ref} aria-hidden="true" className="block scroll-mt-24" />
}

/**
 * The task, and in the shell and the centred frame what fills the space beside it. One task, 400 to
 * 440px wide; a new step slides in the direction you are going.
 */
export function FormColumn({ stepKey, top, children }: {
  readonly stepKey?: string
  /** Above the task in the split frame: a progress line and the close button. The others draw progress themselves. */
  readonly top?: ReactNode
  readonly children: ReactNode
}) {
  const { layout, fill, shell, line, dir } = useContext(Frame)
  const reduce = useReducedMotion()

  const task = (extra?: string) => (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={stepKey ?? "task"}
        custom={dir}
        variants={reduce ? fade : slide}
        initial="enter"
        animate="center"
        exit="exit"
        className={cx("flex flex-1 flex-col gap-5", extra)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )

  if (layout === "gesplitst") {
    return (
      <>
        {top !== undefined && <div className="px-4 pt-4 sm:px-8 sm:pt-5">{top}</div>}
        <main
          className={cx(
            "mx-auto flex w-full max-w-[400px] flex-1 flex-col px-4 pb-14 sm:px-0",
            top !== undefined ? "pt-[clamp(28px,9vh,104px)]" : "pt-10"
          )}
        >
          {task(top === undefined ? "justify-center [&>:first-child]:mt-auto" : undefined)}
        </main>
      </>
    )
  }

  const phase = shell.stage?.phase ?? "leeg"

  if (fill === "gesprek") {
    return (
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4 pt-[clamp(28px,7vh,88px)] pb-14 sm:px-0">
        <History items={shell.history ?? []} person={shell.person} />
        <ScrollIntoView on={stepKey} smooth={reduce !== true} />
        {task()}
      </main>
    )
  }

  if (fill === "vlak") {
    return (
      <div className="flex flex-1 bg-panel">
        <div className="mx-auto grid w-full max-w-[1120px] flex-1 items-center gap-16 px-4 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <aside className="hidden lg:block">
            {line !== null && <StepArt phase={phase} line={line} />}
          </aside>
          <main className="mx-auto flex w-full max-w-[460px] flex-col lg:mx-0">
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="flex flex-col overflow-hidden rounded-xl bg-canvas p-6 shadow-pop sm:p-9"
            >
              {task()}
            </motion.div>
          </main>
        </div>
      </div>
    )
  }

  // voorbeeld
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col items-center px-4 pt-[clamp(32px,10vh,112px)] pb-14 sm:px-10">
        <div className="flex w-full max-w-[420px] flex-1 flex-col">{task()}</div>
      </main>
      <aside className="hidden items-start justify-center bg-panel px-10 pt-[clamp(32px,10vh,112px)] pb-10 lg:flex xl:px-16">
        {shell.stage !== undefined && <Preview stage={shell.stage} />}
      </aside>
    </div>
  )
}

/**
 * The task's one heading and the quiet line under it. While setting up in the shell, Magnus asks:
 * its mark and name above the question, as in a chat, with the gradient only on the mark.
 */
export function Heading({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  const { voice } = useContext(Frame)
  return (
    <header className="flex flex-col gap-1.5">
      {voice === "magnus" && (
        <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink">
          <MagnusMark size={22} />
          {ASSISTANT}
        </span>
      )}
      <h1 className="text-xl font-semibold text-balance text-ink">{title}</h1>
      {children !== undefined && <p className="text-sm text-pretty text-ink-2">{children}</p>}
    </header>
  )
}

/** The field and button size on these pages: 40px, 44px on touch. */
export const TALL = "min-h-10 pointer-coarse:min-h-11"

/** The primary action of a form, full width. */
export const primaryWide = cx(buttonClass("primary", "md", "w-full"), TALL)
export const secondaryWide = cx(buttonClass("secondary", "md", "w-full"), TALL)

/** A password with a way to see what was typed. */
export function PasswordInput({ value, onChange, ...rest }:
  & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">
  & { readonly value: string; readonly onChange: (next: string) => void })
{
  const [show, setShow] = useState(false)
  return (
    <span className="relative flex items-center">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(TALL, "pr-11")}
        {...rest}
      />
      <button
        type="button"
        aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
        onClick={() => setShow(!show)}
        className="absolute right-1 inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:right-0 pointer-coarse:size-11"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  )
}

export function GoogleButton({ label = "Doorgaan met Google", onClick, loading, disabled }: {
  readonly label?: string
  readonly onClick: () => void
  readonly loading?: boolean
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true || loading === true}
      aria-busy={loading === true || undefined}
      className={secondaryWide}
    >
      {loading === true ? <Spinner size={16} /> : <ServiceLogo service="google" name="Google" size={17} bare />}
      {label}
    </button>
  )
}

/** "of met e-mail": between the one-click way in and the form. Space and a word, no rules. */
export function OrDivider({ label }: { readonly label: string }) {
  return <p className="py-0.5 text-center text-xs text-ink-3">{label}</p>
}

/** What the server refused, under the fields: the problem and how to go on. */
export function FormError({ children }: { readonly children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm bg-bad-tint px-3 py-2.5 text-sm text-ink">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad-ink" />
      <span>{children}</span>
    </p>
  )
}

/** A link in running text, in the accent's ink. */
export function TextLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return (
    <Link to={to} className="rounded-xs font-medium text-accent-ink hover:text-ink">
      {children}
    </Link>
  )
}

/** A quiet button that reads as a link: "Vergeten?", "Een back-upcode gebruiken". */
export function TextButton({ onClick, children, tone = "accent", disabled }: {
  readonly onClick: () => void
  readonly children: ReactNode
  readonly tone?: "accent" | "quiet"
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "rounded-xs font-medium disabled:pointer-events-none disabled:text-ink-3 pointer-coarse:min-h-11",
        tone === "accent" ? "text-accent-ink hover:text-ink" : "text-ink-3 hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}

/** The demo's pause, so a busy button reads as it would against a server. */
export const pause = (ms = 650) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** The same check the server would make on an address. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim())

/** One segment per step, the done ones and the current one in the accent, with the count in words. */
export function StepBar({ index, total, className }: {
  readonly index: number
  readonly total: number
  readonly className?: string
}) {
  // The shell and the centred frame draw progress along their bar; a second one would repeat it.
  const { layout } = useContext(Frame)
  if (layout !== "gesplitst") return null
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <div className="flex flex-1 items-center gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the segments are positions
            key={i}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i <= index ? "bg-accent" : "bg-line"
            )}
          />
        ))}
      </div>
      <span className="figure shrink-0 text-xs font-medium text-ink-2">Stap {index + 1} van {total}</span>
    </div>
  )
}
