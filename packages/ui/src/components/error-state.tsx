import { AlertTriangle } from "@insyte/ui/icons"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * A row the operator can scan, not a centred red card with a retry button under it.
 *
 * The leading triangle and the cause carry the signal hue; the detail stays in ink, because when
 * everything in the block is red nothing in it is urgent. The cause names the problem and the action
 * names the recovery — the copy rule, enforced by the prop names.
 */
function ErrorState({
  cause,
  detail,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  cause: React.ReactNode
  detail?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn("flex items-start gap-3 rounded-xl bg-signal-red-bg px-5 py-4", className)}
      {...props}
    >
      <AlertTriangle className="size-4 shrink-0 self-center text-signal-red" strokeWidth={1.75} aria-hidden />
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="font-medium text-base text-signal-red">{cause}</p>
        {detail ? <p className="text-sm text-ink-2 leading-[1.55]">{detail}</p> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  )
}

export { ErrorState }
