import { useEffect, useRef, useState } from "react"
import { AnswerText, plainOf, RecordChip, units } from "../ask/answer-text.tsx"
import { KIND_GLYPH } from "../ask/catalogue.ts"
import type { Ref } from "../ask/catalogue.ts"
import { ASSISTANT } from "../assistant.ts"
import { ChartCard } from "../charts/chart-card.tsx"
import { DataTable } from "../charts/data-table.tsx"
import { Figures } from "../charts/figures.tsx"
import { Funnel } from "../charts/funnel.tsx"
import { LineChart } from "../charts/line-chart.tsx"
import { Key } from "../charts/parts.tsx"
import type { FollowUp, Proposal as ProposalData, Source, Step, Turn, Visual } from "../fixtures/assistant.ts"
import { ME } from "../fixtures/workspace.ts"
import { Link, paths } from "../router.tsx"
import { MagnusAvatar } from "../ui/assistant.tsx"
import { Avatar } from "../ui/avatar.tsx"
import { Chip } from "../ui/chip.tsx"
import { cx } from "../ui/cx.ts"
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { Message } from "../ui/message.tsx"
import { Proposal } from "../ui/proposal.tsx"
import type { ProposalState } from "../ui/proposal.tsx"
import { Spinner } from "../ui/spinner.tsx"

export function MyMessage({ at, text, refs = [] }: {
  readonly at: string
  readonly text: string
  /** The records the message named with @, as chips above the words. */
  readonly refs?: ReadonlyArray<Ref>
}) {
  return (
    <Message avatar={<Avatar name={ME.name} size={28} />} name={ME.name} at={at}>
      {refs.length > 0 && (
        <p className="flex flex-wrap gap-1" aria-label="Genoemd">
          {refs.map((r) => <RecordChip key={`${r.kind}-${r.id}`} label={r.label} href={r.href} kind={r.kind} />)}
        </p>
      )}
      {text !== refs.map((r) => r.label).join(", ") && <p className="text-base text-ink">{text}</p>}
    </Message>
  )
}

// Magnus's disc and the working line live in the library now; re-exported for the screens.

type MagnusTurn = Extract<Turn, { from: "magnus" }>

/**
 * An answer: how Magnus got there (folded), the sentences with their records and figures as chips,
 * the chart or table in the house style, what it read, the question back, feedback, and the next
 * steps as chips. A `stream`ed answer writes itself in once, the way a model's answer arrives.
 */
