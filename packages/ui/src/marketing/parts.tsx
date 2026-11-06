import { useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { ArrowRight, ArrowUpRight } from "../icons.tsx"
import { cn } from "../lib/utils.ts"

/*
 * The landing page's small parts: the mark, the vendor tile, the two buttons, the arrow link and the
 * one hook every animated illustration plays through.
 */

/**
 * Insyte's mark as the product draws it: the brand kit's `InsyteMark` (`MarkDrift`) in white, the
 * mark of the console's rail, sign-in and onboarding, served as the file rendered from that
 * component (`public/brand/`, provenance in `BRON.md`). On abyss it stands on its own; on paper it
 * sits on an abyss tile, as it does on the console's rail.
 */
export function Mark({ size = 24, tone = "brand" }: { readonly size?: number; readonly tone?: "brand" | "white" }) {
  const img = <img src="/brand/insyte-mark-white.svg" alt="" width={size} height={size} className="shrink-0" />
  if (tone === "white") return img
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-abyss"
      style={{ width: size + 8, height: size + 8 }}
    >
      <img src="/brand/insyte-mark-white.svg" alt="" width={size - 2} height={size - 2} />
    </span>
  )
}

/** The lockup the console's login draws: the mark beside "insyte" in General Sans medium, lower case. */
export function Wordmark({ tone = "ink" }: { readonly tone?: "ink" | "white" }) {
  return (
    <span className="flex items-center gap-2">
      <Mark size={24} tone={tone === "white" ? "white" : "brand"} />
      <span className={cn("font-medium text-xl tracking-tight", tone === "white" ? "text-mesh-ink" : "text-ink")}>
        insyte
      </span>
    </span>
  )
}

/**
 * The services the page names, each with its vendor's own mark (provenance in `public/logos/BRON.md`).
 * Only marks that are the vendor's published logo or app icon: low-resolution site favicons and
 * marks that could be mistaken for a lookalike were dropped.
 */
export const VENDORS = {
  shopify: { name: "Shopify", file: "shopify.svg" },
  gmail: { name: "Gmail", file: "gmail.svg" },
  outlook: { name: "Outlook", file: "outlook.png", full: true },
  paypal: { name: "PayPal", file: "paypal.svg" },
  klarna: { name: "Klarna", file: "klarna.svg", full: true },
  slack: { name: "Slack", file: "slack.svg" },
  teams: { name: "Microsoft Teams", file: "microsoft-teams.svg" },
  microsoft: { name: "Microsoft 365", file: "microsoft.svg" },
  dhl: { name: "DHL", file: "dhl.svg", full: true },
  postnl: { name: "PostNL", file: "postnl.png", full: true },
  aftership: { name: "AfterShip", file: "aftership.svg" },
  sheets: { name: "Google Sheets", file: "google-sheets.svg" },
  stripe: { name: "Stripe", file: "stripe.svg", full: true },
  klaviyo: { name: "Klaviyo", file: "klaviyo.png", full: true },
  zapier: { name: "Zapier", file: "zapier.svg", full: true },
  google: { name: "Google", file: "google.svg" },
  recharge: { name: "Recharge", file: "recharge.png", full: true },
  yotpo: { name: "Yotpo", file: "yotpo.png", full: true },
  shipbob: { name: "ShipBob", file: "shipbob.png", full: true },
  gorgias: { name: "Gorgias", file: "gorgias.png", full: true },
  signifyd: { name: "Signifyd", file: "signifyd.png", full: true },
  okendo: { name: "Okendo", file: "okendo.png", full: true },
  postscript: { name: "Postscript", file: "postscript.png", full: true },
  loop: { name: "Loop Returns", file: "loop-returns.png", full: true },
  googleads: { name: "Google Ads", file: "google-ads.svg" },
  anthropic: { name: "Anthropic", file: "anthropic.svg" },
  exact: { name: "Exact Online", file: "exact.png", full: true },
  sendcloud: { name: "Sendcloud", file: "sendcloud.png", full: true }
} as const satisfies Record<string, { name: string; file: string; full?: boolean }>

export type Vendor = keyof typeof VENDORS

/**
 * A vendor's mark on the console's tile: `mesh-ink`, pinned, because a vendor draws for a white
 * ground. Full-bleed app icons fill it; bare marks sit at 62%. The corner follows the size.
 */
