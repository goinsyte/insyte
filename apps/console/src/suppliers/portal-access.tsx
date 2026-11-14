import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SupplierAccess } from "@insyte/modules/members/domain/Team"
import { Field, TextAreaField, TextField } from "@insyte/ui/app/common/form-dialog"
import { formatRelative } from "@insyte/ui/app/lib/format"
import { EMAIL, PORTAL_SCOPES } from "@insyte/ui/app/lib/team"
import type { Supplier } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { cn } from "@insyte/ui/app/lib/utils"
import { StatusPill } from "@insyte/ui/app/settings/setting-card"
import { PORTAL_LABEL } from "@insyte/ui/app/suppliers/portal-label"
import { GHOST_BTN, PRIMARY_BTN, WELL_BTN } from "@insyte/ui/app/team/bits"
import { Checkbox } from "@insyte/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@insyte/ui/components/dialog"
import { RotateCcw, Send } from "@insyte/ui/icons"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useState } from "react"
import { PRODUCTS } from "../data/products.ts"
import { portalAccessWrites, supplierAccessAtom, SUPPLIERS } from "../data/suppliers.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The supplier's portal on the brand's side (M16 step 2): in the supplier's dialog, who signs in and who is invited;
 * the invite dialog over `Invitations.sendSupplier`; revoking an invitation or a contact's access, each with its undo.
 * The design's markup (`suppliers/portal-invite.tsx`) over the server's access. What the console's portal does not
 * have yet is not offered: only orders (always) and stock are parts to open, there is no copy of the link (the server
 * keeps only its hash) and no "view as they see it". Changing what an active contact sees is not a call yet either.
 */

/** The parts of the portal the console has: orders, always, and stock. */
const SCOPES = PORTAL_SCOPES.filter((s) => s.id === "orders" || s.id === "stock")
type Scope = "orders" | "stock"
const DEFAULT_SCOPES: ReadonlyArray<Scope> = ["orders", "stock"]

const COPY: RefusalCopy = {
  gone: "Die uitnodiging bestaat niet meer",
  conflicts: {
    newer_invitation: ["Kan niet terug", "Er ging intussen een nieuwere uitnodiging naar dat adres."],
    owner_taken: ["Kan niet terug", "Deze leverancier heeft intussen een andere hoofdcontactpersoon."]
  },
  invalid: {
    format: "Vul een geldig e-mailadres in.",
    contact: "Die persoon logt al in op hun portaal.",
    invited: "Die persoon heeft al een open uitnodiging.",
    duplicate: "Dat e-mailadres staat er twee keer in.",
    unknown: "Die leverancier bestaat niet meer.",
    forbidden: "Hun portaal toont orders uit elke winkel; dat kan alleen wie bij alle winkels kan."
  }
}

const refused = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isFailure(exit)) sayRefusal(failureOf(exit), COPY)
  return Exit.isFailure(exit)
}

const KEYS = { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }

