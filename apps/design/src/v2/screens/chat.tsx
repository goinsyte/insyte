import { useEffect, useId, useRef, useState } from "react"
import { ASSISTANT } from "../assistant.ts"
import { deleteChat, renameChat, useDemo } from "../demo.ts"
import { CHATS } from "../fixtures/assistant.ts"
import type { Chat, FollowUp, Proposal, Turn } from "../fixtures/assistant.ts"
import { DEMO_NOW, WORKSPACE } from "../fixtures/workspace.ts"
import { Link, navigate, paths } from "../router.tsx"
import { BarActions } from "../shell/bar-slot.tsx"
import { Button, IconButton } from "../ui/button.tsx"
import { Composer } from "../ui/composer.tsx"
import { AlertDialog } from "../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../ui/dropdown.tsx"
import { Copy, Edit, History, MessageSquare, MoreHorizontal, Share, Trash } from "../ui/icons.tsx"
import { Input } from "../ui/input.tsx"
import { Popover } from "../ui/popover.tsx"
import type { ProposalState } from "../ui/proposal.tsx"
import { copyText, SharePanel } from "../ui/share.tsx"
import { toast } from "../ui/toast.tsx"
import { MagnusMessage, MyMessage, ProposalCard, Thinking } from "./chat-parts.tsx"
import { SoonScreen } from "./soon.tsx"

type Entry =
  | { readonly kind: "turn"; readonly turn: Turn }
  | { readonly kind: "proposal"; readonly id: string; readonly proposal: Proposal }

/** New turns are stamped on the demo clock (14:30), not the wall clock, so the thread stays one afternoon. */
const now = () => DEMO_NOW.clock

/**
 * A conversation with Magnus: the owner's screen, rebuilt. The thread sits at a reading measure in
 * the middle of the work surface, the composer stays at the foot. Follow-ups act: a question gets its
 * scripted answer, an action brings a proposal that waits for Uitvoeren.
 */
