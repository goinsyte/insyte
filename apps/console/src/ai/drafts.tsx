import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Draft } from "@insyte/modules/ai/domain/Ai"
import type { InboxDrafts, InboxThread, ThreadDraft } from "@insyte/ui/app/inbox/source"
import type { TicketDrafts } from "@insyte/ui/app/tickets/source"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
import { DRAFTS, draftWrites, latestDraftAtom } from "../data/drafts.ts"
import { TICKETS } from "../data/tickets.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * Insyte AI in the console's inbox and tickets (M15 step 2; ADR-0027): Insyte writes, a person reads, edits and sends.
 * A thread the customer wrote last gets its draft when it is opened, once; Warmer and Korter rewrite it; "Concept
 * gebruiken" counts it taken. A spent budget and a model that did not answer are said here, in Dutch; the screen keeps
 * what it had.
 */

const NO_DRAFT = Atom.make(AsyncResult.initial<never, never>())

/** Why Insyte wrote nothing, said once. */
const sayAiRefusal = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "BudgetExceeded":
      return void toast.error("Het AI-budget van deze maand is op", {
        description: tagged["scope"] === "member"
          ? `Je eigen limiet van € ${tagged["limit"]} is bereikt. Een beheerder kan hem verhogen bij Limieten.`
          : `De limiet van € ${
            tagged["limit"]
          } voor de werkruimte is bereikt. Een beheerder kan hem verhogen bij Limieten.`
      })
    case "AiRateLimited":
      return void toast.error("Even te veel tegelijk", {
        description: `Insyte schrijft over ${
          Math.max(1, Number(tagged["retryAfterSeconds"]) || 1)
        } seconden weer. Probeer het dan nog eens.`
      })
    case "ModelUnavailable":
      return void toast.error("Concept niet beschikbaar", {
        description: tagged["reason"] === "refused"
          ? "Insyte schrijft hier geen tekst voor. Schrijf het antwoord zelf."
          : tagged["reason"] === "unconfigured"
          ? "Insyte AI is hier nog niet ingesteld. Schrijf het antwoord zelf."
          : tagged["reason"] === "busy"
          ? "Insyte schrijft dit concept al. Het staat zo klaar."
          : "Insyte kon nu geen tekst schrijven. Probeer het zo nog eens of schrijf het zelf."
      })
    default:
      return sayRefusal(error, { gone: "Dat gesprek bestaat niet meer" })
  }
}

/** The inbox's draft card over `Drafts.*`. */
export function useInboxDrafts(): InboxDrafts {
  return useMemo(() => ({ useDraft: useThreadDraft }), [])
}

function useThreadDraft(t: InboxThread | null): ThreadDraft | undefined {
  const latest = useAtomValue(t === null ? NO_DRAFT : latestDraftAtom(`thread:${t.id}`))
  const reply = useAtomSet(draftWrites.reply, { mode: "promiseExit" })
  const use = useAtomSet(draftWrites.use, { mode: "promiseExit" })
  const asked = useRef(new Set<string>())
  const current = Option.getOrUndefined(AsyncResult.value(latest)) as
    | { readonly draft: Draft | null; readonly canDraft: boolean }
    | undefined

  // A thread the customer wrote last and Insyte has no draft for yet: one is asked for, once per thread and visit. The
  // server writes one per last message however many tabs ask, and waits a while after a failed one.
  const id = t?.id
  const missing = current !== undefined && current.draft === null && current.canDraft
  useEffect(() => {
    if (id === undefined || !missing || asked.current.has(id)) return
    asked.current.add(id)
    void reply({ payload: { subject: { type: "thread", id } }, reactivityKeys: [...DRAFTS] }).then((exit) => {
      // A spent budget, a full minute or a model away leaves the card out; the person writes the answer themselves.
      if (Exit.isFailure(exit)) {
        const error = failureOf(exit) as { _tag?: string }
        const quiet = ["BudgetExceeded", "AiRateLimited", "ModelUnavailable"]
        if (!quiet.includes(error._tag ?? "")) sayAiRefusal(error)
      }
    })
  }, [id, missing, reply])

  if (t === null || current === undefined) return undefined
  const draft = current.draft
  return {
    reply: draft?.text,
    rewrite: async (style) => {
      if (draft === null) return undefined
      const exit = await reply({
        payload: {
          subject: { type: "thread", id: t.id },
          tone: style === "warmer" ? "warmer" : "korter",
          parentDraftId: draft.id
        },
        reactivityKeys: [...DRAFTS]
      })
      if (Exit.isFailure(exit)) return void sayAiRefusal(failureOf(exit))
      return exit.value.text
    },
    use: () => {
      if (draft === null) return
      void use({ payload: { id: draft.id }, reactivityKeys: [...DRAFTS] })
    }
  }
}

/** Samenvatten and Antwoord voorstellen (AI) on a ticket, over `Drafts.*`. */
export function useTicketDrafts(): TicketDrafts {
  const reply = useAtomSet(draftWrites.reply, { mode: "promiseExit" })
  const summarize = useAtomSet(draftWrites.summarizeTicket, { mode: "promiseExit" })
  return useMemo(() => ({
    summarize: async (ticketId) => {
      const exit = await summarize({ payload: { ticketId }, reactivityKeys: [...TICKETS, ...DRAFTS] })
      if (Exit.isFailure(exit)) {
        sayAiRefusal(failureOf(exit))
        return false
      }
      return true
    },
    suggestReply: async (ticketId) => {
      const exit = await reply({ payload: { subject: { type: "ticket", id: ticketId } }, reactivityKeys: [...DRAFTS] })
      if (Exit.isFailure(exit)) return void sayAiRefusal(failureOf(exit))
      return exit.value.text
    }
  }), [reply, summarize])
}
