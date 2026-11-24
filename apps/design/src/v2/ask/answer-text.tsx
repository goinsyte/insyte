import { Fragment } from "react"
import { Link } from "../router.tsx"
import { KIND_GLYPH } from "./catalogue.ts"
import type { RefKind } from "./catalogue.ts"

/*
 * An answer's sentences: `**bold**` for the point, `[[label|href|kind]]` for a record, drawn as a
 * chip that opens it, and `{{value|what it is|href}}` for a figure, set as a figure with a dotted
 * rule that says it opens where it was counted. The fixtures' older answers use only bold, so they
 * read the same as before.
 */

const TOKEN = /(\[\[[^\]]+\]\]|\{\{[^}]+\}\})/

/** The pieces a sentence streams in by: a word, or a whole chip (never half a record). */
export const units = (paragraph: string): ReadonlyArray<string> =>
  paragraph.match(/\[\[[^\]]*\]\]|\{\{[^}]*\}\}|\S+/g) ?? []

/** A record in a sentence: its kind's glyph and its name, on the well; opens the record. */
export function RecordChip({ label, href, kind }: {
  readonly label: string
  readonly href: string
  readonly kind: RefKind
}) {
  const G = KIND_GLYPH[kind]
  return (
    <Link
      to={href}
      className="mx-px inline-flex h-[1.375rem] translate-y-[-1px] items-center gap-1 rounded-xs bg-well px-1.5 align-middle text-sm font-medium text-ink hover:bg-hover"
    >
      <G size={13} className="shrink-0 text-ink-3" />
      {label}
    </Link>
  )
}

/** A number Magnus counted: what it is on hover, its rows a click away. */
function FigureChip({ value, what, href }: { readonly value: string; readonly what: string; readonly href: string }) {
  return (
    <Link
      to={href}
      title={what}
      aria-label={`${what}: ${value}`}
      className="figure font-medium text-ink underline decoration-ink-4 decoration-dotted underline-offset-[3px] hover:decoration-ink"
    >
      {value}
    </Link>
  )
}

function Bold({ text }: { readonly text: string }) {
  const parts = text.split("**")
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? (
            <strong key={i} className={/\d/.test(part) ? "figure font-medium text-ink" : "font-semibold text-ink"}>
              {part}
            </strong>
          )
          : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  )
}

export function AnswerText({ text }: { readonly text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        const record = /^\[\[([^|]+)\|([^|]+)\|([a-z]+)\]\]$/.exec(part)
        if (record !== null) {
          return (
            <RecordChip
              key={i}
              label={record[1] ?? ""}
              href={record[2] ?? "/v2"}
              kind={(record[3] ?? "order") as RefKind}
            />
          )
        }
        const figure = /^\{\{([^|]+)\|([^|]+)\|([^}]+)\}\}$/.exec(part)
        if (figure !== null) {
          return <FigureChip key={i} value={figure[1] ?? ""} what={figure[2] ?? ""} href={figure[3] ?? "/v2"} />
        }
        return <Bold key={i} text={part} />
      })}
    </>
  )
}

/** The answer as plain text, for copying: chips as their names, figures as their values. */
export const plainOf = (text: string) =>
  text.replaceAll("**", "").replace(/\[\[([^|]+)\|[^\]]+\]\]/g, "$1").replace(/\{\{([^|]+)\|[^}]+\}\}/g, "$1")
