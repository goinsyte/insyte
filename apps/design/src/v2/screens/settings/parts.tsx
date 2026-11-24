import { useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Check, Copy } from "../../ui/icons.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import type { PageWidth } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import type { PermArea, Staat } from "../../view.ts"

/*
 * What every settings page shares: the frame that draws loading, error and a missing permission the
 * same way on all of them; a small store so a saved setting survives leaving the page (the screen is
 * remounted per address); a draft that a section's Opslaan commits; and the copy button for values
 * people paste elsewhere.
 */

/* ── a store for what was saved ─────────────────────────────────────────────────────────────────── */

const saved = new Map<string, unknown>()
const listeners = new Set<() => void>()
let version = 0
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const snapshot = () => version

/**
 * A value that outlives the page: the saved form of a setting, kept per view state so "leeg" and
 * "druk" start from their own data. `useSaved("retouren", seed)` returns it and a setter.
 */
export function useSaved<T>(key: string, seed: T): readonly [T, (next: T | ((prev: T) => T)) => void] {
  const { staat } = useView()
  useSyncExternalStore(subscribe, snapshot)
  const id = `${staat}:${key}`
  const value = (saved.has(id) ? saved.get(id) : seed) as T
  const set = (next: T | ((prev: T) => T)) => {
    const prev = (saved.has(id) ? saved.get(id) : seed) as T
    saved.set(id, typeof next === "function" ? (next as (p: T) => T)(prev) : next)
    version += 1
    for (const fn of listeners) fn()
  }
  return [value, set] as const
}

/** Read what a page saved, outside it (the overview, a menu count). */
export function readSaved<T>(staat: Staat, key: string, seed: T): T {
  const id = `${staat}:${key}`
  return (saved.has(id) ? saved.get(id) : seed) as T
}

/**
 * A section's edits before Opslaan: the draft, whether it differs from what is saved, and the two
 * ways out. `save` takes an optional check that returns an error sentence to stop on.
 */
export function useDraft<T>(key: string, seed: T) {
  const [value, setValue] = useSaved(key, seed)
  const [draft, setDraft] = useState<T>(value)
  const dirty = JSON.stringify(draft) !== JSON.stringify(value)
  const patch = (next: Partial<T>) => setDraft((d) => ({ ...d, ...next }))
  return {
    draft,
    saved: value,
    dirty,
    set: setDraft,
    patch,
    reset: () => setDraft(value),
    commit: (next: T = draft) => {
      setValue(next)
      setDraft(next)
    }
  }
}

/* ── the frame ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * A settings page: its head, then the page, or in its place what the view state and the role say.
 * `area` is the permission it reads (`null` for a page about yourself: meldingen, sneltoetsen);
 * below Bekijken it is refused, below Bewerken it reads with the "Alleen lezen" line on top.
 */
export function SettingsPage({ title, meta, actions, area, width = "text", what, readOnlyNote = true, children }: {
  readonly title: string
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly area: PermArea | null
  readonly width?: PageWidth
  /** What the page holds, for the refusal: "de facturatie". */
  readonly what?: string
  /** Pages that only list and link can leave the line off. */
  readonly readOnlyNote?: boolean
  readonly children: ReactNode
}) {
  const view = useView()
  const state = dataState(view)
  const access = useAccess(area ?? "settings")
  const allowed = area === null || access.view
  const head = (
    <PageHead
      title={title}
      meta={meta}
      actions={allowed && state !== "loading" && state !== "error" ? actions : undefined}
    />
  )
  if (!allowed && area !== null) {
    return (
      <Page width={width}>
        {head}
        <Denied area={area} what={what} />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width={width}>
        {head}
        <div aria-busy="true" aria-label={`${title} laden`} className="flex flex-col gap-6">
          {[0, 1].map((n) => (
            <div key={n} className="flex flex-col gap-4 rounded-lg bg-well/60 px-5 py-5">
              <Skeleton className="h-3.5 w-40" />
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center justify-between gap-6">
                  <span className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2.5 w-2/3" />
                  </span>
                  <Skeleton className="h-8 w-28 rounded-sm" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width={width}>
        {head}
        <ErrorState
          title={`${title} laden lukte niet`}
          detail="GET /settings · 503 · req_7c2e91"
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          De verbinding met de server viel weg. Er is niets gewijzigd; probeer het zo nog eens.
        </ErrorState>
      </Page>
    )
  }
  return (
    <Page width={width}>
      {head}
      {area !== null && !access.edit && readOnlyNote && <ReadOnlyNotice area={area} />}
      {children}
    </Page>
  )
}

/** A section's foot: Negeren and Opslaan, quiet until something changed. */
export function SaveBar({ dirty, onSave, onReset, disabled = false, label = "Opslaan" }: {
  readonly dirty: boolean
  readonly onSave: () => void
  readonly onReset: () => void
  readonly disabled?: boolean
  readonly label?: string
}) {
  if (disabled) return null
  return (
    <>
      {dirty && <span className="mr-auto text-xs text-ink-3">Niet opgeslagen</span>}
      {dirty && <Button size="sm" variant="ghost" onClick={onReset}>Negeren</Button>}
      <Button size="sm" variant="primary" disabled={!dirty} onClick={onSave}>{label}</Button>
    </>
  )
}

/**
 * For a page that is one matrix of choices (zelfstandigheid, a role, meldingen): a bar that stays at
 * the foot of the pane while something is unsaved.
 */
export function UnsavedBar({ dirty, onSave, onReset, note }: {
  readonly dirty: boolean
  readonly onSave: () => void
  readonly onReset: () => void
  readonly note?: string
}) {
  if (!dirty) return null
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-ink px-4 py-2.5 text-on-ink shadow-pop">
      <span className="text-sm">
        Je hebt niet-opgeslagen wijzigingen{note === undefined ? "" : `: ${note}`}
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-8 items-center rounded-sm px-2.5 text-sm font-medium text-on-ink/80 hover:text-on-ink pointer-coarse:min-h-11"
        >
          Negeren
        </button>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex h-8 items-center rounded-sm bg-canvas px-3 text-sm font-medium text-ink hover:bg-well pointer-coarse:min-h-11"
        >
          Wijzigingen opslaan
        </button>
      </span>
    </div>
  )
}

/** A value with a button that copies it: a link, a DNS record, a variable. */
export function CopyValue({ value, label, shown, className }: {
  readonly value: string
  readonly label: string
  /** What to show when it differs from what is copied (a cut-short key). */
  readonly shown?: string
  readonly className?: string
}) {
  const [done, setDone] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(value).catch(() => undefined)
    setDone(true)
    toast({ title: `${label} gekopieerd`, tone: "good" })
    window.setTimeout(() => setDone(false), 1600)
  }
  return (
    <span className={cx("flex min-w-0 items-center gap-1", className)}>
      <span className="min-w-0 truncate text-sm text-ink-2" title={value}>{shown ?? value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`${label} kopiëren`}
        title={`${label} kopiëren`}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
      >
        {done ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  )
}

/** "€ 38,40", "€ 120": euros as the rest of `/v2` writes them. */
export function money(n: number, cents = n % 1 !== 0): string {
  return `€ ${
    n.toLocaleString("nl-NL", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  }`
}

export const figure = (n: number) => n.toLocaleString("nl-NL")
