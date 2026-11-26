import { Exit } from "effect"

/**
 * One preference section's writes, one after another (`lane`), each over the version the one before it came back with,
 * read when it goes out rather than when it was asked. A section saves whole, so a write still waiting when a newer
 * one is asked is dropped: the newer carries its value too. One the server refuses (another tab wrote in between), or
 * that does not come back, hands over to `refused`, which reads the frame again.
 *
 * `read` says whether a fresh read of the frame is to be shown: only one newer than what the writes know, or the read
 * after a refusal. A read that set out before a write landed can arrive after it, and would put the value back.
 */
export function prefWrites<T>(options: {
  readonly version: { current: number }
  readonly lane: (write: () => Promise<void>) => Promise<void>
  readonly send: (value: T, baseVersion: number) => Promise<Exit.Exit<{ readonly version: number }, unknown>>
  readonly refused: () => void
}): { readonly write: (next: T) => Promise<void>; readonly read: (version: number) => boolean } {
  let latest = 0
  let refused = false
  return {
    write: (next) => {
      const mine = ++latest
      return options.lane(async () => {
        if (mine !== latest) return
        const exit = await options.send(next, options.version.current).catch(() => undefined)
        if (exit !== undefined && Exit.isSuccess(exit)) {
          options.version.current = exit.value.version
          return
        }
        refused = true
        options.refused()
      })
    },
    read: (version) => {
      if (version <= options.version.current && !refused) return false
      refused = false
      options.version.current = version
      return true
    }
  }
}
