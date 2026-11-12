import { useBlocker, useRouter } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Loader } from "../../icons"
import { cn } from "../lib/utils"

/**
 * The settings form kit: one label, one input, one select, for every settings screen.
 *
 * It exists because the sign-in screen and the settings screens were drawing the same control two
 * different ways — sign-in at 14px in a 44px control with a real focus halo, settings at 13px in a
 * 32px control with a 2px tint ring — and the sign-in one is the one that reads. Settings keeps the
 * tighter height a dense screen needs and takes everything else from sign-in: the type size, the
 * filled well, the ring.
 *
 * The label moved from `font-normal text-ink` to `font-medium text-xs text-ink-2`. A label is not
 * body text; it is a name for the thing under it, and at 12px the weight is what keeps it readable
 * rather than the colour.
 */

export const INPUT_CLASS =
  "field h-9 w-full rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper"

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  /** One clause under the control, for a rule the label cannot carry. Rare. */
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-medium text-xs text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  )
}

/**
 * A field set beside its label rather than under it, the way a settings page is read: down the
 * labels, then across to the one being changed. The control stops at 380px, because a VAT number in
 * a 900px well is a well that says nothing about what goes in it.
 */
export function FieldRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="grid grid-cols-1 items-start gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[200px_minmax(0,380px)]">
      <span className="flex flex-col gap-0.5 sm:pt-2">
        <span className="font-medium text-sm text-ink">{label}</span>
        {hint ? <span className="text-sm text-ink-2">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  type?: "text" | "email" | "url" | "tel"
  placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
    />
  )
}

export function SelectInput({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  /** A plain string is its own label; a pair shows `label` and stores `value`. */
  options: ReadonlyArray<string | { value: string; label: string }>
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLASS, "appearance-none pr-8")}
      >
        {options.map((o) => {
          const { value: v, label } = typeof o === "string" ? { value: o, label: o } : o
          return (
            <option key={v} value={v}>
              {label}
            </option>
          )
        })}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3"
        strokeWidth={1.75}
      />
    </span>
  )
}

/**
 * The primary action on a settings section. One button, one place, so "Save changes" is not drawn
 * five slightly different ways down one page.
 */
export function SaveButton({
  dirty,
  onSave,
  label = "Wijzigingen opslaan"
}: {
  dirty: boolean
  onSave: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      disabled={!dirty}
      onClick={onSave}
      className="flex h-8 items-center rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
    >
      {label}
    </button>
  )
}

/** A navigation the bar is holding until the changes are saved or let go. */
type Held = { proceed: () => void; reset: () => void }

/**
 * Unsaved changes, said once at the foot of the page the moment there are any, with both ways out.
 * It replaces a Save button that sat disabled at the bottom of every form, saying nothing.
 *
 * It floats the way the command palette does — paper lifted off the sheet, the shortcut beside the
 * action it runs — because it is the same kind of thing: a command that is waiting for you. `⌘S`
 * (Ctrl+S off a Mac) saves from anywhere on the page. Leaving the page while it is up does not lose
 * the work: the navigation is held, the bar shakes once and asks, and saving or letting go carries
 * on to where you were going; Esc stays. Closing the tab gets the browser's own warning.
 *
 * `onSave` may return a promise, or the screen may say `saving` itself; either way the bar says it
 * is saving, and a held navigation only goes on once the save has landed. A save that fails leaves
 * you where you are, with the screen's own message about why.
 */
