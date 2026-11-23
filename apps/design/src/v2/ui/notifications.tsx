import type { ReactNode } from "react"
import { Link } from "../router.tsx"
import { cx } from "./cx.ts"

export type Notification = {
  readonly id: string
  /** Who or what it is from: an avatar, an agent's disc, a glyph tile. */
  readonly mark: ReactNode
  /** One sentence, the actor first: "Sofía Kim noemde je in ticket #5142". */
  readonly text: ReactNode
  readonly at: string
  readonly href?: string
  readonly unread?: boolean
}

/**
 * Notifications: what happened that is about you, one sentence each, newest first. Unread rows carry
 * a dot in the accent and their sentence in full ink; read ones step back. Shown in the bell's
 * popover and on the full notifications page, from the same rows.
 */
export function NotificationList(
  { items, empty }: { readonly items: ReadonlyArray<Notification>; readonly empty?: ReactNode }
) {
  if (items.length === 0) return <>{empty}</>
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const body = (
          <>
            <span className="flex shrink-0 pt-0.5">{item.mark}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cx("text-sm text-pretty", item.unread === true ? "text-ink" : "text-ink-2")}>
                {item.text}
              </span>
              <span className="figure text-2xs text-ink-3">{item.at}</span>
            </span>
            <span className="flex w-2 shrink-0 justify-center pt-1.5">
              {item.unread === true && (
                <>
                  <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                  <span className="sr-only">ongelezen</span>
                </>
              )}
            </span>
          </>
        )
        const shape = "flex items-start gap-3 rounded-md px-2.5 py-2.5"
        return (
          <li key={item.id}>
            {item.href === undefined
              ? <div className={shape}>{body}</div>
              : <Link to={item.href} className={cx(shape, "transition-colors hover:bg-hover")}>{body}</Link>}
          </li>
        )
      })}
    </ul>
  )
}
