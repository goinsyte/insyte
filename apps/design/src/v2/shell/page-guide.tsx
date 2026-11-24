import { useEffect, useId, useRef, useState } from "react"
import { useRoute } from "../router.tsx"
import { Button } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { Compass, X } from "../ui/icons.tsx"
import { guideFor } from "./guides.ts"
import type { Guide } from "./guides.ts"
import { useShellState } from "./shell-state.ts"

/*
 * The page's explanation, kept off the page: a small card that rises bottom right with a few short
 * steps, and folds back into a round button that stays, so the explanation is one click away and never
 * in the way. It rises on its own sparingly: once per page ever, at most one page per browser session,
 * and only after someone has stayed on the page a moment. Clicking through the app is never a string
 * of popups; the button is always there.
 */

const SEEN_KEY = "insyte:v2:guides"
const SESSION_KEY = "insyte:v2:guides:auto"
const RISE_MS = 1600

function seen(): ReadonlyArray<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    return raw === null ? [] : (JSON.parse(raw) as ReadonlyArray<string>)
  } catch {
    return []
  }
}

function markSeen(id: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen().filter((x) => x !== id), id]))
  } catch {
    // Not remembered: it may rise once more another day.
  }
}

/** Whether a guide already rose this session; no storage fails closed, so it never rises on its own. */
function autoShown(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1"
  } catch {
    return true
  }
}

function markAutoShown() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1")
  } catch {
    // The check above fails closed.
  }
}

export function PageGuide() {
  const { route } = useRoute()
  const { drawer } = useShellState()
  const guide = guideFor(route)
  // Magnus beside the work has the bottom right corner for his composer.
  if (guide === null || drawer) return null
  return <GuideCard key={guide.id} guide={guide} />
}

function GuideCard({ guide }: { readonly guide: Guide }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const launcher = useRef<HTMLButtonElement>(null)
  const heading = useId()
  const current = guide.steps[step] ?? guide.steps[0]
  const last = step === guide.steps.length - 1

  useEffect(() => {
    if (seen().includes(guide.id) || autoShown()) return
    const timer = window.setTimeout(() => {
      // Not over a dialog or the palette the person just opened.
      if (autoShown() || document.querySelector("dialog[open]") !== null) return
      markAutoShown()
      markSeen(guide.id)
      setOpen(true)
    }, RISE_MS)
    return () => window.clearTimeout(timer)
  }, [guide.id])

  const close = () => {
    setOpen(false)
    setStep(0)
    markSeen(guide.id)
    window.requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true }))
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  if (current === undefined) return null

  return open
    ? (
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby={heading}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !last) setStep(step + 1)
          if (event.key === "ArrowLeft" && step > 0) setStep(step - 1)
        }}
        className="fixed right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex w-[min(22rem,calc(100vw-1.5rem))] animate-rise flex-col gap-4 rounded-lg bg-canvas p-5 shadow-pop ring-1 ring-line sm:right-4"
      >
        <div className="flex items-start gap-3">
          <Compass size={18} className="mt-0.5 shrink-0 text-ink-3" />
          <div key={step} className="flex min-w-0 flex-1 animate-rise flex-col gap-1.5">
            <p className="text-2xs text-ink-3">{guide.title}</p>
            <h2 id={heading} className="text-base font-semibold text-balance text-ink">{current.title}</h2>
            <p className="text-sm text-pretty text-ink-2">{current.body}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Uitleg sluiten"
            className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex items-center gap-3 pl-[30px]">
          {guide.steps.length > 1 && (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Stappen">
              {guide.steps.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  role="tab"
                  aria-selected={i === step}
                  aria-label={`Stap ${i + 1} van ${guide.steps.length}`}
                  onClick={() => setStep(i)}
                  className="flex h-4 items-center"
                >
                  <span
                    className={cx(
                      "block h-1.5 rounded-full transition-[width,background-color] duration-300",
                      i === step ? "w-4.5 bg-ink" : "w-1.5 bg-line-strong hover:bg-ink-4"
                    )}
                  />
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? "Begrepen" : "Volgende"}
          </Button>
        </div>
      </div>
    )
    : (
      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Uitleg: ${guide.title}`}
        title="Uitleg bij deze pagina"
        className="fixed right-[3.75rem] bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 inline-flex size-10 animate-rise items-center justify-center rounded-full bg-canvas text-ink-2 shadow-pop transition-colors hover:bg-hover hover:text-ink pointer-coarse:size-11 sm:right-[4.25rem] sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <Compass size={18} />
      </button>
    )
}
