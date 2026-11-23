import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { css } from "../brand/color.ts"
import { DIRECTIONS } from "../brand/directions.ts"
import { BlendedDataMark, InsyteMark, MagnusFlowerMark } from "../brand/marks.tsx"
import { useRoute } from "../router.tsx"
import { Button } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { LinkIcon, Palette, RotateCcw } from "../ui/icons.tsx"
import { Select } from "../ui/input.tsx"
import { Popover } from "../ui/popover.tsx"
import { copyText } from "../ui/share.tsx"
import { AccentSwatches } from "../ui/theme-picker.tsx"
import { MODES } from "../ui/theme.ts"
import { Segmented } from "../ui/toggle.tsx"
import {
  accentsFor,
  BAR_OPTIONS,
  DENSITY_OPTIONS,
  describeVariant,
  DIRECTION_OPTIONS,
  isDefault,
  LOGO_OPTIONS,
  RAIL_OPTIONS,
  readVariant,
  resetVariant,
  setVariant,
  syncAddress,
  useVariant,
  variantHref
} from "../variants.ts"
import type { DirectionId, Logo } from "../variants.ts"

/*
 * Varianten: a round button bottom right on every `/v2` page (mounted once in `app.tsx`) that opens
 * a compact panel for comparing versions of the founder's direction live. Every choice is an
 * attribute on `<html>` (`variants.ts`); this file only draws the controls and the logo slot.
 */

/* ── the logo slot ────────────────────────────────────────────────────────────────────────────── */

/** The house direction's marks: neutral greys and the accent, so the mark follows the theme. */
const HOUSE = {
  squares: ["var(--color-series-3)", "var(--color-series-2)", "var(--color-accent)"] as const,
  pills: [
    "var(--color-accent)",
    "var(--color-series-2)",
    "var(--color-series-3)",
    "var(--color-accent)",
    "var(--color-series-2)",
    "var(--color-series-3)"
  ],
  petals: [
    "var(--color-ai-amber)",
    "var(--color-ai-coral)",
    "var(--color-ai-magenta)",
    "var(--color-ai-violet)",
    "var(--color-ai-sky)",
    "var(--color-ai-violet)",
    "var(--color-ai-magenta)",
    "var(--color-ai-coral)"
  ],
  core: "var(--color-ink)"
}

/** One logo in one direction's colours, for the slot below and the kit. */
export function LogoMark(
  { logo, direction, size }: { readonly logo: Logo; readonly direction: DirectionId; readonly size: number }
) {
  const d = DIRECTIONS.find((x) => x.id === direction)
  if (logo === "insyte-mono") return <InsyteMark size={size} mono="var(--color-rail-fg)" squares={HOUSE.squares} />
  if (logo === "insyte") {
    if (d === undefined) return <InsyteMark size={size} squares={HOUSE.squares} />
    const [a, b, c] = d.marks.insyte.squares
    return (
      <InsyteMark
        size={size}
        squares={[css(a), css(b), css(c)]}
        lines={d.marks.insyte.lines === undefined ? undefined : css(d.marks.insyte.lines)}
        overprint={d.marks.overprint}
      />
    )
  }
  if (logo === "blend") {
    return <BlendedDataMark size={size} pills={d === undefined ? HOUSE.pills : d.marks.blend.map(css)} />
  }
  return d === undefined
    ? <MagnusFlowerMark size={size} petals={HOUSE.petals} core={HOUSE.core} star="var(--color-mark-ground)" />
    : (
      <MagnusFlowerMark
        size={size}
        petals={d.marks.magnus.petals.map(css)}
        core={css(d.marks.magnus.core)}
        star={css(d.marks.magnus.star)}
        overprint={d.marks.overprint}
      />
    )
}

/**
 * The chosen mark in the dark L: on a white tile (the marks are drawn for a light ground), or bare
 * in the rail's own ink when it is the one-colour Insyte. With the store's letter (the default) it
 * draws `fallback`, or nothing.
 */
export function VariantMark({ size = 26, fallback, className }: {
  readonly size?: number
  readonly fallback?: ReactNode
  readonly className?: string
}) {
  const { logo, direction } = useVariant()
  if (logo === "winkel") return <>{fallback}</>
  const inner = Math.round(size * 0.8)
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-sm",
        logo !== "insyte-mono" && "bg-mark-ground",
        className
      )}
      style={{ width: size, height: size }}
    >
      <LogoMark logo={logo} direction={direction} size={logo === "insyte-mono" ? size : inner} />
    </span>
  )
}

/* ── the panel ────────────────────────────────────────────────────────────────────────────────── */

function Row({ label, htmlFor, children }: {
  readonly label: string
  readonly htmlFor?: string
  readonly children: ReactNode
}) {
  return (
    <>
      {htmlFor === undefined
        ? <span className="text-xs text-ink-2">{label}</span>
        : <label htmlFor={htmlFor} className="text-xs text-ink-2">{label}</label>}
      <div className="flex min-w-0 items-center">{children}</div>
    </>
  )
}