export function Logo(
  { vendor, size = 32, className, label = false }: {
    readonly vendor: Vendor
    readonly size?: number
    readonly className?: string
    /** Whether the name is announced. Decorative repeats of a logo stay silent. */
    readonly label?: boolean
  }
) {
  const v: { name: string; file: string; full?: boolean } = VENDORS[vendor]
  const radius = size < 24 ? "rounded-sm" : size <= 40 ? "rounded-md" : "rounded-lg"
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-mesh-ink",
        radius,
        className
      )}
      style={{
        width: size,
        height: size,
        boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--ink) 10%, transparent)"
      }}
    >
      <img
        src={`/logos/${v.file}`}
        alt={label ? v.name : ""}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={v.full === true ? "size-full object-cover" : "size-[62%] object-contain"}
      />
    </span>
  )
}

/** The page's one primary action. Abyss on light grounds, paper on a chapter. */
export function PrimaryLink(
  { href, children, onDark = false, className }: {
    readonly href: string
    readonly children: ReactNode
    readonly onDark?: boolean
    readonly className?: string
  }
) {
  return (
    <a
      href={href}
      className={cn(
        "group/btn inline-flex h-11 items-center gap-2 rounded-md px-5 font-medium text-md transition-colors",
        onDark ? "bg-paper text-abyss hover:bg-arc-tint" : "bg-abyss text-mesh-ink shadow-sm hover:bg-abyss-2",
        className
      )}
    >
      {children}
      <ArrowRight
        size={16}
        className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/btn:translate-x-0.5"
      />
    </a>
  )
}

/** The quiet action: a filled well, never an outline. */
export function SecondaryLink(
  { href, children, onDark = false, className }: {
    readonly href: string
    readonly children: ReactNode
    readonly onDark?: boolean
    readonly className?: string
  }
) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-md px-5 font-medium text-md transition-colors",
        onDark ? "bg-mesh-ink/10 text-mesh-ink hover:bg-mesh-ink/16" : "field text-ink hover:bg-paper",
        className
      )}
    >
      {children}
    </a>
  )
}

/**
 * A text action with the travelling arrow: the arrow leaves to the right and a second one arrives
 * from the left, so it reads as "go" rather than as a wiggle. Up-and-right when it leaves the site.
 */
export function ArrowLink(
  { href, children, onDark = false, external = false, className }: {
    readonly href: string
    readonly children: ReactNode
    readonly onDark?: boolean
    readonly external?: boolean
    readonly className?: string
  }
) {
  const Arrow = external ? ArrowUpRight : ArrowRight
  return (
    <a
      href={href}
      className={cn(
        "group/arrow inline-flex items-center gap-1.5 font-medium text-base",
        onDark ? "text-mesh-ink hover:text-mesh-ink-2" : "text-arc-ink hover:text-abyss",
        className
      )}
    >
      {children}
      <span className="relative inline-flex size-4 overflow-hidden" aria-hidden>
        <Arrow
          size={16}
          className="absolute inset-0 transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/arrow:translate-x-4 motion-reduce:transition-none motion-reduce:group-hover/arrow:translate-x-0"
        />
        <Arrow
          size={16}
          className="-translate-x-4 absolute inset-0 transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/arrow:translate-x-0 motion-reduce:hidden"
        />
      </span>
    </a>
  )
}

/**
 * Plays an illustration once, the first time it is scrolled to.
 *
 * The server renders the FINAL frame, so a reader without JavaScript, a crawler and a reader who
 * asked for reduced motion all see the finished drawing. Only on the client, only with motion
 * allowed and only when the piece is still below the fold does it rewind to its first frame and
 * wait. A piece already on screen at load is left finished rather than snapped back and replayed.
 *
 * The returned `play` goes on the piece's root as `data-play`; the parts read it through
 * `group-data-[play=false]:` variants, so the choreography is CSS transitions, transform and
 * opacity only.
 */
export function usePlay<T extends Element>(
  { rootMargin = "0px 0px -18% 0px" }: { readonly rootMargin?: string } = {}
) {
  const ref = useRef<T | null>(null)
  const reduced = useReducedMotion() === true
  const [play, setPlay] = useState(true)

  useEffect(() => {
    const node = ref.current
    if (node === null || reduced || typeof IntersectionObserver === "undefined") return
    let first = true
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return
      if (first) {
        first = false
        if (entry.isIntersecting) {
          observer.disconnect()
          return
        }
        setPlay(false)
        return
      }
      if (entry.isIntersecting) {
        setPlay(true)
        observer.disconnect()
      }
    }, { rootMargin })
    observer.observe(node)
    return () => observer.disconnect()
  }, [reduced, rootMargin])

  return { ref, play, reduced }
}

/** A section's container: the one content column the rails frame. */
export function Column({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1180px] px-4 sm:px-8", className)}>{children}</div>
}
