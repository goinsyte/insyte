import { type MotionValue, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react"
import { type RefObject, useEffect } from "react"

type Offset = NonNullable<Parameters<typeof useScroll>[0]>["offset"]

/**
 * Writes a target's scroll progress (0 → 1) into a CSS custom property on that target.
 *
 * One style write per frame on one element; everything that reacts to it — words lighting up,
 * lines drawing, logos rising — reads `var(--name)` in `calc()` and animates opacity, transform or
 * a dash offset. React does not re-render on scroll.
 *
 * The property is left at 1 until the client takes over, so the server's HTML and a reduced-motion
 * reader both get the finished state.
 */
export function useScrollVar(
  ref: RefObject<HTMLElement | null>,
  { name = "--p", offset }: { readonly name?: string; readonly offset?: Offset } = {}
): MotionValue<number> {
  const reduced = useReducedMotion() === true
  const { scrollYProgress } = useScroll(offset === undefined ? { target: ref } : { target: ref, offset })

  useEffect(() => {
    const node = ref.current
    if (node === null) return
    node.style.setProperty(name, reduced ? "1" : String(scrollYProgress.get()))
  }, [reduced, name, ref, scrollYProgress])

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reduced) return
    ref.current?.style.setProperty(name, value.toFixed(4))
  })

  return scrollYProgress
}
