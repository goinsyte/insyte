import type { ReactNode } from "react"

/**
 * One message in a conversation: the sender's disc, name and time on one line, the body under the
 * name. Used by Magnus's chat and an agent's chat alike, so every conversation reads the same.
 */
export function Message({ avatar, name, at, children }: {
  readonly avatar: ReactNode
  readonly name: string
  readonly at: string
  readonly children: ReactNode
}) {
  return (
    <article className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
      <div className="pt-0.5">{avatar}</div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <header className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink">{name}</h3>
          <span className="figure text-2xs text-ink-3">{at}</span>
        </header>
        {children}
      </div>
    </article>
  )
}
