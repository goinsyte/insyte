import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, ReactNode } from "react"
import {
  caseRef,
  COMMANDS,
  KIND_GLYPH,
  KIND_LABEL,
  productRef,
  searchRefs,
  supplierRef,
  ticketRef
} from "../ask/catalogue.ts"
import type { Command, Ref } from "../ask/catalogue.ts"
import type { Glyph } from "../fixtures/agents.ts"
import { ModelButton } from "./assistant.tsx"
import { cx } from "./cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "./dropdown.tsx"
import { ArrowUp, At, BarChart3, Mic, Paperclip, Plus, X, Zap } from "./icons.tsx"
import { Kbd } from "./kbd.tsx"

/** What "+" can attach as context besides a file: the records today is about. */
const ATTACHABLE = () => [
  productRef("aurora-hooded-fleece"),
  supplierRef("kestrel-goods"),
  caseRef("CB-2291"),
  ticketRef("5141")
]

/** The skills the composer can switch on for one message. */
const SKILLS = ["Northwind-toon", "Verzendbeleid", "Retourbeleid", "Maattabellen"] as const

/** What the demo's dictation "hears": the composer cannot listen, so it writes a sentence an operator would say. */
const DICTATED = "Welke bestellingen van Kestrel Goods zijn het langst onderweg?"
const LISTEN_MS = 1800

/** What a message carries besides its words: the records named with @ and the / command chosen. */
type Extra = { readonly refs: ReadonlyArray<Ref>; readonly command?: string }

type Option =
  | { readonly kind: "ref"; readonly ref: Ref }
  | { readonly kind: "command"; readonly command: Command }

const sameRef = (a: Ref, b: Ref) => a.kind === b.kind && a.id === b.id

/**
 * The composer for Magnus and the agents: a white field in a neutral line that turns into the AI
 * gradient while you type (the ring is how you know you are talking to the assistant, and the only
 * place the gradient frames anything). It grows with its text; Enter sends, Shift+Enter breaks the
 * line. Context the message carries sits above the text as removable chips.
 *
 * `@` names a record (an order, a customer, a product, a supplier, a ticket, a case, a return) and `/`
 * at the start picks a command. Either opens a short list above the field that the arrow keys walk,
 * Enter or Tab picks and Escape closes; what is picked becomes a chip in the field, and Backspace at
 * the start of the text takes the last chip back out.
 */
