import { useState } from "react"
import { ASSISTANT } from "../assistant.ts"
import { DropdownItem, DropdownLabel, DropdownMenu } from "./dropdown.tsx"
import { ChevronDown } from "./icons.tsx"
import { MagnusMark } from "./magnus-mark.tsx"

/*
 * The assistant's small pieces, shared by the chat, an agent's page and the composer: Magnus's disc,
 * the line that says he is working, and the model picker. The gradient and the mark stay fixed in
 * every accent theme: they mean "the assistant", not the workspace's colour.
 */

/** Magnus's disc: the mark on the surface, ringed like a person's avatar. */
export function MagnusAvatar({ size = 28 }: { readonly size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-canvas ring-1 ring-line"
      style={{ width: size, height: size }}
    >
      <MagnusMark size={Math.round(size * 0.72)} />
    </span>
  )
}

/** While Magnus works: the disc breathing, and a line that says so. */
export function Thinking({ label = `${ASSISTANT} leest mee…` }: { readonly label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-3" role="status">
      <span className="animate-pulse motion-reduce:animate-none">
        <MagnusAvatar />
      </span>
      {label}
    </div>
  )
}

/** The models a workspace can choose, with what each is for. */
const MODELS = [
  { id: "sonnet", label: "Claude Sonnet", hint: "standaard" },
  { id: "haiku", label: "Claude Haiku", hint: "snel, goedkoop" },
  { id: "opus", label: "Claude Opus", hint: "lastige vragen" }
] as const

export type ModelId = (typeof MODELS)[number]["id"]

/**
 * Which model answers: a quiet hairline button with the model's name that opens a small menu of the
 * models, each with what it is for. Without `value` it keeps its own choice.
 */
export function ModelButton({ value, onChange }: {
  readonly value?: ModelId
  readonly onChange?: (next: ModelId) => void
}) {
  const [own, setOwn] = useState<ModelId>("sonnet")
  const current = value ?? own
  const model = MODELS.find((m) => m.id === current) ?? MODELS[0]
  return (
    <DropdownMenu
      label="Model"
      placement="bottom-end"
      width="w-64"
      trigger={(props) => (
        <button
          type="button"
          aria-label={`Model: ${model.label}`}
          className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-ink-2 ring-1 ring-line ring-inset hover:bg-hover"
          {...props}
        >
          {model.label}
          <ChevronDown size={12} className="text-ink-3" />
        </button>
      )}
    >
      {(close) => (
        <>
          <DropdownLabel>Welk model antwoordt</DropdownLabel>
          {MODELS.map((m) => (
            <DropdownItem
              key={m.id}
              checked={m.id === current}
              hint={m.hint}
              onSelect={() => {
                setOwn(m.id)
                onChange?.(m.id)
                close()
              }}
            >
              {m.label}
            </DropdownItem>
          ))}
        </>
      )}
    </DropdownMenu>
  )
}