export function MagnusMessage({ turn, used, onFollowUp, stream: fresh = false, onStreamed }: {
  readonly turn: MagnusTurn
  readonly used: ReadonlySet<string>
  readonly onFollowUp?: (followUp: FollowUp) => void
  /** Write the answer in as it arrives (a new answer), instead of showing it whole. */
  readonly stream?: boolean
  readonly onStreamed?: () => void
}) {
  const versions = [turn.paragraphs, turn.alternative ?? turn.paragraphs] as const
  const [version, setVersion] = useState<0 | 1>(0)
  const [again, setAgain] = useState(false)
  const stream = useStream(onStreamed)
  const paragraphs = stream.shown(versions[version])
  // The first version, read when the answer starts; a ref so a re-render (each word) does not restart it.
  const first = useRef(versions[0])
  first.current = versions[0]
  const started = useRef(false)
  const { start, stop } = stream
  useEffect(() => {
    if (!fresh || started.current) return
    started.current = true
    start(first.current)
    // Unmounted mid-answer (StrictMode's rehearsal too): stop, so the next mount writes it in again.
    return () => {
      started.current = false
      stop()
    }
  }, [fresh, start, stop])
  const regenerate = () => {
    const next = version === 0 ? 1 : 0
    setVersion(next)
    setAgain(true)
    stream.start(versions[next])
  }
  const settled = !stream.busy
  return (
    <Message avatar={<MagnusAvatar />} name={ASSISTANT} at={turn.at}>
      {turn.steps !== undefined && <Steps steps={turn.steps} />}
      {paragraphs.some((p) => p !== "") && (
        <div className="flex max-w-[60ch] flex-col gap-3 text-base text-pretty text-ink" aria-busy={stream.busy}>
          {paragraphs.map((text, i) => (
            <p key={i}>
              <AnswerText text={text} />
            </p>
          ))}
        </div>
      )}
      {settled && turn.chart !== undefined && (
        <ChartCard {...turn.chart} board={{ label: "Retouren", href: paths.board("retouren") }} />
      )}
      {settled && turn.visual !== undefined && <AnswerVisual visual={turn.visual} />}
      {settled && turn.closing !== undefined && (
        <p className="max-w-[60ch] text-base text-pretty text-ink">{turn.closing}</p>
      )}
      {settled && turn.sources !== undefined && turn.sources.length > 0 && <Sources sources={turn.sources} />}
      {turn.paragraphs.length > 0 && (
        <Feedback
          text={plainOf([...versions[version], turn.closing ?? ""].join("\n\n")).trim()}
          onRegenerate={regenerate}
          busy={stream.busy}
          version={turn.alternative === undefined || !again ? undefined : version + 1}
        />
      )}
      {settled && turn.followUps !== undefined && turn.followUps.length > 0 && onFollowUp !== undefined && (
        <ul className="flex flex-col items-start gap-1.5 pt-1" aria-label="Vervolgstappen">
          {turn.followUps.map((followUp) => {
            const done = used.has(followUp.id)
            return (
              <li key={followUp.id}>
                <Chip
                  done={done}
                  hint={followUp.kind === "proposal" ? "vraagt eerst" : undefined}
                  onClick={() => onFollowUp(followUp)}
                >
                  {followUp.label}
                </Chip>
              </li>
            )
          })}
        </ul>
      )}
    </Message>
  )
}

