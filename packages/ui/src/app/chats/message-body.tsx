import { Link } from "@tanstack/react-router"
import { Fragment, type ReactNode } from "react"
import type { ChatRecordRef } from "../../data-source"

/**
 * A chat message's text, formatted the way the composer writes it: **bold**, _italic_, ~~struck~~,
 * `code`, [a link](https://…), a bare https:// link, "- " lines as a list, and @mentions of the
 * team marked. An order number (SO-12204) or a chargeback (DSP-2210) becomes a link to that record,
 * on the reader's own side of the product; in the team chat it opens beside the conversation. Nothing else is interpreted; what was typed is what shows.
 */
const INLINE =
  /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|_[^_\s][^_]*_|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|@[\p{L}\p{N}_]+|\bSO-\d{5}\b|\bDSP-\d{4}\b)/gu

const CHIP =
  "inline-flex h-5 translate-y-[-1px] items-center rounded-[5px] bg-arc-tint px-1.5 align-middle font-medium text-arc-ink text-sm leading-none hover:bg-arc/15"

type Read = {
  handles: ReadonlySet<string>
  orderBase: string
  refOf: (code: string) => ChatRecordRef | undefined
  onRecord?: ((ref: ChatRecordRef) => void) | undefined
}

function inline(text: string, key: string, { handles, orderBase, refOf, onRecord }: Read): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`
    const ref = /^SO-\d{5}$|^DSP-\d{4}$/.test(part) ? refOf(part) : undefined
    /* In the team chat a record opens beside the conversation instead of leaving it. */
    if (onRecord && ref) {
      return (
        <button key={k} type="button" onClick={() => onRecord(ref)} className={CHIP}>
          {part}
        </button>
      )
    }
    if (ref?.kind === "order") {
      return (
        <Link
          key={k}
          to={`${orderBase}/${ref.id}` as never}
          className={CHIP}
        >
          {part}
        </Link>
      )
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={k} className="font-medium text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) return <s key={k}>{part.slice(2, -2)}</s>
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={k} className="rounded-md bg-ink/6 px-1.5 py-px font-sans font-medium text-sm text-ink-2">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (/^_[^_]+_$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
    if (link) {
      return (
        <a
          key={k}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-arc-ink underline underline-offset-2"
        >
          {link[1]}
        </a>
      )
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={k}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="break-all text-arc-ink underline underline-offset-2"
        >
          {part}
        </a>
      )
    }
    if (part.startsWith("@") && handles.has(part.slice(1).toLowerCase())) {
      return (
        <span key={k} className="rounded-sm bg-arc-tint px-0.5 font-medium text-arc-ink">
          {part}
        </span>
      )
    }
    return <Fragment key={k}>{part}</Fragment>
  })
}

/** Where the text names no record the host knows, it stays text. */
const NONE = (): undefined => undefined

export function MessageBody({
  body,
  handles,
  orderBase = "/orders",
  refOf = NONE,
  onRecord
}: {
  body: string
  handles: ReadonlySet<string>
  orderBase?: string
  /** The record a handle in the text names (SO-12204, DSP-2210), as the host knows it. */
  refOf?: ((code: string) => ChatRecordRef | undefined) | undefined
  onRecord?: (ref: ChatRecordRef) => void
}) {
  const read: Read = { handles, orderBase, refOf, onRecord }
  const blocks: Array<{ kind: "p"; lines: string[] } | { kind: "ul"; items: string[] }> = []
  for (const line of body.split("\n")) {
    const item = /^\s*[-•]\s+(.*)$/.exec(line)
    const last = blocks[blocks.length - 1]
    if (item) {
      if (last?.kind === "ul") last.items.push(item[1] ?? "")
      else blocks.push({ kind: "ul", items: [item[1] ?? ""] })
    } else if (last?.kind === "p") last.lines.push(line)
    else blocks.push({ kind: "p", lines: [line] })
  }
  return (
    <div className="flex flex-col gap-1 text-base text-ink/90 leading-[1.6]">
      {blocks.map((b, i) =>
        b.kind === "ul" ?
          (
            <ul key={i} className="flex list-disc flex-col gap-0.5 pl-5 marker:text-ink-3">
              {b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`, read)}</li>)}
            </ul>
          ) :
          (
            <p key={i} className="whitespace-pre-wrap">
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 ? "\n" : null}
                  {inline(l, `${i}-${j}`, read)}
                </Fragment>
              ))}
            </p>
          )
      )}
    </div>
  )
}
