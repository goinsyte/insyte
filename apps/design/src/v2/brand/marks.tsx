import { useId } from "react"
import type { CSSProperties, ReactNode } from "react"

/**
 * The product owner's three marks, redrawn as SVG on one 48-unit grid so they sit together at any
 * size: Insyte (three stacked squares, the front one with three lines), Blended data (a burst of six
 * pills) and Magnus (an eight-petal flower round a four-point star).
 *
 * Every colour is a prop, so the same mark draws in any palette. `mono` paints the whole mark in one
 * colour; what has to stay readable inside it (the gaps between the squares, the lines, the star) is
 * cut out with a mask rather than painted white, so a mono mark works on any ground. Below 28px a
 * mark draws its small cut: thicker lines, wider gaps, fewer details.
 */

type Common = {
  readonly size?: number
  /** One colour for the whole mark. */
  readonly mono?: string
  /** Read out; without it the mark is decoration. */
  readonly title?: string
  readonly className?: string
}

/** Small marks get thicker details: the cut switches at this size. */
const SMALL = 28

function useMaskId(name: string) {
  return `${name}-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
}

function Svg({ size, title, className, children }: Common & { readonly children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title === undefined ? undefined : "img"}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      className={className === undefined ? "shrink-0" : `shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

/* ── Insyte ───────────────────────────────────────────────────────────────────────────────────── */

const SQUARE = 28
const OFFSETS = [1, 10, 19] as const

export function InsyteMark({ size = 48, mono, title, className, squares, lines, overprint }: Common & {
  /** Back, middle, front. */
  readonly squares: readonly [string, string, string]
  /** The front square's lines; knocked out (the ground shows through) when absent. */
  readonly lines?: string
  /** Squares print through each other instead of stacking (multiply). Ignored in mono. */
  readonly overprint?: boolean
}) {
  const id = useMaskId("insyte")
  const small = size < SMALL
  const gap = small ? 2.6 : 1.6
  const radius = small ? 7 : 8
  const through = overprint === true && mono === undefined
  // Three lines, left-aligned, middle the longest; two thicker ones in the small cut.
  const rows = small
    ? [{ y: 29.5, w: 11 }, { y: 36, w: 7 }]
    : [{ y: 28.5, w: 10 }, { y: 33, w: 13 }, { y: 37.5, w: 7 }]
  const stroke = small ? 3.6 : 2.6
  const fills = mono === undefined ? squares : [mono, mono, mono] as const
  const knockout = mono !== undefined || lines === undefined

  const cut = (o: number) => (
    <rect
      x={o - gap}
      y={o - gap}
      width={SQUARE + gap * 2}
      height={SQUARE + gap * 2}
      rx={radius + gap}
      fill="black"
    />
  )
  const lineEls = (colour: string) =>
    rows.map((row) => (
      <line
        key={row.y}
        x1={26}
        x2={26 + row.w}
        y1={row.y}
        y2={row.y}
        stroke={colour}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    ))

  return (
    <Svg size={size} title={title} className={className}>
      <defs>
        <mask id={`${id}-0`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          {!through && cut(OFFSETS[1])}
        </mask>
        <mask id={`${id}-1`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          {!through && cut(OFFSETS[2])}
        </mask>
        <mask id={`${id}-2`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          {knockout && lineEls("black")}
        </mask>
      </defs>
      <g style={through ? { isolation: "isolate" } : undefined}>
        {OFFSETS.map((o, i) => (
          <rect
            key={o}
            x={o}
            y={o}
            width={SQUARE}
            height={SQUARE}
            rx={radius}
            fill={fills[i]}
            mask={`url(#${id}-${i})`}
            style={through ? { mixBlendMode: "multiply" } : undefined}
          />
        ))}
      </g>
      {!knockout && lines !== undefined && lineEls(lines)}
    </Svg>
  )
}

/* ── Blended data ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Six pills round a centre, read off the owner's drawing: angle (degrees, clockwise from three
 * o'clock), inner and outer reach from the centre. Uneven on purpose: a burst, not a clock face.
 */
const PILLS = [
  { angle: 222, from: 8, to: 22 },
  { angle: 278, from: 12.5, to: 18.5 },
  { angle: 326, from: 12, to: 19 },
  { angle: 18, from: 11, to: 19.5 },
  { angle: 84, from: 9, to: 19.5 },
  { angle: 156, from: 8, to: 20 }
] as const

const CENTRE = { x: 24.5, y: 24.5 }

export function BlendedDataMark({ size = 48, mono, title, className, pills }: Common & {
  /** Six colours, clockwise from the long pill at the upper left. */
  readonly pills: ReadonlyArray<string>
}) {
  const width = size < SMALL ? 7 : 6.4
  return (
    <Svg size={size} title={title} className={className}>
      {PILLS.map((pill, i) => {
        const rad = (pill.angle * Math.PI) / 180
        const at = (r: number) => ({ x: CENTRE.x + Math.cos(rad) * r, y: CENTRE.y + Math.sin(rad) * r })
        const a = at(pill.from)
        const b = at(pill.to)
        return (
          <line
            key={pill.angle}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={mono ?? pills[i]}
            strokeWidth={width}
            strokeLinecap="round"
          />
        )
      })}
    </Svg>
  )
}

/* ── Magnus ───────────────────────────────────────────────────────────────────────────────────── */

/** A four-point star with drawn-in sides, centred on 24,24, points `r` from the centre. */
function star(r: number): string {
  const k = r * 0.2
  const lo = 24 - r
  const hi = 24 + r
  return [
    `M24 ${lo}`,
    `Q${24 + k} ${24 - k} ${hi} 24`,
    `Q${24 + k} ${24 + k} 24 ${hi}`,
    `Q${24 - k} ${24 + k} ${lo} 24`,
    `Q${24 - k} ${24 - k} 24 ${lo}`,
    "Z"
  ].join(" ")
}

export function MagnusFlowerMark({ size = 48, mono, title, className, petals, core, star: starFill, overprint }:
  & Common
  & {
    /** Eight colours, clockwise from the top. */
    readonly petals: ReadonlyArray<string>
    /** The disc behind the star. */
    readonly core: string
    readonly star: string
    readonly overprint?: boolean
  })
{
  const id = useMaskId("magnus")
  const small = size < SMALL
  const through = overprint === true && mono === undefined
  const starPath = star(small ? 8.8 : 8.4)
  const petalEls = Array.from({ length: 8 }, (_, i) => (
    <ellipse
      key={i}
      cx="24"
      cy="11"
      rx="6.9"
      ry="8.6"
      fill={petals[i]}
      transform={`rotate(${i * 45} 24 24)`}
      style={through ? { mixBlendMode: "multiply" } : undefined}
    />
  ))

  const coreRadius = small ? 9.5 : 8.6
  // In one colour the petals and the heart are cut apart by a gap, as the colours part them otherwise.
  const gap = small ? 2.2 : 1.5

  return (
    <Svg size={size} title={title} className={className}>
      {mono === undefined
        ? (
          <>
            <g style={through ? { isolation: "isolate" } : undefined}>{petalEls}</g>
            <circle cx="24" cy="24" r={coreRadius} fill={core} />
            <path d={starPath} fill={starFill} />
          </>
        )
        : (
          <>
            <defs>
              <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
                {Array.from({ length: 8 }, (_, i) => (
                  <ellipse
                    key={i}
                    cx="24"
                    cy="11"
                    rx="6.9"
                    ry="8.6"
                    fill="white"
                    stroke="black"
                    strokeWidth={gap}
                    transform={`rotate(${i * 45} 24 24)`}
                  />
                ))}
                <circle cx="24" cy="24" r={coreRadius} fill="white" stroke="black" strokeWidth={gap} />
                <path d={starPath} fill="black" />
              </mask>
            </defs>
            <rect width="48" height="48" fill={mono} mask={`url(#${id})`} />
          </>
        )}
    </Svg>
  )
}

/* ── lockup ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * The mark beside the word "Insyte": the word set at 0.78 of the mark's height, so the mark stands
 * about a third taller than the capitals, and a gap of 0.3 of the mark. Mona Sans semibold, tight.
 */
export function Lockup({ size = 32, colour, children }: {
  /** The mark's height in px. */
  readonly size?: number
  /** The word's colour. */
  readonly colour: string
  /** The mark. */
  readonly children: ReactNode
}) {
  const style: CSSProperties = {
    gap: Math.round(size * 0.3),
    fontSize: Math.round(size * 0.78),
    lineHeight: 1,
    color: colour,
    letterSpacing: "-0.03em"
  }
  return (
    <span className="inline-flex items-center font-semibold" style={style}>
      {children}
      <span className="pb-[0.04em]">Insyte</span>
    </span>
  )
}
