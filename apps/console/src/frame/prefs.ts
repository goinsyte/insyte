import { RegistryContext, useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { PrefSection } from "@insyte/modules/prefs/domain/Prefs"
import { useContext, useEffect, useRef, useState } from "react"
import { frameAtom, frameWrites } from "../data/frame.ts"
import { inTurn } from "../data/in-turn.ts"
import { prefWrites } from "./pref-writes.ts"

/**
 * One preference section as the frame keeps it (M4.2): the saved value (or `defaults`), changed at once on screen and
 * written over the version it was read at. Writes go one after another (every section shares one command atom), each
 * over the version the last came back with, so two quick changes both land. Another tab that wrote in between gets the
 * server's answer instead: the frame is read again and the value follows it.
 */
export function usePrefSection<T>(frame: Frame, section: PrefSection, defaults: T): readonly [T, (next: T) => void] {
  const saved = frame.prefs.sections[section]
  const [value, setValue] = useState<T>((saved?.value as T | undefined) ?? defaults)
  const version = useRef(saved?.version ?? 0)
  const registry = useContext(RegistryContext)
  const patch = useAtomSet(frameWrites.patchPrefs, { mode: "promiseExit" })
  const refresh = useAtomRefresh(frameAtom)
  // The writer lives as long as the component; what it calls is the latest render's.
  const calls = useRef({ patch, refresh })
  calls.current = { patch, refresh }
  const [writes] = useState(() =>
    prefWrites<T>({
      version,
      lane: (run) => inTurn(registry, frameWrites.patchPrefs, run),
      send: (next, baseVersion) => calls.current.patch({ payload: { section, value: next as never, baseVersion } }),
      refused: () => calls.current.refresh()
    })
  )

  // A fresh read of the frame (another tab, a conflict) is the truth, unless it is older than what the writes know.
  useEffect(() => {
    if (saved !== undefined && writes.read(saved.version)) setValue(saved.value as T)
  }, [saved?.version])

  const set = (next: T) => {
    setValue(next)
    void writes.write(next)
  }
  return [value, set] as const
}
