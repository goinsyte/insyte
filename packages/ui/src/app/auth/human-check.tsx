import { useEffect, useRef, useSyncExternalStore } from "react"
import { humanCheckSiteKey } from "../lib/human-check"

/*
 * Cloudflare Turnstile in a form (M2.2). Written for this repo. A host that checks for humans says where its site key
 * comes from (`configureHumanCheck` in `lib/human-check.ts`, at its composition root); one that does not, the design
 * reference, leaves it unset and this renders nothing.
 *
 * `interaction-only`: the widget stays out of sight while Cloudflare decides on its own, which is nearly always, and
 * shows itself only when it needs the visitor to do something.
 *
 * A form owns a `HumanCheckController` and renders `<HumanCheck controller={…} />`. On submit it awaits `token()`,
 * which waits for the widget rather than sending without one while Cloudflare's script is still loading, and after
 * the request it calls `spent()`: a token is single-use, so the widget fetches the next one.
 */

const WAIT_MS = 10_000

export interface HumanCheckController {
  /** The widget's token, waiting up to ten seconds for one; `undefined` where this host checks for no humans. */
  readonly token: () => Promise<string | undefined>
  /** The last token was sent; ask the widget for the next. */
  readonly spent: () => void
  readonly receive: (token: string | null) => void
  readonly attempt: () => number
  readonly subscribe: (listener: () => void) => () => void
}

export function createHumanCheck(): HumanCheckController {
  let current: string | null = null
  let attempt = 0
  let waiters: Array<(token: string | undefined) => void> = []
  const listeners = new Set<() => void>()
  return {
    token: () => {
      if (humanCheckSiteKey() === undefined) return Promise.resolve(undefined)
      if (current !== null) return Promise.resolve(current)
      return new Promise((resolve) => {
        waiters.push(resolve)
        setTimeout(() => resolve(current ?? undefined), WAIT_MS)
      })
    },
    spent: () => {
      current = null
      attempt += 1
      for (const listener of listeners) listener()
    },
    receive: (token) => {
      current = token
      if (token === null) return
      const waiting = waiters
      waiters = []
      for (const resolve of waiting) resolve(token)
    },
    attempt: () => attempt,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

interface Turnstile {
  readonly render: (element: HTMLElement, options: Record<string, unknown>) => string
  readonly reset: (widgetId: string) => void
  readonly remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let loading: Promise<Turnstile> | undefined
const loadTurnstile = () => (loading ??= new Promise<Turnstile>((resolve, reject) => {
  if (window.turnstile !== undefined) return resolve(window.turnstile)
  const script = document.createElement("script")
  script.src = SCRIPT
  script.async = true
  script.addEventListener(
    "load",
    () => window.turnstile === undefined ? reject(new Error("no turnstile")) : resolve(window.turnstile)
  )
  script.addEventListener("error", () => reject(new Error("turnstile did not load")))
  // `appendChild`, not `append`: the console also loads the Workers types, whose HTMLRewriter `append` shadows the DOM's.
  document.head.appendChild(script)
}))

export function HumanCheck({ controller }: { readonly controller: HumanCheckController }) {
  const host = useRef<HTMLDivElement>(null)
  const widget = useRef<{ turnstile: Turnstile; id: string } | undefined>(undefined)
  const attempt = useSyncExternalStore(controller.subscribe, controller.attempt, controller.attempt)

  useEffect(() => {
    const siteKeyOf = humanCheckSiteKey()
    if (siteKeyOf === undefined) return
    let gone = false
    void Promise.all([siteKeyOf(), loadTurnstile()]).then(([sitekey, turnstile]) => {
      if (gone || host.current === null || sitekey === null || sitekey === "") return
      const id = turnstile.render(host.current, {
        sitekey,
        appearance: "interaction-only",
        language: "nl",
        callback: (token: string) => controller.receive(token),
        "expired-callback": () => controller.receive(null),
        "error-callback": () => controller.receive(null)
      })
      widget.current = { turnstile, id }
    }, () => controller.receive(null))
    return () => {
      gone = true
      if (widget.current !== undefined) widget.current.turnstile.remove(widget.current.id)
      widget.current = undefined
    }
  }, [controller])

  // A new attempt: the last token was spent, so ask for the next.
  useEffect(() => {
    if (attempt > 0 && widget.current !== undefined) widget.current.turnstile.reset(widget.current.id)
  }, [attempt])

  if (humanCheckSiteKey() === undefined) return null
  return <div ref={host} />
}
