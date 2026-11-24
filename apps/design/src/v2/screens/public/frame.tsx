import type { ReactNode } from "react"
import { cx } from "../../ui/cx.ts"
import { ArrowLeft } from "../../ui/icons.tsx"
import { Skeleton, SkeletonText } from "../../ui/skeleton.tsx"

/*
 * The frame of a page opened from a link by someone outside the workspace: a shopper returning a
 * parcel, a supplier sending a quality check. It is the store's page, not Insyte's: the store's name
 * at the top, one column of one task, and only "Mogelijk gemaakt door Insyte" at the foot. No rail,
 * no dark half: nothing here is the product's chrome.
 */
export function PublicFrame({ brand, wide = false, children }: {
  readonly brand: string
  readonly wide?: boolean
  readonly children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-16 shrink-0 items-center justify-center px-4">
        <span className="text-lg font-semibold tracking-tight">{brand}</span>
      </header>
      <main
        className={cx(
          "mx-auto flex w-full flex-1 flex-col px-4 pt-4 pb-12 sm:pt-10",
          wide ? "max-w-[560px]" : "max-w-[480px]"
        )}
      >
        {children}
      </main>
      <footer className="flex justify-center px-4 pb-6 text-xs text-ink-3">Mogelijk gemaakt door Insyte</footer>
    </div>
  )
}

/** One step: rises in when it changes. */
export function Step({ stepKey, children }: { readonly stepKey: string; readonly children: ReactNode }) {
  return <section key={stepKey} className="flex animate-rise flex-col gap-5">{children}</section>
}

export function Title({ children, sub }: { readonly children: ReactNode; readonly sub?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold text-balance text-ink">{children}</h1>
      {sub !== undefined && <p className="text-sm text-pretty text-ink-2">{sub}</p>}
    </header>
  )
}

export function BackButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 inline-flex min-h-8 items-center gap-1 self-start rounded-sm px-2 text-sm font-medium text-ink-2 hover:bg-hover hover:text-ink pointer-coarse:min-h-11"
    >
      <ArrowLeft size={15} />
      Terug
    </button>
  )
}

/** A big choice on the well: a title, a line, the accent's tint when it is the one. */
export function ChoiceButton({ title, body, meta, on, disabled, onClick, role }: {
  readonly title: string
  readonly body?: ReactNode
  readonly meta?: ReactNode
  readonly on?: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly role?: "radio" | "checkbox"
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === undefined ? undefined : on === true}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex min-h-12 w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors",
        on === true ? "bg-accent-tint" : "bg-well",
        disabled === true ? "cursor-not-allowed" : on === true ? "" : "hover:bg-hover"
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx("text-sm font-medium", disabled === true ? "text-ink-3" : "text-ink")}>{title}</span>
        {body !== undefined && <span className="text-sm text-pretty text-ink-2">{body}</span>}
      </span>
      {meta}
    </button>
  )
}

/** Term and value, in the summary. */
export function Row({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm text-ink-3 sm:w-32">{term}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  )
}

/** The shape of a lookup while it loads. */
export function LoadingStep() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Laden">
      <Skeleton className="h-6 w-2/3" />
      <SkeletonText lines={2} />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export const dayMonth = (d: Date) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(d)
export const weekdayDayMonth = (d: Date) =>
  new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(d)
export const clock = (d: Date) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(d)
export const pause = (ms = 650) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim())
