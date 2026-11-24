import type { ReactNode } from "react"
import { cx } from "./cx.ts"

/**
 * A settings page is sections of rows. A section has a title and a sentence that says what it
 * governs; a row is a setting: its name and what it does on the left, its control on the right. A
 * switch takes effect at once; text fields gather into the section's own Opslaan at its foot, so
 * nothing on the page saves by surprise.
 */
export function SettingsSection({ title, description, children, footer, id }: {
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly id?: string
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col rounded-lg bg-canvas ring-1 ring-line">
      <header className="flex flex-col gap-0.5 px-5 pt-4 pb-2">
        <h2 id={id} className="text-sm font-semibold text-ink">{title}</h2>
        {description !== undefined && <p className="text-xs text-pretty text-ink-3">{description}</p>}
      </header>
      <div className="flex flex-col px-5">{children}</div>
      {footer !== undefined && (
        <footer className="flex flex-wrap items-center justify-end gap-2 px-5 pt-2 pb-4">
          {footer}
        </footer>
      )}
    </section>
  )
}

export function SettingRow({ title, description, control, htmlFor, stack = false }: {
  readonly title: string
  readonly description?: ReactNode
  readonly control: ReactNode
  /** The control's id, so the title is its label. */
  readonly htmlFor?: string
  /** A wide control (a text field, a list) goes under the text instead of beside it. */
  readonly stack?: boolean
}) {
  const Title = htmlFor === undefined ? "p" : "label"
  return (
    <div
      className={cx(
        "flex gap-x-6 gap-y-2.5 py-3",
        stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <Title htmlFor={htmlFor} className="text-sm font-medium text-ink">{title}</Title>
        {description !== undefined && <p className="max-w-[56ch] text-xs text-pretty text-ink-3">{description}</p>}
      </div>
      <div className={cx("flex shrink-0 items-center gap-2", stack && "w-full")}>{control}</div>
    </div>
  )
}
