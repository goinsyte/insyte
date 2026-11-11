import { useNavigate } from "@tanstack/react-router"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import type { ChatCard, ChatReaction } from "../../data-source"
import { Edit3, Link2, MessageSquareText, MoreHorizontal, Pin, Smile, Sparkles, Ticket, Trash2 } from "../../icons"
import { cn } from "../lib/utils"
import { ActionCard } from "./action-card"
import { AttachmentTile } from "./attachments"
import { useChat } from "./chat-context"
import { EmojiPicker } from "./emoji-picker"
import { MessageBody } from "./message-body"
import { Avatar, ProfilePopover } from "./profile-card"
import { RecordCard } from "./record-views"
import { sameRef } from "./records"
import { type Message, SOON, useChatsSource } from "./source"

/*
 * One message, the way a team reads them all day. The words are ink rather than the grey a caption
 * gets, because they are the point of the screen. Everything else in the row is either the person
 * (their face and name open their card) or the work the message carries: records as live cards,
 * an action with its own state, and a thread that opens beside the conversation.
 */

export function MessageRow(
  { message: m, continuation, inThread = false, highlight = false }: {
    message: Message
    continuation: boolean
    inThread?: boolean
    highlight?: boolean
  }
) {
  const chat = useChat()
  const source = useChatsSource()
  const reduce = useReducedMotion() ?? false
  const [editing, setEditing] = useState(false)
  const pinned = Boolean(m.pinned)
  const profile = source.profileOf(m.sender_id, m.sender_name)
  const mine = m.sender_id === source.me.id
  const agent = Boolean(profile.agent)
  const mentionsMe = !mine && Boolean(m.mentionsMe)
  const thread = inThread ? undefined : m.thread
  const threadOpen = chat.threadId === m.id && !inThread

  if (m.deleted) return null

  return (
    <motion.div
      id={`msg-${m.id}`}
      initial={false}
      animate={highlight && !reduce ? { backgroundColor: ["var(--color-arc-tint)", "rgba(0,0,0,0)"] } : undefined}
      transition={{ duration: 1.6, ease: "easeOut" }}
      className={cn(
        "group relative flex items-start gap-3 rounded-lg px-3 py-1 transition-colors",
        continuation ? "pt-0.5" : "pt-2.5",
        threadOpen ? "bg-arc-tint/45" : mentionsMe ? "bg-arc-tint/35 hover:bg-arc-tint/55" : "hover:bg-mist/80"
      )}
    >
      <div className="w-9 shrink-0 pt-0.5">
        {continuation ?
          (
            <span className="block w-full pt-0.5 text-center text-2xs text-transparent tabular-nums group-hover:text-ink-3">
              {formatTime(m.at)}
            </span>
          ) :
          (
            <ProfilePopover senderId={m.sender_id} name={m.sender_name} onMention={chat.mention}>
              <button
                type="button"
                aria-label={`Profiel van ${profile.name}`}
                className="rounded-lg transition-transform active:scale-95"
              >
                <Avatar senderId={m.sender_id} name={m.sender_name} size={36} />
              </button>
            </ProfilePopover>
          )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {continuation ? null : (
          <div className="flex items-baseline gap-2">
            <ProfilePopover senderId={m.sender_id} name={m.sender_name} onMention={chat.mention}>
              <button
                type="button"
                className={cn(
                  "font-medium text-base hover:underline hover:underline-offset-2",
                  agent ? "text-arc-ink" : "text-ink"
                )}
              >
                {agent ? "Insyte" : m.sender_name}
              </button>
            </ProfilePopover>
            {agent
              ? <span className="rounded-[5px] bg-arc-tint px-1.5 py-px font-medium text-2xs text-arc-ink">AI</span>
              : null}
            <span className="text-ink-3 text-xs tabular-nums">{formatTime(m.at)}</span>
            {pinned ?
              (
                <span className="flex items-center gap-1 text-arc-ink text-xs">
                  <Pin className="size-3" strokeWidth={2} />
                  Vastgezet
                </span>
              ) :
              null}
          </div>
        )}
        {editing ? <EditBox message={m} onDone={() => setEditing(false)} /> : m.body ?
          (
            <div>
              <MessageBody body={m.body} handles={chat.handles} refOf={source.refOf} onRecord={chat.openRecord} />
              {m.edited_at ? <span className="text-ink-3 text-xs">(bewerkt)</span> : null}
            </div>
          ) :
          null}
        {m.attachments && m.attachments.length > 0 ?
          (
            <div className="flex flex-wrap items-start gap-2 pt-0.5">
              {m.attachments.map((a) => <AttachmentTile key={a.id} a={a} />)}
            </div>
          ) :
          null}
        {m.records?.length ?
          (
            <div className="flex flex-col gap-1.5 pt-1">
              {m.records.map((r) => (
                <RecordCard
                  key={`${r.kind}:${r.id}`}
                  refTo={r}
                  onOpen={chat.openRecord}
                  active={chat.openRecordRef ? sameRef(chat.openRecordRef, r) : false}
                />
              ))}
            </div>
          ) :
          null}
        {m.action
          ? <ActionCard action={m.action} by={mine ? "Jij" : m.sender_name} onOpen={chat.openRecord} />
          : null}
        {m.card?.type === "ai" ? <AiCard card={m.card} /> : null}
        {m.reactions && m.reactions.length > 0
          ? <Reactions reactions={m.reactions} onToggle={(e) => chat.toggleReaction(m, e)} />
          : null}
        {thread && thread.count > 0
          ? <ThreadSummary thread={thread} open={threadOpen} onOpen={() => chat.openThread(m.id)} />
          : null}
      </div>
      {editing
        ? null
        : <Toolbar m={m} mine={mine} inThread={inThread} pinned={pinned} onEdit={() => setEditing(true)} />}
    </motion.div>
  )
}

function ThreadSummary(
  { thread, open, onOpen }: { thread: NonNullable<Message["thread"]>; open: boolean; onOpen: () => void }
) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group/thread -ml-1 flex w-fit max-w-full items-center gap-2 rounded-lg py-1 pr-2.5 pl-1 transition-colors",
        open ? "bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "hover:bg-paper hover:shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
      )}
    >
      <span className="flex -space-x-1">
        {thread.people.map((p) => (
          <span key={p.id} className="rounded-md ring-2 ring-paper">
            <Avatar senderId={p.id} name={p.name} size={20} />
          </span>
        ))}
      </span>
      <span className="font-medium text-arc-ink text-sm">
        {thread.count} {thread.count === 1 ? "antwoord" : "antwoorden"}
      </span>
      <span className="text-ink-3 text-sm group-hover/thread:hidden">Laatste om {formatTime(thread.lastAt)}</span>
      <span className="hidden text-ink-3 text-sm group-hover/thread:inline">Thread openen</span>
    </button>
  )
}

