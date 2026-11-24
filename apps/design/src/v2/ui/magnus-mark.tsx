import { useId } from "react"

/**
 * Magnus's mark: five petals, one per stop of the AI gradient, overlapping on multiply so the
 * centre deepens. The owner's flower, redrawn as a mark rather than a picture. It is the only
 * multicolour object in `/v2` besides the gradient itself, and it always means "the assistant".
 */
const PETALS = [
  "var(--color-ai-coral)",
  "var(--color-ai-amber)",
  "var(--color-ai-sky)",
  "var(--color-ai-violet)",
  "var(--color-ai-magenta)"
] as const

export function MagnusMark({ size = 20, label }: { readonly size?: number; readonly label?: string }) {
  const id = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className="shrink-0"
    >
      <g style={{ isolation: "isolate" }}>
        {PETALS.map((fill, i) => (
          <ellipse
            key={`${id}-${fill}`}
            cx="12"
            cy="6.6"
            rx="4.1"
            ry="5.6"
            fill={fill}
            opacity="0.9"
            style={{ mixBlendMode: "multiply" }}
            transform={`rotate(${i * 72} 12 12)`}
          />
        ))}
      </g>
      <circle cx="12" cy="12" r="1.9" fill="white" />
    </svg>
  )
}
