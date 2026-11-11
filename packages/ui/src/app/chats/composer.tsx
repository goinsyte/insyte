import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type Ref, useImperativeHandle, useRef, useState } from "react"
import type { ChatRecordRef } from "../../data-source"
import {
  AtSign,
  Bold,
  Code,
  Hash,
  Italic,
  Link2,
  List,
  Paperclip,
  Send,
  Smile,
  Sparkles,
  Strikethrough,
  Zap
} from "../../icons"
import { cn } from "../lib/utils"
import { useChatStore } from "../stores/chat-store"
import { type Attachment, PendingAttachments } from "./attachments"
import { blocked, COMMANDS, mentionsInsyte, parseSlash } from "./commands"
import { EmojiPicker } from "./emoji-picker"
import { Avatar } from "./profile-card"
import { RecordChip } from "./record-views"
import { usePools } from "./records"
import { type Person, SmartField } from "./smart-field"

/*
 * Where a message is written, and where the app is reached from. Under the text sit the records it
 * will carry; over it, while a /command is typed, a line that reads the command back the way its card
 * will say it, so what Enter does is never a guess. Insyte's name turns the send button into an ask.
 */

const FORMATS = [
  { id: "bold", label: "Vet", keys: "⌘B", icon: Bold, wrap: ["**", "**"] },
  { id: "italic", label: "Cursief", keys: "⌘I", icon: Italic, wrap: ["_", "_"] },
  { id: "strike", label: "Doorhalen", keys: "⌘⇧X", icon: Strikethrough, wrap: ["~~", "~~"] },
  { id: "code", label: "Code", keys: "⌘E", icon: Code, wrap: ["`", "`"] }
] as const

export type ComposerHandle = { insert: (text: string) => void; focus: () => void }

