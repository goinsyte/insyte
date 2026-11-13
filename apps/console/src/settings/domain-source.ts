import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { DomainRecord, SendingDomainState } from "@insyte/modules/settings/domain/SendingDomain"
import type { DnsRecord, Domain } from "@insyte/ui/app/lib/settings-depth"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { SettingsDepthSource } from "@insyte/ui/app/settings/depth/source"
import { Exit } from "effect"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { DEPTH, depthWrites, sendingDomainAtom } from "../data/settings-depth.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * E-mail en domein in the console (M17 step 20.1c): `SendingDomain.get` as the design's domain, "Domein instellen"
 * through `SendingDomain.setUp`, "Opnieuw controleren" through `SendingDomain.verify` (the toast says what it found),
 * "Domein verwijderen" through `SendingDomain.remove`, and the senders saved through `SendingDomain.saveSenders` over
 * the version they were read at, with their undo. Where there is no domain to show the page says why
 * (`DomainHere.state`; a set-up that did not take is said until the next try); a record is only ever one Resend listed
 * or the DNS answered.
 */

/** Why a record is not found yet, as the page says it under the value. */
const whyOf = (r: DomainRecord, domain: string): string | undefined => {
  if (r.status !== "missing") return undefined
  if (r.reason === "failed") return "Na 72 uur nog niet gevonden. Kijk de naam en de waarde na en controleer opnieuw."
  if (r.reason === "temporary_failure") return "De controle lukte even niet. Probeer het later opnieuw."
  const at = `${r.name}.${domain}`
  switch (r.id) {
    case "mx":
      return `Er staat nog geen MX-record op ${at}.`
    case "spf":
      return `Er staat nog geen SPF-record op ${at}.`
    case "dkim":
      return "De sleutel staat er nog niet. Een nieuw record kan tot 24 uur duren."
    case "dmarc":
      return `Er staat nog geen DMARC-record op ${at}.`
  }
}

/** The server's state as the design's domain; never checked is an empty `checkedAt`. */
const designDomain = (state: SendingDomainState): Domain => {
  const domain = state.domain ?? ""
  return {
    domain,
    records: state.records.map((r): DnsRecord => {
      const why = whyOf(r, domain)
      return {
        id: r.id,
        type: r.type,
        name: r.name,
        value: r.value,
        status: r.status,
        ...(why === undefined ? {} : { why })
      }
    }),
    checkedAt: state.checkedAt === null ? "" : new Date(state.checkedAt).toISOString(),
    checks: state.checks,
    from: state.senders.from,
    replyTo: state.senders.replyTo
  }
}

/** A sender the server refused, by its field and reason, in the page's words. */
const senderRefusal = (fields: Record<string, string>, domain: string) => {
  const from = fields["from"]
  if (from === "format") return "Mails van Insyte is geen geldig e-mailadres."
  if (from === "not_on_domain") return `Mails van Insyte moet een adres op ${domain} zijn.`
  if (from === "no_domain") return "Er is nog geen domein om vanaf te mailen. Stel eerst je domein in."
  const replyTo = fields["replyTo"]
  if (replyTo === "format") return "Antwoorden naar is geen geldig e-mailadres."
  if (replyTo === "not_a_mailbox") {
    return "Kies het adres van een gekoppelde mailbox, dan komt een antwoord binnen in de Inbox."
  }
  return undefined
}

const copyFor = (domain: string): RefusalCopy => ({
  gone: "Deze instellingen bestaan niet meer",
  conflicts: {
    stale_version: [
      "Iemand anders sloeg de afzenders net op",
      "Je ziet nu de nieuwste versie. Breng je wijziging opnieuw aan."
    ]
  },
  other: (tagged) => {
    if (tagged._tag !== "Invalid") return false
    if ((tagged["fields"] as Record<string, string>)["domain"] === "format") {
      toast.error("Dat is geen domein", {
        description: "Vul een domein in zoals jouwwinkel.nl, zonder https:// of pad."
      })
      return true
    }
    const said = senderRefusal(tagged["fields"] as Record<string, string>, domain)
    if (said === undefined) return false
    toast.error("Dat kan zo niet", { description: said })
    return true
  }
})

