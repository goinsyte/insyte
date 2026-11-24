import { useEffect, useRef } from "react"
import { GOTO_DEFAULTS } from "../fixtures/settings.ts"
import { navigate, paths } from "../router.tsx"
import { useSaved } from "../screens/settings/parts.tsx"
import { askMagnus, openOverlay } from "./shell-state.ts"

/**
 * The keys that work everywhere in the shell: ⌘K the palette, ⌘J Magnus beside the work, ? the
 * shortcuts, and G then a key to go to an area. The G keys are the person's own, set under
 * Instellingen → Sneltoetsen and read from the same saved setting, so a change there works at once.
 * Never while typing, never with a modifier, and the G waits a second for its partner.
 */

/** Where each G key goes; the ids are the setting's (`GOTO_DEFAULTS`). */
const GOTO_PATHS: Readonly<Record<string, string>> = {
  home: paths.home,
  orders: paths.orders,
  tickets: paths.tickets,
  inbox: paths.inbox,
  customers: paths.customers,
  products: paths.products,
  returns: paths.returns,
  analytics: paths.board("week"),
  sheets: paths.sheets,
  courses: paths.courses,
  live: paths.live,
  notifications: paths.notifications,
  settings: paths.settings()
}

type Keys = { readonly on: boolean; readonly map: Readonly<Record<string, string>> }

/** The seed Instellingen → Sneltoetsen starts from, so both read the same saved value. */
const KEY_SEED: Keys = { on: true, map: Object.fromEntries(GOTO_DEFAULTS.map((g) => [g.id, g.key])) }

/** The person's G keys, as saved under Sneltoetsen. */
export function useGotoKeys(): Keys {
  return useSaved("shortcuts", KEY_SEED)[0]
}

/** Whether a key press belongs to whatever the person is typing in, or to a menu or dialog that has focus. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
    t.closest("[role=grid],[role=menu],[role=listbox],dialog") !== null)

export function useShellKeys() {
  const keys = useGotoKeys()
  const latest = useRef(keys)
  latest.current = keys

  useEffect(() => {
    let armed = 0
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        if (key === "k") {
          event.preventDefault()
          openOverlay("palette")
        } else if (key === "j") {
          event.preventDefault()
          askMagnus()
        }
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      if (event.key === "?") {
        event.preventDefault()
        openOverlay("shortcuts")
        return
      }
      const k = event.key.length === 1 ? event.key.toUpperCase() : ""
      if (k === "") return
      const { on, map } = latest.current
      if (!on) return
      if (armed !== 0 && Date.now() - armed < 1000) {
        armed = 0
        const hit = GOTO_DEFAULTS.find((g) => (map[g.id] ?? g.key) === k)
        const to = hit === undefined ? undefined : GOTO_PATHS[hit.id]
        if (to !== undefined) {
          event.preventDefault()
          navigate(to)
        }
        return
      }
      if (k === "G") armed = Date.now()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
}