const QUICK = ["👍", "✅", "👀", "🙏"] as const

function Toolbar(
  { m, mine, inThread, pinned, onEdit }: {
    m: Message
    mine: boolean
    inThread: boolean
    pinned: boolean
    onEdit: () => void
  }
) {
  const chat = useChat()
  const { writes, insyte } = useChatsSource()
  return (
    <div className="absolute -top-3.5 right-3 z-10 hidden items-center gap-0.5 rounded-lg bg-paper p-0.5 shadow-[0_6px_18px_-8px_rgb(0_0_0/0.3),0_1px_3px_rgb(0_0_0/0.08)] group-hover:flex has-[[data-popup-open]]:flex">
      {QUICK.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => chat.toggleReaction(m, e)}
          title={`Reageren met ${e}`}
          className="flex size-7 items-center justify-center rounded-md text-base hover:bg-mist"
        >
          {e}
        </button>
      ))}
      <EmojiPicker onPick={(e) => chat.toggleReaction(m, e)} side="bottom" label="Reactie toevoegen">
        <ToolButton label="Meer reacties">
          <Smile className="size-4" strokeWidth={1.75} />
        </ToolButton>
      </EmojiPicker>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-ink/10" />
      {inThread ? null : (
        <ToolButton
          label="Antwoorden in thread"
          onClick={() => chat.openThread(m.id)}
        >
          <MessageSquareText className="size-4" strokeWidth={1.75} />
        </ToolButton>
      )}
      <ToolButton
        label="Vraag Insyte hierover"
        disabled={!insyte}
        onClick={() => {
          if (!inThread) chat.openThread(m.id)
          requestAnimationFrame(() => chat.mention("Insyte"))
        }}
      >
        <Sparkles className="size-4 text-arc-ink" strokeWidth={1.75} />
      </ToolButton>
      <DropdownMenu>
        <ToolButton label="Meer acties" asTrigger>
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </ToolButton>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => writes.pinMessage(m)}>
            <Pin className="size-4" strokeWidth={1.75} />
            {pinned ? "Losmaken" : "Vastzetten in kanaal"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => writes.ticketFrom(m, chat.conversation)}>
            <Ticket className="size-4" strokeWidth={1.75} />
            Ticket maken van bericht
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard?.writeText(
                `${window.location.origin}${window.location.pathname}?id=${chat.conversation.id}#msg-${m.id}`
              )
              toast("Link naar bericht gekopieerd")
            }}
          >
            <Link2 className="size-4" strokeWidth={1.75} />
            Link kopiëren
          </DropdownMenuItem>
          {mine && !m.action ?
            (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onEdit}>
                  <Edit3 className="size-4" strokeWidth={1.75} />
                  Bewerken
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => writes.remove(m)}>
                  <Trash2 className="size-4" strokeWidth={1.75} />
                  Verwijderen
                </DropdownMenuItem>
              </>
            ) :
            null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ToolButton(
  { label, onClick, children, asTrigger = false, disabled = false }: {
    label: string
    onClick?: () => void
    children: React.ReactNode
    asTrigger?: boolean
    disabled?: boolean
  }
) {
  const button = (
    <button
      type="button"
      aria-label={label}
      title={disabled ? `${label} · ${SOON}` : label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-mist hover:text-ink disabled:pointer-events-none disabled:opacity-40 data-[popup-open]:bg-mist"
    >
      {children}
    </button>
  )
  return asTrigger ? <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger> : button
}

function EditBox({ message, onDone }: { message: Message; onDone: () => void }) {
  const [text, setText] = useState(message.body)
  const { writes } = useChatsSource()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    el?.focus()
    el?.setSelectionRange(text.length, text.length)
    // biome-ignore lint/correctness/useExhaustiveDependencies: place the caret once, on open
  }, [])
  const save = () => {
    if (text.trim() && text !== message.body) writes.edit(message, text.trim())
    onDone()
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-paper p-2 shadow-[0_0_0_1.5px_var(--color-arc)]">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone()
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            save()
          }
        }}
        rows={2}
        aria-label="Bericht bewerken"
        className="w-full resize-none bg-transparent text-base text-ink leading-[1.55] outline-none"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-ink-3 text-xs">Esc om te annuleren · Enter om op te slaan</span>
        <button
          type="button"
          onClick={onDone}
          className="h-7 rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={save}
          className="h-7 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
        >
          Opslaan
        </button>
      </div>
    </div>
  )
}

