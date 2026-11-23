import type { ReactNode } from "react"
import { cx } from "./cx.ts"
import { AlertTriangle, CheckCircle, Info, X, XCircle } from "./icons.tsx"

export type NoticeTone = "info" | "good" | "warn" | "bad"

const SURFACE: Record<NoticeTone, string> = {
  info: "bg-well",
  good: "bg-good-tint",
  warn: "bg-warn-tint",
  bad: "bg-bad-tint"
}
const SIGN: Record<NoticeTone, { readonly glyph: typeof Info; readonly ink: string; readonly word: string }> = {
  info: { glyph: Info, ink: "text-ink-2", word: "Let op" },
  good: { glyph: CheckCircle, ink: "text-good-ink", word: "Gelukt" },
  warn: { glyph: AlertTriangle, ink: "text-warn-ink", word: "Waarschuwing" },
  bad: { glyph: XCircle, ink: "text-bad-ink", word: "Fout" }
}

/**
 * An inline message in the page, beside what it is about: a store that lost its connection, a limit
 * almost reached, a form that did not save. The whole field takes the tint (no coloured edge), the
 * sign carries the tone with the word for screen readers, and the action says how to recover.
 */
export function Notice({ tone = "info", title, children, action, onDismiss, className }: {
  readonly tone?: NoticeTone
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  readonly onDismiss?: () => void
  readonly className?: string
}) {
  const sign = SIGN[tone]
  const G = sign.glyph
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-md px-3.5 py-3", SURFACE[tone], className)}
    >
      <G size={16} className={cx("mt-px shrink-0", sign.ink)} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium text-ink">
          <span className="sr-only">{sign.word}:</span>
          {title}
        </p>
        {children !== undefined && <div className="text-sm text-pretty text-ink-2">{children}</div>}
        {action !== undefined && <div className="flex flex-wrap gap-2 pt-1.5">{action}</div>}
      </div>
      {onDismiss !== undefined && (
        <button
          type="button"
          aria-label="Bericht sluiten"
          onClick={onDismiss}
          className="-mt-1 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-canvas/60 hover:text-ink"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
