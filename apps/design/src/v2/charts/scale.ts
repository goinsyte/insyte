import { useLayoutEffect, useRef, useState } from "react"

/** A step of 1, 2, 2.5 or 5 × 10ⁿ, so axis labels are numbers a person would write. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return nice * power
}

/**
 * The value axis. Bars always start at zero (a bar's length is its value); a line may start above
 * zero so a week's movement is visible, but always from the nice step at or below the lowest point.
 */
export function axis(values: ReadonlyArray<number>, { zero, ticks = 3 }: { zero: boolean; ticks?: number }) {
  const max = Math.max(...values)
  const min = zero ? 0 : Math.min(...values)
  const step = niceStep(max - min || max || 1, ticks)
  const lo = zero ? 0 : Math.max(0, Math.floor(min / step) * step)
  const hi = Math.ceil(max / step) * step
  const marks: Array<number> = []
  for (let v = lo; v <= hi + step / 2; v += step) marks.push(v)
  return { lo, hi, marks, at: (value: number, height: number) => height - ((value - lo) / (hi - lo || 1)) * height }
}

/** The rendered width of an element, kept current: charts draw at real pixels, so text never stretches. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    setWidth(node.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
