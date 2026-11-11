import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"
import { ChevronDown } from "../../icons"
import { cn } from "../lib/utils"

/**
 * The settings form kit: one label, one input, one select, for every settings screen.
 *
 * It exists because the sign-in screen and the settings screens were drawing the same control two
 * different ways — sign-in at 14px in a 44px control with a real focus halo, settings at 13px in a
 * 32px control with a 2px tint ring — and the sign-in one is the one that reads. Settings keeps the
 * tighter height a dense screen needs and takes everything else from sign-in: the type size, the
 * filled well, the ring.
 *
 * The label moved from `font-normal text-ink` to `font-medium text-xs text-ink-2`. A label is not
 * body text; it is a name for the thing under it, and at 12px the weight is what keeps it readable
 * rather than the colour.
 */

export const INPUT_CLASS =
  "field h-9 w-full rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper"

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  /** One clause under the control, for a rule the label cannot carry. Rare. */
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-medium text-xs text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  )
}

/**
 * A field set beside its label rather than under it, the way a settings page is read: down the
 * labels, then across to the one being changed. The control stops at 380px, because a VAT number in
 * a 900px well is a well that says nothing about what goes in it.
 */
export function FieldRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="grid grid-cols-1 items-start gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[200px_minmax(0,380px)]">
      <span className="flex flex-col gap-0.5 sm:pt-2">
        <span className="font-medium text-sm text-ink">{label}</span>
        {hint ? <span className="text-sm text-ink-2">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  type?: "text" | "email" | "url" | "tel"
  placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
    />
  )
}

export function SelectInput({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  /** A plain string is its own label; a pair shows `label` and stores `value`. */
  options: ReadonlyArray<string | { value: string; label: string }>
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLASS, "appearance-none pr-8")}
      >
        {options.map((o) => {
          const { value: v, label } = typeof o === "string" ? { value: o, label: o } : o
          return (
            <option key={v} value={v}>
              {label}
            </option>
          )
        })}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3"
        strokeWidth={1.75}
      />
    </span>
  )
}

/**
 * The primary action on a settings section. One button, one place, so "Save changes" is not drawn
 * five slightly different ways down one page.
 */
export function SaveButton({
  dirty,
  onSave,
  label = "Wijzigingen opslaan"
}: {
  dirty: boolean
  onSave: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      disabled={!dirty}
      onClick={onSave}
      className="flex h-8 items-center rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
    >
      {label}
    </button>
  )
}

/**
 * Unsaved changes, said once at the foot of the page the moment there are any, with both ways out.
 * It replaces a Save button that sat disabled at the bottom of every form, saying nothing.
 */
export function UnsavedBar({
  visible,
  onDiscard,
  onSave
}: {
  visible: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  const still = useReducedMotion()
  return (
    <AnimatePresence>
      {visible ?
        (
          <motion.div
            initial={still ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            className="sticky bottom-4 z-10 flex items-center gap-3 self-start rounded-lg bg-abyss py-2 pr-2 pl-4 text-mesh-ink shadow-[0_12px_32px_-12px_color-mix(in_oklch,var(--abyss)_60%,transparent)]"
            role="status"
          >
            <span className="text-base">Je hebt niet-opgeslagen wijzigingen</span>
            <button
              type="button"
              onClick={onDiscard}
              className="flex h-8 items-center rounded-md px-3 font-medium text-sm text-mesh-ink-2 transition-colors hover:bg-mesh-ink/10 hover:text-mesh-ink"
            >
              Negeren
            </button>
            <button
              type="button"
              onClick={onSave}
              className="flex h-8 items-center rounded-md bg-mesh-ink px-3 font-medium text-abyss text-sm transition-colors hover:bg-paper"
            >
              Wijzigingen opslaan
            </button>
          </motion.div>
        ) :
        null}
    </AnimatePresence>
  )
}
