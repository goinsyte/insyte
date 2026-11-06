import { Mark } from "../../parts.tsx"
import { Layer, stroke, type Tone } from "./shared.tsx"

const N = 14

/**
 * Nodes on the grid, each drawing a dashed line into the Insyte mark at the centre in turn, the line
 * fading as the next one draws: the store, the inbox and the providers arriving at one place.
 */
export function NodesToMark({ tone }: { readonly tone: Tone }) {
  const nodes = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 + (i % 2) * 0.12
    const r = i % 2 === 0 ? 300 : 420
    return [720 + Math.cos(a) * r * 1.5, 380 + Math.sin(a) * r * 0.75] as const
  })
  return (
    <Layer>
      <svg
        viewBox="0 0 1440 720"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        fill="none"
      >
        {nodes.map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y} L720 120`} stroke={stroke(tone, 7)} strokeDasharray="3 6" />
            <path
              d={`M${x} ${y} L720 120`}
              stroke={tone === "dark" ? "var(--sky)" : "var(--arc)"}
              strokeWidth="1.2"
              pathLength={100}
              strokeDasharray="100 100"
              className="variant-anim variant-wire"
              style={{ animationDelay: `${i * 0.6}s`, animationDuration: `${N * 0.6}s` }}
            />
            <rect x={x - 4} y={y - 4} width="8" height="8" fill={stroke(tone, 35)} />
          </g>
        ))}
      </svg>
      <span className="absolute top-[16.6%] left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-abyss opacity-90">
        <Mark size={28} tone="white" />
      </span>
    </Layer>
  )
}
