import { useEffect, useRef } from "react"
import { humanCheckSiteKey } from "../lib/human-check"

/*
 * Cloudflare Turnstile in a form (M2.2). Written for this repo. A host that checks for humans says where its site key
 * comes from (`configureHumanCheck` in `lib/human-check.ts`, at its composition root); one that does not, the design
 * reference, leaves it unset and this renders nothing.
 *
 * `interaction-only`: the widget stays out of sight while Cloudflare decides on its own, which is nearly always, and
 * shows itself only when it needs the visitor to do something. A token is single-use, so the form passes a new
 * `attempt` after each submit and the widget fetches the next one.
 */

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

export function HumanCheck(
  { onToken, attempt = 0 }: { readonly onToken: (token: string | null) => void; readonly attempt?: number }
) {
  const host = useRef<HTMLDivElement>(null)
  const widget = useRef<{ turnstile: Turnstile; id: string } | undefined>(undefined)
  const latest = useRef(onToken)
  latest.current = onToken

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
        callback: (token: string) => latest.current(token),
        "expired-callback": () => latest.current(null),
        "error-callback": () => latest.current(null)
      })
      widget.current = { turnstile, id }
    }, () => latest.current(null))
    return () => {
      gone = true
      if (widget.current !== undefined) widget.current.turnstile.remove(widget.current.id)
      widget.current = undefined
    }
  }, [])

  // A new attempt: the last token was spent, so ask for the next.
  useEffect(() => {
    if (attempt === 0 || widget.current === undefined) return
    latest.current(null)
    widget.current.turnstile.reset(widget.current.id)
  }, [attempt])

  if (humanCheckSiteKey() === undefined) return null
  return <div ref={host} />
}
