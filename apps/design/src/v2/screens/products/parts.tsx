import { useEffect, useRef, useState } from "react"
import type { ComponentProps, KeyboardEvent } from "react"
import type { Silhouette } from "../../fixtures/products.ts"
import { cx } from "../../ui/cx.ts"
import { TableSkeleton as SharedTableSkeleton } from "../../ui/data.tsx"

/* The shared record states (`ui/data.tsx`) and side column (`ui/page.tsx`), as this area uses them. */

export { Figures, LoadError as PageError, RecordSkeleton } from "../../ui/data.tsx"
export { Side } from "../../ui/page.tsx"

/** The area's tables open with a person or a product: a round mark before the name. */
export function TableSkeleton(props: ComponentProps<typeof SharedTableSkeleton>) {
  return <SharedTableSkeleton avatar {...props} />
}

/* ── a photograph's stand-in ───────────────────────────────────────────────────────────────────── */

const SHAPE: Readonly<Record<Silhouette, string>> = {
  top: "M24 12 L14 16 L6 27 L14 33 L19 29 V56 H45 V29 L50 33 L58 27 L50 16 L40 12 Q32 20 24 12 Z",
  pant: "M20 8 H44 L48 58 H36 L32 26 L28 58 H16 Z",
  hat: "M14 42 Q14 14 32 14 Q50 14 50 42 Z M10 42 H54 V48 H10 Z",
  belt: "M6 28 H40 V36 H6 Z M48 28 H58 V36 H48 Z M40 25 H48 V39 H40 Z",
  bag: "M14 24 H50 L46 56 H18 Z M25 24 V19 Q32 9 39 19 V24",
  shoe: "M8 44 Q10 36 22 36 L34 30 Q40 40 56 42 V50 H8 Z"
}

/**
 * What a product photograph shows, drawn: the kind of thing on the well, turned and cropped per
 * view, so a gallery of a fleece reads as one and a belt as another. Shopify holds the real images.
 */
export function ProductArt({ shape, view, className }: {
  readonly shape: Silhouette
  /** Which photo of the set: each one is framed a little differently. */
  readonly view: number
  readonly className?: string
}) {
  const scale = [1, 0.9, 1.5, 1.25, 0.8][view % 5] ?? 1
  const shift = [0, 0, -8, 6, 0][view % 5] ?? 0
  const flip = view % 2 === 1
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cx("text-ink-3", className)}>
      <g
        transform={`translate(32 ${32 + shift}) scale(${flip ? -scale : scale} ${scale}) translate(-32 -32)`}
        fill="currentColor"
        fillOpacity={0.14}
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth={1.25}
        strokeLinejoin="round"
      >
        <path d={SHAPE[shape]} />
      </g>
    </svg>
  )
}

/* ── a value that is its own field ─────────────────────────────────────────────────────────────── */

/**
 * A value that is also its field (`/app`'s product page): read, it is the text with a dotted rule
 * under it; clicked, an input of the same size in the same place. Enter or leaving keeps the change,
 * Escape drops it. Read-only, it is the text and nothing to click.
 */
export function InlineText({ value, onChange, label, multiline = false, placeholder, readOnly = false, className }: {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly label: string
  readonly multiline?: boolean
  readonly placeholder?: string
  readonly readOnly?: boolean
  readonly className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (text !== value) onChange(text)
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      setText(value)
      setEditing(false)
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
    }
  }
  const shown = value === "" ? placeholder : value

  if (readOnly) return <span className={cx(value === "" && "text-ink-3", className)}>{shown}</span>
  if (editing) {
    const cls = cx(
      "w-full rounded-sm bg-canvas px-1.5 py-0.5 text-ink outline-none ring-2 ring-accent ring-inset",
      className
    )
    return multiline
      ? (
        <textarea
          ref={ref}
          aria-label={label}
          value={text}
          rows={5}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={keys}
          className={cx(cls, "resize-y")}
        />
      )
      : (
        <input
          ref={ref}
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={keys}
          className={cls}
        />
      )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={`${label} bewerken`}
      className={cx(
        "-mx-1 cursor-text rounded-sm px-1 text-left underline decoration-line-strong decoration-dotted underline-offset-4",
        "hover:bg-hover hover:decoration-accent",
        value === "" && "text-ink-3",
        className
      )}
    >
      {shown}
    </button>
  )
}
