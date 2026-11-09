import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import type { Customer } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"

const counted = (n: number) => `${n} ${n === 1 ? "klant" : "klanten"}`

const PRIMARY =
  "h-9 cursor-pointer rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
const GHOST =
  "h-9 cursor-pointer rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"

/* ─── Sync to Klaviyo ───────────────────────────────────────────────────── */

/** A list the profiles can go to; `id` is the host's, `null` for one still to be made. */
export type KlaviyoListOption = { readonly id: string; readonly name: string }

/** Who of the picked profiles may go, where the host knows it better than the addresses alone. */
export type KlaviyoPreview = { readonly sendable: number; readonly consent: number; readonly email: number }

const processor = (email: string) => email.includes("@stripe.com") || email.includes("@paypal.com")

/**
 * Sends the picked profiles to a Klaviyo list: it walks the profiles with a count, then says where they went. If
 * Klaviyo is not connected, the dialog says so and offers to connect it instead of pretending.
 *
 * Everything it does is the host's: whether Klaviyo is connected, its lists, who may go (`preview`; without one, every
 * profile with an address of its own), connecting (`onConnect`: the demo's Integrations, Klaviyo's approval page) and the sync
 * itself (`onSync`, answering whether it took). The demo workspace's, or the console's Klaviyo (M7.5).
 */
