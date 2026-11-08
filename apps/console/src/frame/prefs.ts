import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { PrefSection } from "@insyte/modules/prefs/domain/Prefs"
import { Exit } from "effect"
import { useEffect, useRef, useState } from "react"
import { frameAtom, frameWrites } from "../data/frame.ts"

/**
 * One preference section as the frame keeps it (M4.2): the saved value (or `defaults`), changed at once on screen and
 * written over the version it was read at. Another tab that wrote in between gets the server's answer instead: the
 * frame is read again and the value follows it.
 */
export function usePrefSection<T>(frame: Frame, section: PrefSection, defaults: T): readonly [T, (next: T) => void] {
  const saved = frame.prefs.sections[section]
  const [value, setValue] = useState<T>((saved?.value as T | undefined) ?? defaults)
  const version = useRef(saved?.version ?? 0)
  const patch = useAtomSet(frameWrites.patchPrefs, { mode: "promiseExit" })
  const refresh = useAtomRefresh(frameAtom)

  // A fresh read of the frame (another tab, a conflict) is the truth.
  useEffect(() => {
    if (saved === undefined) return
    version.current = saved.version
    setValue(saved.value as T)
  }, [saved?.version])

  const set = (next: T) => {
    setValue(next)
    void patch({ payload: { section, value: next as never, baseVersion: version.current } }).then((exit) => {
      if (Exit.isSuccess(exit)) version.current = exit.value.version
      else refresh()
    })
  }
  return [value, set] as const
}