const foundOf = (state: { records: ReadonlyArray<{ status: string }> }) =>
  state.records.filter((r) => r.status === "found").length

export function useConsoleDomainSource(state: SendingDomainState): SettingsDepthSource {
  const save = useAtomSet(depthWrites.saveSenders, { mode: "promiseExit" })
  const verify = useAtomSet(depthWrites.verifyDomain, { mode: "promiseExit" })
  const setUp = useAtomSet(depthWrites.setUpDomain, { mode: "promiseExit" })
  const remove = useAtomSet(depthWrites.removeDomain, { mode: "promiseExit" })
  const undo = useAtomSet(depthWrites.undo, { mode: "promiseExit" })
  const refresh = useAtomRefresh(sendingDomainAtom)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  // What the last "Domein instellen" came to where it did not take: the page says so until the next try.
  const [attempt, setAttempt] = useState<"taken" | "failed" | "unavailable" | null>(null)
  const saved = useMemo(() => designDomain(state), [state])
  const copy = copyFor(saved.domain)
  return {
    saved: { domain: saved },
    save: async (_key, next, said) => {
      const { from, replyTo } = next as Domain
      const exit = await save({ payload: { from, replyTo, baseVersion: state.version }, reactivityKeys: [...DEPTH] })
      if (Exit.isFailure(exit)) {
        const error = failureOf(exit) as { _tag?: string; reason?: string }
        sayRefusal(error, copy)
        if (error._tag === "Conflict" && error.reason === "stale_version") refresh()
        return false
      }
      const token = exit.value.undo.token
      undoable(said.label, () =>
        void undo({ payload: { token }, reactivityKeys: [...DEPTH] }).then((done) => {
          if (Exit.isFailure(done)) sayRefusal(failureOf(done), copy)
        }), said.detail)
      return true
    },
    domain: {
      state: state.state === "unclaimed" && attempt !== null ? attempt : state.state,
      busy,
      setUp: (name) => {
        if (busy) return
        setBusy(true)
        void setUp({ payload: { name }, reactivityKeys: [...DEPTH] }).then((exit) => {
          setBusy(false)
          if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), copy)
          const now = exit.value
          setAttempt(now.state === "taken" || now.state === "failed" || now.state === "unavailable" ? now.state : null)
          if (now.state === "ready") {
            toast(`${now.domain ?? name} ingesteld`, {
              description: "Voeg de vier DNS-records toe bij je domeinbeheerder en controleer daarna opnieuw."
            })
          }
        })
      },
      remove: () => {
        if (busy) return
        setBusy(true)
        void remove({ payload: undefined, reactivityKeys: [...DEPTH] }).then((exit) => {
          setBusy(false)
          if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), copy)
          setAttempt(null)
          if (exit.value.state !== "unclaimed") {
            return void toast.error("Verwijderen lukte niet", { description: "Probeer het zo opnieuw." })
          }
          toast(`${saved.domain} verwijderd`, {
            description: "Mail gaat van Insyte uit tot een nieuw domein klaar is."
          })
        })
      },
      checking,
      check: () => {
        if (checking) return
        setChecking(true)
        void verify({ payload: undefined, reactivityKeys: [...DEPTH] }).then((exit) => {
          setChecking(false)
          if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), copy)
          const now = exit.value
          if (now.state === "failed") {
            return void toast.error("Controleren lukte niet", { description: "Probeer het zo opnieuw." })
          }
          if (now.state !== "ready") return
          const after = foundOf(now)
          const all = after === now.records.length
          toast(all ? "Alle records gevonden" : `${after} van ${now.records.length} records gevonden`, {
            description: all
              ? "Mail van je domein is nu ondertekend en komt beter aan."
              : "De rest kan tot 24 uur duren. Controleer het later nog eens."
          })
        })
      }
    }
  }
}
