import { Exit } from "effect"

/**
 * One preference section's writes, one after another (`lane`), each over the version the one before it came back with,
 * read when it goes out rather than when it was asked. A section saves whole, so a write still waiting when a newer
 * one is asked is dropped: the newer carries its value too. One the server refuses (another tab wrote in between)
 * hands over to `refused`, which reads the frame again.
 */
export function prefWrites<T>(options: {
  readonly version: { current: number }
  readonly lane: (write: () => Promise<void>) => Promise<void>
  readonly send: (value: T, baseVersion: number) => Promise<Exit.Exit<{ readonly version: number }, unknown>>
  readonly refused: () => void
}): (next: T) => Promise<void> {
  let latest = 0
  return (next) => {
    const mine = ++latest
    return options.lane(async () => {
      if (mine !== latest) return
      const exit = await options.send(next, options.version.current)
      if (Exit.isSuccess(exit)) options.version.current = exit.value.version
      else options.refused()
    })
  }
}
