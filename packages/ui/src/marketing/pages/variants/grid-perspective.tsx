import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { useRef } from "react"
import { stroke, type Tone } from "./shared.tsx"

/**
 * The drafting grid laid down as a floor in perspective under the copy; scrolling tilts it flat and
 * draws it toward the reader. Scroll-linked only: it does not move on its own.
 */
export function GridPerspective({ tone }: { readonly tone: Tone }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const line = stroke(tone, tone === "dark" ? 26 : 18)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [72, 48])
  const y = useTransform(scrollYProgress, [0, 1], [0, -120])
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [perspective:900px]">
      <motion.div
        className="absolute -inset-x-1/2 top-[52%] h-[160%] origin-top [mask-image:linear-gradient(180deg,black,transparent_60%)]"
        style={{
          ...(reduced ? { rotateX: 60 } : { rotateX, y }),
          backgroundImage:
            `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 48px)`
        }}
      />
    </div>
  )
}
