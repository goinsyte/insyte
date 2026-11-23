import { useState } from "react"
import type { PointerEvent } from "react"
import { formatAxis, formatChange, formatValue } from "./format.ts"
import { NotePin } from "./parts.tsx"
import { axis, useWidth } from "./scale.ts"
import type { BarData, Note } from "./types.ts"

const TOP = 22
const BOTTOM = 22
const GUTTER = 36
/** Room at the right for a reference line's label, so it never sits on a bar or its value. */
const REFERENCE_ROOM = 68

/**
 * Upright bars from zero, each value written on its own bar. The period before is not drawn: hover a
 * bar (or arrow along the focused chart) and its tooltip says what it was and how far it moved, so no
 * mark competes with the value. With a `focus`, that bar is the accent and the rest step back to light
 * grey; without one, every bar is a darker grey. A `reference` (a promise, a target) is a dashed rule
 * with its label in its own room at the right end, clear of the bars.
 */
export function BarChart({ data, note, height = 200, axisLabels = true }: {
  readonly data: BarData
  readonly note?: Note
  readonly height?: number
  readonly axisLabels?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const gutter = axisLabels ? GUTTER : 0
  const room = data.reference === undefined ? 0 : REFERENCE_ROOM
  const plotW = Math.max(width - gutter - room, 0)
  const plotH = height - TOP - BOTTOM
  const values = data.items.flatMap((item) => [item.value, data.reference?.value ?? 0])
  const y = axis(values, { zero: true })
  const band = plotW / Math.max(data.items.length, 1)
  const barW = Math.min(band * 0.56, 48)
  const yAt = (v: number) => TOP + y.at(v, plotH)
  const focus = data.focus ?? note?.at

  const fill = (i: number) =>
    focus === undefined ? "var(--color-series-2)" : i === focus ? "var(--color-accent)" : "var(--color-series-3)"

  const summary = data.items.map((item) =>
    `${item.label} ${formatValue(item.value, data.format)}${
      item.compare === undefined ? "" : `, was ${formatValue(item.compare, data.format)}`
    }`
  ).join("; ")
  const n = data.items.length
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const at = Math.floor((event.clientX - box.left - gutter) / (band || 1))
    setActive(at >= 0 && at < n ? at : null)
  }
  const shown = active === null ? undefined : data.items[active]

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
            if (event.key === "ArrowRight") setActive(Math.min(n - 1, (active ?? -1) + 1))
            if (event.key === "ArrowLeft") setActive(Math.max(0, (active ?? n) - 1))
          }}
          onBlur={() => setActive(null)}
        >
          {y.marks.map((mark) => (
            <g key={mark}>
              <line
                x1={gutter}
                x2={width}
                y1={yAt(mark)}
                y2={yAt(mark)}
                stroke={mark === 0 ? "var(--color-line-strong)" : "var(--color-grid)"}
              />
              {axisLabels && (
                <text x={gutter - 8} y={yAt(mark)} dy="0.32em" textAnchor="end" className="figure fill-ink-3 text-2xs">
                  {formatAxis(mark, data.format)}
                </text>
              )}
            </g>
          ))}

          {data.items.map((item, i) => {
            const cx = gutter + band * i + band / 2
            const top = yAt(item.value)
            const isFocus = i === focus
            return (
              <g key={item.label}>
                {active === i && (
                  <rect
                    x={cx - band / 2}
                    y={TOP - 6}
                    width={band}
                    height={yAt(0) - TOP + 6}
                    fill="var(--color-hover)"
                  />
                )}
                <rect
                  x={cx - barW / 2}
                  y={top}
                  width={barW}
                  height={Math.max(yAt(0) - top, 1)}
                  rx="3"
                  fill={fill(i)}
                  className="transition-[fill]"
                />
                <text
                  x={cx}
                  y={top - 6}
                  textAnchor="middle"
                  className={isFocus ? "figure fill-accent-ink text-2xs font-semibold" : "figure fill-ink-2 text-2xs"}
                >
                  {formatValue(item.value, data.format)}
                </text>
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className={isFocus ? "fill-ink text-2xs font-medium" : "fill-ink-3 text-2xs"}
                >
                  {item.label}
                </text>
                {note !== undefined && note.at === i && <NotePin x={cx + barW / 2 + 2} y={top + 2} />}
              </g>
            )
          })}

          {data.reference !== undefined && (
            <g>
              <line
                x1={gutter}
                x2={width}
                y1={yAt(data.reference.value)}
                y2={yAt(data.reference.value)}
                stroke="var(--color-ink-2)"
                strokeDasharray="5 3"
              />
              <text
                x={width}
                y={yAt(data.reference.value)}
                dy="-0.5em"
                textAnchor="end"
                className="figure fill-ink-2 text-2xs"
              >
                {data.reference.label}
              </text>
            </g>
          )}
        </svg>
      )}

      {width > 0 && shown !== undefined && active !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-sm bg-canvas/95 px-2 py-1 shadow-sm ring-1 ring-line"
          style={{ left: Math.min(Math.max(gutter + band * active + band / 2 - 60, 0), Math.max(width - 132, 0)) }}
          aria-hidden="true"
        >
          <p className="text-2xs text-ink-3">{shown.label}</p>
          <p className="figure text-xs font-medium whitespace-nowrap text-ink">
            {formatValue(shown.value, data.format)}
            {shown.compare !== undefined && (
              <span className="ml-1.5 font-normal text-ink-3">
                was {formatValue(shown.compare, data.format)} · {formatChange(shown.value, shown.compare, data.format)}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
