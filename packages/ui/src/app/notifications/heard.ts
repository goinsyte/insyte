import { useMemo } from "react"
import { heard } from "../lib/notifications"
import type { Persona } from "../lib/types/persona"
import { useNotifications } from "../stores/notifications-store"

/** A persona's notifications, minus the ones its settings say not to show in the app. */
export function useHeardNotes(persona: Persona) {
  const notes = useNotifications((s) => s.notes)
  const prefs = useNotifications((s) => s.prefs)
  return useMemo(() => notes.filter((n) => n.persona === persona && heard(n, prefs)), [notes, prefs, persona])
}
