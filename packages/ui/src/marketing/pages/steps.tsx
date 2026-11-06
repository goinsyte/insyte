import { AnimatePresence, motion, type MotionValue, useMotionValue, useReducedMotion } from "motion/react"
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import { cn } from "../../lib/utils.ts"
import { Frame } from "../frame.tsx"
import { SectionHead } from "./shell.tsx"

/*
 * A sticky scroll sequence: the steps' text runs down one column while the other column holds one
 * product moment in place and changes it as each step reaches the reading line. The incoming moment
 * rises out of a short blur, the outgoing one sinks; a ruled index beside the moment fills its
 * segment with the reading. Scrolling back reverses it. The moment is told whether it is the one on
 * screen, so its own small loop runs only then.
 *
 * Below `lg`, and under reduced motion, there is no pinning: each step's moment sits under its text.
 */

export type Step = {
  readonly title: string
  readonly body: ReactNode
  readonly points?: ReadonlyArray<string>
  /** The product moment; `on` is whether it is the one being read. */
  readonly render: (on: boolean) => ReactNode
}

function useActiveStep(refs: RefObject<Array<HTMLElement | null>>, frac: MotionValue<number>) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.5
      let current = 0
      const list = refs.current
      list.forEach((el, i) => {
        if (el !== null && el.getBoundingClientRect().top <= line) current = i
      })
      const el = list[current]
      if (el != null) {
        const r = el.getBoundingClientRect()
        frac.set(Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height))))
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [refs, frac])
  return active
}

export function StickySteps(
  { id, title, second, lede, steps, ground = "paper", flip = false }: {
    readonly id: string
    readonly title: string
    readonly second?: string | undefined
    readonly lede?: ReactNode | undefined
    readonly steps: ReadonlyArray<Step>
    readonly ground?: "paper" | "glacier"
    /** Moment on the left instead of the right. */
    readonly flip?: boolean
  }
) {
  const reduced = useReducedMotion() === true
  const els = useRef<Array<HTMLElement | null>>([])
  const frac = useMotionValue(0)
  const active = useActiveStep(els, frac)
  const step = steps[active] ?? steps[0]!
  return (
    <section id={id} aria-labelledby={`${id}-kop`} className={ground === "paper" ? "bg-paper" : "bg-glacier"}>
      <Frame inner="py-20 sm:py-28">
        <SectionHead id={`${id}-kop`} title={title} second={second} lede={lede} />
        <div
          className={cn(
            "mt-14 grid grid-cols-[minmax(0,1fr)] gap-16 lg:mt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16",
            flip && "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
          )}
        >
          <ol className={cn("flex flex-col gap-20 lg:gap-0", flip && "lg:order-2")}>
            {steps.map((s, i) => (
              <li
                key={s.title}
                ref={(el) => {
                  els.current[i] = el
                }}
                className={cn(
                  "flex flex-col gap-4 transition-opacity duration-[420ms] lg:min-h-[78svh] lg:justify-center",
                  !reduced && i !== active && "lg:opacity-35"
                )}
              >
                <span className="text-ink-3 text-sm tabular-nums">
                  {i + 1} van {steps.length}
                </span>
                <h3 className="max-w-[22ch] font-medium text-3xl text-ink">{s.title}</h3>
                <div className="max-w-[44ch] text-ink-2 text-lg">{s.body}</div>
                {s.points === undefined ? null : (
                  <ul className="flex flex-col gap-2 pt-1">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-base text-ink-2">
                        <span aria-hidden className="mt-[0.55em] size-[6px] shrink-0 bg-abyss" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 lg:hidden">{s.render(true)}</div>
              </li>
            ))}
          </ol>
          <div className={cn("hidden lg:block", flip && "lg:order-1")}>
            <div className="sticky top-24 flex h-[calc(100svh-8rem)] min-h-[520px] flex-col justify-center gap-5">
              <div className="relative">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={active}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, filter: "blur(6px)", scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -20, filter: "blur(4px)", scale: 0.99 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {step.render(true)}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div aria-hidden className="flex items-center gap-1.5">
                {steps.map((s, i) => (
                  <span key={s.title} className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <motion.span
                      className="absolute inset-0 origin-left bg-abyss"
                      style={{ scaleX: i === active ? frac : i < active ? 1 : 0 }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Frame>
    </section>
  )
}

/** The ground a moment sits on: a glacier field with the construction crosses at its corners. */
export function MomentFrame(
  { children, className, tone = "glacier" }: {
    readonly children: ReactNode
    readonly className?: string
    readonly tone?: "glacier" | "mist" | "abyss" | "none"
  }
) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-xl",
        tone === "none" ? "" : "min-h-[380px] overflow-hidden p-5 sm:p-8",
        tone === "glacier" && "bg-glacier",
        tone === "mist" && "bg-mist",
        tone === "abyss" && "chapter bg-abyss",
        className
      )}
    >
      {tone === "none" ? null : tone === "abyss"
        ? <div aria-hidden className="pointer-events-none absolute inset-0 drafting-chalk" />
        : (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(0deg,color-mix(in_oklch,var(--ink)_4%,transparent)_0_1px,transparent_1px_32px),repeating-linear-gradient(90deg,color-mix(in_oklch,var(--ink)_4%,transparent)_0_1px,transparent_1px_32px)] [mask-image:radial-gradient(80%_80%_at_50%_50%,black,transparent)]"
          />
        )}
      <div aria-hidden inert className="relative w-full select-none">{children}</div>
    </div>
  )
}