function Steps({ steps }: { readonly steps: ReadonlyArray<Step> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 self-start rounded-xs text-xs text-ink-3 hover:text-ink"
      >
        Klaar in {steps.length} {steps.length === 1 ? "stap" : "stappen"}
        <ChevronRight size={13} className={cx("transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <ol className="flex animate-rise flex-col gap-1.5 pl-1">
          {steps.map((step) => (
            <li key={step.label} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <Check size={12} className="translate-y-0.5 text-good-ink" />
              <span className="text-ink-2">{step.label}</span>
              {step.read !== undefined && <span className="text-ink-3">{step.read}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * Magnus at work on an answer: his disc and name, and the steps as he takes them, the current one
 * turning and the ones before it ticked, each with what it read. The answer replaces it when it is
 * written.
 */
export function WorkingMessage({ steps, reached }: {
  readonly steps: ReadonlyArray<Step>
  /** How many steps have started. */
  readonly reached: number
}) {
  return (
    <Message
      avatar={
        <span className="animate-pulse motion-reduce:animate-none">
          <MagnusAvatar />
        </span>
      }
      name={ASSISTANT}
      at="nu"
    >
      <ol className="flex flex-col gap-1.5" role="status" aria-label={`${ASSISTANT} werkt`}>
        {steps.slice(0, Math.max(1, reached)).map((step, i) => {
          const done = i < reached - 1
          return (
            <li key={step.label} className="flex animate-rise flex-wrap items-center gap-x-2 text-sm">
              {done ? <Check size={13} className="text-good-ink" /> : <Spinner size={13} className="text-ink-3" />}
              <span className={done ? "text-ink-3" : "text-ink"}>{step.label}</span>
              {step.read !== undefined && <span className="text-xs text-ink-3">{step.read}</span>}
            </li>
          )
        })}
      </ol>
    </Message>
  )
}

/** What the answer read: "N bronnen gelezen", folded, each source a row that opens it. */
function Sources({ sources }: { readonly sources: ReadonlyArray<Source> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex animate-rise flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-ml-1.5 flex min-h-7 items-center gap-1.5 self-start rounded-sm px-1.5 text-xs text-ink-3 hover:bg-hover hover:text-ink"
      >
        <span className="flex -space-x-1" aria-hidden="true">
          {sources.slice(0, 3).map((s) => {
            const G = KIND_GLYPH[s.kind]
            return (
              <span
                key={`${s.kind}-${s.title}`}
                className="flex size-4 items-center justify-center rounded-full bg-canvas text-ink-3 ring-1 ring-line"
              >
                <G size={10} />
              </span>
            )
          })}
        </span>
        <span className="figure">{sources.length}</span> {sources.length === 1 ? "bron" : "bronnen"} gelezen
        <ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="flex max-w-md animate-rise flex-col">
          {sources.map((s) => {
            const G = KIND_GLYPH[s.kind]
            return (
              <li key={`${s.kind}-${s.title}`}>
                <Link
                  to={s.href}
                  className="group flex min-h-9 items-center gap-2.5 rounded-sm px-1.5 py-1 hover:bg-hover"
                >
                  <G size={15} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 truncate text-sm text-ink">{s.title}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{s.detail}</span>
                  <ArrowUpRight size={13} className="shrink-0 text-ink-4 group-hover:text-ink-3" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** A chart, table or figures under an answer: the board's marks on a well, its title and key below. */
function AnswerVisual({ visual }: { readonly visual: Visual }) {
  if (visual.kind === "bar" || visual.kind === "rank") {
    return (
      <ChartCard
        title={visual.title}
        kind={visual.kind}
        data={visual.data}
        board={visual.board ?? { label: "Analyse", href: paths.board("week") }}
      />
    )
  }
  return (
    <figure className={cx("my-1 rounded-lg bg-well", visual.kind === "table" ? "max-w-xl" : "max-w-md")}>
      <div className="px-4 pt-3 pb-1">
        {visual.kind === "line" && <LineChart data={visual.data} height={150} />}
        {visual.kind === "table" && <DataTable data={visual.data} />}
        {visual.kind === "funnel" && <Funnel data={visual.data} />}
        {visual.kind === "figures" && <Figures figures={visual.figures} compareLabel={visual.compareLabel} />}
      </div>
      <figcaption className="flex flex-col gap-2 px-4 pt-1 pb-3">
        <span className="text-sm font-medium text-ink">{visual.title}</span>
        {(visual.kind === "line" || visual.board !== undefined) && (
          <span className="flex flex-wrap items-center justify-between gap-2">
            {visual.kind === "line" ? <Key compare /> : <span />}
            {visual.board !== undefined && (
              <Link
                to={visual.board.href}
                className="flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink"
              >
                Op bord {visual.board.label}
                <ArrowUpRight size={13} />
              </Link>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * Streams an answer in as it is written: a few words at a time, a record or a figure arriving whole,
 * the way a model's answer arrives. For people who asked for reduced motion it appears whole.
 */
function useStream(onDone?: () => void) {
  const [words, setWords] = useState<number | null>(null)
  const total = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => () => window.clearInterval(timer.current), [])

  const [api] = useState(() => ({
    stop: () => window.clearInterval(timer.current),
    start: (paragraphs: ReadonlyArray<string>) => {
      window.clearInterval(timer.current)
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setWords(null)
        done.current?.()
        return
      }
      total.current = paragraphs.reduce((n, p) => n + units(p).length, 0)
      setWords(0)
      timer.current = window.setInterval(() => {
        setWords((n) => {
          const next = (n ?? 0) + 3
          if (next >= total.current) {
            window.clearInterval(timer.current)
            window.setTimeout(() => done.current?.(), 0)
            return null
          }
          return next
        })
      }, 45)
    }
  }))

  /** The paragraphs as far as they have arrived; an open `**` is closed so the bold does not run on. */
  const shown = (paragraphs: ReadonlyArray<string>): ReadonlyArray<string> => {
    if (words === null) return paragraphs
    let left = words
    const out: Array<string> = []
    for (const paragraph of paragraphs) {
      if (left <= 0) break
      const parts = units(paragraph)
      const piece = parts.slice(0, left).join(" ")
      left -= parts.length
      out.push((piece.match(/\*\*/g)?.length ?? 0) % 2 === 1 ? `${piece}**` : piece)
    }
    return out.length === 0 ? [""] : out
  }

  return { start: api.start, stop: api.stop, shown, busy: words !== null }
}

function Feedback({ text, onRegenerate, busy = false, version }: {
  readonly text: string
  readonly onRegenerate?: (() => void) | undefined
  readonly busy?: boolean
  /** Which of the answers shows (1 or 2), when there is more than one. */
  readonly version?: number | undefined
}) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [copied, setCopied] = useState(false)
  const base = "flex size-7 items-center justify-center rounded-sm hover:bg-hover hover:text-ink"
  return (
    <div className="-ml-1.5 flex items-center gap-0.5 text-ink-3">
      <button
        type="button"
        aria-label="Goed antwoord"
        aria-pressed={vote === "up"}
        onClick={() => setVote(vote === "up" ? null : "up")}
        className={cx(base, vote === "up" && "text-ink")}
      >
        <ThumbsUp size={15} />
      </button>
      <button
        type="button"
        aria-label="Slecht antwoord"
        aria-pressed={vote === "down"}
        onClick={() => setVote(vote === "down" ? null : "down")}
        className={cx(base, vote === "down" && "text-ink")}
      >
        <ThumbsDown size={15} />
      </button>
      <button
        type="button"
        aria-label={copied ? "Gekopieerd" : "Kopiëren"}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))
        }}
        className={base}
      >
        {copied ? <Check size={15} className="text-good-ink" /> : <Copy size={15} />}
      </button>
      {onRegenerate !== undefined && (
        <button
          type="button"
          aria-label="Opnieuw genereren"
          title="Opnieuw genereren"
          disabled={busy}
          onClick={onRegenerate}
          className={cx(base, "disabled:text-ink-4")}
        >
          <RotateCcw size={15} />
        </button>
      )}
      {version !== undefined && (
        <span className="figure pl-1.5 text-2xs text-ink-3" aria-live="polite">
          {busy ? "Schrijft een ander antwoord…" : `Antwoord ${version} van 2`}
        </span>
      )}
    </div>
  )
}

/** Magnus's proposal in a conversation: the shared `Proposal` on the panel tone (no frame), under the answer. */
export function ProposalCard({ proposal, state, onChange, decidedAt, edit, onEdit }: {
  readonly proposal: ProposalData
  readonly state: ProposalState
  readonly onChange: (next: ProposalState) => void
  /** When Uitvoeren was chosen, for the send window of a proposal that sends. */
  readonly decidedAt?: number | undefined
  /** A saved edit held in the thread, so Uitvoeren carries out what the person wrote. */
  readonly edit?: string | undefined
  readonly onEdit?: (text: string | undefined) => void
}) {
  return (
    <div className="max-w-xl animate-rise rounded-lg bg-panel p-4">
      <Proposal
        from={
          <>
            <MagnusMark size={14} />
            <span className="font-medium text-ink-2">Voorstel van {ASSISTANT}</span>
          </>
        }
        title={proposal.title}
        body={proposal.body}
        where={proposal.where}
        state={state}
        onChange={onChange}
        doneBy={ME.name.split(" ")[0] ?? ME.name}
        {...(proposal.draft === undefined ? {} : { draft: proposal.draft })}
        {...(proposal.read === undefined ? {} : { read: proposal.read })}
        {...(proposal.sends === true ? { sends: true } : {})}
        {...(decidedAt === undefined ? {} : { decidedAt })}
        {...(onEdit === undefined ? {} : { edit, onEdit })}
      />
    </div>
  )
}
