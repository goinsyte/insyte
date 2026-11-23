import { useEffect, useId, useState } from "react"
import type { ReactNode } from "react"
import { DEMO_NOW } from "../fixtures/workspace.ts"
import { Tag } from "./badge.tsx"
import { Button } from "./button.tsx"
import { cx } from "./cx.ts"
import { Check, ChevronDown } from "./icons.tsx"

export type ProposalState = "open" | "done" | "discarded"

/** The send window (ADR-0023): a send waits this long before it leaves, and can be taken back until then. */
export const SEND_WINDOW_S = 30

/**
 * A proposal: what the assistant or an agent wants to do, why, what it read, and under which rule.
 * This is _Eerst vragen_: nothing happens until a person chooses Uitvoeren. Bewerken opens the draft
 * in place (what will be sent or set), and Opslaan keeps the edit on the proposal. Something that
 * leaves the building (a mail, a message) counts down its send window after Uitvoeren, with the
 * undo beside it; once the window is over it says it was sent and offers no undo, because there is
 * none.
 *
 * One component for Start, the chat and the agent page; it draws no frame of its own, so a list row
 * and a card in a conversation both hold the same proposal. With `fold`, the reasons (why and what
 * it read) wait behind "Waarom" on a phone, so a queue shows more rows above the fold.
 */
export function Proposal(
  {
    from,
    title,
    body,
    read,
    where,
    draft,
    state,
    onChange,
    primary = true,
    sends = false,
    doneBy,
    decidedAt,
    fold,
    edit,
    onEdit
  }: {
    /** The head's left side: who proposes it, and when. */
    readonly from: ReactNode
    readonly title: string
    readonly body: string
    /** What it looked at before proposing. */
    readonly read?: ReadonlyArray<string>
    /** Where the change lands. */
    readonly where?: string
    /** What will be sent or set, as written: what Bewerken opens. Without it, Bewerken edits the title. */
    readonly draft?: string
    readonly state: ProposalState
    readonly onChange: (next: ProposalState) => void
    /** Only the first open proposal in a region gets the ink button; the rest are secondary. */
    readonly primary?: boolean
    readonly sends?: boolean
    readonly doneBy: string
    /** When Uitvoeren was chosen (ms), so the send window counts from the decision, wherever it is shown. */
    readonly decidedAt?: number
    readonly fold?: boolean
    /** A saved edit held outside (the demo store), so the same proposal reads the same everywhere. */
    readonly edit?: string
    readonly onEdit?: (text: string | undefined) => void
  }
) {
  const original = draft ?? title
  const [editing, setEditing] = useState(false)
  const [own, setOwn] = useState<string | undefined>(undefined)
  const saved = onEdit === undefined ? own : edit
  const text = saved ?? original
  const edited = saved !== undefined && saved !== original
  const [buffer, setBuffer] = useState(text)
  const [open, setOpen] = useState(false)
  const id = useId()
  const left = useSendWindow(state === "done" && sends, decidedAt)

  const shownTitle = draft === undefined ? text : title
  const reasons = (
    <>
      <p className="text-sm text-pretty text-ink-2">{body}</p>
      {(read !== undefined || where !== undefined) && (
        <p className="text-xs text-ink-3">
          {read !== undefined && <>Gelezen: {read.join(" · ")}</>}
          {read !== undefined && where !== undefined && " · "}
          {where !== undefined && <>In {where}</>}
        </p>
      )}
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">{from}</span>
        <Tag>Eerst vragen</Tag>
      </div>
      <p className={cx("text-sm font-semibold", state === "discarded" ? "text-ink-3 line-through" : "text-ink")}>
        {shownTitle}
      </p>
      {fold === true
        ? (
          <>
            <div id={`${id}-why`} className={cx("flex-col gap-1.5 sm:flex", open ? "flex" : "hidden")}>{reasons}</div>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${id}-why`}
              onClick={() => setOpen(!open)}
              className="flex min-h-8 items-center gap-1 self-start text-xs text-ink-3 hover:text-ink sm:hidden"
            >
              {open ? "Minder" : "Waarom en wat hij las"}
              <ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />
            </button>
          </>
        )
        : reasons}

      {draft !== undefined && edited && !editing && (
        <p className="max-w-[62ch] text-sm text-pretty text-ink">
          <span className="text-ink-3">Aangepast door {doneBy}:</span>‘{text}’
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-2 pt-1">
          <label htmlFor={`${id}-draft`} className="text-xs font-medium text-ink-2">
            {draft === undefined ? "Wat de agent doet" : sends ? "Wat er verstuurd wordt" : "Wat er komt te staan"}
          </label>
          <textarea
            id={`${id}-draft`}
            value={buffer}
            autoFocus
            rows={draft === undefined ? 2 : 4}
            onChange={(event) => setBuffer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                setBuffer(text)
                setEditing(false)
              }
            }}
            className="w-full max-w-[62ch] resize-y rounded-md bg-canvas p-2.5 text-sm text-pretty text-ink ring-1 ring-line-strong outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1.5">
        {state === "open" && editing && (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={buffer.trim() === ""}
              onClick={() => {
                const next = buffer.trim() === original ? undefined : buffer.trim()
                if (onEdit === undefined) setOwn(next)
                else onEdit(next)
                setEditing(false)
              }}
            >
              Opslaan
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBuffer(text)
                setEditing(false)
              }}
            >
              Annuleren
            </Button>
          </>
        )}
        {state === "open" && !editing && (
          <>
            <Button variant={primary ? "primary" : "secondary"} size="sm" onClick={() => onChange("done")}>
              Uitvoeren
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBuffer(text)
                setEditing(true)
              }}
            >
              Bewerken
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange("discarded")}>Negeren</Button>
          </>
        )}
        {state !== "open" && (
          <p
            className={cx(
              "flex flex-wrap items-center gap-x-2 text-xs",
              state === "done" ? "text-good-ink" : "text-ink-3"
            )}
            role="status"
          >
            {state === "done" && <Check size={14} />}
            {state === "discarded"
              ? "Genegeerd"
              : !sends
              ? `Uitgevoerd door ${doneBy}`
              : left > 0
              ? (
                <span>
                  <span aria-hidden="true">
                    Wordt over <span className="figure">{left}</span> s verstuurd
                  </span>
                  <span className="sr-only">Wordt binnen {SEND_WINDOW_S} seconden verstuurd</span>
                </span>
              )
              : `Verstuurd om ${DEMO_NOW.clock} · niet terug te halen`}
            {(state === "discarded" || !sends || left > 0) && (
              <button
                type="button"
                onClick={() => onChange("open")}
                className="inline-flex min-h-8 items-center font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                {state === "discarded" ? "Terugzetten" : sends ? "Niet versturen" : "Ongedaan maken"}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

/** Seconds left in the send window, ticking once a second while `on`. */
function useSendWindow(on: boolean, decidedAt: number | undefined) {
  const [start, setStart] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) {
      setStart(null)
      return
    }
    const from = decidedAt ?? Date.now()
    setStart(from)
    setNow(Date.now())
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() - from >= SEND_WINDOW_S * 1000) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [on, decidedAt])
  if (!on || start === null) return SEND_WINDOW_S
  return Math.max(0, SEND_WINDOW_S - Math.floor((now - start) / 1000))
}
