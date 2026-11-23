import { useState } from "react"
import type { PointerEvent } from "react"
import { formatAxis, formatChange, formatValue } from "./format.ts"
import { NotePin } from "./parts.tsx"
import { axis, useWidth } from "./scale.ts"
import type { LineData, Note } from "./types.ts"

const GUTTER = 44 // the value labels, right-aligned against the plot
const TOP = 18
const BOTTOM = 26

/**
 * A line: this period in ink, the period before dashed in comparison grey, three ruled values and the
 * days under it. Hover (or arrow keys when focused) reads one day out against the day before.
 */
export function LineChart({ data, note, height = 200 }: {
  readonly data: LineData
  readonly note?: Note
  readonly height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const plotW = Math.max(width - GUTTER - 8, 0)
  const plotH = height - TOP - BOTTOM
  const all = [...data.current, ...(data.compare ?? [])]
  const y = axis(all, { zero: false })
  const n = data.labels.length
  const x = (i: number) => GUTTER + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yAt = (v: number) => TOP + y.at(v, plotH)
  const path = (values: ReadonlyArray<number>) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yAt(v).toFixed(1)}`).join("")

  const last = n - 1
  // On a narrow chart, every second (or third) label, counted back from the last so "now" always shows.
  const every = Math.max(1, Math.ceil(40 / ((plotW || 1) / Math.max(last, 1))))
  const focus = data.focus ?? note?.at
  const shown = active ?? focus ?? last

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const rel = (event.clientX - box.left - GUTTER) / (plotW || 1)
    setActive(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))))
  }

  const summary = `${
    data.labels.map((label, i) => `${label} ${formatValue(data.current[i] ?? 0, data.format)}`).join(", ")
  }`
  const current = data.current[shown] ?? 0
  const before = data.compare?.[shown]

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          className="block touch-none outline-none focus-visible:outline-2 focus-visible:outline-accent"
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") setActive(Math.min(n - 1, (active ?? shown) + 1))
            if (event.key === "ArrowLeft") setActive(Math.max(0, (active ?? shown) - 1))
          }}
          onBlur={() => setActive(null)}
        >
          {y.marks.map((mark) => (
            <g key={mark}>
              <line x1={GUTTER} x2={GUTTER + plotW} y1={yAt(mark)} y2={yAt(mark)} stroke="var(--color-grid)" />
              <text
                x={GUTTER - 8}
                y={yAt(mark)}
                dy="0.32em"
                textAnchor="end"
                className="figure fill-ink-3 text-2xs"
              >
                {formatAxis(mark, data.format)}
              </text>
            </g>
          ))}
          {data.labels.map((label, i) =>
            (last - i) % every !== 0 ? null : (
              <text
                key={label}
                x={x(i)}
                y={height - 6}
                textAnchor={i === data.labels.length - 1 ? "end" : "middle"}
                className={i === shown ? "fill-ink text-2xs font-medium" : "fill-ink-3 text-2xs"}
              >
                {label}
              </text>
            )
          )}

          <line
            x1={x(shown)}
            x2={x(shown)}
            y1={TOP - 6}
            y2={TOP + plotH}
            stroke="var(--color-line-strong)"
            strokeDasharray={active === null ? "2 3" : undefined}
          />

          {data.compare !== undefined && (
            <path
              d={path(data.compare)}
              fill="none"
              stroke="var(--color-compare)"
              strokeWidth="1.75"
              strokeDasharray="4 3"
              strokeLinejoin="round"
            />
          )}
          <path
            d={path(data.current)}
            fill="none"
            stroke="var(--color-series-1)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {before !== undefined && (
            <circle
              cx={x(shown)}
              cy={yAt(before)}
              r="3"
              fill="var(--color-canvas)"
              stroke="var(--color-compare)"
              strokeWidth="1.75"
            />
          )}
          <circle
            cx={x(shown)}
            cy={yAt(current)}
            r="4"
            fill={shown === focus ? "var(--color-accent)" : "var(--color-series-1)"}
            stroke="var(--color-canvas)"
            strokeWidth="2"
          />
          {note !== undefined && active === null && <NotePin x={x(note.at)} y={yAt(data.current[note.at] ?? 0) - 16} />}
        </svg>
      )}

      {width > 0 && (
        <div
          className="pointer-events-none absolute top-0 rounded-sm bg-canvas/95 px-2 py-1 shadow-sm ring-1 ring-line"
          style={{
            left: Math.min(Math.max(x(shown) - 60, GUTTER), Math.max(width - 128, 0)),
            opacity: active === null ? 0 : 1,
            transition: "opacity var(--duration-fast) var(--ease-out)"
          }}
          aria-hidden="true"
        >
          <p className="text-2xs text-ink-3">{data.labels[shown]}</p>
          <p className="figure text-xs font-medium text-ink">
            {formatValue(current, data.format)}
            {before !== undefined && (
              <span className="ml-1.5 font-normal text-ink-3">{formatChange(current, before, data.format)}</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
