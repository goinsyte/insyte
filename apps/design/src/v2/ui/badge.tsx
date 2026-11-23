import type { ReactNode } from "react"
import { cx } from "./cx.ts"
import { X } from "./icons.tsx"

/** A count beside a menu row: quiet figures, no pill. */
export function Count({ children }: { readonly children: ReactNode }) {
  return <span className="figure ml-auto text-2xs text-ink-3">{children}</span>
}

/** An unread count on a rail glyph: the only red pill in the shell, and only for what waits on you. */
export function Alert({ count }: { readonly count: number }) {
  return (
    <span
      className="figure absolute -top-1 -right-1.5 min-w-4 rounded-full bg-bad-ink px-1 text-center text-2xs leading-4 font-medium text-rail-fg ring-2 ring-rail"
      aria-hidden="true"
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

export type Tone = "neutral" | "accent" | "good" | "warn" | "bad"

const TONE: Record<Tone, string> = {
  neutral: "bg-well text-ink-2",
  accent: "bg-accent-tint text-accent-ink",
  good: "bg-good-tint text-good-ink",
  warn: "bg-warn-tint text-warn-ink",
  bad: "bg-bad-tint text-bad-ink"
}

/**
 * A short status in words, on its tint: the badge of the system. Colour never stands alone: the word
 * is the signal. `accent` is for what is new or selected, the signals for a judgement.
 */
export function Tag({ tone = "neutral", children, className }: {
  readonly tone?: Tone
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-xs px-1.5 text-2xs font-medium whitespace-nowrap [&_svg]:size-3",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-4",
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad"
}

/**
 * A record's state in a table or a head: a dot and the word, no tint, so a column of forty statuses
 * stays quiet and the odd one out still shows. Use `Tag` where the status must stand out on its own.
 */
export function Status({ tone = "neutral", children }: { readonly tone?: Tone; readonly children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-2">
      <span className={cx("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * A label a person put on a record (VIP, Cadeau, Retour gestart): a hairline box in neutral ink,
 * never a colour, because labels are the operator's own words and carry no judgement. Removable
 * where it can be edited.
 */
export function RecordLabel({ children, onRemove }: { readonly children: string; readonly onRemove?: () => void }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-xs pr-1 pl-2 text-xs whitespace-nowrap text-ink-2 ring-1 ring-line-strong ring-inset">
      {children}
      {onRemove === undefined ? <span className="w-1" /> : (
        <button
          type="button"
          aria-label={`Label ${children} weghalen`}
          onClick={onRemove}
          className="inline-flex size-4 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X size={11} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}
