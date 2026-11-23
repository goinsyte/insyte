import type { ComponentType } from "react"
import { cx } from "./cx.ts"

export type Presence = "online" | "away" | "offline"

const PRESENCE: Record<Presence, string> = {
  online: "bg-good",
  away: "bg-warn",
  offline: "bg-ink-4"
}

const PRESENCE_LABEL: Record<Presence, string> = {
  online: "online",
  away: "afwezig",
  offline: "offline"
}

type AvatarProps = {
  readonly name: string
  readonly size?: number
  readonly presence?: Presence
  /** The ring colour around the presence dot: the surface the avatar sits on. */
  readonly on?: "canvas" | "panel" | "rail"
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()

/** A person: initials on graphite, the owner's "DZ" disc. Presence as a dot with its word for screen readers. */
export function Avatar({ name, size = 28, presence, on = "canvas" }: AvatarProps) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex size-full items-center justify-center rounded-full bg-avatar font-semibold text-avatar-ink select-none"
        style={{ fontSize: Math.round(size * 0.38) }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      {presence !== undefined && <PresenceDot presence={presence} on={on} />}
      <span className="sr-only">
        {name}
        {presence === undefined ? "" : `, ${PRESENCE_LABEL[presence]}`}
      </span>
    </span>
  )
}

function PresenceDot({ presence, on }: { readonly presence: Presence; readonly on: "canvas" | "panel" | "rail" }) {
  return (
    <span
      className={cx(
        "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2",
        PRESENCE[presence],
        on === "rail" ? "ring-rail" : on === "panel" ? "ring-panel" : "ring-canvas"
      )}
    />
  )
}

type Glyph = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

/**
 * An agent: its glyph in ink on white inside a neutral hairline ring, round like a person because it
 * works like a colleague. No gradient: that belongs to Magnus's mark, the focused composer and the
 * chart point Magnus found, so a list of seven agents stays a list of glyphs.
 */
export function AgentAvatar(
  { glyph: G, size = 28, active }: { readonly glyph: Glyph; readonly size?: number; readonly active?: boolean }
) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span className="inline-flex size-full items-center justify-center rounded-full bg-canvas text-ink ring-1 ring-line ring-inset">
        <G size={Math.round(size * 0.5)} strokeWidth={1.75} />
      </span>
      {active !== undefined && <PresenceDot presence={active ? "online" : "offline"} on="canvas" />}
    </span>
  )
}

/**
 * Several people on one record (who is on a ticket, who edits a board): up to `max` discs overlapping
 * on a ring of the surface, then the rest as a count. The names are read out as one sentence.
 */
export function AvatarStack({ names, max = 3, size = 24 }: {
  readonly names: ReadonlyArray<string>
  readonly max?: number
  readonly size?: number
}) {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return (
    <span className="inline-flex items-center" role="img" aria-label={names.join(", ")}>
      {shown.map((name, i) => (
        <span key={name} className={cx("rounded-full ring-2 ring-canvas", i > 0 && "-ml-1.5")} aria-hidden="true">
          <Avatar name={name} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          aria-hidden="true"
          className="figure -ml-1.5 inline-flex items-center justify-center rounded-full bg-well text-2xs font-medium text-ink-2 ring-2 ring-canvas"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
