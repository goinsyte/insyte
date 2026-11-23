import { useId, useState } from "react"
import { Button } from "./button.tsx"
import { Check, Copy, Users } from "./icons.tsx"
import { Input } from "./input.tsx"

/** Copies text when the browser lets it; resolves either way, so the UI can say it is done. */
export function copyText(text: string): Promise<void> {
  if (navigator.clipboard === undefined) return Promise.resolve()
  return navigator.clipboard.writeText(text).catch(() => undefined)
}

/**
 * What Delen opens, in a popover: the link, a button that copies it and says so, and who can open it.
 * The demo's links are made up (`insyte.app/northwind/…`); in the product they are the record's own.
 */
export function SharePanel({ title, link, audience }: {
  readonly title: string
  readonly link: string
  /** Who can open the link: "Iedereen in Northwind". */
  readonly audience: string
}) {
  const [copied, setCopied] = useState(false)
  const id = useId()
  const copy = () => void copyText(link).then(() => setCopied(true))
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-xs text-ink-3">Link</label>
        <div className="flex gap-2">
          <Input id={id} readOnly value={link} onFocus={(event) => event.target.select()} className="flex-1" />
          <Button
            size="md"
            variant={copied ? "secondary" : "primary"}
            icon={copied ? <Check /> : <Copy />}
            onClick={copy}
          >
            {copied ? "Gekopieerd" : "Kopiëren"}
          </Button>
        </div>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-pretty text-ink-3">
        <Users size={13} className="mt-px shrink-0" />
        {audience}
      </p>
      <p role="status" className="sr-only">{copied ? "Link gekopieerd" : ""}</p>
    </div>
  )
}
