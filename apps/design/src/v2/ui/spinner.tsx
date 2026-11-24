import { cx } from "./cx.ts"

/**
 * Working, inside a control: a quarter arc turning on a faint ring. Only for the button or field that
 * is busy; a page or a table that is loading shows its own shape in skeletons instead.
 */
export function Spinner({ size = 16, className, label }: {
  readonly size?: number
  readonly className?: string
  /** Read out when the spinner stands on its own; inside a busy button the button says it. */
  readonly label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={cx("shrink-0 animate-spin motion-reduce:animate-none", className)}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.75" />
      <path d="M8 2A6 6 0 0 1 14 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
