import { animate, motion, type Variants } from "motion/react"
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { cn } from "../lib/utils.ts"
import { usePlay } from "./parts.tsx"

/*
 * The page's motion, on `motion/react`, under one rule: the server renders the final frame.
 *
 * `usePlay` (parts.tsx) starts every piece shown. On the client, with motion allowed, a piece that is
 * still below the fold is rewound to its first frame in zero time and waits; when it is scrolled to
 * it plays once, on a spring. A piece on screen at load, a reader with reduced motion, a crawler and a
 * browser without JavaScript all get the finished page. Only transform and opacity move.
 */

const SPRING = { type: "spring", stiffness: 140, damping: 22, mass: 0.9 } as const

const group: Variants = {
  hidden: { transition: { duration: 0 } },
  shown: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } }
}

const item: Variants = {
  hidden: { opacity: 0, y: 28, transition: { duration: 0 } },
  shown: { opacity: 1, y: 0, transition: SPRING }
}

/** Whether the nearest `Reveal` is playing; a piece inside it reads this to time its own motion. */
const PlayContext = createContext(true)

/** A section or a grid that reveals once, its `RevealItem` children staggering in. */
export function Reveal(
  { children, className, as = "div" }: {
    readonly children: ReactNode
    readonly className?: string
    readonly as?: "div" | "ul" | "ol"
  }
) {
  const { play, ref } = usePlay<HTMLElement>()
  const Tag = as === "ul" ? motion.ul : as === "ol" ? motion.ol : motion.div
  return (
    <PlayContext value={play}>
      <Tag
        ref={ref as never}
        data-play={play}
        variants={group}
        initial={false}
        animate={play ? "shown" : "hidden"}
        className={className}
      >
        {children}
      </Tag>
    </PlayContext>
  )
}

/** One staggered piece of a `Reveal`. */
export function RevealItem(
  { children, className, as = "div", lift = false }: {
    readonly children: ReactNode
    readonly className?: string
    readonly as?: "div" | "li" | "article"
    /** A card the pointer can lift a few pixels — the hover micro-interaction. */
    readonly lift?: boolean
  }
) {
  const Tag = as === "li" ? motion.li : as === "article" ? motion.article : motion.div
  return (
    <Tag
      variants={item}
      className={cn("group", className)}
      {...(lift ? { whileHover: { y: -4, transition: { type: "spring", stiffness: 320, damping: 26 } } } : {})}
    >
      {children}
    </Tag>
  )
}

/**
 * A figure that counts up to its value when its `Reveal` plays. Writes text directly, so a count is
 * one text write per frame and no re-render. Only a piece that was rewound counts: one on screen at
 * load, or under reduced motion, keeps the value the server rendered.
 */
export function Count({ to, format }: { readonly to: number; readonly format: (n: number) => string }) {
  const play = useContext(PlayContext)
  const ref = useRef<HTMLSpanElement | null>(null)
  const armed = useRef(false)
  useEffect(() => {
    const node = ref.current
    if (node === null) return
    if (!play) {
      armed.current = true
      node.textContent = format(0)
      return
    }
    if (!armed.current) return
    const controls = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v)
      }
    })
    return () => controls.stop()
  }, [play, to, format])
  return <span ref={ref}>{format(to)}</span>
}

/**
 * Writes `text` out a few characters at a time while `run`, the way a draft or a question arrives.
 * When it is not running — on the server, under reduced motion, off screen — the whole text shows.
 */
export function useTyped(text: string, run: boolean, delay = 600): string {
  const [n, setN] = useState(text.length)
  useEffect(() => {
    if (!run) {
      setN(text.length)
      return
    }
    setN(0)
    let i = 0
    let id = 0
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        i += 3
        setN(Math.min(i, text.length))
        if (i >= text.length) window.clearInterval(id)
      }, 28)
    }, delay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [text, run, delay])
  return text.slice(0, n)
}
