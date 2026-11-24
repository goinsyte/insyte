import { useEffect, useState } from "react"
import { useDemo } from "../../demo.ts"
import { AGENTS } from "../../fixtures/agents.ts"
import { SNOOZE } from "../../fixtures/notifications.ts"
import type { NoteBox, NoteFixture } from "../../fixtures/notifications.ts"
import { navigate } from "../../router.tsx"
import { AgentAvatar, Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu } from "../../ui/dropdown.tsx"
import { ArrowLeft, Bell, Bot, Check, CheckCircle, Clock, Eye, EyeOff, RotateCcw, Send, X } from "../../ui/icons.tsx"
import { Textarea } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile } from "../../ui/list.tsx"
import { Rich } from "../../ui/rich.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { toast } from "../../ui/toast.tsx"
import { doAct, setRead } from "./actions.ts"

/** Who or what a note is from: a person's disc, an agent's, a service's logo, the bell. */
export function NoteLead({ note, size = 28 }: { readonly note: NoteFixture; readonly size?: number }) {
  const from = note.from
  const glyph = Math.round(size * 0.55)
  if (from.kind === "person") return <Avatar name={from.name} size={size} />
  if (from.kind === "agent") {
    const agent = AGENTS.find((a) => a.id === from.agentId)
    if (agent !== undefined) return <AgentAvatar glyph={agent.glyph} size={size} />
    return (
      <GlyphTile size={size}>
        <Bot size={glyph} />
      </GlyphTile>
    )
  }
  if (from.service !== undefined) return <ServiceLogo service={from.service} size={size} />
  return (
    <GlyphTile size={size}>
      <Bell size={glyph} />
    </GlyphTile>
  )
}

/** The sentence without the quote the bell shows at its end; the page quotes it in full under it. */
export const sentenceOf = (note: NoteFixture) =>
  note.quote === undefined ? note.text : note.text.replace(/: ‘[^’]*’$/, "")

/** "Later": the times a note can come back. `data-snooze` lets the S key open it. */
export function SnoozeMenu({ onSnooze, label = "Later", button = false }: {
  readonly onSnooze: (until: string) => void
  readonly label?: string
  /** A labelled button (the preview) rather than the row's clock. */
  readonly button?: boolean
}) {
  return (
    <DropdownMenu
      label="Terug in je inbox"
      placement="bottom-end"
      width="w-60"
      trigger={(props) =>
        button
          ? <Button size="sm" variant="ghost" icon={<Clock />} data-snooze="" {...props}>{label}</Button>
          : (
            <IconButton size="sm" label={`${label} (S)`} className="pointer-coarse:size-11" {...props}>
              <Clock />
            </IconButton>
          )}
    >
      <DropdownLabel>Terug in je inbox</DropdownLabel>
      {SNOOZE.map((choice) => (
        <DropdownItem
          key={choice.id}
          glyph={Clock}
          hint={choice.hint}
          onSelect={() => onSnooze(choice.until)}
        >
          {choice.label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  )
}

/**
 * The preview beside the list: the note in full, what its record says, and the one thing to do
 * about it, done here without leaving the list (approve, submit, reconnect, answer). Opening the
 * record is always there too. Doing it reads the note.
 */
export function NotePreview({ note, read, box, until, done, onClose, onSnooze, onClear, onRestore }: {
  readonly note: NoteFixture
  readonly read: boolean
  readonly box: NoteBox
  readonly until?: string
  readonly done: boolean
  readonly onClose: () => void
  readonly onSnooze: (until: string) => void
  readonly onClear: () => void
  readonly onRestore: () => void
}) {
  const demo = useDemo()
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState("")
  // A new note starts a new answer.
  useEffect(() => {
    setAnswer("")
    setBusy(false)
  }, [note.id])

  const act = note.act
  const decided = act?.proposal !== undefined && demo.decisions[act.proposal]?.state === "done"
  const isDone = done || decided
  const open = () => {
    setRead([note.id], true)
    if (note.href !== undefined) navigate(note.href)
  }
  const runAct = () => {
    if (act === undefined) return
    if (act.slow !== true) {
      doAct(note)
      return
    }
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      doAct(note)
    }, 1200)
  }
  const send = () => {
    const body = answer.trim()
    if (body === "" || note.reply === undefined) return
    setAnswer("")
    setRead([note.id], true)
    toast({ title: `Verstuurd in ${note.reply}`, tone: "good" })
  }

  return (
    <article aria-label="Voorbeeld" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <IconButton label="Terug naar de lijst" onClick={onClose} className="lg:hidden">
          <ArrowLeft />
        </IconButton>
        <span className="min-w-0 truncate text-xs text-ink-3">
          {note.record !== undefined && <>{note.record} ·{" "}</>}
          <span className="figure">{note.at}</span>
        </span>
        <IconButton
          label="Voorbeeld sluiten (Esc)"
          size="sm"
          onClick={onClose}
          className="ml-auto hidden lg:inline-flex"
        >
          <X />
        </IconButton>
      </header>

      <div className="pane-scroll flex min-h-0 flex-1 flex-col gap-6 px-5 pt-1 pb-8">
        <div className="flex items-start gap-3">
          <NoteLead note={note} size={36} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-md text-pretty text-ink">
              <Rich text={sentenceOf(note)} />
            </p>
            {box === "later" && until !== undefined && (
              <p className="flex items-center gap-1.5 text-sm text-accent-ink">
                <Clock size={14} />
                Komt terug {until}
              </p>
            )}
            {box === "gewist" && <p className="text-sm text-ink-3">Gewist. Hij staat hier tot je hem terugzet.</p>}
          </div>
        </div>

        {note.quote !== undefined && <p className="text-sm leading-6 text-pretty text-ink">‘{note.quote}’</p>}

        {note.facts !== undefined && <KeyValue items={note.facts.map(([label, value]) => ({ label, value }))} />}

        <div className="flex flex-wrap items-center gap-2">
          {act !== undefined && (isDone
            ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-good-tint px-3 text-sm font-medium text-good-ink">
                <Check size={15} />
                {act.done}
              </span>
            )
            : (
              <Button variant="primary" loading={busy} onClick={runAct}>
                {act.label}
              </Button>
            ))}
          {note.href !== undefined && (
            <Button variant={act === undefined || isDone ? "primary" : "secondary"} onClick={open}>
              {note.open ?? "Openen"}
            </Button>
          )}
        </div>

        {note.reply !== undefined && (
          <div className="flex flex-col gap-2">
            <Textarea
              value={answer}
              rows={3}
              placeholder={`Antwoord in ${note.reply}`}
              aria-label={`Antwoord in ${note.reply}`}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-ink-3">⌘ Enter verstuurt</span>
              <Button size="sm" icon={<Send />} disabled={answer.trim() === ""} onClick={send}>Versturen</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={read ? <EyeOff /> : <Eye />}
            onClick={() => setRead([note.id], !read)}
          >
            {read ? "Ongelezen" : "Gelezen"}
          </Button>
          {box === "inbox" && <SnoozeMenu button onSnooze={onSnooze} />}
          {box === "inbox"
            ? <Button size="sm" variant="ghost" icon={<CheckCircle />} onClick={onClear}>Wissen</Button>
            : (
              <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onRestore}>
                {box === "later" ? "Nu terughalen" : "Terugzetten"}
              </Button>
            )}
          {box === "later" && (
            <Button size="sm" variant="ghost" icon={<CheckCircle />} onClick={onClear}>
              Wissen
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
