/* ────────────────────────────────────────────────────────────────────────
   Insyte's mark: Drift, three offset rounded squares. `InsyteMark`
   (`mark.tsx`) points here, and the console's rail, sign-in, onboarding
   and the marketing site's file (`public/brand/insyte-mark-white.svg`)
   are all this one drawing.

   Ported byte-for-byte from the legacy brand kit. The 56 other logo
   concepts that file carried were cut with the old brand book on
   1 November 2026 (the mark is decided; git keeps the history).

   `{ size, tone, color, accent }`:
     tone="brand" (default) → MARK_BACK / MARK_MID / accent strata.
     tone="mono" | "ink" | "white" → one colour stratified by opacity,
       resolved via resolveMono(tone, color).

   Open, not changed in this round: the `TopLight` gradient on every
   square, and the two off-token azures MARK_BACK / MARK_MID.
   ──────────────────────────────────────────────────────────────────────── */

import { type ReactNode, useId } from "react"

type Tone = "brand" | "mono" | "ink" | "white"

export type MarkProps = {
  size?: number
  tone?: Tone
  color?: string
  accent?: string
}

const MARK_BACK = "oklch(86% 0.060 270)" // powder azure (back layer)
const MARK_MID = "oklch(56% 0.140 270)" // mid azure (mid layer)
const DEFAULT_ACCENT = "var(--abyss)"

/** Stable id across SSR/CSR. Sanitize React's `:r0:` syntax so it's a valid SVG id. */
function useMarkId(prefix: string) {
  const raw = useId()
  return `${prefix}${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

function resolveMono(tone: Tone | undefined, explicit?: string): string {
  if (explicit) return explicit
  if (tone === "white") return "#ffffff"
  if (tone === "ink") return "var(--ink)"
  return "var(--abyss)"
}

function LogoFrame({
  size,
  children,
  defs
}: {
  size: number
  children: ReactNode
  defs?: ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <title>Insyte mark</title>
      {defs}
      {children}
    </svg>
  )
}

/** Faint white lift on the top ~30% of each layer. Independent of fill color. */
function TopLight({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
      <stop offset="0.4" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Shared sub-layer helpers (Drift, Step, Pivot, Frame)
   ════════════════════════════════════════════════════════════════════════ */

function DriftBaseMono({ color, gid }: { color: string; gid: string }) {
  return (
    <>
      <rect
        x="2"
        y="2"
        width="38"
        height="38"
        rx="7"
        fill={color}
        opacity="0.2"
      />
      <rect
        x="2"
        y="2"
        width="38"
        height="38"
        rx="7"
        fill={`url(#${gid})`}
        opacity="0.4"
      />
      <rect
        x="13"
        y="13"
        width="38"
        height="38"
        rx="7"
        fill={color}
        opacity="0.5"
      />
      <rect
        x="13"
        y="13"
        width="38"
        height="38"
        rx="7"
        fill={`url(#${gid})`}
        opacity="0.6"
      />
      <rect x="24" y="24" width="38" height="38" rx="7" fill={color} />
      <rect x="24" y="24" width="38" height="38" rx="7" fill={`url(#${gid})`} />
    </>
  )
}
function DriftBaseBrand({ accent, gid }: { accent: string; gid: string }) {
  return (
    <>
      <rect x="2" y="2" width="38" height="38" rx="7" fill={MARK_BACK} />
      <rect
        x="2"
        y="2"
        width="38"
        height="38"
        rx="7"
        fill={`url(#${gid})`}
        opacity="0.5"
      />
      <rect x="13" y="13" width="38" height="38" rx="7" fill={MARK_MID} />
      <rect
        x="13"
        y="13"
        width="38"
        height="38"
        rx="7"
        fill={`url(#${gid})`}
        opacity="0.7"
      />
      <rect x="24" y="24" width="38" height="38" rx="7" fill={accent} />
      <rect x="24" y="24" width="38" height="38" rx="7" fill={`url(#${gid})`} />
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   DRIFT family (11) — recommended favorite + 10 variants.
   ════════════════════════════════════════════════════════════════════════ */

export function MarkDrift({
  size = 64,
  tone = "brand",
  color,
  accent
}: MarkProps) {
  const gid = useMarkId("d")
  const a = accent ?? DEFAULT_ACCENT
  if (tone === "brand") {
    return (
      <LogoFrame
        size={size}
        defs={
          <defs>
            <TopLight id={gid} />
          </defs>
        }
      >
        <DriftBaseBrand accent={a} gid={gid} />
        <rect
          x="44"
          y="30"
          width="10"
          height="3"
          rx="1.5"
          fill="#ffffff"
          opacity="0.55"
        />
        <rect
          x="44"
          y="36"
          width="14"
          height="3"
          rx="1.5"
          fill="#ffffff"
          opacity="0.55"
        />
        <rect
          x="44"
          y="42"
          width="8"
          height="3"
          rx="1.5"
          fill="#ffffff"
          opacity="0.55"
        />
      </LogoFrame>
    )
  }
  const c = resolveMono(tone, color)
  return (
    <LogoFrame
      size={size}
      defs={
        <defs>
          <TopLight id={gid} />
        </defs>
      }
    >
      <DriftBaseMono color={c} gid={gid} />
      <rect
        x="44"
        y="30"
        width="10"
        height="3"
        rx="1.5"
        fill={c}
        opacity="0.5"
      />
      <rect
        x="44"
        y="36"
        width="14"
        height="3"
        rx="1.5"
        fill={c}
        opacity="0.5"
      />
      <rect
        x="44"
        y="42"
        width="8"
        height="3"
        rx="1.5"
        fill={c}
        opacity="0.5"
      />
    </LogoFrame>
  )
}

export function InsyteWordmark({
  variant = "default",
  size = 32,
  tone = "ink"
}: {
  variant?: "default" | "ishift"
  size?: number
  tone?: "ink" | "white" | "brand"
}) {
  const color = tone === "white"
    ? "#ffffff"
    : tone === "brand"
    ? "var(--abyss)"
    : "var(--ink)"
  if (variant === "ishift") {
    return (
      <span
        className="inline-flex items-baseline font-display font-medium tracking-[-0.02em]"
        style={{ fontSize: size, lineHeight: 1, color }}
      >
        <span className="relative inline-block" style={{ paddingTop: "0.5em" }}>
          <span
            aria-hidden
            className="absolute block"
            style={{
              top: "0.04em",
              left: "50%",
              width: "0.46em",
              height: "0.46em",
              transform: "translateX(-50%)"
            }}
          >
            <span
              className="absolute"
              style={{
                top: 0,
                left: 0,
                width: "0.26em",
                height: "0.26em",
                borderRadius: "0.06em",
                background: color,
                opacity: 0.28
              }}
            />
            <span
              className="absolute"
              style={{
                top: "0.10em",
                left: "0.10em",
                width: "0.26em",
                height: "0.26em",
                borderRadius: "0.06em",
                background: color,
                opacity: 0.58
              }}
            />
            <span
              className="absolute"
              style={{
                top: "0.20em",
                left: "0.20em",
                width: "0.26em",
                height: "0.26em",
                borderRadius: "0.06em",
                background: color
              }}
            />
          </span>
          <span className="inline-block leading-none">ı</span>
        </span>
        nsyte
      </span>
    )
  }
  return (
    <span
      className="font-display font-medium tracking-[-0.02em]"
      style={{ fontSize: size, lineHeight: 1, color }}
    >
      insyte
    </span>
  )
}
