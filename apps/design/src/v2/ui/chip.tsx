import type { ReactNode } from "react"
import { cx } from "./cx.ts"
import { Check } from "./icons.tsx"

/**
 * A next step you can take with one press: Magnus's follow-ups, a new chat's suggestions. A hairline
 * box, not a pill. Once used it stays, ticked and quiet, so the conversation keeps its history. `hint`
 * says what pressing it leads to ("vraagt eerst": a proposal, nothing happens yet).
 */
export function Chip({ done = false, hint, onClick, children }: {
  readonly done?: boolean
  readonly hint?: string
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={done}
      onClick={onClick}
      className={cx(
        "flex min-h-8 items-center gap-2 rounded-sm px-2.5 py-1 text-left text-sm ring-1 ring-inset transition-colors",
        done ? "text-ink-3 ring-line" : "text-ink ring-line-strong hover:bg-hover"
      )}
    >
      {done && <Check size={14} className="text-ink-3" />}
      {children}
      {hint !== undefined && !done && <span className="text-2xs text-ink-3">· {hint}</span>}
    </button>
  )
}
