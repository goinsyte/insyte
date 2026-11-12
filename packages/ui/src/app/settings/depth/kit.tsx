import { canRole } from "@insyte/domain/Permissions"
import { useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useGateRole } from "../../access/gate-role"
import type { SettingsDepthSeed } from "../../lib/settings-depth"
import { type DepthSection, type FieldChange, useSettingsDepthSource } from "./source"

/**
 * One settings section edited as a draft: the house's unsaved bar shows while it differs, and saving writes the change
 * into the Logboek with what it was and what it became. The section comes from the page's host
 * (`SettingsDepthSource`); a save that did not land keeps the draft. `level` is what changing it takes: Bewerken, or
 * Beheren for what decides an erase.
 */
export function useSection<K extends DepthSection>(
  key: K,
  page: string,
  describe: (before: SettingsDepthSeed[K], after: SettingsDepthSeed[K]) => Array<FieldChange>,
  level: 2 | 3 = 2
) {
  const source = useSettingsDepthSource()
  const saved = source.saved[key] as SettingsDepthSeed[K]
  const savedKey = JSON.stringify(saved)
  const [draft, setDraft] = useState<SettingsDepthSeed[K]>(saved)
  const last = useRef(savedKey)
  useEffect(() => {
    if (last.current !== savedKey) {
      last.current = savedKey
      setDraft(JSON.parse(savedKey) as SettingsDepthSeed[K])
    }
  }, [savedKey])
  const to = useRouterState({ select: (s) => s.location.pathname })
  // The host's role (the design's access store, the console's frame); the server refuses what it may not either way.
  const role = useGateRole()
  const dirty = JSON.stringify(draft) !== savedKey
  const save = (message: string, detail?: string) =>
    source.save(key, draft, { label: message, detail }, { page, to, changes: describe(saved, draft) })
  return {
    saved,
    draft,
    setDraft,
    dirty,
    discard: () => setDraft(saved),
    save,
    canEdit: role === null || canRole(role, "settings", level)
  }
}

export const WELL =
  "field h-9 w-full rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper"
