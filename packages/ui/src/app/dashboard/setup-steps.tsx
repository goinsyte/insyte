import { motion, useReducedMotion } from "motion/react"

/**
 * The steps as the Drift mark draws them: offset squares down a diagonal, filled once done, the
 * next one outlined and breathing. Seven steps, seven squares; the drawing is the progress bar.
 */
export function Steps(
  { done, total, still: stillProp = false, className = "hidden shrink-0 sm:block" }: {
    done: number
    total: number
    still?: boolean
    className?: string
  }
) {
  const still = useReducedMotion() || stillProp
  const STEP = 15
  const SIZE = 30
  const w = SIZE + STEP * (total - 1)
  return (
    <svg width={w} height={w} viewBox={`0 0 ${w} ${w}`} fill="none" aria-hidden className={className}>
      {Array.from({ length: total }, (_, i) => {
        const on = i < done
        const isNext = i === done
        return (
          <motion.rect
            key={i}
            x={i * STEP}
            y={w - SIZE - i * STEP}
            width={SIZE}
            height={SIZE}
            rx={7}
            fill={on ? "var(--mesh-ink)" : "var(--abyss)"}
            fillOpacity={on ? 0.92 - i * 0.04 : 1}
            stroke="var(--mesh-ink)"
            strokeOpacity={on ? 0 : isNext ? 0.9 : 0.28}
            strokeWidth={1.25}
            strokeDasharray={on || isNext ? undefined : "3 3"}
            initial={still ? false : { opacity: 0, y: 8 }}
            animate={isNext && !still
              ? { opacity: [1, 0.55, 1], y: 0 }
              : { opacity: 1, y: 0 }}
            transition={isNext && !still
              ? { opacity: { duration: 2.4, repeat: Infinity, ease: "easeInOut" }, y: { delay: i * 0.06 } }
              : { delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        )
      })}
    </svg>
  )
}