export function KlaviyoDialog({
  open,
  onOpenChange,
  picked,
  connected,
  lists,
  preview,
  onConnect,
  onSync
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  picked: ReadonlyArray<Customer>
  connected: boolean
  lists: ReadonlyArray<KlaviyoListOption>
  preview?: KlaviyoPreview | undefined
  onConnect: () => void
  onSync: (list: { readonly id: string | null; readonly name: string }, withTags: boolean) => Promise<boolean>
}) {
  const still = useReducedMotion()
  const [list, setList] = useState(lists[0]?.id ?? "new")
  const [custom, setCustom] = useState("")
  const [withTags, setWithTags] = useState(true)
  const [phase, setPhase] = useState<"pick" | "syncing" | "done">("pick")
  const [sent, setSent] = useState(0)
  const [answer, setAnswer] = useState<"waiting" | "took" | "refused">("waiting")
  const chosen = lists.find((l) => l.id === list)
  const target = list === "new" ? custom.trim() : chosen?.name ?? ""
  const noEmail = preview?.email ?? picked.filter((c) => processor(c.email)).length
  const noConsent = preview?.consent ?? 0
  const sendable = preview?.sendable ?? picked.length - noEmail

  useEffect(() => {
    if (!open) return
    setPhase("pick")
    setSent(0)
    setAnswer("waiting")
  }, [open])

  // The first list once the host's lists arrive.
  useEffect(() => {
    if (list !== "new" && !lists.some((l) => l.id === list)) setList(lists[0]?.id ?? "new")
  }, [lists, list])

  function start() {
    setPhase("syncing")
    void onSync({ id: list === "new" ? null : list, name: target }, withTags).then((took) =>
      setAnswer(took ? "took" : "refused")
    )
  }

  useEffect(() => {
    if (phase !== "syncing") return
    if (answer === "refused") {
      setPhase("pick")
      setSent(0)
      setAnswer("waiting")
      return
    }
    if (sent >= sendable) {
      if (answer === "took") setPhase("done")
      return
    }
    const t = window.setTimeout(() => setSent((n) => Math.min(sendable, n + Math.max(1, Math.ceil(sendable / 12)))), 70)
    return () => window.clearTimeout(t)
  }, [phase, sent, sendable, answer])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BrandLogo brand="klaviyo" name="Klaviyo" size={36} />
            <div className="flex flex-col gap-0.5">
              <DialogTitle>Synchroniseren naar Klaviyo</DialogTitle>
              <DialogDescription>{counted(picked.length)} gekozen</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!connected ?
          (
            <p className="text-base text-ink-2">
              Klaviyo is niet gekoppeld aan deze werkruimte. Koppel het eerst en kom dan terug voor deze{" "}
              {counted(picked.length)}.
            </p>
          ) :
          phase === "pick" ?
          (
            <div className="flex flex-col gap-3">
              <div role="radiogroup" aria-label="Klaviyo-lijst" className="flex flex-col gap-1">
                {[...lists.map((o) => o.id), "new"].map((l) => {
                  const on = list === l
                  return (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setList(l)}
                      className={cn(
                        "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg bg-mist px-3 text-left text-base transition-shadow",
                        on ? "ring-2 ring-arc" : "hover:ring-1 hover:ring-ink/15"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full ring-1",
                          on ? "bg-arc ring-arc" : "ring-ink/25"
                        )}
                      >
                        {on ? <span className="size-1.5 rounded-full bg-paper" /> : null}
                      </span>
                      {l === "new" ?
                        (
                          on ?
                            (
                              <input
                                // biome-ignore lint/a11y/noAutofocus: the field appears because the operator chose a new list
                                autoFocus
                                value={custom}
                                onChange={(e) => setCustom(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Geef de nieuwe lijst een naam"
                                aria-label="Naam nieuwe lijst"
                                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
                              />
                            ) :
                            <span className="text-ink-2">Een nieuwe lijst</span>
                        ) :
                        <span className="text-ink">{lists.find((o) => o.id === l)?.name ?? l}</span>}
                    </button>
                  )
                })}
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 text-base text-ink-2">
                <input
                  type="checkbox"
                  checked={withTags}
                  onChange={(e) => setWithTags(e.target.checked)}
                  className="size-4 accent-[var(--arc)]"
                />
                Labels meesturen als profieleigenschappen
              </label>
              {noConsent > 0 ?
                (
                  <p className="text-sm text-ink-3">
                    {counted(noConsent)} {noConsent === 1 ? "gaf" : "gaven"} geen toestemming voor marketing en{" "}
                    {noConsent === 1 ? "blijft" : "blijven"} buiten de synchronisatie.
                  </p>
                ) :
                null}
              {noEmail > 0 ?
                (
                  <p className="text-sm text-ink-3">
                    {counted(noEmail)} {noEmail === 1 ? "rekende" : "rekenden"} als gast af via een betaalprovider en
                    {" "}
                    {noEmail === 1 ? "heeft" : "hebben"} geen eigen e-mailadres;{" "}
                    {noEmail === 1 ? "die blijft" : "die blijven"} buiten de synchronisatie.
                  </p>
                ) :
                null}
            </div>
          ) :
          (
            <div className="flex flex-col gap-2.5" role="status">
              <div className="flex items-baseline justify-between text-base">
                <span className="text-ink">
                  {phase === "done" ? `In Klaviyo, op ${target}` : `Versturen naar ${target}`}
                </span>
                <span className="text-ink-2 tabular-nums">
                  {Math.min(sent, sendable)} van {sendable}
                </span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-ink/8">
                <motion.span
                  className="block h-full rounded-full bg-arc"
                  animate={{ width: `${sendable === 0 ? 100 : (Math.min(sent, sendable) / sendable) * 100}%` }}
                  transition={still ? { duration: 0 } : { duration: 0.12 }}
                />
              </span>
              {phase === "done" ?
                (
                  <p className="text-sm text-ink-3">
                    {withTags ? "Labels zijn meegestuurd als profieleigenschappen. " : ""}Elk profiel laat zien wanneer
                    het voor het laatst is gesynchroniseerd.
                  </p>
                ) :
                null}
            </div>
          )}

        <DialogFooter>
          {!connected ?
            (
              <button type="button" onClick={onConnect} className={PRIMARY}>
                Klaviyo koppelen
              </button>
            ) :
            phase === "done" ?
            (
              <button type="button" onClick={() => onOpenChange(false)} className={PRIMARY}>
                Klaar
              </button>
            ) :
            (
              <>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className={GHOST}
                  disabled={phase === "syncing"}
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  disabled={phase === "syncing" || target === "" || sendable === 0}
                  onClick={start}
                  className={PRIMARY}
                >
                  {phase === "syncing" ? "Synchroniseren" : `${counted(sendable)} synchroniseren`}
                </button>
              </>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
