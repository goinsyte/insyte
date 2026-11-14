import { Link, useNavigate } from "@tanstack/react-router"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, BellRing, CheckCircle2, Clock, Eye, EyeOff, Loader, RotateCcw, X } from "../../icons"
import { eventDef, fullTime, type Note, SOURCES, stateOf, wakesAt } from "../lib/notifications"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { NoteLead, NoteSentence } from "./note-parts"
import { type NoteRecord, useNotificationsSource } from "./source"
/*
 * The preview: what the notification is about, read from the record itself, and the one thing to do
 * about it. What the record says and the act it offers come from the host (`useRecord`, the design app's in
 * `demo-preview.tsx`); a host without them shows the note's own facts and "Openen". Doing it reads the notification.
 */

/** A note with no record to read: its own facts, and "Openen". */
const useOwnFacts = (note: Note, open: () => void): NoteRecord => ({
  facts: [...(note.facts ?? [])],
  primary: { label: "Openen", run: open },
  missing: false
})

export function NotePreview({ note, now, onClose, onSnooze, onClear, onRestore, canMute }: {
  note: Note
  now: number
  onClose: () => void
  onSnooze: () => void
  onClear: () => void
  onRestore: () => void
  canMute: boolean
}) {
  const navigate = useNavigate()
  const still = useReducedMotion()
  const { setRead, setEventApp, useRecord = useOwnFacts, Reply } = useNotificationsSource()
  const state = stateOf(note, now)
  const ref = note.ref

  const open = () => {
    setRead([note.id], true)
    navigate({ to: note.to, search: note.search } as never)
  }

  const { facts, primary, missing } = useRecord(note, open)

  const event = eventDef(note.event)
  const Source = SOURCES[note.source]

  return (
    <motion.article
      key={note.id}
      initial={still ? false : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      aria-label="Voorbeeld"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex h-[52px] shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Terug naar de lijst"
          className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink lg:hidden"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        <span className="flex h-6 items-center gap-1.5 rounded-sm bg-paper px-2 font-medium text-ink-2 text-xs">
          <Source.icon className="size-3.5 text-ink-3" strokeWidth={1.75} />
          {Source.label}
        </span>
        <span className="truncate text-ink-3 text-xs">{fullTime(note.at)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Voorbeeld sluiten"
          title="Sluiten (Esc)"
          className="ml-auto hidden size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink lg:flex"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-1 pb-6">
        <div className="flex items-start gap-3">
          <NoteLead note={note} size={36} />
          <div className="flex min-w-0 flex-col gap-1">
            <NoteSentence note={note} className="text-ink text-md [overflow-wrap:anywhere]" />
            {state === "later" && note.snoozeUntil ?
              (
                <span className="flex items-center gap-1.5 text-arc-ink text-sm">
                  <Clock className="size-3.5" strokeWidth={1.75} />
                  Komt terug {wakesAt(note.snoozeUntil, now)}
                </span>
              ) :
              null}
            {state === "cleared"
              ? <span className="text-ink-3 text-sm">Gewist. Hij staat hier tot je hem terugzet.</span>
              : null}
          </div>
        </div>

        {note.detail ?
          (
            <p
              className={cn(
                "rounded-lg bg-paper px-3.5 py-3 text-base leading-relaxed",
                note.quote ? "text-ink" : "text-ink-2"
              )}
            >
              {note.quote ? `“${note.detail}”` : note.detail}
            </p>
          ) :
          null}

        {ref?.type === "conversation" && Reply ? <Reply note={note} conversation={ref.id} name={ref.name} /> : null}

        {facts.length > 0 ?
          (
            <dl className="flex flex-col overflow-hidden rounded-lg bg-paper [&>div+div]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3.5 py-2 text-sm">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-ink tabular-nums [overflow-wrap:anywhere]">{v}</dd>
                </div>
              ))}
            </dl>
          ) :
          null}
        {missing ? <p className="text-ink-3 text-sm">Dit record staat niet meer in de werkruimte.</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {primary.done ?
            (
              <span className="flex h-9 items-center gap-1.5 rounded-md bg-signal-green-bg px-3 font-medium text-signal-green text-sm">
                <CheckCircle2 className="size-4" strokeWidth={1.75} />
                {primary.done}
              </span>
            ) :
            null}
          <button
            type="button"
            disabled={primary.busy}
            onClick={() => void primary.run()}
            className={cn(
              "flex h-9 items-center gap-2 rounded-md px-3.5 font-medium text-base transition-colors disabled:opacity-70",
              primary.quiet
                ? "field text-ink hover:field-hover"
                : "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2"
            )}
          >
            {primary.busy ? <Loader className="size-4 animate-spin" strokeWidth={1.75} /> : null}
            {primary.label}
          </button>
          {primary.label !== "Openen" && primary.run !== open && !primary.done ?
            (
              <Link
                to={note.to}
                search={note.search as never}
                onClick={() => setRead([note.id], true)}
                className="field flex h-9 items-center rounded-md px-3.5 font-medium text-base text-ink hover:field-hover"
              >
                Openen
              </Link>
            ) :
            null}
        </div>

        <div className="flex flex-wrap gap-1">
          <PaneButton
            icon={note.read ? EyeOff : Eye}
            label={note.read ? "Ongelezen" : "Gelezen"}
            keys="U"
            onClick={() => setRead([note.id], !note.read)}
          />
          {state === "inbox" ? <PaneButton icon={Clock} label="Later" keys="S" onClick={onSnooze} /> : null}
          {state === "cleared" || state === "later" ?
            (
              <PaneButton
                icon={RotateCcw}
                label={state === "later" ? "Nu terughalen" : "Terugzetten"}
                onClick={onRestore}
              />
            ) :
            <PaneButton icon={CheckCircle2} label="Wissen" keys="E" onClick={onClear} />}
          {note.persona === "admin" && event && canMute ?
            (
              <PaneButton
                icon={BellRing}
                label="Dit soort niet meer tonen"
                onClick={() => {
                  setEventApp(note.event, false)
                  onClose()
                  undoable(
                    `Je ziet “${event.label}” niet meer in de app`,
                    () => setEventApp(note.event, true),
                    "Zet het terug in Instellingen, Meldingen."
                  )
                }}
              />
            ) :
            null}
        </div>
      </div>
    </motion.article>
  )
}

function PaneButton(
  { icon: Icon, label, keys, onClick }: { icon: typeof Eye; label: string; keys?: string; onClick: () => void }
) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
    >
      <Icon className="size-3.5 text-ink-3" strokeWidth={1.75} />
      {label}
      {keys
        ? (
          <kbd className="ml-0.5 hidden h-5 sm:flex min-w-5 items-center justify-center rounded-sm bg-paper px-1 font-medium text-ink-3 text-xs">
            {keys}
          </kbd>
        )
        : null}
    </button>
  )
}

/** Answer a mention where it was read: the message lands in the channel it came from. */
