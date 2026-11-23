import { useState } from "react"
import type { InputHTMLAttributes, ReactNode } from "react"
import { SUPPORT_EMAIL } from "../../fixtures/auth.ts"
import type { BrandLine } from "../../fixtures/auth.ts"
import { Link } from "../../router.tsx"
import { buttonClass } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { AlertTriangle, Eye, EyeOff } from "../../ui/icons.tsx"
import { Input } from "../../ui/input.tsx"
import { Spinner } from "../../ui/spinner.tsx"

/*
 * The frame of signing in, setting up and joining: the dark half that joins the product's dark L
 * (the rail's graphite, the Insyte wordmark in plain type, one line about why this step matters),
 * and a light column with one short task. On a phone the dark half folds into a strip at the top.
 *
 * The line is two-toned like the kit's headings: what it says first in the rail's white, the rest in
 * its grey. It changes with the step, and that change is the one moment of motion here.
 */

/** Insyte's name, plain: no mark, no gradient (the gradient is Magnus's alone). */
export function Wordmark({ size = "md" }: { readonly size?: "sm" | "md" }) {
  return (
    <span className={cx("font-semibold tracking-tight", size === "sm" ? "text-md" : "text-lg")}>
      insyte
    </span>
  )
}

export function AuthFrame({ line, meta, foot, children }: {
  readonly line: BrandLine
  /** Beside the wordmark on a phone, and under the line on a wide screen: "Winkeleigenaar · ~6 min". */
  readonly meta?: ReactNode
  /** At the foot of the dark half, after the support address: "Rol wijzigen". */
  readonly foot?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      <aside className="hidden flex-col justify-between bg-rail px-12 py-11 text-rail-fg lg:flex xl:px-16">
        <Wordmark />
        <div key={`${line.lead}|${line.rest}`} className="flex animate-rise flex-col gap-5 py-10">
          <p className="max-w-[15ch] text-3xl font-semibold text-balance xl:text-4xl" aria-live="polite">
            {line.lead} <span className="text-rail-ink">{line.rest}</span>
          </p>
          <p className="max-w-[44ch] text-md text-pretty text-rail-ink">{line.body}</p>
          {meta !== undefined && <p className="figure text-sm text-rail-ink">{meta}</p>}
        </div>
        <div className="flex items-center justify-between gap-4 text-xs text-rail-ink">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-xs hover:text-rail-fg">{SUPPORT_EMAIL}</a>
          {foot}
        </div>
      </aside>

      <header className="flex min-h-14 items-center justify-between gap-3 bg-rail px-4 text-rail-fg sm:px-6 lg:hidden">
        <Wordmark size="sm" />
        {meta !== undefined && (
          <span className="figure flex min-w-0 items-center gap-3 truncate text-xs text-rail-ink">{meta}{foot}</span>
        )}
      </header>

      <div className="flex flex-col">{children}</div>
    </div>
  )
}

/** The light column's measure: one task, 400px wide, centred, rising in when its step changes. */
export function FormColumn({ stepKey, top, children }: {
  readonly stepKey?: string
  /** Above the task, pinned to the top: a progress line and the close button. */
  readonly top?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <>
      {top !== undefined && <div className="px-4 pt-4 sm:px-8 sm:pt-5">{top}</div>}
      <main
        key={stepKey}
        className={cx(
          "mx-auto flex w-full max-w-[400px] flex-1 animate-rise flex-col gap-5 px-4 pb-14 sm:px-0",
          top === undefined ? "justify-center pt-10" : "pt-[clamp(28px,9vh,104px)]"
        )}
      >
        {children}
      </main>
    </>
  )
}

/** The task's one heading and the quiet line under it. */
export function Heading({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold text-balance text-ink">{title}</h1>
      {children !== undefined && <p className="text-sm text-pretty text-ink-2">{children}</p>}
    </header>
  )
}

/** The field and button size on these pages: 40px, 44px on touch. */
export const TALL = "min-h-10 pointer-coarse:min-h-11"

/** The primary action of a form, full width. */
export const primaryWide = cx(buttonClass("primary", "md", "w-full"), TALL)
export const secondaryWide = cx(buttonClass("secondary", "md", "w-full"), TALL)

/** A password with a way to see what was typed. */
export function PasswordInput({ value, onChange, ...rest }:
  & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">
  & { readonly value: string; readonly onChange: (next: string) => void })
{
  const [show, setShow] = useState(false)
  return (
    <span className="relative flex items-center">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(TALL, "pr-11")}
        {...rest}
      />
      <button
        type="button"
        aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
        onClick={() => setShow(!show)}
        className="absolute right-1 inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:right-0 pointer-coarse:size-11"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  )
}

/** Google's G in one ink: a sign-in button, not a brand tile. */
function GoogleGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21.8 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.54Z" />
      <path d="M12 22c2.76 0 5.08-.92 6.77-2.48l-3.3-2.56c-.92.61-2.09.98-3.47.98-2.66 0-4.92-1.8-5.73-4.22H2.86v2.64A10 10 0 0 0 12 22Z" />
      <path d="M6.27 13.72a6 6 0 0 1 0-3.44V7.64H2.86a10 10 0 0 0 0 8.72l3.41-2.64Z" />
      <path d="M12 5.98c1.5 0 2.85.52 3.91 1.53l2.93-2.93A9.95 9.95 0 0 0 12 2a10 10 0 0 0-9.14 5.64l3.41 2.64C7.08 7.78 9.34 5.98 12 5.98Z" />
    </svg>
  )
}

export function GoogleButton({ label = "Doorgaan met Google", onClick, loading, disabled }: {
  readonly label?: string
  readonly onClick: () => void
  readonly loading?: boolean
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true || loading === true}
      aria-busy={loading === true || undefined}
      className={secondaryWide}
    >
      {loading === true ? <Spinner size={15} /> : <GoogleGlyph />}
      {label}
    </button>
  )
}

/** "of met e-mail": between the one-click way in and the form. */
export function OrDivider({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-3">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      {label}
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  )
}

/** What the server refused, under the fields: the problem and how to go on. */
export function FormError({ children }: { readonly children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm bg-bad-tint px-3 py-2.5 text-sm text-ink">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad-ink" />
      <span>{children}</span>
    </p>
  )
}

/** A link in running text, in the accent's ink. */
export function TextLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return (
    <Link to={to} className="rounded-xs font-medium text-accent-ink hover:text-ink">
      {children}
    </Link>
  )
}

/** A quiet button that reads as a link: "Vergeten?", "Een back-upcode gebruiken". */
export function TextButton({ onClick, children, tone = "accent", disabled }: {
  readonly onClick: () => void
  readonly children: ReactNode
  readonly tone?: "accent" | "quiet"
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "rounded-xs font-medium disabled:pointer-events-none disabled:text-ink-3 pointer-coarse:min-h-11",
        tone === "accent" ? "text-accent-ink hover:text-ink" : "text-ink-3 hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}

/** The demo's pause, so a busy button reads as it would against a server. */
export const pause = (ms = 650) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** The same check the server would make on an address. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim())

/** One segment per step, the done ones and the current one in the accent, with the count in words. */
export function StepBar({ index, total, className }: {
  readonly index: number
  readonly total: number
  readonly className?: string
}) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <div className="flex flex-1 items-center gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the segments are positions
            key={i}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i <= index ? "bg-accent" : "bg-line"
            )}
          />
        ))}
      </div>
      <span className="figure shrink-0 text-xs font-medium text-ink-2">Stap {index + 1} van {total}</span>
    </div>
  )
}