export function Composer(
  {
    placeholder,
    label,
    context = [],
    onRemoveContext,
    onSend,
    tools = true,
    autoFocus,
    lead,
    dictation = DICTATED,
    mentions = true,
    commands = tools
  }: {
    readonly placeholder: string
    readonly label: string
    readonly context?: ReadonlyArray<string>
    readonly onRemoveContext?: (item: string) => void
    /** The words, and the records and command the message names. */
    readonly onSend: (text: string, extra: Extra) => void
    /** Skills and the model picker; off for an agent's own chat. */
    readonly tools?: boolean
    readonly autoFocus?: boolean
    /** Who the message goes to, before the text: an agent's disc in its own chat. */
    readonly lead?: ReactNode
    /** The sentence the demo's dictation writes. */
    readonly dictation?: string
    /** `@` to name a record. */
    readonly mentions?: boolean
    /** `/` for Magnus's commands; follows `tools` unless set. */
    readonly commands?: boolean
  }
) {
  const [text, setText] = useState("")
  const [cursor, setCursor] = useState(0)
  const [files, setFiles] = useState<ReadonlyArray<string>>([])
  const [refs, setRefs] = useState<ReadonlyArray<Ref>>([])
  const [command, setCommand] = useState<Command | null>(null)
  const [active, setActive] = useState(0)
  /** The `@` or `/` whose list was closed with Escape, by where it starts. */
  const [closedAt, setClosedAt] = useState<number | null>(null)
  const [skills, setSkills] = useState<ReadonlySet<string>>(new Set())
  const [listening, setListening] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const id = useId()
  const listId = `${id}-lijst`

  useEffect(() => {
    if (!listening) return
    const timer = window.setTimeout(() => {
      setListening(false)
      setText((current) => (current.trim() === "" ? dictation : `${current.trim()} ${dictation}`))
      area.current?.focus()
    }, LISTEN_MS)
    return () => window.clearTimeout(timer)
  }, [listening, dictation])

  /* What is being typed at the caret: "@kest" or "/ver" (a command only at the very start), or nothing. */
  const trigger = useMemo(() => {
    const before = text.slice(0, cursor)
    const m = /(^|\s)([@/])([^\s@/]*)$/.exec(before)
    if (m === null) return null
    const sign = m[2] as "@" | "/"
    const query = m[3] ?? ""
    if (sign === "@" && !mentions) return null
    if (sign === "/" && (!commands || command !== null || before.trimStart() !== `/${query}`)) return null
    return { sign, query, start: before.length - query.length - 1 }
  }, [text, cursor, mentions, commands, command])

  const options: ReadonlyArray<Option> = useMemo(() => {
    if (trigger === null || trigger.start === closedAt) return []
    if (trigger.sign === "/") {
      const q = trigger.query.toLocaleLowerCase("nl-NL")
      return COMMANDS.filter((c) => c.name.startsWith(q) || c.hint.toLocaleLowerCase("nl-NL").includes(q))
        .map((c) => ({ kind: "command" as const, command: c }))
    }
    return searchRefs(trigger.query, 9).filter((r) => !refs.some((x) => sameRef(x, r))).slice(0, 7)
      .map((ref) => ({ kind: "ref" as const, ref }))
  }, [trigger, closedAt, refs])
  const open = options.length > 0
  const at = Math.min(active, Math.max(0, options.length - 1))

  const place = (next: string, caret: number) => {
    setText(next)
    setCursor(caret)
    setActive(0)
    requestAnimationFrame(() => {
      const el = area.current
      if (el === null) return
      el.focus()
      el.setSelectionRange(caret, caret)
      el.style.height = ""
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
  }

  const choose = (option: Option) => {
    if (trigger === null) return
    // The typed "@kest" or "/ver" goes; what it stood for is a chip now.
    const head = text.slice(0, trigger.start)
    const tail = text.slice(cursor).replace(/^\s+/, head === "" || head.endsWith(" ") ? "" : " ")
    if (option.kind === "ref") setRefs((list) => [...list, option.ref])
    else setCommand(option.command)
    place(head + tail, head.length)
  }

  /** The @ and / buttons: start a mention at the caret, or a command at the start. */
  const begin = (sign: "@" | "/") => {
    if (sign === "/") {
      place(`/${text.replace(/^\//, "")}`, 1)
      return
    }
    const head = text.slice(0, cursor)
    const pad = head === "" || head.endsWith(" ") ? "" : " "
    place(`${head}${pad}@${text.slice(cursor)}`, head.length + pad.length + 1)
  }

  const removeChip = (
    item: { kind: "context" | "file"; value: string } | { kind: "ref"; ref: Ref } | { kind: "command" }
  ) => {
    if (item.kind === "file") setFiles((list) => list.filter((x) => x !== item.value))
    else if (item.kind === "context") onRemoveContext?.(item.value)
    else if (item.kind === "ref") setRefs((list) => list.filter((x) => !sameRef(x, item.ref)))
    else setCommand(null)
    area.current?.focus()
  }

  const canSend = text.trim() !== "" || refs.length > 0 || command !== null

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSend) return
    const message = text.trim() === "" && command === null ? refs.map((r) => r.label).join(", ") : text.trim()
    onSend(message, { refs, ...(command === null ? {} : { command: command.name }) })
    setText("")
    setCursor(0)
    setFiles([])
    setRefs([])
    setCommand(null)
    setClosedAt(null)
    if (area.current !== null) area.current.style.height = ""
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        setActive((at + step + options.length) % options.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        const option = options[at]
        if (option !== undefined) choose(option)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setClosedAt(trigger?.start ?? null)
        return
      }
    }
    const el = event.currentTarget
    if (event.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (refs.length > 0) {
        event.preventDefault()
        setRefs((list) => list.slice(0, -1))
        return
      }
      if (command !== null) {
        event.preventDefault()
        setCommand(null)
        return
      }
    }
    if (event.key === "Enter" && !event.shiftKey) send(event)
  }

  const contextChips = context
  const fileChips = files.filter((item) => !context.includes(item))
  const hasChips = contextChips.length + fileChips.length + refs.length > 0 || command !== null

  return (
    <div className="relative">
      {open && (
        <div className="absolute right-0 bottom-full left-0 z-20 mb-2 animate-rise rounded-lg bg-canvas p-1.5 shadow-pop ring-1 ring-line">
          <p className="flex items-center justify-between px-2 pt-1 pb-1.5 text-2xs font-medium text-ink-3">
            {trigger?.sign === "/" ? "Opdrachten" : trigger?.query === "" ? "Record noemen" : "Records"}
            <span className="flex items-center gap-1 font-normal" aria-hidden="true">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>↵</Kbd>
            </span>
          </p>
          <ul id={listId} role="listbox" aria-label={trigger?.sign === "/" ? "Opdrachten" : "Records"}>
            {options.map((option, i) => {
              const G = option.kind === "ref" ? KIND_GLYPH[option.ref.kind] : Zap
              const key = option.kind === "ref" ? `${option.ref.kind}-${option.ref.id}` : option.command.name
              return (
                <li
                  key={key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === at}
                  onPointerMove={() => setActive(i)}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    choose(option)
                  }}
                  className={cx(
                    "flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm",
                    i === at ? "bg-selected text-ink" : "text-ink-2"
                  )}
                >
                  <G size={15} className="shrink-0 text-ink-3" />
                  <span className="shrink-0 font-medium text-ink">
                    {option.kind === "ref" ? option.ref.label : `/${option.command.name}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                    {option.kind === "ref" ? option.ref.hint : option.command.hint}
                  </span>
                  {option.kind === "ref" && (
                    <span className="shrink-0 text-2xs text-ink-3">{KIND_LABEL[option.ref.kind]}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <form onSubmit={send} className="ai-ring flex flex-col gap-2 rounded-lg p-3 shadow-sm">
        {hasChips && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Context">
            {command !== null && (
              <ChipItem
                glyph={Zap}
                label={`/${command.name}`}
                onRemove={() => removeChip({ kind: "command" })}
              />
            )}
            {refs.map((ref) => (
              <ChipItem
                key={`${ref.kind}-${ref.id}`}
                glyph={KIND_GLYPH[ref.kind]}
                label={ref.label}
                onRemove={() => removeChip({ kind: "ref", ref })}
              />
            ))}
            {contextChips.map((item) => (
              <ChipItem
                key={item}
                glyph={BarChart3}
                label={item}
                {...(onRemoveContext === undefined
                  ? {}
                  : { onRemove: () => removeChip({ kind: "context", value: item }) })}
              />
            ))}
            {fileChips.map((item) => (
              <ChipItem
                key={item}
                glyph={Paperclip}
                label={item}
                onRemove={() => removeChip({ kind: "file", value: item })}
              />
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
            role={mentions || commands ? "combobox" : undefined}
            aria-expanded={mentions || commands ? open : undefined}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? `${listId}-${at}` : undefined}
            aria-autocomplete={mentions || commands ? "list" : undefined}
            placeholder={listening
              ? "Luistert…"
              : command !== null
              ? `${command.hint}. Verstuur, of zeg er iets bij`
              : placeholder}
            onChange={(event) => {
              setText(event.target.value)
              setCursor(event.target.selectionStart)
              setActive(0)
              event.target.style.height = ""
              event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`
            }}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            onBlur={() => setClosedAt(trigger?.start ?? null)}
            onFocus={() => setClosedAt(null)}
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
            if (picked !== undefined) setFiles((list) => (list.includes(picked.name) ? list : [...list, picked.name]))
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
            <DropdownItem glyph={Paperclip} onSelect={() => file.current?.click()}>
              Bestand van je computer
            </DropdownItem>
            <DropdownSeparator />
            <DropdownLabel>Record als context</DropdownLabel>
            {ATTACHABLE().map((ref) => (
              <DropdownItem
                key={`${ref.kind}-${ref.id}`}
                glyph={KIND_GLYPH[ref.kind]}
                disabled={refs.some((x) => sameRef(x, ref))}
                onSelect={() => setRefs((list) => (list.some((x) => sameRef(x, ref)) ? list : [...list, ref]))}
              >
                {ref.label}
              </DropdownItem>
            ))}
            {mentions && <DropdownItem glyph={At} onSelect={() => begin("@")}>Een ander record zoeken…</DropdownItem>}
          </DropdownMenu>
          {mentions && (
            <button
              type="button"
              aria-label="Record noemen"
              title="Record noemen (@)"
              onClick={() => begin("@")}
              className="flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
            >
              <At size={15} />
            </button>
          )}
          {commands && (
            <button
              type="button"
              aria-label="Opdracht kiezen"
              title="Opdracht kiezen (/)"
              onClick={() => begin("/")}
              className="flex size-7 items-center justify-center rounded-sm text-base text-ink-3 hover:bg-hover hover:text-ink"
            >
              <span aria-hidden="true">/</span>
            </button>
          )}
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
                  <span className="hidden sm:inline">Vaardigheden</span>
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
            {!canSend
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
                  className="flex size-7 items-center justify-center rounded-full bg-ink text-on-ink transition-transform hover:bg-ink/88"
                >
                  <ArrowUp size={15} strokeWidth={2} />
                </button>
              )}
          </span>
        </div>
      </form>
    </div>
  )
}

function ChipItem({ glyph: G, label, onRemove }: {
  readonly glyph: Glyph
  readonly label: string
  readonly onRemove?: () => void
}) {
  return (
    <li className="inline-flex h-6 animate-rise items-center gap-1.5 rounded-xs bg-well pr-1 pl-2 text-xs text-ink-2">
      <G size={13} className="text-ink-3" />
      <span className="max-w-48 truncate">{label}</span>
      {onRemove === undefined ? <span className="w-1" /> : (
        <button
          type="button"
          aria-label={`${label} weghalen`}
          onClick={onRemove}
          className="rounded-xs p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X size={12} />
        </button>
      )}
    </li>
  )
}