function Reactions({ reactions, onToggle }: { reactions: ChatReaction[]; onToggle: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          aria-pressed={Boolean(r.mine)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-full px-2 font-medium text-xs transition-[background-color,transform] active:scale-[0.92]",
            r.mine
              ? "bg-arc-tint text-arc-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-arc)_35%,transparent)]"
              : "bg-ink/6 text-ink-2 hover:bg-ink/10"
          )}
        >
          <span className="text-base leading-none">{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
      <EmojiPicker onPick={onToggle} label="Reactie toevoegen">
        <button
          type="button"
          aria-label="Reactie toevoegen"
          className="flex h-6 items-center justify-center rounded-full bg-ink/6 px-1.5 text-ink-3 opacity-0 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
        >
          <Smile className="size-3" strokeWidth={1.75} />
        </button>
      </EmojiPicker>
    </div>
  )
}

/** The older Insyte note a seeded message can carry: a headline and a line, on the brand ground. */
function AiCard({ card }: { card: Extract<ChatCard, { type: "ai" }> }) {
  const navigate = useNavigate()
  return (
    <div
      className="mt-1 flex max-w-[460px] flex-col gap-2 rounded-xl bg-abyss px-4 py-3.5"
      style={{
        backgroundImage:
          "radial-gradient(120% 120% at 100% 0%, color-mix(in oklch, var(--color-arc) 55%, transparent), transparent 65%)"
      }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-mesh-ink" strokeWidth={1.75} />
        <span className="font-medium text-mesh-ink text-sm leading-none">{card.headline}</span>
      </div>
      <p className="text-base text-mesh-ink-2 leading-[1.6]">{card.body}</p>
      {card.cta ?
        (
          <button
            type="button"
            onClick={() => void navigate({ to: "/chargebacks" })}
            className="mt-1 flex h-7 w-fit items-center rounded-md bg-mesh-ink/15 px-2.5 font-medium text-mesh-ink text-sm leading-none transition-colors hover:bg-mesh-ink/25"
          >
            {card.cta}
          </button>
        ) :
        null}
    </div>
  )
}

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-[5] flex items-center justify-center py-3">
      <span className="rounded-full bg-paper px-3 py-1 font-medium text-ink-2 text-sm leading-none shadow-[0_1px_2px_rgb(0_0_0/0.06),0_2px_8px_-4px_rgb(0_0_0/0.12)]">
        {label}
      </span>
    </div>
  )
}

export function NewDivider() {
  return (
    <div className="flex items-center gap-2 px-3 py-2" role="separator" aria-label="Nieuwe berichten">
      <span className="h-px flex-1 bg-arc/60" />
      <span className="rounded-full bg-arc px-2 py-0.5 font-medium text-2xs text-mesh-ink">Nieuw</span>
    </div>
  )
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

export function groupByDay<M extends { at: string }>(
  messages: ReadonlyArray<M>
): Array<{ label: string; messages: M[] }> {
  const groups = new Map<string, M[]>()
  for (const m of messages) {
    const key = new Date(m.at).toDateString()
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString()
  return Array.from(groups.entries()).map(([key, msgs]) => ({
    label: key === today
      ? "Vandaag"
      : key === yesterday
      ? "Gisteren"
      : new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(key)),
    messages: msgs
  }))
}

/** Two messages from one person within five minutes read as one. An action always gets its own head. */
export function continues(prev: Message | undefined, m: Message) {
  return prev?.sender_id === m.sender_id && !m.action && !prev.action &&
    new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000
}
