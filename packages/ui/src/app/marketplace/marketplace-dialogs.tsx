import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Switch } from "../../components/switch"
import { CheckCircle2, Lock } from "../../icons"
import type { Extension } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { Field, INPUT_CLASS, SelectInput } from "../settings/form"
import { useMarketplaceState } from "../shell/state"
import { PERMISSIONS_FOR, vendorName } from "./app-catalog"

/*
 * The small dialogs the Marketplace and Settings → Apps open: feedback, the legal pages and the scopes an app holds,
 * through the host's source (`marketplace-source.ts`). The in-place app dialog is the design's own
 * (`open-app-dialog.tsx`).
 */

const PRIMARY =
  "flex h-9 items-center justify-center rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
const GHOST = "flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink hover:bg-ink/6"

const FEEDBACK_CATEGORIES = ["Een app voorstellen", "Er werkt iets niet", "Een app-vermelding klopt niet", "Anders"]

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { sendFeedback } = useMarketplaceState()
  const [sending, setSending] = useState(false)
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0])
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (!open) return
    setCategory(FEEDBACK_CATEGORIES[0])
    setMessage("")
    setSent(false)
  }, [open])

  // A failure keeps what was written; the host says why.
  async function send() {
    if (!message.trim() || sending) return
    setSending(true)
    const kept = await sendFeedback({ category, message: message.trim() })
    setSending(false)
    if (kept) setSent(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {sent ?
          (
            <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
              <CheckCircle2 className="size-8 text-signal-green" strokeWidth={1.75} />
              <DialogTitle>Bedankt voor je bericht</DialogTitle>
              <DialogDescription className="max-w-[40ch]">
                Het Marketplace-team leest elk bericht. Is een antwoord nodig, dan gaat dat naar je factuur-e-mail.
              </DialogDescription>
              <button type="button" onClick={() => onOpenChange(false)} className={cn(PRIMARY, "mt-2")}>
                Klaar
              </button>
            </div>
          ) :
          (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
            >
              <DialogHeader>
                <DialogTitle>Feedback sturen</DialogTitle>
                <DialogDescription>Vertel ons welke app je mist of wat niet werkt.</DialogDescription>
              </DialogHeader>
              <Field label="Waar gaat het over">
                <SelectInput value={category} onChange={setCategory} options={FEEDBACK_CATEGORIES} />
              </Field>
              <Field label="Bericht">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="We zouden een retourportaal gebruiken dat ook omruilingen afhandelt."
                  className={cn(INPUT_CLASS, "h-auto resize-none py-2")}
                />
              </Field>
              <DialogFooter>
                <button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
                  Annuleren
                </button>
                <button type="submit" disabled={!message.trim() || sending} className={PRIMARY}>
                  Feedback sturen
                </button>
              </DialogFooter>
            </form>
          )}
      </DialogContent>
    </Dialog>
  )
}

const LEGAL = {
  terms: {
    label: "Voorwaarden",
    body: [
      "Apps in de Marketplace worden gebouwd en beheerd door hun aanbieders, niet door Insyte. Als je er een installeert, sluit je een overeenkomst met die aanbieder.",
      "De aanbieder factureert zelf, tenzij de vermelding zegt dat het via Insyte gaat. Insyte houdt niets in van wat je een aanbieder betaalt.",
      "Je kunt een app altijd verwijderen. De toegang stopt dan direct; data die al gekopieerd is, valt onder de voorwaarden van de aanbieder."
    ]
  },
  privacy: {
    label: "Privacy",
    body: [
      "Een app krijgt alleen de data die in zijn rechten staat. Je ziet en trekt die rechten in onder Instellingen, dan Apps.",
      "Insyte legt elk verzoek vast dat een app namens jou doet. Dat logboek hoort bij de auditlog van de werkruimte en wordt 90 dagen bewaard.",
      "Klantdata verlaat via Insyte nooit je regio. Een aanbieder die data elders opslaat, vermeldt dat bij de app."
    ]
  },
  vendors: {
    label: "Aanbiedersprogramma",
    body: [
      "Elke app wordt beoordeeld voordat hij verschijnt: we vergelijken de gevraagde rechten met wat de app doet en testen hem in een dropshipping-werkruimte.",
      "Aanbieders beantwoorden supportvragen binnen twee werkdagen en melden een ingrijpende wijziging 30 dagen van tevoren.",
      "Bouw je iets voor dropshippers? Schrijf naar vendors@insyte.app met een korte omschrijving en een demowerkruimte."
    ]
  }
} as const
type LegalTab = keyof typeof LEGAL

