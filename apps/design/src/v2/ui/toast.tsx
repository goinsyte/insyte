import { useEffect, useRef, useSyncExternalStore } from "react"
import { cx } from "./cx.ts"
import { AlertTriangle, CheckCircle, Info, X } from "./icons.tsx"

/**
 * A toast: a sentence about something that just happened somewhere you are not looking ("Label VIP
 * toegevoegd aan 3 bestellingen"), with its one way back ("Ongedaan maken"). It leaves by itself
 * after a few seconds, waits while the pointer is on it, and is read out politely. Never for an
 * error that needs fixing: that stays in the page, beside what is wrong, as a `Notice`.
 *
 * `toast()` can be called from anywhere; `Toaster` (once, in the shell) draws them.
 */

export type ToastTone = "neutral" | "good" | "bad"

export type ToastData = {
  readonly id: number
  readonly title: string
  readonly body?: string
  readonly tone: ToastTone
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly duration: number
}

let items: ReadonlyArray<ToastData> = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

export function toast(input: {
  readonly title: string
  readonly body?: string
  readonly tone?: ToastTone
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly duration?: number
}): number {
  const id = next++
  const item: ToastData = { ...input, tone: input.tone ?? "neutral", duration: input.duration ?? 5000, id }
  items = [...items, item].slice(-3)
  emit()
  return id
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id)
  emit()
}

const ICON = { neutral: Info, good: CheckCircle, bad: AlertTriangle } as const
const ICON_TONE = { neutral: "text-ink-3", good: "text-good-ink", bad: "text-bad-ink" } as const

/** One toast's surface, for the kit and for `Toaster`. */
export function ToastView(
  { item, onDismiss }: { readonly item: Omit<ToastData, "id" | "duration">; readonly onDismiss?: () => void }
) {
  const G = ICON[item.tone]
  return (
    <div className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-md bg-canvas p-3 pr-2 shadow-pop ring-1 ring-line">
      <G size={16} className={cx("mt-0.5 shrink-0", ICON_TONE[item.tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium text-ink">{item.title}</p>
        {item.body !== undefined && <p className="text-xs text-pretty text-ink-2">{item.body}</p>}
      </div>
      {item.action !== undefined && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick()
            onDismiss?.()
          }}
          className="h-7 shrink-0 rounded-sm px-2 text-xs font-medium text-ink underline underline-offset-2 hover:bg-hover"
        >
          {item.action.label}
        </button>
      )}
      {onDismiss !== undefined && (
        <button
          type="button"
          aria-label="Melding sluiten"
          onClick={onDismiss}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}

function Timed({ item }: { readonly item: ToastData }) {
  const timer = useRef<number | undefined>(undefined)
  const start = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => dismissToast(item.id), item.duration)
  }
  // Started once per toast; the pointer on it pauses, leaving restarts.
  useEffect(() => {
    timer.current = window.setTimeout(() => dismissToast(item.id), item.duration)
    return () => window.clearTimeout(timer.current)
  }, [item.id, item.duration])
  return (
    <li onPointerEnter={() => window.clearTimeout(timer.current)} onPointerLeave={start} className="flex justify-end">
      <ToastView
        item={item}
        onDismiss={() =>
          dismissToast(item.id)}
      />
    </li>
  )
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items)
  return (
    <ol
      aria-live="polite"
      aria-label="Meldingen"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      {list.map((item) => <Timed key={item.id} item={item} />)}
    </ol>
  )
}