/** The controls: what is on in one line, seven choices, and the link and the way back. */
export function VariantsPanel() {
  const v = useVariant()
  const id = useId()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const linkButton = useRef<HTMLButtonElement>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const line = describeVariant(v)

  const copy = () => {
    void copyText(variantHref(v)).then(() => {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    })
  }

  // The reset button turns off once pressed; focus goes to its neighbour, not to the page.
  const reset = () => {
    resetVariant()
    window.requestAnimationFrame(() => linkButton.current?.focus())
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-ink">Varianten</h2>
        <p className="truncate text-xs text-ink-3" title={line}>{line}</p>
      </div>

      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <Row label="Kleurrichting" htmlFor={`${id}-richting`}>
          <Select
            id={`${id}-richting`}
            className="w-full"
            value={v.direction}
            onChange={(e) => setVariant({ direction: e.target.value as DirectionId })}
          >
            {DIRECTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Row>
        <Row label="Accent">
          <AccentSwatches
            size="sm"
            value={v.accent}
            options={accentsFor(v.direction)}
            onChange={(accent) => setVariant({ accent })}
          />
        </Row>
        <Row label="Iconenbalk">
          <Segmented
            size="sm"
            label="Iconenbalk"
            value={v.rail}
            options={RAIL_OPTIONS}
            onChange={(rail) => setVariant({ rail })}
          />
        </Row>
        <Row label="Hoofdbalk">
          <Segmented
            size="sm"
            label="Hoofdbalk"
            value={v.bar}
            options={BAR_OPTIONS}
            onChange={(bar) => setVariant({ bar })}
          />
        </Row>
        <Row label="Weergave">
          <Segmented
            size="sm"
            label="Weergave"
            value={v.mode}
            options={MODES}
            onChange={(mode) => setVariant({ mode })}
          />
        </Row>
        <Row label="Dichtheid">
          <Segmented
            size="sm"
            label="Dichtheid"
            value={v.density}
            options={DENSITY_OPTIONS}
            onChange={(density) => setVariant({ density })}
          />
        </Row>
        <Row label="Logo" htmlFor={`${id}-logo`}>
          <Select
            id={`${id}-logo`}
            className="w-full"
            value={v.logo}
            onChange={(e) => setVariant({ logo: e.target.value as Logo })}
          >
            {LOGO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Row>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button ref={linkButton} size="sm" icon={<LinkIcon />} onClick={copy}>
          <span aria-live="polite">{copied ? "Link gekopieerd" : "Link kopiëren"}</span>
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={isDefault(v)} onClick={reset}>
          Terug naar standaard
        </Button>
      </div>
    </div>
  )
}

/* ── the button ───────────────────────────────────────────────────────────────────────────────── */

/** Pages with a composer at the foot: the button stands above it there. */
const CHAT_ROUTES = new Set(["new-chat", "chat", "agent"])

/**
 * How far above the viewport's foot the button has to stand to clear a composer that sits at the
 * bottom (the Magnus chat, an agent's chat): measured, and again when the composer grows.
 */
function useComposerLift(active: boolean, pathname: string): number {
  const [lift, setLift] = useState(0)
  useEffect(() => {
    if (!active) {
      setLift(0)
      return
    }
    let frame = 0
    const sizes = new ResizeObserver(() => measure())
    function measure() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const vh = window.innerHeight
        let next = 0
        sizes.disconnect()
        for (const el of document.querySelectorAll<HTMLElement>("#main .ai-ring")) {
          sizes.observe(el)
          const r = el.getBoundingClientRect()
          if (r.height > 0 && r.bottom > vh - 96 && r.top < vh) next = Math.max(next, Math.round(vh - r.top + 12))
        }
        setLift(next)
      })
    }
    measure()
    const main = document.getElementById("main")
    const changes = new MutationObserver(measure)
    if (main !== null) changes.observe(main, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    return () => {
      window.cancelAnimationFrame(frame)
      sizes.disconnect()
      changes.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [active, pathname])
  return lift
}

/** The button's look, shared with the kit's specimen (which adds its own position). */
export const FAB = cx(
  "inline-flex size-10 items-center justify-center rounded-full bg-canvas text-ink-2 shadow-pop pointer-coarse:size-11",
  "transition-[color,background-color,right,bottom,opacity] hover:bg-hover hover:text-ink"
)

/** The glyph, and the accent dot while a variant is on. */
export function FabFace({ on }: { readonly on: boolean }) {
  return (
    <>
      <Palette size={18} />
      {on && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-canvas"
        />
      )}
    </>
  )
}

/**
 * The round button bottom right, on every page and in every frame. Above the composer on a chat,
 * above the safe area on a phone, under the toasts and out of their way (`v2.css`). A dot in the
 * accent says a variant is on.
 */
export function VariantsButton() {
  const v = useVariant()
  const { route, pathname } = useRoute()
  const lift = useComposerLift(CHAT_ROUTES.has(route.name), pathname)
  // A navigation writes a new address without `v`; put the variant back so the address stays a link to it.
  useEffect(() => syncAddress(readVariant()), [pathname])
  return (
    <Popover
      label="Varianten"
      placement="top"
      width="w-[22rem] max-w-[calc(100vw-1rem)]"
      className="max-h-[calc(100dvh-5rem)] overflow-y-auto"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label="Varianten"
          title="Varianten"
          style={lift > 0 ? { bottom: lift } : undefined}
          className={cx(
            "variants-fab fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 sm:right-4 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]",
            FAB,
            props["aria-expanded"] && "bg-selected text-ink"
          )}
        >
          <FabFace on={!isDefault(v)} />
        </button>
      )}
    >
      <VariantsPanel />
    </Popover>
  )
}
