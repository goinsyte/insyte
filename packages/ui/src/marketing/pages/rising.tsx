import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import { type ReactNode, useRef } from "react"
import { cn } from "../../lib/utils.ts"

/**
 * A product render rising out of a hero wrapper, as the homepage's console window does: tilted back
 * and a little low as it enters, flat by the time its top reaches the upper third, on a spring.
 * Transform only; under reduced motion it simply lies flat.
 */
export function Rising(
  { children, zoom = "[zoom:0.38] sm:[zoom:0.66] md:[zoom:0.8] lg:[zoom:1.08] xl:[zoom:1.2]" }: {
    readonly children: ReactNode
    /** The zoom ladder that fits the render's own width to the column. */
    readonly zoom?: string
  }
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.3"] })
  const eased = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.6 })
  const rotateX = useTransform(eased, [0, 1], [14, 0])
  const y = useTransform(eased, [0, 1], [40, 0])
  const scale = useTransform(eased, [0, 1], [0.94, 1])
  return (
    <motion.div
      ref={ref}
      style={reduced ? {} : { rotateX, y, scale, transformPerspective: 1800, transformOrigin: "50% 0%" }}
      className="mx-auto w-fit max-w-full overflow-hidden rounded-lg outline outline-mesh-ink/20 window-lift"
    >
      <div className={cn(zoom)}>{children}</div>
    </motion.div>
  )
}
