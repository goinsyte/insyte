import { useId, useState } from "react"
import { plainOf } from "../ask/answer-text.tsx"
import { MagnusThread } from "../ask/thread-view.tsx"
import { allChats, findChat, useStartedChats, useThread } from "../ask/thread.ts"
import { ASSISTANT } from "../assistant.ts"
import { deleteChat, renameChat, useDemo } from "../demo.ts"
import type { Chat } from "../fixtures/assistant.ts"
import { WORKSPACE } from "../fixtures/workspace.ts"
import { Link, navigate, paths } from "../router.tsx"
import { BarActions } from "../shell/bar-slot.tsx"
import { Button, IconButton } from "../ui/button.tsx"
import { AlertDialog } from "../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../ui/dropdown.tsx"
import { Copy, Edit, History, MessageSquare, MoreHorizontal, Share, Trash } from "../ui/icons.tsx"
import { Input } from "../ui/input.tsx"
import { Popover } from "../ui/popover.tsx"
import { copyText, SharePanel } from "../ui/share.tsx"
import { toast } from "../ui/toast.tsx"
import { SoonScreen } from "./soon.tsx"

/**
 * A conversation with Magnus: the owner's screen, rebuilt. The thread sits at a reading measure in
 * the middle of the work surface, the composer stays at the foot. A typed question is answered from
 * the workspace by what it asks (`ask/scripts.ts`); follow-ups act: a question gets its answer, an
 * action brings a proposal that waits for Uitvoeren and changes the workspace, with undo.
 */
export function ChatScreen({ chatId }: { readonly chatId: string }) {
  useStartedChats()
  const chat = findChat(chatId)
  const demo = useDemo()
  const thread = useThread(chatId)

  if (chat === undefined) return <SoonScreen section="magnus" page={chatId} />
  const title = demo.chatTitles[chat.id] ?? chat.title
  const transcript = () =>
    thread.entries.map((entry) =>
      entry.kind === "proposal"
        ? `Voorstel: ${entry.proposal.title}`
        : entry.turn.from === "me"
        ? `Jij (${entry.turn.at}): ${entry.turn.text}`
        : `${ASSISTANT} (${entry.turn.at}): ${plainOf(entry.turn.paragraphs.join(" "))}`
    ).join("\n\n")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The werkdraad names the chat; its own actions sit in the bar, not in a second title row. */}
      <BarActions>
        <ChatActions chat={chat} title={title} transcript={transcript} />
      </BarActions>
      <h1 className="sr-only">{title}</h1>
      <h2 className="sr-only">Gesprek</h2>
      <MagnusThread chatId={chat.id} context={chat.id === "terugbetalingen" ? ["Terugbetalingen per product"] : []} />
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
              {allChats().filter((c) => !demo.deletedChats.includes(c.id)).map((c) => (
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
