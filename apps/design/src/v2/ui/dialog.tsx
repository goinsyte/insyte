import { useEffect, useId, useRef } from "react"
import type { ReactNode } from "react"
import { Button } from "./button.tsx"
import { cx } from "./cx.ts"
import { AlertTriangle, X } from "./icons.tsx"

/*
 * Modal surfaces, on the browser's own `<dialog>`: `showModal()` gives the top layer (nothing can clip
 * it), the focus trap, Escape and the inert page behind it for free. Three shapes:
 *
 * - `Dialog`: a short task that needs the page out of the way (a supplier's details, a new label).
 * - `AlertDialog`: one question before something that cannot be undone, with the act named on the
 *   button ("Chargeback accepteren", never "OK"). It does not close on a press outside.
 * - `Sheet`: a record's detail from the right, over the list it came from, so the list keeps its place.
 *
 * A modal is the last resort: a setting is changed in place, and a proposal waits in the page.
 */

function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      close.current()
    }
    dialog.addEventListener("cancel", onCancel)
    return () => dialog.removeEventListener("cancel", onCancel)
  }, [])
  return ref
}

/** The dialog's surface without the behaviour: for the kit and for a mock that shows it open. */
export function DialogPanel(
  { title, lead, description, children, footer, onClose, size = "md", titleId, descriptionId }: {
    readonly title: string
    /** Before the title: the logo of the service the dialog is about (Klaviyo, Shopify, an app). */
    readonly lead?: ReactNode
    readonly description?: ReactNode
    readonly children?: ReactNode
    readonly footer?: ReactNode
    readonly onClose?: () => void
    readonly size?: "sm" | "md" | "lg"
    readonly titleId?: string
    readonly descriptionId?: string
  }
) {
  return (
    <div
      className={cx(
        "flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-lg bg-canvas text-ink shadow-pop ring-1 ring-line",
        size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg"
      )}
    >
      <header className="flex items-start gap-3 px-5 pt-5 pb-3">
        {lead}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className="text-md font-semibold text-ink">{title}</h2>
          {description !== undefined && (
            <p id={descriptionId} className="text-sm text-pretty text-ink-2">{description}</p>
          )}
        </div>
        {onClose !== undefined && (
          <button
            type="button"
            aria-label="Sluiten"
            onClick={onClose}
            className="-mt-1 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X size={18} />
          </button>
        )}
      </header>
      {children !== undefined && <div className="pane-scroll min-h-0 flex-1 px-5 py-2">{children}</div>}
      {footer !== undefined && (
        <footer className="flex flex-wrap items-center justify-end gap-2 px-5 pt-3 pb-5">{footer}</footer>
      )}
    </div>
  )
}

const DIALOG =
  "m-auto w-[calc(100%-2rem)] max-w-none bg-transparent p-0 text-ink open:flex open:animate-rise open:justify-center " +
  "backdrop:bg-scrim"

export function Dialog({ open, onClose, title, lead, description, children, footer, size }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly lead?: ReactNode
  readonly description?: ReactNode
  readonly children?: ReactNode
  readonly footer?: ReactNode
  readonly size?: "sm" | "md" | "lg"
}) {
  const ref = useModal(open, onClose)
  const id = useId()
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-t`}
      aria-describedby={description === undefined ? undefined : `${id}-d`}
      className={DIALOG}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && (
        <DialogPanel
          title={title}
          lead={lead}
          description={description}
          footer={footer}
          onClose={onClose}
          size={size}
          titleId={`${id}-t`}
          descriptionId={`${id}-d`}
        >
          {children}
        </DialogPanel>
      )}
    </dialog>
  )
}

/** The question's surface: the sign, the consequence in one or two sentences, the two answers. */
export function AlertPanel(
  { title, body, confirmLabel, cancelLabel = "Annuleren", onConfirm, onCancel, loading, titleId, bodyId }: {
    readonly title: string
    readonly body: ReactNode
    readonly confirmLabel: string
    readonly cancelLabel?: string
    readonly onConfirm?: () => void
    readonly onCancel?: () => void
    readonly loading?: boolean
    readonly titleId?: string
    readonly bodyId?: string
  }
) {
  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-canvas p-5 text-ink shadow-pop ring-1 ring-line">
      <div className="flex gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bad-tint text-bad-ink">
          <AlertTriangle size={16} />
        </span>
        <div className="flex min-w-0 flex-col gap-1 pt-1">
          <h2 id={titleId} className="text-md font-semibold text-ink">{title}</h2>
          <div id={bodyId} className="text-sm text-pretty text-ink-2">{body}</div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </div>
  )
}

export function AlertDialog({ open, onCancel, onConfirm, title, body, confirmLabel, cancelLabel, loading }: {
  readonly open: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly title: string
  readonly body: ReactNode
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly loading?: boolean
}) {
  const ref = useModal(open, onCancel)
  const id = useId()
  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      className={DIALOG}
    >
      {open && (
        <AlertPanel
          title={title}
          body={body}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          onCancel={onCancel}
          loading={loading}
          titleId={`${id}-t`}
          bodyId={`${id}-d`}
        />
      )}
    </dialog>
  )
}

/** The sheet's surface: a head with the record's name and its actions, a body that scrolls, an optional foot. */
export function SheetPanel({ title, meta, actions, children, footer, onClose, titleId }: {
  readonly title: string
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly onClose?: () => void
  readonly titleId?: string
}) {
  return (
    <div className="flex h-full w-full flex-col bg-canvas text-ink shadow-pop ring-1 ring-line">
      <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className="truncate text-md font-semibold text-ink">{title}</h2>
          {meta !== undefined && <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">{meta}</div>}
        </div>
        {actions}
        {onClose !== undefined && (
          <button
            type="button"
            aria-label="Sluiten"
            onClick={onClose}
            className="-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X size={18} />
          </button>
        )}
      </header>
      <div className="pane-scroll min-h-0 flex-1 px-5 py-4">{children}</div>
      {footer !== undefined && (
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
          {footer}
        </footer>
      )}
    </div>
  )
}

export function Sheet({ open, onClose, title, meta, actions, children, footer }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly footer?: ReactNode
}) {
  const ref = useModal(open, onClose)
  const id = useId()
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-t`}
      className="mt-0 mr-0 mb-0 ml-auto h-dvh max-h-none w-full max-w-[min(30rem,100vw)] bg-transparent p-0 text-ink open:animate-slide-in backdrop:bg-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && (
        <SheetPanel title={title} meta={meta} actions={actions} footer={footer} onClose={onClose} titleId={`${id}-t`}>
          {children}
        </SheetPanel>
      )}
    </dialog>
  )
}
