import { Link } from "../router.tsx"
import { ChevronRight } from "./icons.tsx"

export type Crumb = { readonly label: string; readonly href?: string }

/**
 * Where a page sits in a hierarchy: Instellingen › Winkels › Northwind EU. A path, so the joints are
 * chevrons. Not the werkdraad: the werkdraad names the records a thing is tied to (ties, not a path)
 * and lives in the main bar; a breadcrumb sits at the top of a deep page and goes up.
 */
export function Breadcrumbs({ items }: { readonly items: ReadonlyArray<Crumb> }) {
  return (
    <nav aria-label="Kruimelpad">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {last || item.href === undefined
                ? (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={last ? "truncate font-medium text-ink" : "truncate text-ink-3"}
                  >
                    {item.label}
                  </span>
                )
                : (
                  <Link to={item.href} className="truncate rounded-xs text-ink-3 hover:text-ink hover:underline">
                    {item.label}
                  </Link>
                )}
              {!last && <ChevronRight size={12} className="shrink-0 text-ink-4" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
