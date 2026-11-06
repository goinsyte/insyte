import type { ReactNode } from "react"

/**
 * The brand kit's one layout primitive.
 *
 * A heading, a line saying what the rule is, and the specimens. Separation between sections is the
 * surface step and the space, never a rule across the page — which is the marketing register's
 * first rule, applied to the document that states it.
 */
export function Section(
  { children, id, rule, title }: {
    readonly id: string
    readonly title: string
    readonly rule: string
    readonly children: ReactNode
  }
) {
  return (
    <section id={id} className="flex scroll-mt-16 flex-col gap-8">
      <header className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-xl font-medium tracking-tight text-ink">{title}</h2>
        <p className="text-sm leading-relaxed text-ink-3">{rule}</p>
      </header>
      {children}
    </section>
  )
}

/** A label above a group of specimens. Not an eyebrow: sentence case, and it names a real group. */
export function Group({ children, title }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-ink-2">{title}</h3>
      {children}
    </div>
  )
}
