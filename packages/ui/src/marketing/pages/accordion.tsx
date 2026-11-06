import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useId, useState } from "react"
import { Check, Link2, Plus } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import type { FaqItem } from "../faq-data.ts"
import { useMarketingLinks } from "../links.tsx"
import { ArrowLink } from "../parts.tsx"

/*
 * One question as a hairline row (the homepage's form), with the answer always in the document — so
 * a crawler, find-in-page and a reader without JavaScript all have it — and its height, opacity and
 * a short de-blur animated when it opens. Under reduced motion it simply appears.
 */

const fold = (s: string) => [...s].map((c) => c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()).join("")

/** Whether `query` (already folded) occurs in `text`, ignoring case and accents. */
export const matches = (text: string, query: string) => query === "" || fold(text).includes(query)

export const foldQuery = (q: string) => fold(q.trim())

/** The text with each occurrence of the folded query marked, in the original spelling. */
export function Highlight({ text, query }: { readonly text: string; readonly query: string }) {
  if (query === "") return <>{text}</>
  const folded = fold(text)
  if (folded.length !== text.length) return <>{text}</>
  const out: Array<ReactNode> = []
  let at = 0
  let i = folded.indexOf(query)
  while (i !== -1) {
    if (i > at) out.push(text.slice(at, i))
    out.push(
      <mark key={i} className="rounded-[3px] bg-arc-tint text-arc-ink">
        {text.slice(i, i + query.length)}
      </mark>
    )
    at = i + query.length
    i = folded.indexOf(query, at)
  }
  if (at < text.length) out.push(text.slice(at))
  return <>{out}</>
}

function CopyLink({ id }: { readonly id: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1800)
    return () => window.clearTimeout(t)
  }, [done])
  return (
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}/vragen#${id}`
        void navigator.clipboard?.writeText(url).then(() => setDone(true), () => setDone(false))
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-ink-3 text-sm transition-colors hover:bg-mist hover:text-ink"
    >
      {done ? <Check size={14} className="text-arc-ink" /> : <Link2 size={14} />}
      <span aria-live="polite">{done ? "Gekopieerd" : "Link kopiëren"}</span>
    </button>
  )
}

export function QuestionRow(
  { item, open, onToggle, query = "", copy = false, size = "lg" }: {
    readonly item: FaqItem
    readonly open: boolean
    readonly onToggle: () => void
    readonly query?: string
    /** Whether the open answer offers its own link (on /vragen, where the anchor exists). */
    readonly copy?: boolean
    readonly size?: "lg" | "xl"
  }
) {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  const panel = useId()
  const t = reduced ? { duration: 0 } : { duration: 0.46, ease: [0.16, 1, 0.3, 1] as const }
  return (
    <div id={copy ? item.id : undefined} className="scroll-mt-32 border-hairline border-b">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggle}
          className="group flex w-full items-start justify-between gap-6 py-5 text-left sm:py-6"
        >
          <span
            className={cn(
              "font-medium text-ink transition-colors group-hover:text-arc-ink",
              size === "xl" ? "text-xl" : "text-lg"
            )}
          >
            <Highlight text={item.q} query={query} />
          </span>
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors duration-[240ms]",
              open ? "bg-abyss text-mesh-ink" : "bg-ink/5 text-ink-2 group-hover:bg-ink/8"
            )}
          >
            <Plus
              size={16}
              className={cn(
                "transition-transform duration-[320ms] ease-[var(--ease-out-expo)] motion-reduce:transition-none",
                open && "rotate-[135deg]"
              )}
            />
          </span>
        </button>
      </h3>
      <motion.div
        id={panel}
        role="region"
        aria-label={item.q}
        initial={false}
        animate={{ height: open ? "auto" : 0 }}
        transition={t}
        className="overflow-hidden"
        inert={!open}
      >
        <motion.div
          initial={false}
          animate={open
            ? { opacity: 1, y: 0, filter: "blur(0px)" }
            : { opacity: 0, y: reduced ? 0 : -6, filter: reduced ? "blur(0px)" : "blur(3px)" }}
          transition={reduced ? { duration: 0 } : { duration: open ? 0.4 : 0.18, delay: open ? 0.08 : 0 }}
          className="flex max-w-[68ch] flex-col gap-3 pr-12 pb-6"
        >
          {item.a.map((p) => (
            <p key={p.slice(0, 24)} className="text-ink-2 text-md">
              <Highlight text={p} query={query} />
            </p>
          ))}
          {item.link !== undefined || copy
            ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
                {item.link === undefined
                  ? null
                  : <ArrowLink href={links.page(item.link.path)}>{item.link.label}</ArrowLink>}
                {copy ? <CopyLink id={item.id} /> : null}
              </div>
            )
            : null}
        </motion.div>
      </motion.div>
    </div>
  )
}

/** A plain list of rows, one open at a time or several: the homepage's and /prijzen's form. */
export function QuestionList(
  { items, size = "lg", className }: {
    readonly items: ReadonlyArray<FaqItem>
    readonly size?: "lg" | "xl"
    readonly className?: string
  }
) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  return (
    <div className={cn("border-hairline border-t", className)}>
      {items.map((item) => (
        <QuestionRow
          key={item.id}
          item={item}
          size={size}
          open={open.has(item.id)}
          onToggle={() =>
            setOpen((s) => {
              const next = new Set(s)
              if (next.has(item.id)) next.delete(item.id)
              else next.add(item.id)
              return next
            })}
        />
      ))}
    </div>
  )
}
