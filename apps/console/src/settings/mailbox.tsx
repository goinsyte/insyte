import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { MailboxView } from "@insyte/modules/inbox/domain/Inbox"
import { ConfirmDialog } from "@insyte/ui/app/common/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@insyte/ui/components/dialog"
import { Copy } from "@insyte/ui/icons"
import { Link } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { toast } from "sonner"
import { INBOX, inboxWrites, mailboxesAtom } from "../data/inbox.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * A forwarded mailbox on Koppelingen: "Beheren" opens what the server keeps of it (`?mailbox=`): the Insyte address to
 * forward the team's own address to, with a copy button; the signature every mail from it ends with; whether
 * "Nieuwe e-mail" sends from it; the way to its mail in the inbox; and Ontkoppelen, asked first. Its name in the inbox
 * is the one it was connected with: the server has no rename yet.
 */

const keys = { reactivityKeys: [...INBOX] }

const COPY: RefusalCopy = {
  gone: "Die mailbox bestaat niet meer",
  conflicts: { disconnected: ["Deze mailbox is ontkoppeld", "Koppel hem opnieuw in de inbox."] },
  invalid: { signature: "Die handtekening is te lang." }
}

const QUIET =
  "flex h-9 items-center justify-center rounded-lg px-3.5 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
const SMALL =
  "flex h-8 w-fit items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-ink text-sm hover:bg-ink/6 disabled:opacity-50"

const copyText = (text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined)
  toast("Doorstuuradres gekopieerd")
}

export function MailboxManageDialog({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const mailboxes = Option.getOrUndefined(AsyncResult.value(useAtomValue(mailboxesAtom)))
  const disconnect = useAtomSet(inboxWrites.disconnectMailbox, { mode: "promiseExit" })
  const setDefault = useAtomSet(inboxWrites.setDefaultMailbox, { mode: "promiseExit" })
  const setSignature = useAtomSet(inboxWrites.setSignature, { mode: "promiseExit" })
  // Klantenservice · Volledig: what the signature, the default and Ontkoppelen each ask of the server.
  const gate = useGate("support", 3)
  const denied = gate.ok ? undefined : gate.reason
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [signature, setSignatureDraft] = useState<string | null>(null)
  const box: MailboxView | undefined = mailboxes?.find((m) => m.id === id && m.status === "connected")
  const shown = signature ?? box?.signature ?? ""
  const changed = box !== undefined && signature !== null && signature.trim() !== box.signature.trim()
  const close = () => {
    setSignatureDraft(null)
    onClose()
  }

  const save = async (m: MailboxView) => {
    setBusy(true)
    const exit = await setSignature({ payload: { id: m.id, signature: shown }, ...keys })
    setBusy(false)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    setSignatureDraft(null)
    toast.success("Handtekening opgeslagen")
  }
  const makeDefault = async (m: MailboxView) => {
    setBusy(true)
    const exit = await setDefault({ payload: { id: m.id }, ...keys })
    setBusy(false)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    toast.success(`Nieuwe e-mails gaan nu van ${m.address}`)
  }
  const letGo = async (m: MailboxView) => {
    setAsking(false)
    setBusy(true)
    const exit = await disconnect({ payload: { id: m.id }, ...keys })
    setBusy(false)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    close()
    toast.success(`${m.address} ontkoppeld`, {
      description: "Er komt niets meer binnen en er gaat niets meer vanaf. De gesprekken blijven in de inbox."
    })
  }

  return (
    <>
      <Dialog
        open={id !== undefined && box !== undefined}
        onOpenChange={(o) => {
          if (!o) close()
        }}
      >
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle>{box === undefined ? "Mailbox" : box.label}</DialogTitle>
            {box === undefined ? null : (
              <DialogDescription>
                {`${box.address} · ${box.threads} ${box.threads === 1 ? "gesprek" : "gesprekken"} in de inbox`}
              </DialogDescription>
            )}
          </DialogHeader>
          {box === undefined ? null : (
            <div className="flex flex-col gap-4">
              {box.forwardingAddress === null ? null : (
                <div className="flex flex-col gap-1.5">
                  <span className="font-medium text-ink-3 text-sm">Doorsturen naar</span>
                  <div className="flex items-center gap-2 rounded-md bg-paper px-3 py-2">
                    <code className="min-w-0 flex-1 truncate font-sans text-ink text-sm">{box.forwardingAddress}</code>
                    <button
                      type="button"
                      aria-label="Doorstuuradres kopiëren"
                      onClick={() => copyText(box.forwardingAddress!)}
                      className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
                    >
                      <Copy className="size-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                  <span className="text-ink-3 text-xs">
                    Stuur mail aan {box.address} door naar dit adres, dan komt die hier binnen.
                  </span>
                </div>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-ink-3 text-sm">Handtekening</span>
                <textarea
                  value={shown}
                  maxLength={2000}
                  rows={3}
                  disabled={!gate.ok}
                  title={denied}
                  onChange={(e) => setSignatureDraft(e.target.value)}
                  placeholder="Onder elk antwoord, elke doorgestuurde en elke nieuwe mail vanaf deze mailbox"
                  className="field rounded-md px-3 py-2 text-base text-ink leading-[1.5] outline-none focus:bg-paper"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {box.isDefault
                  ? <span className="text-ink-2 text-sm">Nieuwe e-mails gaan van deze mailbox.</span>
                  : (
                    <button
                      type="button"
                      disabled={busy || !gate.ok}
                      title={denied}
                      onClick={() => void makeDefault(box)}
                      className={SMALL}
                    >
                      Als standaard instellen
                    </button>
                  )}
                <Link to="/inbox" search={{ mailbox: box.id } as never} className={SMALL}>
                  Naar de inbox
                </Link>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <button
              type="button"
              disabled={busy || box === undefined || !gate.ok}
              title={denied}
              onClick={() => setAsking(true)}
              className="flex h-9 items-center justify-center rounded-lg px-3.5 font-medium text-base text-signal-red transition-colors hover:bg-signal-red-bg disabled:opacity-50"
            >
              Ontkoppelen
            </button>
            <span className="flex gap-2">
              <button type="button" onClick={close} className={QUIET}>Sluiten</button>
              <button
                type="button"
                disabled={busy || !changed || !gate.ok}
                title={denied}
                onClick={() => box !== undefined && void save(box)}
                className="flex h-9 items-center justify-center gap-2 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Opslaan
              </button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {box === undefined ? null : (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          tone="destructive"
          title={`${box.address} ontkoppelen?`}
          description="Er komt geen mail meer binnen en je antwoordt er niet meer vanaf. De gesprekken blijven in de inbox. Koppel je hetzelfde adres later opnieuw, dan krijgt het zijn doorstuuradres en gesprekken terug."
          confirmLabel="Ontkoppelen"
          onConfirm={() => void letGo(box)}
        />
      )}
    </>
  )
}
