import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react"
import { Link } from "../router.tsx"
import { cx } from "./cx.ts"
import { Spinner } from "./spinner.tsx"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md"

const VARIANT: Record<ButtonVariant, string> = {
  // Ink, not a hue: the owner's "Ask" button. One per region at most. Never the accent: the accent
  // marks focus and selection, and a customer's theme must not repaint the one thing to press.
  primary: "bg-ink text-on-ink hover:bg-ink/88 active:bg-ink/80",
  secondary: "bg-canvas text-ink shadow-xs ring-1 ring-line-strong ring-inset hover:bg-hover active:bg-selected",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink active:bg-selected",
  // Only for the act that cannot be taken back, and only in the dialog that asks about it.
  danger: "bg-bad-ink text-on-ink hover:bg-bad-ink/90 active:bg-bad-ink/80"
}

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs pointer-coarse:h-11",
  md: "h-8 gap-2 px-3 text-sm pointer-coarse:h-11"
}

/** The classes of a button, for the rare element that must look like one but cannot be one. */
export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) =>
  cx(
    "inline-flex shrink-0 items-center justify-center rounded-sm font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    VARIANT[variant],
    SIZE[size],
    className
  )

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** A trigger's ref (a menu or popover opens from it). */
  readonly ref?: Ref<HTMLButtonElement>
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly icon?: ReactNode
  /** Working: the label stays (so the button keeps its width), a spinner takes the icon's place, and it cannot be pressed twice. */
  readonly loading?: boolean
}

/**
 * A button. Primary is ink and appears once per region; secondary sits on a hairline; ghost is for
 * the quiet actions beside them; danger only confirms what cannot be undone.
 */
export function Button(
  { variant = "secondary", size = "md", icon, loading = false, className, children, disabled, ...rest }: ButtonProps
) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 13 : 15} /> : icon}
      {children}
    </button>
  )
}

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  readonly to: string
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly icon?: ReactNode
}

/** A link that looks like a button, for an action that goes somewhere ("Ticket openen"). */
export function ButtonLink(
  { to, variant = "secondary", size = "md", icon, className, children, ...rest }: ButtonLinkProps
) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  readonly ref?: Ref<HTMLButtonElement>
  /** What the button does, read out and shown on hover. Required: an icon alone names nothing. */
  readonly label: string
  readonly size?: ButtonSize
  /** `outline` sits on a hairline beside a secondary button; `rail` is for the dark L. */
  readonly tone?: "canvas" | "outline" | "rail"
  /** A toggle (bold, a vote): pressed draws it as selected. */
  readonly pressed?: boolean
}

export function IconButton(
  { label, size = "md", tone = "canvas", pressed, className, children, ...rest }: IconButtonProps
) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-sm transition-colors [&_svg]:shrink-0",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "size-7 [&_svg]:size-4" : "size-8 [&_svg]:size-[18px]",
        // A finger needs 44px, whatever the drawn size.
        "pointer-coarse:size-11",
        tone === "rail"
          ? "text-rail-ink hover:bg-rail-2 hover:text-rail-fg"
          : tone === "outline"
          ? "text-ink-2 ring-1 ring-line-strong ring-inset hover:bg-hover hover:text-ink active:bg-selected"
          : "text-ink-3 hover:bg-hover hover:text-ink active:bg-selected",
        pressed === true && "bg-selected text-ink",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