export function ChatScreen({ chatId }: { readonly chatId: string }) {
  const chat = CHATS.find((c) => c.id === chatId)
  const demo = useDemo()
  const [entries, setEntries] = useState<ReadonlyArray<Entry>>(() =>
    (chat?.turns ?? []).map((turn) => ({ kind: "turn", turn }))
  )
  const [states, setStates] = useState<Readonly<Record<string, ProposalState>>>({})
  const [used, setUsed] = useState<ReadonlySet<string>>(new Set())
  const [thinking, setThinking] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (entries.length > (chat?.turns.length ?? 0) || thinking) {
      end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [entries.length, thinking, chat?.turns.length])

  if (chat === undefined) return <SoonScreen section="magnus" page={chatId} />
  const title = demo.chatTitles[chat.id] ?? chat.title
  const transcript = () =>
    entries.map((entry) =>
      entry.kind === "proposal"
        ? `Voorstel: ${entry.proposal.title}`
        : entry.turn.from === "me"
        ? `Jij (${entry.turn.at}): ${entry.turn.text}`
        : `${ASSISTANT} (${entry.turn.at}): ${entry.turn.paragraphs.join(" ").replaceAll("**", "")}`
    ).join("\n\n")

  const reply = (turn: Turn) => {
    setThinking(true)
    timer.current = window.setTimeout(() => {
      setThinking(false)
      // A scripted answer is stamped when it arrives, so it never reads as older than the question.
      setEntries((list) => [...list, { kind: "turn", turn: { ...turn, at: now() } }])
    }, 900)
  }

  const onFollowUp = (followUp: FollowUp) => {
    setUsed((set) => new Set(set).add(followUp.id))
    setEntries((list) => [...list, { kind: "turn", turn: { from: "me", at: now(), text: followUp.label } }])
    if (followUp.kind === "proposal") {
      setThinking(true)
      timer.current = window.setTimeout(() => {
        setThinking(false)
        setEntries((list) => [...list, { kind: "proposal", id: followUp.id, proposal: followUp.proposal }])
      }, 700)
      return
    }
    const answer = chat.answers?.[followUp.id]
    if (answer !== undefined) reply(answer)
  }

  const onSend = (text: string) => {
    setEntries((list) => [...list, { kind: "turn", turn: { from: "me", at: now(), text } }])
    reply({
      from: "magnus",
      at: now(),
      paragraphs: [
        `Dit is de demo: ${ASSISTANT} antwoordt hier alleen op de vervolgstappen hierboven. In het product leest hij daarvoor je bestellingen, tickets en leveranciers, en zegt hij welke.`
      ]
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The werkdraad names the chat; its own actions sit in the bar, not in a second title row. */}
      <BarActions>
        <ChatActions chat={chat} title={title} transcript={transcript} />
      </BarActions>
      <h1 className="sr-only">{title}</h1>
      <h2 className="sr-only">Gesprek</h2>

      <div className="pane-scroll min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-7 px-4 pt-8 pb-10 sm:px-6">
          {entries.map((entry, i) =>
            entry.kind === "proposal"
              ? (
                <div key={`p-${entry.id}`} className="pl-10">
                  <ProposalCard
                    proposal={entry.proposal}
                    state={states[entry.id] ?? "open"}
                    onChange={(next) => setStates((s) => ({ ...s, [entry.id]: next }))}
                  />
                </div>
              )
              : entry.turn.from === "me"
              ? <MyMessage key={i} at={entry.turn.at} text={entry.turn.text} />
              : <MagnusMessage key={i} turn={entry.turn} used={used} onFollowUp={onFollowUp} />
          )}
          {thinking && <Thinking />}
          <div ref={end} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="mx-auto w-full max-w-[44rem]">
          <Composer
            label={`Bericht aan ${ASSISTANT}`}
            placeholder={`Vertel ${ASSISTANT} wat de volgende stap is`}
            context={chat.id === "terugbetalingen" ? ["Terugbetalingen per product"] : []}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * The chat's own actions in the main bar: rename it, go to an earlier one, share it, and the rest
 * (copy the conversation, delete it, which asks first).
 */
function ChatActions({ chat, title, transcript }: {
  readonly chat: Chat
  readonly title: string
  readonly transcript: () => string
}) {
  const [confirm, setConfirm] = useState(false)
  const demo = useDemo()
  return (
    <>
      <Popover
        label="Naam wijzigen"
        placement="bottom-end"
        trigger={(props) => (
          <IconButton label="Naam wijzigen" {...props}>
            <Edit />
          </IconButton>
        )}
      >
        {(close) => (
          <Rename
            title={title}
            onSave={(next) => {
              renameChat(chat.id, next)
              close()
              toast({ title: "Naam gewijzigd", body: next, tone: "good" })
            }}
            onCancel={close}
          />
        )}
      </Popover>
      <Popover
        label="Eerdere gesprekken"
        placement="bottom-end"
        width="w-72"
        trigger={(props) => (
          <IconButton label="Eerdere gesprekken" {...props}>
            <History />
          </IconButton>
        )}
      >
        {(close) => (
          <div className="flex flex-col gap-1 p-1.5">
            <h2 className="px-2 pt-1.5 pb-1 text-xs font-medium text-ink-3">Eerdere gesprekken</h2>
            <ul className="flex flex-col">
              {CHATS.filter((c) => !demo.deletedChats.includes(c.id)).map((c) => (
                <li key={c.id}>
                  <Link
                    to={paths.chat(c.id)}
                    onClick={close}
                    aria-current={c.id === chat.id ? "page" : undefined}
                    className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink aria-[current=page]:bg-selected aria-[current=page]:text-ink"
                  >
                    <MessageSquare size={15} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{demo.chatTitles[c.id] ?? c.title}</span>
                    <span className="shrink-0 text-2xs text-ink-3">{c.started}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Popover>
      <Popover
        label="Delen"
        placement="bottom-end"
        trigger={(props) => (
          <IconButton label="Delen" {...props}>
            <Share />
          </IconButton>
        )}
      >
        <SharePanel
          title="Gesprek delen"
          link={`https://insyte.app/northwind/magnus/${chat.id}`}
          audience={`Iedereen in ${WORKSPACE} met de link kan het gesprek lezen, niet verder schrijven.`}
        />
      </Popover>
      <DropdownMenu
        label="Meer"
        placement="bottom-end"
        trigger={(props) => (
          <IconButton label="Meer" {...props}>
            <MoreHorizontal />
          </IconButton>
        )}
      >
        <DropdownItem
          glyph={Copy}
          onSelect={() => {
            void copyText(transcript()).then(() =>
              toast({ title: "Gesprek gekopieerd", body: "Als tekst, met de tijden.", tone: "good" })
            )
          }}
        >
          Gesprek kopiëren
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem glyph={Trash} tone="danger" onSelect={() => setConfirm(true)}>Verwijderen</DropdownItem>
      </DropdownMenu>
      <AlertDialog
        open={confirm}
        title="Dit gesprek verwijderen?"
        body={`‘${title}’ verdwijnt voor iedereen met wie je het deelde. Voorstellen die je al uitvoerde blijven staan.`}
        confirmLabel="Gesprek verwijderen"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          deleteChat(chat.id, true)
          navigate(paths.newChat())
          toast({
            title: "Gesprek verwijderd",
            action: {
              label: "Ongedaan maken",
              onClick: () => {
                deleteChat(chat.id, false)
                navigate(paths.chat(chat.id))
              }
            }
          })
        }}
      />
    </>
  )
}

function Rename({ title, onSave, onCancel }: {
  readonly title: string
  readonly onSave: (next: string) => void
  readonly onCancel: () => void
}) {
  const [value, setValue] = useState(title)
  const id = useId()
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim() !== "") onSave(value.trim())
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold text-ink">Naam van het gesprek</label>
      <Input id={id} value={value} onChange={(event) => setValue(event.target.value)} autoFocus maxLength={80} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        <Button variant="primary" size="sm" type="submit" disabled={value.trim() === ""}>Opslaan</Button>
      </div>
    </form>
  )
}
