import { cn } from "../../../lib/utils.ts"
import { Logo, type Vendor } from "../../parts.tsx"
import { Layer, stroke, type Tone } from "./shared.tsx"

const MARKS: ReadonlyArray<readonly [Vendor, number, number]> = [
  ["shopify", 160, 140],
  ["gmail", 300, 560],
  ["stripe", 1250, 170],
  ["klarna", 1120, 600],
  ["outlook", 90, 380],
  ["paypal", 1360, 420],
  ["dhl", 470, 90],
  ["slack", 980, 80],
  ["klaviyo", 600, 650],
  ["postnl", 860, 660]
]

const LINKS: ReadonlyArray<readonly [number, number]> = [
  [0, 6],
  [6, 7],
  [7, 2],
  [2, 5],
  [5, 3],
  [3, 9],
  [9, 8],
  [8, 1],
  [1, 4],
  [4, 0]
]

/**
 * The services Insyte connects to, scattered at the edges of the hero and joined by thin lines
 * that light one after another round the constellation; the copy keeps the quiet middle.
 */
export function LogoConstellation({ tone }: { readonly tone: Tone }) {
  return (
    <Layer>
      <svg
        viewBox="0 0 1440 720"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        fill="none"
      >
        {LINKS.map(([a, b], i) => {
          const [, x1, y1] = MARKS[a]!
          const [, x2, y2] = MARKS[b]!
          return (
            <g key={i}>
              <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={stroke(tone, 9)} />
              <path
                d={`M${x1} ${y1} L${x2} ${y2}`}
                stroke={tone === "dark" ? "var(--sky)" : "var(--arc)"}
                strokeWidth="1.2"
                pathLength={100}
                strokeDasharray="100 100"
                className="variant-anim variant-wire"
                style={{ animationDelay: `${i * 0.8}s`, animationDuration: `${LINKS.length * 0.8}s` }}
              />
            </g>
          )
        })}
      </svg>
      {MARKS.map(([v, x, y]) => (
        <span
          key={v}
          className={cn(
            "absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg max-md:hidden",
            tone === "dark" ? "bg-mesh-ink/8 chalk-line" : "bg-paper hairline"
          )}
          style={{ left: `${(x / 1440) * 100}%`, top: `${(y / 720) * 100}%` }}
        >
          <Logo vendor={v} size={28} />
        </span>
      ))}
    </Layer>
  )
}
