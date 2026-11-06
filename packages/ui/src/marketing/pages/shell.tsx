import { motion, MotionConfig, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"
import { ArrowRight } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Closing } from "../closing.tsx"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { MarketingLinksProvider } from "../links.tsx"
import { SiteNav } from "../nav.tsx"

/*
 * The skeleton every page of the site shares, so the site reads as one drawing rather than a set of
 * templates: the banner and the full-width bar, a rounded abyss hero wrapper inset like the
 * homepage's, sections on flat grounds framed by the dashed construction rails, and the closing band
 * with the footer. A page brings its own sections and one or two authored moments; the frame, the
 * type, the grounds and the motion rule (the server renders the final frame) are the same as the
 * homepage's.
 */

export function MarketingPage({ links, children }: { readonly links: MarketingLinks; readonly children: ReactNode }) {
  return (
    <MarketingLinksProvider links={links}>
      <MotionConfig reducedMotion="user">
        <div className="light min-h-svh bg-paper text-ink">
          <SiteNav />
          <main>{children}</main>
          <Closing />
        </div>
      </MotionConfig>
    </MarketingLinksProvider>
  )
}

/* The hero's arrival, as on the homepage: transform only, so the headline is painted (and is the
   LCP) on the first frame, before any JavaScript runs. */
const rise = (i: number) => ({
  initial: { y: 16 },
  animate: { y: 0 },
  transition: { type: "spring" as const, stiffness: 120, damping: 20, delay: 0.04 + i * 0.07 }
})

export type TitleField = { readonly label: string; readonly value: ReactNode }

/**
 * A drawing's title block, at the foot of the hero: a few ruled cells of what the page is. Chalk
 * hairlines on abyss, ink hairlines on a light hero. The rules draw in once.
 */
