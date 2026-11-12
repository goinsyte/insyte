import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type KeyboardEvent, type Ref, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { ChatRecordRef } from "../../data-source"
import { Sparkle, Zap } from "../../icons"
import { personStyle } from "../lib/person-color"
import { cn } from "../lib/utils"
import { type Command, COMMANDS } from "./commands"
import { KindTile } from "./record-views"
import { KIND_LABEL } from "./records"
import { type RecordHit, useChatsSource } from "./source"

/*
 * The composer's field, which knows three things about the product. "@" names a colleague, or
 * Insyte. "/" at the start of a message is a command: the verbs the app has. "#" is a record: an
 * order, a customer, a product, a chargeback or a ticket, picked by its number or its name and sent
 * along as a live card. One picker serves all three, so the keys are the same each time: arrows,
 * Enter or Tab to take one, Escape to let it go.
 */

export type Person = { id: string; initial: string; name: string }

type Trigger = { kind: "@" | "/" | "#"; query: string; start: number }

type Option =
  | { type: "person"; key: string; person: Person; agent?: boolean }
  | { type: "command"; key: string; command: Command }
  | { type: "record"; key: string; record: RecordHit }

const EASE = [0.16, 1, 0.3, 1] as const

export function SmartField({
  value,
  onChange,
  onSubmit,
  people,
  onPickRecord,
  recordKinds,
  placeholder,
  className,
  rows = 2,
  inputRef,
  onKeyDown: onOtherKey
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  people: ReadonlyArray<Person>
  onPickRecord: (ref: ChatRecordRef) => void
  /** Narrows the # picker, when a command is waiting on one kind of record. */
  recordKinds?: Command["kinds"]
  placeholder?: string
  className?: string
  rows?: number
  inputRef?: Ref<HTMLTextAreaElement | null>
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, [])
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [at, setAt] = useState(0)
  const source = useChatsSource()
  const hits = source.useRecordSearch(trigger?.kind === "#" ? trigger.query : null, recordKinds)
  const reduce = useReducedMotion() ?? false

  const options = useMemo<Option[]>(() => {
    if (!trigger) return []
    const q = trigger.query.toLowerCase()
    if (trigger.kind === "@") {
      const list: Option[] = []
      if (source.insyte && "insyte".startsWith(q)) {
        list.push({
          type: "person",
          key: "insyte",
          person: { id: "u_insyte", initial: "I", name: "Insyte" },
          agent: true
        })
      }
      for (const p of people) if (p.name.toLowerCase().includes(q)) list.push({ type: "person", key: p.id, person: p })
      return list.slice(0, 6)
    }
    if (trigger.kind === "/") {
      return COMMANDS.filter((c) => c.slash.startsWith(q) || c.label.toLowerCase().includes(q)).map((c) => ({
        type: "command",
        key: c.id,
        command: c
      }))
    }
    return hits.map((r) => ({
      type: "record",
      key: `${r.kind}:${r.ref.id}`,
      record: r
    }))
  }, [trigger, people, hits, source.insyte])
  const open = options.length > 0

  function read(next: string, caret: number) {
    const before = next.slice(0, caret)
    const slash = /^\/([\p{L}]*)$/u.exec(before)
    if (slash) return setTrigger({ kind: "/", query: slash[1] ?? "", start: 0 }), setAt(0)
    const m = /(^|\s)([@#])([\p{L}\p{N}_-]*)$/u.exec(before)
    if (m) {
      const start = caret - (m[3]?.length ?? 0) - 1
      setTrigger({ kind: m[2] as "@" | "#", query: m[3] ?? "", start })
      setAt(0)
      return
    }
    setTrigger(null)
  }

  function replaceTrigger(withText: string) {
    if (!trigger) return
    const el = ref.current
    const caret = el?.selectionStart ?? value.length
    const before = value.slice(0, trigger.start) + withText
    onChange(before + value.slice(caret))
    setTrigger(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(before.length, before.length)
    })
  }

  function pick(o: Option) {
    if (o.type === "person") replaceTrigger(`@${o.person.name.split(" ")[0]} `)
    else if (o.type === "command") replaceTrigger(`/${o.command.slash} `)
    else {
      onPickRecord(o.record.ref)
      replaceTrigger("")
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setAt((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const o = options[at]
        if (o) pick(o)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setTrigger(null)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSubmit()
      return
    }
    onOtherKey?.(e)
  }

  const heading = trigger?.kind === "@"
    ? "Vermelden"
    : trigger?.kind === "/"
    ? "Doen in de app"
    : trigger?.query
    ? "Records"
    : "Delen uit de app"

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          read(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => read(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTrigger(null)}
        placeholder={placeholder}
        rows={rows}
        aria-autocomplete="list"
        aria-expanded={open}
        className={className}
      />
      <AnimatePresence>
        {open ?
          (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
              style={{ transformOrigin: "0% 100%" }}
              className="absolute bottom-full left-0 z-20 mb-2 flex w-[min(420px,calc(100vw-48px))] flex-col overflow-hidden rounded-xl bg-paper shadow-[0_18px_40px_-12px_rgb(0_0_0/0.25),0_2px_6px_rgb(0_0_0/0.06)]"
            >
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                <span className="font-medium text-ink-3 text-xs">{heading}</span>
                <span className="text-ink-3 text-xs">↑↓ · Enter</span>
              </div>
              <ul
                role="listbox"
                aria-label={heading}
                className="flex max-h-72 flex-col gap-px overflow-y-auto px-1.5 pb-1.5"
              >
                {options.map((o, i) => (
                  <li key={o.key} role="option" aria-selected={i === at}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pick(o)
                      }}
                      onMouseEnter={() => setAt(i)}
                      className={cn(
                        "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                        i === at ? "bg-arc-tint" : ""
                      )}
                    >
                      <OptionRow o={o} active={i === at} />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          ) :
          null}
      </AnimatePresence>
    </div>
  )
}

function OptionRow({ o, active }: { o: Option; active: boolean }) {
  if (o.type === "person") {
    return (
      <>
        {o.agent ?
          (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-abyss text-mesh-ink">
              <Sparkle className="size-3.5" strokeWidth={2} />
            </span>
          ) :
          (
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-md font-medium text-xs"
              style={personStyle(o.person.id)}
            >
              {o.person.initial}
            </span>
          )}
        <span className="flex-1 truncate text-base text-ink">{o.person.name}</span>
        {o.agent ? <span className="text-arc-ink text-sm">Laat Insyte iets doen</span> : null}
      </>
    )
  }
  if (o.type === "command") {
    return (
      <>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            active ? "bg-arc text-mesh-ink" : "bg-arc-tint text-arc-ink"
          )}
        >
          <Zap className="size-3.5" strokeWidth={2} />
        </span>
        <span className="font-medium text-base text-ink">/{o.command.slash}</span>
        <span className="min-w-0 flex-1 truncate text-ink-3 text-sm">{o.command.hint}</span>
      </>
    )
  }
  const r = o.record
  return (
    <>
      <KindTile kind={r.kind} size="sm" />
      <span className="shrink-0 font-medium text-arc-ink text-sm">{r.code}</span>
      <span className="min-w-0 flex-1 truncate text-base text-ink">{r.title}</span>
      <span className="shrink-0 text-ink-3 text-xs">{KIND_LABEL[r.kind]}</span>
    </>
  )
}
