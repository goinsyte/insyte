import { useEffect, useRef, useState } from "react"
import { ASSISTANT } from "../assistant.ts"
import { ChartCard } from "../charts/chart-card.tsx"
import type { FollowUp, Proposal as ProposalData, Step, Turn } from "../fixtures/assistant.ts"
import { ME } from "../fixtures/workspace.ts"
import { paths } from "../router.tsx"
import { MagnusAvatar } from "../ui/assistant.tsx"
import { Avatar } from "../ui/avatar.tsx"
import { Chip } from "../ui/chip.tsx"
import { cx } from "../ui/cx.ts"
import { Check, ChevronRight, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { Message } from "../ui/message.tsx"
import { Proposal } from "../ui/proposal.tsx"
import type { ProposalState } from "../ui/proposal.tsx"
import { Rich } from "../ui/rich.tsx"

export function MyMessage({ at, text }: { readonly at: string; readonly text: string }) {
  return (
    <Message avatar={<Avatar name={ME.name} size={28} />} name={ME.name} at={at}>
      <p className="text-base text-ink">{text}</p>
    </Message>
  )
}

// Magnus's disc and the working line live in the library now; re-exported for the screens.
export { Thinking } from "../ui/assistant.tsx"

type MagnusTurn = Extract<Turn, { from: "magnus" }>

/**
 * An answer: how Magnus got there (folded), the sentences with their figures, the chart in the house
 * style, the question back, feedback, and the next steps as chips.
 */
export function MagnusMessage({ turn, used, onFollowUp }: {
  readonly turn: MagnusTurn
  readonly used: ReadonlySet<string>
  readonly onFollowUp?: (followUp: FollowUp) => void
}) {
  const versions = [turn.paragraphs, turn.alternative ?? turn.paragraphs] as const
  const [version, setVersion] = useState<0 | 1>(0)
  const [again, setAgain] = useState(false)
  const stream = useStream()
  const paragraphs = stream.shown(versions[version])
  const regenerate = () => {
    const next = version === 0 ? 1 : 0
    setVersion(next)
    setAgain(true)
    stream.start(versions[next])
  }
  return (
    <Message avatar={<MagnusAvatar />} name={ASSISTANT} at={turn.at}>
      {turn.steps !== undefined && <Steps steps={turn.steps} />}
      <div className="flex max-w-[60ch] flex-col gap-3 text-base text-pretty text-ink" aria-busy={stream.busy}>
        {paragraphs.map((text, i) => (
          <p key={i}>
            <Rich text={text} />
          </p>
        ))}
      </div>
      {!stream.busy && turn.chart !== undefined && (
        <ChartCard {...turn.chart} board={{ label: "Retouren", href: paths.board("retouren") }} />
      )}
      {!stream.busy && turn.closing !== undefined && (
        <p className="max-w-[60ch] text-base text-pretty text-ink">{turn.closing}</p>
      )}
      <Feedback
        text={[...versions[version], turn.closing ?? ""].join("\n\n").replaceAll("**", "").trim()}
        onRegenerate={regenerate}
        busy={stream.busy}
        version={turn.alternative === undefined || !again ? undefined : version + 1}
      />
      {!stream.busy && turn.followUps !== undefined && onFollowUp !== undefined && (
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
        Klaar in {steps.length} stappen
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
 * Streams an answer in as it is written: a few words at a time, the way a model's answer arrives. For
 * people who asked for reduced motion it appears whole.
 */
function useStream() {
  const [words, setWords] = useState<number | null>(null)
  const total = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])

  const start = (paragraphs: ReadonlyArray<string>) => {
    window.clearInterval(timer.current)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWords(null)
      return
    }
    total.current = paragraphs.join(" ").split(/\s+/).length
    setWords(0)
    timer.current = window.setInterval(() => {
      setWords((n) => {
        const next = (n ?? 0) + 3
        if (next >= total.current) {
          window.clearInterval(timer.current)
          return null
        }
        return next
      })
    }, 45)
  }

  /** The paragraphs as far as they have arrived; an open `**` is closed so the bold does not run on. */
  const shown = (paragraphs: ReadonlyArray<string>): ReadonlyArray<string> => {
    if (words === null) return paragraphs
    let left = words
    const out: Array<string> = []
    for (const paragraph of paragraphs) {
      if (left <= 0) break
      const parts = paragraph.split(/\s+/)
      const piece = parts.slice(0, left).join(" ")
      left -= parts.length
      out.push((piece.match(/\*\*/g)?.length ?? 0) % 2 === 1 ? `${piece}**` : piece)
    }
    return out.length === 0 ? [""] : out
  }

  return { start, shown, busy: words !== null }
}

function Feedback({ text, onRegenerate, busy = false, version }: {
  readonly text: string
  readonly onRegenerate?: () => void
  readonly busy?: boolean
  /** Which of the answers shows (1 or 2), when there is more than one. */
  readonly version?: number
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
export function ProposalCard({ proposal, state, onChange }: {
  readonly proposal: ProposalData
  readonly state: ProposalState
  readonly onChange: (next: ProposalState) => void
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
        draft={proposal.draft}
        state={state}
        onChange={onChange}
        doneBy={ME.name.split(" ")[0] ?? ME.name}
      />
    </div>
  )
}
