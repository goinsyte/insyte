import { useEffect, useRef } from "react"
import { ASSISTANT } from "../assistant.ts"
import { MagnusMessage, MyMessage, ProposalCard, WorkingMessage } from "../screens/chat-parts.tsx"
import { Composer } from "../ui/composer.tsx"
import { cx } from "../ui/cx.ts"
import { refByLabel } from "./catalogue.ts"
import type { Ref } from "./catalogue.ts"
import { decideProposal, editProposal, followUp, send, streamed, useThread } from "./thread.ts"

/**
 * One conversation with Magnus, as the chat page and the side drawer both show it: the thread at a
 * reading measure, Magnus working through his steps while he answers, proposals that wait for
 * Uitvoeren, and the composer at the foot. The thread lives in `thread.ts`, so the page and the
 * drawer are the same conversation.
 *
 * `context` is what the message is about without saying so (the page it was opened from, a board
 * block): shown as chips on the composer and sent with every message as the records it names.
 */
export function MagnusThread({ chatId, context = [], compact = false, empty }: {
  readonly chatId: string
  readonly context?: ReadonlyArray<string>
  /** The drawer: a narrower gutter and no reading measure. */
  readonly compact?: boolean
  /** What shows before the first message. */
  readonly empty?: React.ReactNode
}) {
  const thread = useThread(chatId)
  const end = useRef<HTMLDivElement>(null)
  const seen = useRef(thread.entries.length)
  const used = new Set(thread.used)
  const reached = thread.working?.reached ?? 0

  useEffect(() => {
    // Follow the thread once something new comes in, not on opening an earlier conversation.
    if (thread.entries.length === seen.current && thread.working === null) return
    seen.current = thread.entries.length
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [thread.entries.length, thread.working, reached])

  const contextRefs = context.map(refByLabel).filter((r): r is Ref => r !== undefined)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pane-scroll min-h-0 flex-1">
        <div
          className={cx(
            "mx-auto flex w-full flex-col gap-7",
            compact ? "px-4 pt-5 pb-6" : "max-w-[44rem] px-4 pt-8 pb-10 sm:px-6"
          )}
        >
          {thread.entries.length === 0 && thread.working === null && empty}
          {thread.entries.map((entry) =>
            entry.kind === "proposal"
              ? (
                <div key={entry.id} className={compact ? "" : "pl-10"}>
                  <ProposalCard
                    proposal={entry.proposal}
                    state={thread.states[entry.id] ?? "open"}
                    onChange={(next) => decideProposal(chatId, entry.id, next)}
                    decidedAt={thread.decidedAt[entry.id]}
                    edit={thread.edits[entry.id]}
                    onEdit={(text) => editProposal(chatId, entry.id, text)}
                  />
                </div>
              )
              : entry.turn.from === "me"
              ? <MyMessage key={entry.id} at={entry.turn.at} text={entry.turn.text} refs={entry.turn.refs} />
              : (
                <MagnusMessage
                  key={entry.id}
                  turn={entry.turn}
                  used={used}
                  onFollowUp={(step) => followUp(chatId, step)}
                  stream={thread.fresh === entry.id}
                  onStreamed={() => streamed(chatId, entry.id)}
                />
              )
          )}
          {thread.working !== null && <WorkingMessage steps={thread.working.steps} reached={reached} />}
          <div ref={end} />
        </div>
      </div>

      <div className={cx("shrink-0", compact ? "px-3 pb-3" : "px-4 pb-4 sm:px-6 sm:pb-5")}>
        <div className={cx("mx-auto w-full", !compact && "max-w-[44rem]")}>
          <Composer
            label={`Bericht aan ${ASSISTANT}`}
            placeholder={`Vraag ${ASSISTANT} iets, @ voor een record, / voor een opdracht`}
            context={context}
            onSend={(text, extra) =>
              send(chatId, {
                text,
                refs: extra.refs,
                about: contextRefs,
                ...(extra.command === undefined ? {} : { command: extra.command })
              })}
          />
        </div>
      </div>
    </div>
  )
}