export function LegalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<LegalTab>("terms")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Marketplace-beleid</DialogTitle>
          <DialogDescription>De korte versie van hoe apps, je data en aanbieders samenwerken.</DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label="Beleid" className="flex self-start rounded-lg bg-mist p-0.5">
          {(Object.keys(LEGAL) as LegalTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`legal-tab-${t}`}
              aria-selected={tab === t}
              aria-controls="legal-panel"
              onClick={() => setTab(t)}
              className={cn(
                "flex h-7 items-center rounded-md px-3 font-medium text-sm transition-colors",
                tab === t ? "bg-paper text-ink shadow-xs" : "text-ink-3 hover:text-ink"
              )}
            >
              {LEGAL[t].label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="legal-panel"
          aria-labelledby={`legal-tab-${tab}`}
          className="flex min-h-[180px] flex-col gap-3 text-base text-ink-2 leading-relaxed"
        >
          {LEGAL[tab].body.map((p) => <p key={p}>{p}</p>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Each scope an app holds, as a switch; the ones turned off are saved as revoked, with an undo. */
export function PermissionsDialog({
  extension,
  open,
  onOpenChange
}: {
  extension: Extension | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { revokedScopes, setRevokedScopes, canRescope } = useMarketplaceState()
  const saved = extension ? revokedScopes(extension.id) : []
  const [revoked, setRevoked] = useState<Array<string>>([...saved])
  const savedKey = saved.join("\n")
  // Each opening starts from what is saved, not from the last visit's unsaved switches.
  useEffect(() => {
    if (open) setRevoked(savedKey ? savedKey.split("\n") : [])
  }, [open, savedKey])

  if (!extension) return null
  const ext = extension
  const permissions = PERMISSIONS_FOR[ext.id] ?? []
  const unchanged = [...revoked].sort().join("\n") === [...saved].sort().join("\n")
  // An app whose rights are its provider's grant lists them, and they are changed at the provider.
  const fixed = !canRescope(ext.id)

  // The host saves and offers Ongedaan maken.
  function save() {
    setRevokedScopes(ext, revoked)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Rechten van {ext.name}</DialogTitle>
          <DialogDescription>
            {fixed ?
              `Deze rechten gaf je bij ${
                vendorName(ext.name)
              } zelf. Wil je er minder geven, verwijder de app dan en koppel opnieuw.` :
              "Zet uit wat deze app niet mag doen. Functies die het nodig hebben, werken pas weer als je het aanzet."}
          </DialogDescription>
        </DialogHeader>
        {permissions.length === 0 ?
          <p className="rounded-lg bg-mist px-3 py-3 text-base text-ink-3">Deze app vraagt geen extra rechten.</p> :
          (
            <ul className="flex flex-col overflow-hidden rounded-lg">
              {permissions.map((p) => {
                const granted = !revoked.includes(p)
                return (
                  <li key={p} className="flex items-center justify-between gap-4 px-3 py-2.5 odd:bg-mist">
                    <span
                      className={cn(
                        "flex items-start gap-2 text-base leading-snug",
                        granted ? "text-ink" : "text-ink-3"
                      )}
                    >
                      <Lock className="mt-[3px] size-3 shrink-0 text-ink-3" strokeWidth={1.75} />
                      {p}
                    </span>
                    <Switch
                      checked={granted}
                      disabled={fixed}
                      aria-label={p}
                      onCheckedChange={(v) => setRevoked((r) => (v ? r.filter((x) => x !== p) : [...r, p]))}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
            Annuleren
          </button>
          <button type="button" disabled={unchanged} onClick={save} className={PRIMARY}>
            Rechten bijwerken
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
