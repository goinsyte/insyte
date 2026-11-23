import type { ReactNode } from "react"
import { cx } from "../../ui/cx.ts"
import { Check, X } from "../../ui/icons.tsx"

/*
 * The kit's own page grammar, taken from the brand book: a chapter opens with its title in two tones
 * and a lede; each component is a spread, a narrow column of words (what it is for, its anatomy,
 * when to use it and when not, its name in code as a caption) beside the specimen sheet, set on one
 * flat ground with captions set close under each state rather than boxed into cards or ruled off.
 * One rule per chapter opens it; spreads are separated by space alone. Not part of the library:
 * these only arrange the library on this page.
 */

export function KitSection({ id, title, second, intro, children }: {
  readonly id: string
  readonly title: string
  /** The title's second line, in the quieter ink: what the chapter is about, in a few words. */
  readonly second: string
  readonly intro: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-titel`} className="flex flex-col">
      <header
        id={id}
        className="grid scroll-mt-20 grid-cols-1 gap-x-10 gap-y-4 border-t border-ink pt-6 pb-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end"
      >
        <h2 id={`${id}-titel`} className="text-2xl font-semibold sm:text-3xl text-balance text-ink">
          {title}
          <span className="block text-ink-3">{second}</span>
        </h2>
        <div className="max-w-[52ch] text-base text-pretty text-ink-2">{intro}</div>
      </header>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function Notes({ label, items }: { readonly label: string; readonly items?: ReadonlyArray<string> }) {
  if (items === undefined) return null
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-medium text-ink">{label}</dt>
      {items.map((item) => <dd key={item} className="text-sm text-pretty text-ink-2">{item}</dd>)}
    </div>
  )
}

/**
 * One component as a spread: the column of words on the left, its specimen sheet on the right. The
 * name it has in code and its file are a caption at the foot of the column, in the text face.
 */
export function Spec({ id, title, name, file, summary, also, anatomy, use, avoid, children }: {
  readonly id: string
  /** What a designer calls it, in Dutch: Knop, Tekstveld, Melding. */
  readonly title: string
  /** As imported: `Button`, `IconButton · ButtonLink`. */
  readonly name: string
  /** Relative to `src/v2/`. */
  readonly file: string
  readonly summary: ReactNode
  /** The product component or pattern it covers, for whoever ports a screen. */
  readonly also?: string
  /** Its parts, in reading order. */
  readonly anatomy?: ReadonlyArray<string>
  readonly use?: ReadonlyArray<string>
  readonly avoid?: ReadonlyArray<string>
  readonly children: ReactNode
}) {
  return (
    <article
      id={id}
      aria-labelledby={`${id}-naam`}
      className="grid scroll-mt-20 grid-cols-1 gap-x-10 gap-y-6 py-12 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-5 self-start lg:sticky lg:top-6">
        <div className="flex flex-col gap-2">
          <h3 id={`${id}-naam`} className="text-xl font-semibold text-balance text-ink">{title}</h3>
          <p className="max-w-[60ch] text-sm text-pretty text-ink-2">{summary}</p>
        </div>
        {anatomy !== undefined && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-ink">Opbouw</p>
            <ol className="flex list-inside list-decimal flex-col gap-1 text-sm text-ink-2 marker:text-ink-3">
              {anatomy.map((part) => <li key={part} className="text-pretty">{part}</li>)}
            </ol>
          </div>
        )}
        {(use !== undefined || avoid !== undefined) && (
          <dl className="flex flex-col gap-3">
            <Notes label="Gebruik als" items={use} />
            <Notes label="Niet" items={avoid} />
          </dl>
        )}
        <p className="flex flex-col gap-0.5 pt-2 text-xs text-ink-3">
          <span id={`${id}-code`} className="font-medium text-ink-2">{name}</span>
          <span className="break-all">{file}</span>
          {also !== undefined && <span className="pt-1">Vervangt {also}</span>}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </article>
  )
}

type Surface = "plain" | "canvas" | "panel" | "rail" | "desk" | "well"

const SURFACE: Record<Exclude<Surface, "plain">, string> = {
  // The page is canvas: a canvas specimen needs no ground of its own, only the inset the others get.
  canvas: "bg-canvas",
  panel: "bg-panel",
  rail: "bg-rail",
  desk: "bg-desk",
  well: "bg-well"
}

/**
 * The specimen sheet: the states set straight on the page in a loose grid with air between them,
 * each captioned just under itself, not boxed and not ruled. `ground` lays a quiet panel under the sheet for parts
 * that need one to read (a white field, a floating card); a state that lives on the rail or the desk
 * says so with its own `surface` instead. `cols` is the most per row on a wide screen.
 */
export function States({ children, cols = 4, ground = false, className }: {
  readonly children: ReactNode
  readonly cols?: 1 | 2 | 3 | 4 | 5 | 6
  readonly ground?: boolean
  readonly className?: string
}) {
  return (
    <div
      className={cx(
        "grid gap-x-8 gap-y-10",
        ground ? "rounded-xl bg-panel px-5 py-7 sm:px-8 sm:py-9" : "pt-2",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        cols === 4 && "grid-cols-2 xl:grid-cols-4",
        cols === 5 && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
        cols === 6 && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * One state on the sheet. `force` draws hover, focus or pressed without a pointer (`v2.css` widens
 * those variants for elements inside `[data-force]`), so the sheet shows them all at once. A
 * `surface` other than plain sets the specimen on that ground, for parts that live on the rail or
 * float over the desk.
 */
export function State({ label, force, surface = "plain", children, align = "center", span, inert = false }: {
  /** The state in words: Standaard, Hover, Focus, Ingedrukt, Uit, Bezig, Leeg, Fout. */
  readonly label: string
  readonly force?: "hover" | "focus" | "focus-current" | "active"
  readonly surface?: Surface
  readonly children: ReactNode
  readonly align?: "center" | "start" | "stretch"
  /** Cells this state takes in its row on a wide screen. */
  readonly span?: 2 | 3 | 4 | "full"
  /** A forced state is a picture of a state: it takes no input, so the page's tab order skips it. */
  readonly inert?: boolean
}) {
  return (
    <figure
      className={cx(
        "flex min-w-0 flex-col gap-3",
        span === 2 && "col-span-2",
        span === 3 && "col-span-2 xl:col-span-3",
        span === 4 && "col-span-2 xl:col-span-4",
        span === "full" && "col-span-full"
      )}
    >
      <div
        data-force={force}
        inert={inert || force !== undefined ? true : undefined}
        className={cx(
          "flex min-h-16 min-w-0 flex-1 gap-3",
          align !== "stretch" && "flex-wrap",
          surface !== "plain" && cx("rounded-lg p-4", SURFACE[surface]),
          align === "center" && "items-center justify-center",
          align === "start" && "items-start justify-start",
          align === "stretch" && "flex-col items-stretch justify-center *:min-w-0"
        )}
      >
        {children}
      </div>
      <figcaption className="text-xs text-ink-3">{label}</figcaption>
    </figure>
  )
}

/** A rule of use under a sheet: one or two sentences, set as a run-in note. */
export function Rule({ children }: { readonly children: ReactNode }) {
  return (
    <p className="max-w-[60ch] text-sm text-pretty text-ink-2">
      <span className="font-medium text-ink">Regel.</span> {children}
    </p>
  )
}

/**
 * Variants by states, as a table: the variants down the side, the states across the top, the labels
 * on the axes only. Scrolls sideways on a narrow screen rather than stacking into a long column.
 */
export function Matrix({ columns, rows, label }: {
  readonly label: string
  readonly columns: ReadonlyArray<
    { readonly label: string; readonly force?: "hover" | "focus" | "focus-current" | "active" }
  >
  readonly rows: ReadonlyArray<{ readonly label: string; readonly cell: (column: number) => ReactNode }>
}) {
  return (
    // A scroll box the keyboard can reach: on a phone the right-hand states sit off screen.
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-20 border-b border-line pt-2 pr-2 pb-2 pl-5 sm:pl-6">
              <span className="sr-only">Variant</span>
            </th>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className="border-b border-line px-2 pt-2 pb-2 text-xs font-normal text-ink-3"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="py-5 pr-3 pl-5 align-middle text-xs font-medium whitespace-nowrap text-ink-2 sm:pl-8"
              >
                {row.label}
              </th>
              {columns.map((column, i) => (
                <td key={column.label} className="px-2 py-5 align-middle last:pr-5 sm:last:pr-6">
                  <div data-force={column.force} inert={column.force !== undefined ? true : undefined} className="flex">
                    {row.cell(i)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Wel and Niet, drawn: the right use beside the wrong one, built from the same parts. */
export function DoDont({ items }: {
  readonly items: ReadonlyArray<
    { readonly kind: "wel" | "niet"; readonly caption: string; readonly children: ReactNode }
  >
}) {
  return (
    <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
      {items.map((item) => (
        <figure key={item.caption} className="flex min-w-0 flex-col gap-3">
          <div inert className="flex min-h-28 flex-wrap items-center justify-center gap-3 rounded-xl bg-panel p-6">
            {item.children}
          </div>
          <figcaption className="flex gap-2 text-sm text-pretty text-ink-2">
            {item.kind === "wel"
              ? <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-good-ink" />
              : <X size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-bad-ink" />}
            <span>
              <span className="font-medium text-ink">{item.kind === "wel" ? "Wel. " : "Niet. "}</span>
              {item.caption}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