export function UnsavedBar({
  visible,
  onDiscard,
  onSave,
  saving: savingOutside = false,
  guard = true
}: {
  visible: boolean
  onDiscard: () => void
  onSave: () => void | Promise<unknown>
  /** A save the screen runs itself is out: the buttons wait for it, as they do for a returned promise. */
  saving?: boolean
  /** Hold a navigation away while there are changes. Off for a bar inside a dialog or a sheet. */
  guard?: boolean
}) {
  const still = useReducedMotion()
  const router = useRouter({ warn: false })
  const mod = useModifierLabel()
  const [pending, setPending] = useState(false)
  const saving = pending || savingOutside
  const [held, setHeld] = useState<Held | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)

  const proceedAfter = useRef<(() => void) | null>(null)

  // Nothing left to hold once the changes are gone, whichever way they went.
  useEffect(() => {
    if (!visible) setHeld(null)
  }, [visible])

  // A held navigation waiting on a save goes on when the changes are gone; a save that did not land keeps asking.
  useEffect(() => {
    const go = proceedAfter.current
    if (go === null || saving) return
    proceedAfter.current = null
    if (!visible) go()
  }, [visible, saving])

  const save = useCallback(
    async (then?: () => void) => {
      if (saving) return
      const out = onSave()
      if (out === undefined || typeof (out as Promise<unknown>).then !== "function") {
        // A save the screen runs itself: go on once the changes are gone, not before it lands.
        proceedAfter.current = then ?? null
        return
      }
      setPending(true)
      try {
        await out
        then?.()
      } catch {
        // The screen says what went wrong; the work and the page both stay.
      } finally {
        setPending(false)
      }
    },
    [onSave, saving]
  )

  const discard = useCallback(
    (then?: () => void) => {
      proceedAfter.current = null
      onDiscard()
      then?.()
    },
    [onDiscard]
  )

  const stay = useCallback(() => {
    proceedAfter.current = null
    held?.reset()
    setHeld(null)
  }, [held])

  /* One shake, sideways, damped — the gesture for "not yet". Reduced motion keeps only the ring. */
  const nudge = useCallback(
    (next: Held) => {
      setHeld(next)
      if (!still) {
        body.current?.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-9px)" },
            { transform: "translateX(8px)" },
            { transform: "translateX(-5px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" }
          ],
          { duration: 420, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" }
        )
      }
      saveButton.current?.focus({ preventScroll: true })
    },
    [still]
  )

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void save(held?.proceed)
      } else if (e.key === "Escape" && held) {
        e.preventDefault()
        stay()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, held, save, stay])

  const asking = held !== null
  return (
    <>
      {guard && router ? <LeaveGuard when={visible && !saving} onHold={nudge} /> : null}
      <AnimatePresence>
        {visible ?
          (
            <motion.div
              initial={still ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={still
                ? { opacity: 0 }
                : {
                  opacity: 0,
                  y: 12,
                  scale: 0.98,
                  filter: "blur(4px)",
                  transition: { duration: 0.16, ease: [0.4, 0, 1, 1] }
                }}
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
              className="pointer-events-none sticky bottom-4 z-20 flex justify-center self-stretch"
            >
              <div
                ref={body}
                role="region"
                aria-label="Niet-opgeslagen wijzigingen"
                data-asking={asking || undefined}
                className="panel-raised pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl py-2 pr-2 pl-4 transition-[box-shadow] duration-200 data-[asking]:shadow-[inset_0_0_0_1px_var(--arc),0_0_0_4px_var(--arc-tint),0_2px_6px_color-mix(in_oklch,black_8%,transparent),0_28px_70px_-24px_color-mix(in_oklch,black_30%,transparent)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="relative flex size-2 shrink-0">
                    {still
                      ? null
                      : (
                        <span className="absolute inset-0 animate-ping rounded-full bg-arc opacity-40 [animation-duration:2.4s]" />
                      )}
                    <span className="relative size-2 rounded-full bg-arc" />
                  </span>
                  <span role="status" aria-live="polite" className="text-base text-ink">
                    {asking ? "Eerst opslaan voordat je verdergaat?" : "Je hebt niet-opgeslagen wijzigingen"}
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {asking ?
                    (
                      <button
                        type="button"
                        onClick={stay}
                        aria-keyshortcuts="Escape"
                        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
                      >
                        Blijven
                        <span aria-hidden>
                          <BarKbd>esc</BarKbd>
                        </span>
                      </button>
                    ) :
                    null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => discard(held?.proceed)}
                    className="flex h-8 items-center rounded-md px-3 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-45"
                  >
                    Negeren
                  </button>
                  <button
                    ref={saveButton}
                    type="button"
                    disabled={saving}
                    aria-busy={saving || undefined}
                    aria-keyshortcuts={mod === "⌘" ? "Meta+S" : "Control+S"}
                    onClick={() => void save(held?.proceed)}
                    className="flex h-8 items-center gap-2 rounded-md bg-abyss pr-1.5 pl-3 font-medium text-mesh-ink text-sm shadow-primary outline-offset-2 transition-colors hover:bg-abyss-2 focus-visible:outline-2 focus-visible:outline-arc disabled:pr-3 disabled:opacity-70"
                  >
                    {saving ?
                      (
                        <>
                          <Loader className="size-3.5 animate-spin" />
                          Opslaan…
                        </>
                      ) :
                      (
                        <>
                          Wijzigingen opslaan
                          <span aria-hidden className="hidden items-center gap-0.5 sm:inline-flex">
                            <BarKbd tone="dark">{mod}</BarKbd>
                            <BarKbd tone="dark">S</BarKbd>
                          </span>
                        </>
                      )}
                  </button>
                </span>
              </div>
            </motion.div>
          ) :
          null}
      </AnimatePresence>
    </>
  )
}

/**
 * Holds a navigation to another page while `when` is true and hands it to the bar. A change of
 * search or hash on the same page is the page's own business (a tab, a filter) and goes through.
 * Mounted only under a router, so a bar rendered outside one (a test, a story) still works.
 */
function LeaveGuard({ when, onHold }: { when: boolean; onHold: (held: Held) => void }) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => when && current.pathname !== next.pathname,
    enableBeforeUnload: () => when,
    withResolver: true
  })
  const { status, proceed, reset } = blocker
  useEffect(() => {
    if (status === "blocked") onHold({ proceed, reset })
  }, [status, proceed, reset, onHold])
  return null
}

/** ⌘ on a Mac, Ctrl elsewhere — read after mount, so the server's render and the first paint agree. */
function useModifierLabel() {
  const [mod, setMod] = useState("Ctrl")
  useEffect(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform
    if (/mac|iphone|ipad/i.test(platform)) setMod("⌘")
  }, [])
  return mod
}

function BarKbd({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm px-1 font-medium text-2xs tabular-nums leading-none tracking-[0]",
        tone === "dark" ? "bg-mesh-ink/14 text-mesh-ink" : "bg-ink/7 text-ink-2"
      )}
    >
      {children}
    </kbd>
  )
}
