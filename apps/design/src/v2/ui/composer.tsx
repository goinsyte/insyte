import { useEffect, useId, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, ReactNode } from "react"
import { RECORDS } from "../fixtures/workspace.ts"
import { ModelButton } from "./assistant.tsx"
import { cx } from "./cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "./dropdown.tsx"
import { ArrowUp, BarChart3, CreditCard, Factory, Inbox, Mic, Package, Paperclip, Plus, X, Zap } from "./icons.tsx"

/** What "+" can attach: a file from the computer, or one of the workspace's records. */
const ATTACHABLE = [
  { label: RECORDS.aurora.label, glyph: Package },
  { label: RECORDS.kestrel.label, glyph: Factory },
  { label: "Chargeback #CB-2291", glyph: CreditCard },
  { label: RECORDS.inbox.label, glyph: Inbox }
] as const

/** The skills the composer can switch on for one message. */
const SKILLS = ["Northwind-toon", "Verzendbeleid", "Retourbeleid", "Maattabellen"] as const

/** What the demo's dictation "hears": the composer cannot listen, so it writes a sentence an operator would say. */
const DICTATED = "Welke bestellingen van Kestrel Goods zijn het langst onderweg?"
const LISTEN_MS = 1800

/**
 * The composer for Magnus and the agents: a white field in a neutral line that turns into the AI
 * gradient while you type (the ring is how you know you are talking to the assistant, and the only
 * place the gradient frames anything). It
 * grows with its text; Enter sends, Shift+Enter breaks the line. Context the message carries sits
 * above the text as removable chips.
 */
export function Composer(
  { placeholder, label, context = [], onRemoveContext, onSend, tools = true, autoFocus, lead, dictation = DICTATED }: {
    readonly placeholder: string
    readonly label: string
    readonly context?: ReadonlyArray<string>
    readonly onRemoveContext?: (item: string) => void
    readonly onSend: (text: string) => void
    /** Skills and the model picker; off for an agent's own chat. */
    readonly tools?: boolean
    readonly autoFocus?: boolean
    /** Who the message goes to, before the text: an agent's disc in its own chat. */
    readonly lead?: ReactNode
    /** The sentence the demo's dictation writes. */
    readonly dictation?: string
  }
) {
  const [text, setText] = useState("")
  const [attached, setAttached] = useState<ReadonlyArray<string>>([])
  const [skills, setSkills] = useState<ReadonlySet<string>>(new Set())
  const [listening, setListening] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const id = useId()
  const chips = [...context, ...attached.filter((item) => !context.includes(item))]

  useEffect(() => {
    if (!listening) return
    const timer = window.setTimeout(() => {
      setListening(false)
      setText((current) => (current.trim() === "" ? dictation : `${current.trim()} ${dictation}`))
      area.current?.focus()
    }, LISTEN_MS)
    return () => window.clearTimeout(timer)
  }, [listening, dictation])

  const attach = (item: string) => setAttached((list) => (list.includes(item) ? list : [...list, item]))
  const remove = (item: string) => {
    if (attached.includes(item)) setAttached((list) => list.filter((x) => x !== item))
    else onRemoveContext?.(item)
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const message = text.trim()
    if (message === "") return
    onSend(message)
    setText("")
    setAttached([])
    if (area.current !== null) area.current.style.height = ""
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) send(event)
  }

  return (
    <form onSubmit={send} className="ai-ring flex flex-col gap-2 rounded-lg p-3 shadow-sm">
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Context">
          {chips.map((item) => (
            <li
              key={item}
              className="inline-flex h-6 items-center gap-1.5 rounded-xs bg-well pr-1 pl-2 text-xs text-ink-2"
            >
              <BarChart3 size={13} className="text-ink-3" />
              {item}
              {(onRemoveContext !== undefined || attached.includes(item)) && (
                <button
                  type="button"
                  aria-label={`${item} weghalen`}
                  onClick={() => remove(item)}
                  className="rounded-xs p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="flex items-start gap-2.5">
        {lead !== undefined && <span className="shrink-0">{lead}</span>}
        <textarea
          id={id}
          ref={area}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          placeholder={listening ? "Luistert…" : placeholder}
          onChange={(event) => {
            setText(event.target.value)
            event.target.style.height = ""
            event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`
          }}
          onKeyDown={onKeyDown}
          className="min-h-6 w-full resize-none self-center bg-transparent text-base text-ink outline-none focus-visible:outline-none"
        />
      </div>
      <input
        ref={file}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const picked = event.target.files?.[0]
          if (picked !== undefined) attach(picked.name)
          event.target.value = ""
        }}
      />
      <div className="flex items-center gap-1">
        <DropdownMenu
          label="Toevoegen"
          placement="top"
          width="w-64"
          trigger={(props) => (
            <button
              type="button"
              aria-label="Bestand of record toevoegen"
              title="Bestand of record toevoegen"
              className="flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
              {...props}
            >
              <Plus size={16} />
            </button>
          )}
        >
          <DropdownItem glyph={Paperclip} onSelect={() => file.current?.click()}>Bestand van je computer</DropdownItem>
          <DropdownSeparator />
          <DropdownLabel>Record als context</DropdownLabel>
          {ATTACHABLE.map((item) => (
            <DropdownItem
              key={item.label}
              glyph={item.glyph}
              disabled={chips.includes(item.label)}
              onSelect={() => attach(item.label)}
            >
              {item.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
        {tools && (
          <DropdownMenu
            label="Vaardigheden"
            placement="top"
            width="w-60"
            trigger={(props) => (
              <button
                type="button"
                className={cx(
                  "flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs hover:bg-hover hover:text-ink",
                  skills.size > 0 ? "text-ink" : "text-ink-3"
                )}
                {...props}
              >
                <Zap size={14} />
                Vaardigheden
                {skills.size > 0 && <span className="figure text-ink-3">{skills.size}</span>}
              </button>
            )}
          >
            <DropdownLabel>Voor dit bericht</DropdownLabel>
            {SKILLS.map((skill) => (
              <DropdownItem
                key={skill}
                checked={skills.has(skill)}
                onSelect={() =>
                  setSkills((set) => {
                    const next = new Set(set)
                    if (next.has(skill)) next.delete(skill)
                    else next.add(skill)
                    return next
                  })}
              >
                {skill}
              </DropdownItem>
            ))}
          </DropdownMenu>
        )}
        <span className="ml-auto flex items-center gap-1">
          {tools && <ModelButton />}
          {text.trim() === ""
            ? (
              <button
                type="button"
                aria-label={listening ? "Stoppen met inspreken" : "Inspreken"}
                aria-pressed={listening}
                title={listening ? "Stoppen met inspreken" : "Inspreken"}
                onClick={() => setListening(!listening)}
                className={cx(
                  "flex size-7 items-center justify-center rounded-full hover:bg-hover hover:text-ink",
                  listening ? "bg-selected text-ink" : "text-ink-3"
                )}
              >
                <Mic size={16} className={listening ? "animate-pulse motion-reduce:animate-none" : undefined} />
              </button>
            )
            : (
              <button
                type="submit"
                aria-label="Versturen"
                className={cx(
                  "flex size-7 items-center justify-center rounded-full bg-ink text-on-ink transition-transform hover:bg-ink/88"
                )}
              >
                <ArrowUp size={15} strokeWidth={2} />
              </button>
            )}
        </span>
      </div>
    </form>
  )
}