export function TitleBlock({ fields, dark }: { readonly fields: ReadonlyArray<TitleField>; readonly dark: boolean }) {
  const reduced = useReducedMotion() === true
  return (
    <dl className="relative grid w-full grid-cols-2 sm:w-auto sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
      <motion.span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-px origin-left", dark ? "dash-x-chalk" : "dash-x")}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      />
      {fields.map((f, i) => (
        <div
          key={f.label}
          className="relative flex min-w-[9rem] flex-col gap-1 px-4 pt-3 pb-1 first:pl-0 sm:first:pl-4"
        >
          {i > 0
            ? (
              <motion.span
                aria-hidden
                className={cn(
                  "absolute top-0 left-0 h-full w-px origin-top max-sm:odd:hidden",
                  dark ? "dash-y-chalk" : "dash-y"
                )}
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.6, delay: 0.55 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            )
            : (
              <span
                aria-hidden
                className={cn("absolute top-0 left-0 h-full w-px max-sm:hidden", dark ? "dash-y-chalk" : "dash-y")}
              />
            )}
          <dt className={cn("text-xs", dark ? "text-mesh-ink-3" : "text-ink-3")}>{f.label}</dt>
          <dd className={cn("text-sm tabular-nums", dark ? "text-mesh-ink" : "text-ink")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The notch: the block's top edge dips into two rounded shoulders that meet under the centre, so
 * the block reads as cut from the page rather than set on it. Two page-coloured corners, each a
 * square with a quarter disc taken out.
 */
function Notch() {
  return (
    <span aria-hidden className="pointer-events-none absolute top-0 left-1/2 z-10 flex -translate-x-1/2">
      <span className="size-7 bg-[radial-gradient(circle_at_0_100%,transparent_27.5px,var(--paper)_28px)]" />
      <span className="size-7 bg-[radial-gradient(circle_at_100%_100%,transparent_27.5px,var(--paper)_28px)]" />
    </span>
  )
}

export type HeroVariant = "notch" | "light" | "split" | "form"

/**
 * A page's hero, one family in four forms (DESIGN.md, Marketing pages):
 * - `notch`: the abyss block, notched at the top centre, with the drafting grid and the Drift
 *   hatch, still; a `bleed` render crosses out of its foot.
 * - `light`: a mist or glacier block with the drafting grid in ink, still; the copy left or centred.
 * - `split`: light, the copy on the left and an abyss panel on the right holding a live moment.
 * - `form`: a calm light block whose foot the page's form card overlaps.
 * The grounds never move: moving backgrounds are tried in the /variants lab first. The headline is
 * one `h1` in two tones and is painted on the first frame (transform only).
 */
export function PageHero(
  {
    title,
    second,
    lede,
    actions,
    aside,
    children,
    fields,
    bleed,
    className,
    variant = "light",
    ground = "mist",
    align = "left",
    panel
  }: {
    readonly title: string
    readonly second?: string
    readonly lede?: ReactNode
    readonly actions?: ReactNode
    /** A figure beside the headline from `lg` up; below it, under the copy. */
    readonly aside?: ReactNode
    /** Anything under the copy, inside the block. */
    readonly children?: ReactNode
    readonly fields?: ReadonlyArray<TitleField>
    readonly bleed?: ReactNode
    readonly className?: string
    readonly variant?: HeroVariant
    readonly ground?: "mist" | "glacier"
    readonly align?: "left" | "center"
    /** The `split` hero's abyss panel content. */
    readonly panel?: ReactNode
  }
) {
  const reduced = useReducedMotion() === true
  const r = (i: number) => (reduced ? {} : rise(i))
  const dark = variant === "notch"
  const center = align === "center" && aside === undefined && variant !== "split"
  const side = variant === "split" ? panel : aside

  const copy = (
    <div className={cn("flex flex-col", center && "items-center text-center")}>
      <motion.h1
        {...r(0)}
        className={cn(
          "max-w-[24ch] font-medium text-4xl sm:text-display-sm",
          variant === "split" ? "" : "lg:text-display",
          dark ? "text-mesh-ink" : "text-ink"
        )}
      >
        {title}
        {second === undefined
          ? null
          : <span className={cn("block", dark ? "text-mesh-ink-2" : "text-ink-3")}>{second}</span>}
      </motion.h1>
      {lede === undefined ? null : (
        <motion.p
          {...r(1)}
          className={cn("mt-6 max-w-[56ch] text-lg sm:text-xl", dark ? "text-mesh-ink-2" : "text-ink-2")}
        >
          {lede}
        </motion.p>
      )}
      {actions === undefined ?
        null :
        (
          <motion.div {...r(2)} className={cn("mt-8 flex flex-wrap items-center gap-2", center && "justify-center")}>
            {actions}
          </motion.div>
        )}
    </div>
  )

  return (
    <div className={cn("relative isolate px-2 pt-1 sm:px-3 sm:pt-2", className)}>
      <div
        data-ground={dark ? "dark" : undefined}
        className={cn(
          "relative flow-root rounded-xl",
          dark ? "chapter bg-abyss text-mesh-ink" : ground === "mist" ? "bg-mist text-ink" : "bg-glacier text-ink",
          !dark && "hairline"
        )}
      >
        {dark ? <Notch /> : null}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          {dark
            ? (
              <>
                <div className="absolute inset-0 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent_85%)]" />
                <div className="absolute inset-0 hatch-chalk [mask-image:radial-gradient(60%_70%_at_100%_0%,black,transparent_75%)]" />
              </>
            )
            : (
              <div
                className={cn(
                  "absolute inset-0 drafting-ink",
                  center
                    ? "[mask-image:radial-gradient(70%_90%_at_50%_0%,black,transparent_80%)]"
                    : "[mask-image:radial-gradient(70%_90%_at_100%_0%,black,transparent_80%)]"
                )}
              />
            )}
        </div>
        <div
          id="main"
          tabIndex={-1}
          className={cn(
            "relative mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pt-16 outline-none sm:px-8 sm:pt-20 lg:pt-24",
            side === undefined
              ? ""
              : variant === "split"
              ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:items-center lg:gap-12"
              : "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16",
            bleed !== undefined ? "pb-0" : variant === "form" ? "pb-40 sm:pb-48" : "pb-10 sm:pb-14"
          )}
        >
          {copy}
          {side === undefined ? null : variant === "split"
            ? (
              <motion.div {...r(2)} className="min-w-0">
                <div className="chapter relative isolate flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg bg-abyss p-5 sm:p-8">
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10 drafting-chalk [mask-image:radial-gradient(70%_70%_at_50%_50%,transparent,black)]"
                  />
                  <div className="w-full">{side}</div>
                </div>
              </motion.div>
            )
            : <motion.div {...r(2)} className="min-w-0">{side}</motion.div>}
          {children === undefined ? null : <div className="lg:col-span-full">{children}</div>}
          {fields === undefined ?
            null :
            (
              <div className={cn("flex lg:col-span-full", center ? "justify-center" : "justify-end")}>
                <TitleBlock fields={fields} dark={dark} />
              </div>
            )}
        </div>
        {bleed === undefined ?
          null :
          <div className="relative z-10 mt-12 -mb-20 px-3 sm:mt-16 sm:-mb-32 sm:px-8 lg:-mb-44">{bleed}</div>}
      </div>
      {bleed === undefined ? null : <div aria-hidden className="h-24 sm:h-36 lg:h-48" />}
    </div>
  )
}

/** A section heading in the homepage's form: two tones in one `h2`, one sentence under it. */
export function SectionHead(
  { id, title, second, lede, dark = false, className, align = "left" }: {
    readonly id: string
    readonly title: string
    readonly second?: string | undefined
    readonly lede?: ReactNode | undefined
    readonly dark?: boolean
    readonly className?: string
    readonly align?: "left" | "center"
  }
) {
  return (
    <div className={cn("flex flex-col gap-5", align === "center" && "items-center text-center", className)}>
      <h2
        id={id}
        className={cn("max-w-[22ch] font-medium text-4xl sm:text-display-sm", dark ? "text-mesh-ink" : "text-ink")}
      >
        {title}
        {second === undefined
          ? null
          : <span className={cn("block", dark ? "text-mesh-ink-2" : "text-ink-3")}>{second}</span>}
      </h2>
      {lede === undefined
        ? null
        : <p className={cn("max-w-[56ch] text-lg", dark ? "text-mesh-ink-2" : "text-ink-2")}>{lede}</p>}
    </div>
  )
}

/** A section on a flat ground, framed by the construction rails, with its heading. */
export function PageSection(
  { id, ground = "paper", labelledBy, children, inner, className }: {
    readonly id?: string
    readonly ground?: "paper" | "glacier" | "mist" | "abyss"
    readonly labelledBy?: string
    readonly children: ReactNode
    readonly inner?: string
    readonly className?: string
  }
) {
  const dark = ground === "abyss"
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-ground={dark ? "dark" : undefined}
      className={cn(
        "relative isolate",
        ground === "paper" && "bg-paper",
        ground === "glacier" && "bg-glacier",
        ground === "mist" && "bg-mist",
        dark && "chapter overflow-hidden bg-abyss text-mesh-ink",
        className
      )}
    >
      {dark
        ? (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 drafting-chalk" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 hatch-chalk [mask-image:linear-gradient(90deg,black,transparent_30%,transparent_70%,black)]"
            />
          </>
        )
        : null}
      <Frame tone={dark ? "dark" : "light"} inner={cn("py-20 sm:py-28", inner)}>{children}</Frame>
    </section>
  )
}

type BarLink = { readonly href: string; readonly label: string; readonly logo?: "google" }

/**
 * A hero's actions as one pill bar: the primary a filled pill inside it, the secondary a quiet
 * text pill beside it. On abyss the bar is chalk-tint with the primary in `arc` — nothing solid
 * white on the blue; on a light hero it is paper with the primary in `abyss`.
 */
export function HeroBar(
  { primary, secondary, dark = false }: {
    readonly primary: BarLink
    readonly secondary?: BarLink
    readonly dark?: boolean
  }
) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1 rounded-[28px] p-1.5",
        dark
          ? "bg-mesh-ink/10 chalk-line"
          : "bg-paper hairline shadow-[0_1px_2px_color-mix(in_oklch,var(--abyss)_8%,transparent)]"
      )}
    >
      <a
        href={primary.href}
        className={cn(
          "group/btn inline-flex h-11 items-center gap-2.5 rounded-full pr-5 pl-4 font-medium text-md transition-colors",
          dark ? "bg-arc text-mesh-ink hover:bg-arc/90" : "bg-abyss text-mesh-ink hover:bg-abyss-2"
        )}
      >
        {primary.logo === "google"
          ? (
            <span className="flex size-6 items-center justify-center rounded-full bg-paper">
              <img src="/logos/google.svg" alt="" width={14} height={14} />
            </span>
          )
          : null}
        {primary.label}
        <ArrowRight
          size={16}
          className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/btn:translate-x-0.5"
        />
      </a>
      {secondary === undefined ? null : (
        <a
          href={secondary.href}
          className={cn(
            "inline-flex h-11 items-center rounded-full px-4 font-medium text-md transition-colors",
            dark ? "text-mesh-ink hover:bg-mesh-ink/10" : "text-ink hover:bg-ink/5"
          )}
        >
          {secondary.label}
        </a>
      )}
    </div>
  )
}