export function Composer({
  conversationId,
  value,
  onChange,
  onSubmit,
  placeholder,
  people,
  attachments,
  onAttach,
  onRemoveAttachment,
  records,
  onRecords,
  alsoToChannel,
  compact = false,
  handle
}: {
  conversationId: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  people: ReadonlyArray<Person>
  attachments: ReadonlyArray<Attachment>
  onAttach: (files: Iterable<File>) => void
  onRemoveAttachment: (id: string) => void
  records: ReadonlyArray<ChatRecordRef>
  onRecords: (refs: ChatRecordRef[]) => void
  /** In a thread: also post the reply in the channel. */
  alsoToChannel?: { checked: boolean; onChange: (v: boolean) => void; channel: string }
  compact?: boolean
  handle?: Ref<ComposerHandle>
}) {
  const area = useRef<HTMLTextAreaElement | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const reduce = useReducedMotion() ?? false
  const pools = usePools()
  const typing = useChatStore((s) => s.typing[conversationId])
  const slash = value.trim().startsWith("/") ? parseSlash(value, records, pools) : null
  const slashTyped = value.trim().startsWith("/") && /^\/\S+\s/.test(value)
  const why = slash ? blocked(slash.command.id, slash.record, slash.arg) : undefined
  const asking = mentionsInsyte(value)
  const canSend = slash ? !why : value.trim() !== "" || attachments.length > 0 || records.length > 0

  function insert(before: string, after = "") {
    const el = area.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + before.length, end + before.length)
    })
  }

  useImperativeHandle(handle, () => ({ insert: (t) => insert(t), focus: () => area.current?.focus() }))

  function toggleList() {
    const el = area.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const from = value.lastIndexOf("\n", start - 1) + 1
    const toIdx = value.indexOf("\n", end)
    const to = toIdx === -1 ? value.length : toIdx
    const lines = value.slice(from, to).split("\n")
    const listed = lines.every((l) => l.startsWith("- "))
    const block = lines.map((l) => (listed ? l.slice(2) : `- ${l}`)).join("\n")
    onChange(value.slice(0, from) + block + value.slice(to))
  }

  function addLink() {
    const el = area.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const text = value.slice(start, end) || "link"
    onChange(`${value.slice(0, start)}[${text}](https://)${value.slice(end)}`)
    const at = start + text.length + 3 + "https://".length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at, at)
    })
  }

  function onKeys(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return
    const k = e.key.toLowerCase()
    const f = k === "b"
      ? FORMATS[0]
      : k === "i"
      ? FORMATS[1]
      : k === "x" && e.shiftKey
      ? FORMATS[2]
      : k === "e"
      ? FORMATS[3]
      : null
    if (f) {
      e.preventDefault()
      insert(f.wrap[0], f.wrap[1])
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSubmit()
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return
        e.preventDefault()
        setDragging(false)
        onAttach(e.dataTransfer.files)
      }}
      className={cn("@container shrink-0", compact ? "px-3 pb-3" : "px-4 pb-4")}
    >
      <div className="flex h-6 items-center gap-2 px-1">
        <AnimatePresence>
          {typing ?
            (
              <motion.span
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-ink-2 text-sm"
              >
                <Avatar senderId="u_insyte" name="Insyte" size={16} />
                <span className="font-medium text-arc-ink">{typing}</span> is bezig
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="size-1 rounded-full bg-arc"
                      animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </span>
              </motion.span>
            ) :
            null}
        </AnimatePresence>
      </div>
      <div
        className={cn(
          "relative flex flex-col rounded-xl bg-paper transition-shadow duration-200",
          "shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-ink)_10%,transparent),0_2px_6px_-2px_rgb(0_0_0/0.06)]",
          "focus-within:shadow-[0_0_0_1.5px_var(--color-arc),0_8px_24px_-12px_color-mix(in_oklch,var(--color-arc)_45%,transparent)]",
          dragging && "shadow-[0_0_0_2px_var(--color-arc)]"
        )}
      >
        {dragging ?
          (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-arc-tint/90 font-medium text-arc-ink text-base">
              Loslaten om bij te voegen
            </div>
          ) :
          null}
        <input
          ref={file}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onAttach(e.target.files)
            e.target.value = ""
          }}
        />
        <AnimatePresence initial={false}>
          {slash || slashTyped ?
            (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 rounded-t-xl bg-arc-tint px-3 py-2">
                  <span className="flex size-5 items-center justify-center rounded-md bg-arc text-mesh-ink">
                    <Zap className="size-3" strokeWidth={2.25} />
                  </span>
                  {slash ?
                    (
                      <>
                        <span className="font-medium text-arc-ink text-sm">{slash.command.label}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-2 text-sm">
                          {why ?? (slash.record
                            ? `${slash.record.code} · ${slash.record.title}${
                              slash.command.money ? " · je bevestigt op de kaart" : ""
                            }`
                            : "")}
                        </span>
                        <kbd className="hidden rounded bg-paper px-1.5 py-px font-sans font-medium text-2xs text-arc-ink sm:inline">
                          Enter
                        </kbd>
                      </>
                    ) :
                    (
                      <span className="text-ink-2 text-sm">
                        Onbekende opdracht. Probeer {COMMANDS.slice(0, 3).map((c) => `/${c.slash}`).join(", ")}
                      </span>
                    )}
                </div>
              </motion.div>
            ) :
            null}
        </AnimatePresence>
        <PendingAttachments items={attachments} onRemove={onRemoveAttachment} />
        {records.length ?
          (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {records.map((r) => (
                <RecordChip
                  key={`${r.kind}:${r.id}`}
                  refTo={r}
                  onRemove={() => onRecords(records.filter((x) => !(x.kind === r.kind && x.id === r.id)))}
                />
              ))}
            </div>
          ) :
          null}
        <SmartField
          inputRef={area}
          rows={compact ? 1 : 2}
          value={value}
          onChange={onChange}
          onSubmit={() => canSend && onSubmit()}
          onKeyDown={onKeys}
          people={people}
          onPickRecord={(r) =>
            onRecords(records.some((x) => x.kind === r.kind && x.id === r.id) ? [...records] : [...records, r])}
          {...(slash ? { recordKinds: slash.command.kinds } : {})}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-3.5 pt-3 text-base text-ink leading-[1.5] outline-none placeholder:text-ink-3"
        />
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <div className="flex min-w-0 items-center gap-0.5">
            {compact ? null : (
              /* The formatting row folds away when the composer is narrow; the shortcuts still work. */
              <div className="hidden items-center gap-0.5 @3xl:flex">
                {FORMATS.map((f) => (
                  <ComposerIcon
                    key={f.id}
                    label={`${f.label} (${f.keys})`}
                    onClick={() => insert(f.wrap[0], f.wrap[1])}
                    icon={<f.icon className="size-3.5" strokeWidth={1.75} />}
                  />
                ))}
                <ComposerIcon
                  label="Opsomming"
                  onClick={toggleList}
                  icon={<List className="size-3.5" strokeWidth={1.75} />}
                />
                <ComposerIcon label="Link" onClick={addLink} icon={<Link2 className="size-3.5" strokeWidth={1.75} />} />
                <span aria-hidden className="mx-1 h-4 w-px bg-ink/10" />
              </div>
            )}
            <ComposerIcon
              label="Bestanden bijvoegen"
              onClick={() => file.current?.click()}
              icon={<Paperclip className="size-3.5" strokeWidth={1.75} />}
            />
            <ComposerIcon
              label="Vermelden (@)"
              onClick={() => insert("@")}
              icon={<AtSign className="size-3.5" strokeWidth={1.75} />}
            />
            <EmojiPicker onPick={(e) => insert(e)}>
              <button
                type="button"
                aria-label="Emoji"
                title="Emoji"
                className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink data-[popup-open]:bg-ink/6"
              >
                <Smile className="size-3.5" strokeWidth={1.75} />
              </button>
            </EmojiPicker>
            <span aria-hidden className="mx-1 h-4 w-px bg-ink/10" />
            <AppButton
              label="Delen uit de app (#)"
              onClick={() => insert(value.endsWith(" ") || value === "" ? "#" : " #")}
            >
              <Hash className="size-3.5" strokeWidth={2} />
              {compact ? null : <span className="hidden @xl:inline">Delen</span>}
            </AppButton>
            <AppButton
              label="Doen in de app (/)"
              onClick={() => (value.startsWith("/")
                ? area.current?.focus()
                : (onChange(`/${value}`), requestAnimationFrame(() => area.current?.focus())))}
            >
              <Zap className="size-3.5" strokeWidth={2} />
              {compact ? null : <span className="hidden @xl:inline">Doen</span>}
            </AppButton>
            <AppButton
              label="Vraag Insyte (@Insyte)"
              onClick={() => insert(value === "" || value.endsWith(" ") ? "@Insyte " : " @Insyte ")}
            >
              <Sparkles className="size-3.5" strokeWidth={1.75} />
              {compact ? null : <span className="hidden @xl:inline">Insyte</span>}
            </AppButton>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {alsoToChannel ?
              (
                <label
                  title={`Ook naar #${alsoToChannel.channel}`}
                  className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-ink-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={alsoToChannel.checked}
                    onChange={(e) => alsoToChannel.onChange(e.target.checked)}
                    className="size-3.5 accent-[var(--color-arc)]"
                  />
                  <span className="hidden @sm:inline">Ook naar #{alsoToChannel.channel}</span>
                  <span className="@sm:hidden">Ook in kanaal</span>
                </label>
              ) :
              (
                <span className="hidden text-ink-3 text-xs @4xl:inline">
                  <kbd className="rounded bg-ink/6 px-1 py-px font-sans font-medium text-2xs">Enter</kbd> versturen ·
                  {" "}
                  <kbd className="rounded bg-ink/6 px-1 py-px font-sans font-medium text-2xs">⇧ Enter</kbd> nieuwe regel
                </span>
              )}
            <button
              type="submit"
              disabled={!canSend}
              aria-label={slash ? slash.command.label : asking ? "Vraag Insyte" : "Versturen"}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md bg-abyss font-medium text-mesh-ink text-sm leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-40",
                compact ? "w-8 justify-center" : "px-3.5"
              )}
            >
              {slash
                ? <Zap className="size-3.5" strokeWidth={2} />
                : asking
                ? <Sparkles className="size-3.5" strokeWidth={2} />
                : <Send className="size-3.5" strokeWidth={2} />}
              {compact ? null : slash ? slash.command.label : asking ? "Vraag Insyte" : "Versturen"}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

function ComposerIcon({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
    >
      {icon}
    </button>
  )
}

/** The three ways into the app, in the brand's ink so they read as the composer's own. */
function AppButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 items-center gap-1 rounded-md px-1.5 font-medium text-arc-ink text-sm transition-colors hover:bg-arc-tint"
    >
      {children}
    </button>
  )
}
