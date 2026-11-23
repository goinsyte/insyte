import { useId, useRef, useState } from "react"
import type { DragEvent } from "react"
import { cx } from "./cx.ts"
import { AlertTriangle, FileText, RotateCcw, Upload, X } from "./icons.tsx"

/**
 * A place to drop files: evidence for a chargeback, a supplier's price list, a product photo. A
 * dashed hairline (the one dashed border in the system: it says "this is a gap you fill"), the
 * glyph and two lines: what to do and what is accepted. It lights in the accent while a file is
 * dragged over it, and is a real button for the keyboard and for phones.
 */
export function FileDrop({ onFiles, accept, hint, label = "Sleep bestanden hierheen of kies ze", disabled, invalid }: {
  readonly onFiles: (files: ReadonlyArray<File>) => void
  /** The `accept` attribute: ".pdf,.png,.jpg". */
  readonly accept?: string
  /** What is accepted, in words: "PDF, PNG of JPG, tot 10 MB". */
  readonly hint?: string
  readonly label?: string
  readonly disabled?: boolean
  readonly invalid?: string
}) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const drop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setOver(false)
    if (disabled === true) return
    onFiles(Array.from(event.dataTransfer.files))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cx(
          "flex w-full flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-55",
          over
            ? "border-accent bg-accent-tint"
            : invalid !== undefined
            ? "border-bad-ink bg-canvas hover:bg-hover"
            : "border-line-strong bg-canvas hover:border-ink-4 hover:bg-hover"
        )}
      >
        <span
          className={cx(
            "inline-flex size-9 items-center justify-center rounded-full",
            over ? "bg-canvas text-accent-ink" : "bg-well text-ink-3"
          )}
        >
          <Upload size={17} />
        </span>
        <span className="text-sm font-medium text-ink">{over ? "Loslaten om toe te voegen" : label}</span>
        {hint !== undefined && <span id={`${id}-hint`} className="text-xs text-ink-3">{hint}</span>}
      </button>
      {invalid !== undefined && (
        <p className="flex items-center gap-1.5 text-xs text-bad-ink">
          <AlertTriangle size={13} />
          {invalid}
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
    </div>
  )
}

export type FileState = { readonly kind: "uploading"; readonly progress: number } | { readonly kind: "done" } | {
  readonly kind: "failed"
  readonly reason: string
}

const size = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} kB`

/** One file in an upload list: its name and size, then its progress, a tick, or why it failed and a retry. */
export function FileRow({ name, bytes, state, onRemove, onRetry }: {
  readonly name: string
  readonly bytes: number
  readonly state: FileState
  readonly onRemove?: () => void
  readonly onRetry?: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-canvas px-3 py-2 ring-1 ring-line">
      <FileText size={16} className={state.kind === "failed" ? "shrink-0 text-bad-ink" : "shrink-0 text-ink-3"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-baseline gap-2 text-sm">
          <span className="truncate text-ink">{name}</span>
          <span className="figure shrink-0 text-2xs text-ink-3">{size(bytes)}</span>
        </p>
        {state.kind === "uploading" && (
          <span
            role="progressbar"
            aria-label={`${name} uploaden`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.progress * 100)}
            className="relative h-1 overflow-hidden rounded-full bg-well"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{ width: `${state.progress * 100}%` }}
            />
          </span>
        )}
        {state.kind === "failed" && <span className="text-xs text-bad-ink">{state.reason}</span>}
        {state.kind === "done" && <span className="text-xs text-good-ink">Toegevoegd</span>}
      </div>
      {state.kind === "failed" && onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          aria-label={`${name} opnieuw proberen`}
          className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
        >
          <RotateCcw size={15} />
        </button>
      )}
      {onRemove !== undefined && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${name} weghalen`}
          className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