function usePortalCommands() {
  const send = useAtomSet(portalAccessWrites.send, { mode: "promiseExit" })
  const revoke = useAtomSet(portalAccessWrites.revoke, { mode: "promiseExit" })
  const restore = useAtomSet(portalAccessWrites.restore, { mode: "promiseExit" })
  const revokeContact = useAtomSet(portalAccessWrites.revokeContact, { mode: "promiseExit" })
  const restoreContact = useAtomSet(portalAccessWrites.restoreContact, { mode: "promiseExit" })

  const undoInvites = (ids: ReadonlyArray<string>) => void revoke({ payload: { ids }, ...KEYS }).then(refused)

  return {
    /** Sent (or a lapsed one renewed); "Ongedaan maken" revokes it inside the undo window, so no mail goes. */
    invite: async (
      supplier: Supplier,
      row: { email: string; name?: string | undefined; scopes: ReadonlyArray<Scope>; message?: string | undefined }
    ) => {
      const exit = await send({
        payload: {
          rows: [{
            supplierId: supplier.id,
            email: row.email,
            scopes: [...row.scopes],
            ...(row.name ? { name: row.name } : {}),
            ...(row.message ? { message: row.message } : {})
          }]
        },
        ...KEYS
      })
      if (Exit.isFailure(exit)) {
        refused(exit)
        return false
      }
      const { ids } = exit.value
      undoable(
        `${supplier.name} uitgenodigd voor het portaal`,
        () => undoInvites(ids),
        "Ze krijgen een link die 7 dagen geldig is."
      )
      return true
    },
    /** Every open invitation and every contact's access taken away; the undo gives each back. */
    revokeAll: async (supplier: Supplier, access: SupplierAccess) => {
      const invitations = access.invitations.map((i) => i.id)
      const contacts = access.contacts.map((c) => c.id)
      if (invitations.length > 0 && refused(await revoke({ payload: { ids: invitations }, ...KEYS }))) return
      for (const id of contacts) if (refused(await revokeContact({ payload: { id }, ...KEYS }))) return
      undoable(
        contacts.length > 0
          ? `Portaaltoegang van ${supplier.name} ingetrokken`
          : `Uitnodiging aan ${supplier.name} ingetrokken`,
        () =>
          void (async () => {
            for (const id of invitations) if (refused(await restore({ payload: { id }, ...KEYS }))) return
            for (const id of contacts) if (refused(await restoreContact({ payload: { id }, ...KEYS }))) return
          })()
      )
    }
  }
}

const useAccess = (supplierId: string): SupplierAccess | undefined =>
  Option.getOrUndefined(AsyncResult.value(useAtomValue(supplierAccessAtom(supplierId))))

const statusOf = (access: SupplierAccess | undefined) =>
  access === undefined
    ? "none"
    : access.contacts.length > 0
    ? "active"
    : access.invitations.length > 0
    ? "invited"
    : "none"

/** The portal, inside the supplier's own dialog: where it stands and what can be done about it. */
export function ConsolePortalSection(
  { supplier, onInvite }: { supplier: Supplier; onInvite: () => void; onClose: () => void }
) {
  const access = useAccess(supplier.id)
  const commands = usePortalCommands()
  const status = statusOf(access)
  const l = PORTAL_LABEL[status]
  const contact = access?.contacts[0]
  const invitation = access?.invitations[0]

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-mist px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex items-center gap-2 font-medium text-base text-ink">
            Leveranciersportaal <StatusPill tone={l.tone} label={l.label} />
          </h3>
          <p className="text-ink-2 text-sm">
            {status === "active" && contact
              ? `${contact.email} logt zelf in${
                (access?.contacts.length ?? 0) > 1 ? ` · nog ${(access?.contacts.length ?? 1) - 1} anderen` : ""
              } · ${contact.scopes.length} van ${SCOPES.length} onderdelen zichtbaar`
              : status === "invited" && invitation
              ? invitation.lapsed
                ? `De uitnodiging aan ${invitation.email} is verlopen`
                : `Verstuurd naar ${invitation.email} · ${formatRelative(new Date(invitation.sentAt))}`
              : "Ze werken nu per e-mail. Met het portaal accepteren en verzenden ze zelf."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {status === "none" ?
            (
              <button type="button" onClick={onInvite} className={WELL_BTN}>
                <Send className="size-3.5" strokeWidth={1.75} />
                Uitnodigen voor het portaal
              </button>
            ) :
            null}
          {status === "invited" && invitation?.lapsed ?
            (
              <button
                type="button"
                onClick={() =>
                  void commands.invite(supplier, {
                    email: invitation.email,
                    name: invitation.name ?? undefined,
                    scopes: invitation.scopes.filter((s): s is Scope => s === "orders" || s === "stock")
                  })}
                className={WELL_BTN}
              >
                <RotateCcw className="size-3.5" strokeWidth={1.75} />
                Opnieuw versturen
              </button>
            ) :
            null}
          {status !== "none" && access ?
            (
              <button
                type="button"
                onClick={() => void commands.revokeAll(supplier, access)}
                className="flex h-8 items-center rounded-md px-2.5 font-medium text-signal-red text-sm hover:bg-signal-red-bg"
              >
                {status === "active" ? "Toegang intrekken" : "Intrekken"}
              </button>
            ) :
            null}
        </div>
      </div>
    </section>
  )
}

