import { ASSISTANT } from "../assistant.ts"
import { cx } from "../ui/cx.ts"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import type { Note } from "./types.ts"

export type KeyLabels = { readonly current: string; readonly compare: string }

const KEY_LABELS: KeyLabels = { current: "Deze periode", compare: "Periode ervoor" }

export type KeyMark = "line" | "bar" | "rank"

/**
 * The key, written once for the whole system, and only about periods: this one and the one before.
 * Each swatch is drawn as the mark it explains: a line for a line chart, a block for bars, the thin
 * tick on a ranked bar for the period before. Upright bars draw no period-before mark (their tooltip
 * says it), so their key says where to find it. When a chart has a focused item, its bar is the
 * accent and the key's swatch follows, so the key never shows a colour the chart does not.
 */
export function Key({ compare, labels = KEY_LABELS, mark = "line", focus = false }: {
  readonly compare?: boolean
  /** The chart has a focused item (its bar in the accent): the swatch is drawn in the accent too. */
  readonly focus?: boolean
  /** What "now" and "before" are called where the period is not a week (Live: today against last week). */
  readonly labels?: KeyLabels
  readonly mark?: KeyMark
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-3">
      <li className="flex items-center gap-1.5">
        {mark === "line"
          ? (
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke="var(--color-series-1)" strokeWidth="2" />
            </svg>
          )
          : <span className={cx("size-2 rounded-[2px]", focus ? "bg-accent" : "bg-series-2")} aria-hidden="true" />}
        {labels.current}
      </li>
      {compare === true && (
        <li className="flex items-center gap-1.5">
          {mark === "rank"
            ? <span className="h-3 w-0.5 bg-ink-2" aria-hidden="true" />
            : mark === "line"
            ? (
              <svg width="14" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="14"
                  y2="3"
                  stroke="var(--color-compare)"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
              </svg>
            )
            : null}
          {mark === "bar" ? `${labels.compare} bij aanwijzen` : labels.compare}
        </li>
      )}
    </ul>
  )
}

/** What Magnus found, under the chart it is about, marked with its mark. */
export function NoteLine({ note, onAsk }: { readonly note: Note; readonly onAsk?: () => void }) {
  return (
    <p className="flex items-start gap-2 text-xs text-ink-2">
      <span className="mt-px">
        <MagnusMark size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{ASSISTANT}:</span>
        {note.text}
        {onAsk !== undefined && (
          <>
            {" "}
            <button type="button" onClick={onAsk} className="font-medium whitespace-nowrap text-ai-ink hover:underline">
              Vraag door
            </button>
          </>
        )}
      </span>
    </p>
  )
}

/** The pin on the data point a note is about: a small Magnus mark on a white disc. */
export function NotePin({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g transform={`translate(${x - 8} ${y - 8})`} aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="var(--color-canvas)" />
      <svg x="1" y="1" width="14" height="14" viewBox="0 0 24 24" overflow="visible">
        <MagnusPetals />
      </svg>
    </g>
  )
}

function MagnusPetals() {
  const fills = ["coral", "amber", "sky", "violet", "magenta"] as const
  return (
    <>
      {fills.map((name, i) => (
        <ellipse
          key={name}
          cx="12"
          cy="6.6"
          rx="4.1"
          ry="5.6"
          fill={`var(--color-ai-${name})`}
          opacity="0.9"
          transform={`rotate(${i * 72} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="1.9" fill="white" />
    </>
  )
}
