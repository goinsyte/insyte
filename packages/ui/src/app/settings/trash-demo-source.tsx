import type { ReactNode } from "react"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useSettingsDepth } from "../stores/settings-depth-store"
import { type TrashSource, TrashSourceProvider } from "./trash-source"

/*
 * The Prullenbak in the design app, as it was before the seam (`trash-source.tsx`): the settings-depth store's seeded
 * items, put back with Ongedaan maken and purged after the page asked.
 */

export function DemoTrashSource({ children }: { children: ReactNode }) {
  const items = useSettingsDepth((s) => s.trash)
  const gate = useGate("settings", 2)
  const source: TrashSource = {
    items,
    canEdit: gate.ok,
    restore: (picked) =>
      undoable(
        picked.length === 1 ? `“${picked[0]!.title}” teruggezet` : `${picked.length} items teruggezet`,
        useSettingsDepth.getState().restore(picked.map((i) => i.id)),
        "Het staat weer waar het stond."
      ),
    purge: (picked) => useSettingsDepth.getState().purge(picked.map((i) => i.id)),
    empty: () => useSettingsDepth.getState().purge(items.map((i) => i.id))
  }
  return <TrashSourceProvider value={source}>{children}</TrashSourceProvider>
}