/** One supplier's person invited: their address, their name and the parts they see. */
export function ConsolePortalInviteDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const commands = usePortalCommands()
  const [email, setEmail] = useState("")
  const [contact, setContact] = useState("")
  const [scopes, setScopes] = useState<ReadonlyArray<Scope>>(DEFAULT_SCOPES)
  const [message, setMessage] = useState("")
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  // Each opening starts from what is on file for this supplier.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refill only when another supplier opens.
  useEffect(() => {
    if (!supplier) return
    setEmail(supplier.contact_email)
    setContact("")
    setScopes(DEFAULT_SCOPES)
    setMessage("")
    setTried(false)
  }, [supplier?.id])

  const valid = EMAIL.test(email.trim())

  return (
    <Dialog open={supplier !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[580px]">
        {supplier ?
          (
            <>
              <DialogHeader>
                <DialogTitle>{`${supplier.name} uitnodigen voor het portaal`}</DialogTitle>
                <DialogDescription>
                  Ze maken een eigen account en zien daarna alleen wat je hieronder aanvinkt. Ze komen niet in je team
                  en tellen niet als plek.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="E-mailadres van de contactpersoon">
                  <TextField value={email} onChange={setEmail} type="email" placeholder="ops@leverancier.com" />
                </Field>
                <Field label="Naam (optioneel)">
                  <TextField value={contact} onChange={setContact} placeholder="Marco Rossi" />
                </Field>
              </div>
              {tried && !valid
                ? <p className="-mt-2 font-medium text-signal-red text-sm">Vul een geldig e-mailadres in.</p>
                : null}

              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1.5 font-medium text-ink-3 text-sm">Wat ze zien</legend>
                {SCOPES.map((s) => {
                  const fixed = "fixed" in s && s.fixed
                  const id = s.id as Scope
                  const on = fixed || scopes.includes(id)
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg px-2.5 py-2",
                        !fixed && "cursor-pointer hover:bg-ink/4"
                      )}
                    >
                      <Checkbox
                        checked={on}
                        disabled={fixed}
                        onCheckedChange={(v) =>
                          setScopes((xs) => (v ? [...new Set([...xs, id])] : xs.filter((x) => x !== id)))}
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-base text-ink">
                          {s.label}
                          {fixed ? <span className="font-normal text-ink-3">{" · altijd"}</span> : null}
                        </span>
                        <span className="text-ink-2 text-sm">{s.detail}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <Field label="Persoonlijk bericht (optioneel)">
                <TextAreaField
                  value={message}
                  onChange={setMessage}
                  placeholder="Via het portaal zie je meteen welke bestellingen voor jullie zijn."
                  rows={2}
                />
              </Field>

              <DialogFooter>
                <button type="button" onClick={onClose} className={GHOST_BTN}>
                  Annuleren
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setTried(true)
                    if (!valid) return
                    setBusy(true)
                    void commands.invite(supplier, {
                      email: email.trim(),
                      name: contact.trim() || undefined,
                      scopes,
                      message: message.trim() || undefined
                    }).then((ok) => {
                      setBusy(false)
                      if (ok) onClose()
                    })
                  }}
                  className={PRIMARY_BTN}
                >
                  <Send className="size-3.5" strokeWidth={1.75} />
                  Uitnodiging versturen
                </button>
              </DialogFooter>
            </>
          ) :
          null}
      </DialogContent>
    </Dialog>
  )
}
