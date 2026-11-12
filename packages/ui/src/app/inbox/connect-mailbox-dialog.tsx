import { useState } from "react"
import { Check, Copy } from "../../icons"
import { Field, FormDialog, TextField } from "../common/form-dialog"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import type { TeamGate } from "./source"

/*
 * "Mailbox koppelen", where the host connects mailboxes itself (the console, M11 step 1): the support address the team
 * already has, forwarded to an Insyte address that the dialog hands out once it is made. Gmail and Outlook are shown
 * as the choices they will be, and say they are not there yet (M11 step 1b: their OAuth apps). Klantenservice ·
 * Beheren; without it the dialog says which permission is missing.
 */

type Provider = "forward" | "gmail" | "outlook"

const CHOICES: ReadonlyArray<{ id: Provider; brand: string; name: string; body: string; ready: boolean }> = [
  {
    id: "forward",
    brand: "email",
    name: "Doorsturen",
    body: "Stuur de mail van je eigen supportadres door naar Insyte. Werkt met elke mailprovider.",
    ready: true
  },
  { id: "gmail", brand: "gmail", name: "Gmail", body: "Inloggen met Google. Nog niet beschikbaar.", ready: false },
  {
    id: "outlook",
    brand: "outlook",
    name: "Outlook",
    body: "Inloggen met Microsoft 365. Nog niet beschikbaar.",
    ready: false
  }
]

export type ConnectedMailbox = { address: string; forwardingAddress: string | null }

export function ConnectMailboxDialog({
  open,
  onOpenChange,
  gate,
  onConnect
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gate: TeamGate
  /** The mailbox as it was made, or `undefined` when the host said why not. */
  onConnect: (input: { address: string; label: string }) => Promise<ConnectedMailbox | undefined>
}) {
  const [address, setAddress] = useState("")
  const [label, setLabel] = useState("Support")
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<ConnectedMailbox | null>(null)
  const [copied, setCopied] = useState(false)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()) && label.trim() !== ""
  const close = (v: boolean) => {
    if (!v) {
      setAddress("")
      setLabel("Support")
      setMade(null)
      setCopied(false)
    }
    onOpenChange(v)
  }

  if (made !== null) {
    return (
      <FormDialog
        open={open}
        onOpenChange={close}
        title="Stuur je mail door"
        description={`Zet in je mailprogramma doorsturen aan voor ${made.address}. Wat daar binnenkomt, staat dan hier.`}
        primaryLabel="Klaar"
        onSubmit={() => close(false)}
      >
        {made.forwardingAddress === null ?
          null :
          (
            <Field label="Doorsturen naar" hint="Antwoorden gaan uit vanaf je eigen adres.">
              <div className="field flex h-11 items-center gap-2 rounded-lg pr-1.5 pl-3.5">
                <span className="min-w-0 flex-1 truncate text-base text-ink">{made.forwardingAddress}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(made.forwardingAddress ?? "")
                    setCopied(true)
                  }}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  {copied
                    ? <Check className="size-3.5" strokeWidth={2} />
                    : <Copy className="size-3.5" strokeWidth={1.75} />}
                  {copied ? "Gekopieerd" : "Kopiëren"}
                </button>
              </div>
            </Field>
          )}
      </FormDialog>
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="Mailbox koppelen"
      description={gate.ok
        ? "Mail aan je supportadres komt in de inbox binnen, en je antwoordt er vanaf."
        : `${gate.reason}. Vraag een beheerder om de mailbox te koppelen.`}
      primaryLabel={busy ? "Koppelen…" : "Koppelen"}
      disabled={!gate.ok || !valid || busy}
      onSubmit={async () => {
        setBusy(true)
        const result = await onConnect({ address: address.trim(), label: label.trim() })
        setBusy(false)
        if (result !== undefined) setMade(result)
      }}
    >
      <div role="radiogroup" aria-label="Hoe de mail binnenkomt" className="flex flex-col gap-1.5">
        {CHOICES.map((c) => (
          <div
            key={c.id}
            role="radio"
            aria-checked={c.id === "forward"}
            aria-disabled={!c.ready}
            className={cn(
              "flex items-start gap-3 rounded-lg px-3 py-2.5",
              c.ready ? "bg-arc-tint" : "bg-ink/4 opacity-60"
            )}
          >
            <BrandLogo brand={c.brand} name={c.name} size={20} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-base text-ink leading-tight">{c.name}</span>
              <span className="text-ink-2 text-sm leading-snug">{c.body}</span>
            </span>
          </div>
        ))}
      </div>
      <Field label="Je supportadres">
        <TextField value={address} onChange={setAddress} placeholder="support@jouwwinkel.nl" type="email" />
      </Field>
      <Field label="Naam in de inbox">
        <TextField value={label} onChange={setLabel} placeholder="Support" />
      </Field>
    </FormDialog>
  )
}
