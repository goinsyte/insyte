import { useEffect, useMemo, useState } from "react"
import { RankChart } from "../../charts/rank-chart.tsx"
import { euro } from "../../fixtures/records.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Thinking } from "../../ui/assistant.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Sheet } from "../../ui/dialog.tsx"
import { ArrowUpRight, MessageSquare } from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { explain } from "./explain.ts"
import type { Driver, Explanation, Row } from "./explain.ts"
import type { Ctx } from "./model.ts"

/*
 * "Leg dit getal uit": the number, what it was, Magnus's reading, what moved it, how it splits, and
 * every order it counts, forty at a time. It reads the board's period, so the same click on another
 * period explains that period's number.
 */

const PAGE = 40
const SIGNAL = { good: "text-good-ink", bad: "text-bad-ink", flat: "text-ink-3" } as const
const WORD = { good: "beter", bad: "slechter", flat: "gelijk" } as const

/** What has been read once this visit opens settled; the first time, Magnus reads for a moment. */
const read = new Set<string>()

export function ExplainDrawer({ ctx, explainKey, onClose }: {
  readonly ctx: Ctx
  readonly explainKey: string | null
  readonly onClose: () => void
}) {
  const e = useMemo(() => (explainKey === null ? null : explain(ctx, explainKey)), [ctx, explainKey])
  return (
    <Sheet
      open={e !== null}
      onClose={onClose}
      title={e?.title ?? ""}
      meta={e === null ? undefined : <span>{ctx.label}{ctx.cmpLabel === "" ? "" : ` tegen ${ctx.cmpLabel}`}</span>}
      footer={e === null ? undefined : (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<MessageSquare />}
            onClick={() => navigate(paths.newChat(`${e.title}, ${ctx.label}`))}
          >
            Vraag door
          </Button>
          {e.link !== undefined && (
            <ButtonLink to={e.link.to} size="sm" icon={<ArrowUpRight />}>{e.link.label}</ButtonLink>
          )}
        </>
      )}
    >
      {e !== null && <Body key={`${e.key}:${ctx.label}:${ctx.cmpLabel}`} e={e} />}
    </Sheet>
  )
}

function Body({ e }: { readonly e: Explanation }) {
  const id = `${e.key}:${e.title}:${e.value}`
  const [ready, setReady] = useState(() => read.has(id))
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => {
    if (ready) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const timer = window.setTimeout(() => {
      read.add(id)
      setReady(true)
    }, still ? 0 : 520)
    return () => window.clearTimeout(timer)
  }, [id, ready])
  const rows = useMemo(() => (e.rows === null ? [] : e.rows.list()), [e])

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="figure text-2xl font-medium text-ink">{e.value}</span>
          {e.change !== undefined && (
            <span className={cx("figure text-sm font-medium", SIGNAL[e.change.verdict])}>
              {e.change.text}
              <span className="sr-only">({WORD[e.change.verdict]})</span>
            </span>
          )}
        </p>
        {e.against !== undefined && <p className="figure text-xs text-ink-3">{e.against}</p>}
      </div>

      {ready
        ? (
          <p className="flex animate-rise items-start gap-2.5 text-sm text-pretty text-ink">
            <span className="mt-0.5">
              <MagnusMark size={16} />
            </span>
            <span className="min-w-0 flex-1">{e.reading}</span>
          </p>
        )
        : <Thinking label="Magnus leest de regels…" />}

      {ready && e.drivers.length > 0 && (
        <section aria-labelledby="uitleg-drivers" className="flex flex-col gap-3">
          <h3 id="uitleg-drivers" className="text-xs font-medium text-ink-3">{e.driversTitle}</h3>
          <Drivers drivers={e.drivers} />
        </section>
      )}

      {ready && e.breakdown !== undefined && e.breakdown.data.items.length > 0 && (
        <section aria-labelledby="uitleg-verdeling" className="flex flex-col gap-3">
          <h3 id="uitleg-verdeling" className="text-xs font-medium text-ink-3">{e.breakdown.title}</h3>
          <RankChart data={e.breakdown.data} />
        </section>
      )}

      {ready && e.rows !== null && (
        <section aria-labelledby="uitleg-rijen" className="flex flex-col gap-3">
          <h3 id="uitleg-rijen" className="flex items-baseline gap-2 text-xs font-medium text-ink-3">
            {e.rows.title}
            <span className="figure font-normal">{rows.length.toLocaleString("nl-NL")}</span>
          </h3>
          {rows.length === 0
            ? <p className="text-sm text-ink-3">Geen bestellingen in deze periode.</p>
            : <Rows rows={rows.slice(0, limit)} label={e.rows.title} />}
          {rows.length > limit && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setLimit(limit + PAGE)}
            >
              Nog {Math.min(PAGE, rows.length - limit)} van {(rows.length - limit).toLocaleString("nl-NL")} tonen
            </Button>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * What moved a number, as bars from a centre line: right for what added, left for what took away,
 * each with its value written out so the sign never rests on the bar alone. Without a comparison,
 * the bars are what the number is made of, from the left.
 */
function Drivers({ drivers }: { readonly drivers: ReadonlyArray<Driver> }) {
  const max = Math.max(1, ...drivers.map((d) => Math.abs(d.value)))
  const signed = drivers.some((d) => d.value < 0) || drivers.some((d) => d.detail !== undefined)
  return (
    <ul className="flex flex-col gap-2.5">
      {drivers.map((d) => {
        const w = (Math.abs(d.value) / max) * 100
        return (
          <li key={d.label} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_5.5rem] items-center gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs text-ink-2">{d.label}</span>
              {d.detail !== undefined && <span className="figure truncate text-2xs text-ink-3">{d.detail}</span>}
            </span>
            <span className="relative h-2" aria-hidden="true">
              {signed && <span className="absolute -inset-y-1 left-1/2 w-px bg-line-strong" />}
              <span
                className={cx("absolute inset-y-0 rounded-full", d.value >= 0 ? "bg-series-1" : "bg-series-3")}
                style={signed
                  ? d.value >= 0 ? { left: "50%", width: `${w / 2}%` } : { right: "50%", width: `${w / 2}%` }
                  : { left: 0, width: `${w}%` }}
              />
            </span>
            <span className="figure text-right text-xs text-ink">{d.shown}</span>
          </li>
        )
      })}
    </ul>
  )
}

const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const
const dated = (d: Date) =>
  `${d.getDate()} ${MONTH[d.getMonth()]}${d.getFullYear() === 2026 ? "" : ` ${d.getFullYear()}`}`

function Rows({ rows, label }: { readonly rows: ReadonlyArray<Row>; readonly label: string }) {
  return (
    <Table label={label} minWidth={420}>
      <THead>
        <Th>Bestelling</Th>
        <Th>Product</Th>
        <Th>Wat er gebeurde</Th>
        <Th align="right">Bedrag</Th>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.key}>
            <Td header>
              <span className="flex flex-col">
                {r.href === undefined
                  ? <span className="figure text-ink">#{r.number}</span>
                  : <Link to={r.href} className="figure text-ink hover:underline">#{r.number}</Link>}
                <span className="figure text-2xs text-ink-3">{dated(r.at)}</span>
              </span>
            </Td>
            <Td>
              <span className="block max-w-[9rem] truncate">{r.item}</span>
            </Td>
            <Td>
              <Status tone={r.tone}>{r.outcome}</Status>
            </Td>
            <Td figure>{euro(r.total)}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
