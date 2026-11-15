import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AskFrame, AskThread, AskTurn, Source, Token as ServerToken } from "@insyte/modules/ask/domain/Ask"
import type { AskSource } from "@insyte/ui/app/ask/ask-source"
import type { Script, Token, Turn } from "@insyte/ui/app/lib/ask/types"
import { undoable } from "@insyte/ui/app/lib/undo"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { ASK, askListAtom, askStream, askThreadAtom, askWrites } from "../data/ask.ts"
import { frameAtom } from "../data/frame.ts"
import { viewStoreAtom } from "../data/store-view.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * Vraag Insyte in the console (M15 step 3): the viewer's own conversations from `Ask.list`, the open one (`?c=`) from
 * `Ask.get`, and a question through `Ask.send`, whose frames draw the answer as they come: the thinking, the tools it
 * ran, what it read, then the words. A turn the server has kept is drawn as it settled, never played again. Every
 * number in an answer is a figure a tool computed and opens where it was counted. Nothing the answer says acts.
 */

const STARTS = [
  "Vat de open zaken van vandaag samen",
  "Welke bestellingen dreigen te laat te komen?",
  "Welke tickets hebben hoge prioriteit?",
  "Welke chargebacks hebben bewijs nodig?"
] as const

const FAILED: Record<string, string> = {
  budget:
    "Het AI-budget van deze maand is op, dus ik kon dit niet beantwoorden. Een beheerder kan het verhogen bij Limieten.",
  model: "Ik kon hier nu geen antwoord op geven. Probeer het zo nog eens.",
  rate: "Er werd net te veel tegelijk gevraagd. Probeer het zo nog eens.",
  interrupted: "Dit antwoord werd afgebroken voordat het klaar was. Vraag het gerust opnieuw."
}

const words = (text: string): Array<Token> => text.split(/(\s+)/).filter((w) => w !== "").map((t) => ({ t }))

/** A figure with an explanation opens it over Analyse (`/analytics?explain=`); any other opens the list it counts. */
const tokenOf = (t: ServerToken): Token =>
  "figure" in t ?
    t.explain === null ?
      { figure: t.figure, label: t.label, to: t.to } :
      { figure: t.figure, label: t.label, to: "/analytics", search: { explain: t.explain } } :
    t

const sourceOf = (s: Source): Script["sources"][number] => s

/** A kept turn as the thread draws it: settled, not played again. */
const turnOf = (t: AskTurn): Turn => {
  if (t.role === "user") return { id: t.id, role: "user", text: t.text }
  const answer = t.withheld ?
    words("Dit antwoord las uit een winkel die je niet meer kunt zien, dus het staat hier niet meer.") :
    t.state === "failed" ?
    words(FAILED[t.failure ?? "model"] ?? FAILED["model"]!) :
    t.tokens.map(tokenOf)
  return {
    id: t.id,
    role: "assistant",
    script: {
      steps: t.thinking,
      tools: t.tools,
      answer,
      sources: t.sources.map(sourceOf),
      followUps: t.followUps
    },
    settled: true,
    decision: "open",
    live: { phase: "settled", seconds: Math.max(1, Math.round((t.thinkingMs ?? 0) / 1000)) }
  }
}

/** The question on its way: what has come of its answer so far. */
interface Pending {
  readonly threadId: string | null
  readonly question: string
  readonly turnId: string | null
  readonly questionId: string | null
  readonly startedAt: number
  readonly steps: ReadonlyArray<string>
  readonly tools: Script["tools"]
  readonly sources: Script["sources"]
  readonly tokens: ReadonlyArray<Token>
  readonly settled: AskTurn | null
}

const onFrame = (p: Pending, f: AskFrame): Pending => {
  switch (f._tag) {
    case "started":
      return { ...p, threadId: f.threadId, turnId: f.turnId, questionId: f.question.id }
    case "thinking":
      return { ...p, steps: [...p.steps, f.step] }
    case "tool":
      return { ...p, tools: [...p.tools, f.tool] }
    case "source":
      return { ...p, sources: [...p.sources, sourceOf(f.source)] }
    case "text":
      return { ...p, tokens: [...p.tokens, ...f.tokens.map(tokenOf)] }
    case "settled":
      return { ...p, settled: f.turn }
  }
}

const pendingTurns = (p: Pending): Array<Turn> => {
  const question: Turn = { id: `${p.turnId ?? "pending"}:q`, role: "user", text: p.question }
  if (p.settled !== null) return [question, turnOf(p.settled)]
  return [question, {
    id: p.turnId ?? "pending",
    role: "assistant",
    script: { steps: p.steps, tools: p.tools, answer: [...p.tokens], sources: p.sources, followUps: [] },
    settled: false,
    decision: "open",
    live: {
      phase: p.tokens.length === 0 ? "thinking" : "streaming",
      seconds: Math.max(1, Math.round((Date.now() - p.startedAt) / 1000))
    }
  }]
}

/** Why a question was not taken, said once. */
const sayAskRefusal = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "AiRateLimited":
      return void toast.error("Even te veel tegelijk", {
        description: `Vraag het over ${Math.max(1, Number(tagged["retryAfterSeconds"]) || 1)} seconden nog eens.`
      })
    case "AskBusy":
      return void toast.error("Insyte is nog aan het antwoorden", {
        description: "Wacht tot het antwoord er staat en vraag dan verder."
      })
    case "ModelUnavailable":
      return void toast.message("Insyte AI is nog niet ingeschakeld", {
        description: tagged["reason"] === "unconfigured"
          ? "Vraag Insyte komt er zodra Insyte AI is ingeschakeld."
          : "Insyte kon nu niet antwoorden. Probeer het zo nog eens."
      })
    default:
      return sayRefusal(error, { gone: "Dat gesprek bestaat niet meer" })
  }
}

/** The open conversation, read while one is open. */
const NONE = Atom.make(AsyncResult.initial<AskThread, never>())

function useThread(id: string | null): AskThread | undefined {
  return Option.getOrUndefined(AsyncResult.value(useAtomValue(id === null ? NONE : askThreadAtom(id))))
}

/**
 * Vraag Insyte where it is drawn: the page (`/ask`), whose open conversation is the address's `?c=`, or the top bar's
 * panel, which keeps its own beside whatever page is open. Both ask and read over the same `Ask.*`.
 */
export function useConsoleAskSource(place: "page" | "panel" = "page"): AskSource {
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> })
  const route = useRouterState({ select: (s) => s.location.pathname })
  const [held, setHeld] = useState<string | null>(null)
  const active = place === "panel" ? held : typeof search["c"] === "string" ? search["c"] : null
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(askListAtom)))
  const thread = useThread(active)
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const storeId = useAtomValue(viewStoreAtom) ?? undefined
  const send = useAtomSet(askStream, { mode: "promiseExit" })
  const remove = useAtomSet(askWrites.remove, { mode: "promiseExit" })
  const undo = useAtomSet(askWrites.undo, { mode: "promiseExit" })
  const [pending, setPending] = useState<Pending | null>(null)
  const busy = pending !== null && pending.settled === null

  const openThread = useCallback((id: string | null) => {
    if (place === "panel") return setHeld(id)
    void navigate({ to: "/ask" as never, search: (id === null ? {} : { c: id }) as never })
  }, [navigate, place])

  const run = useCallback((p: Pending, call: { kind: "send"; text: string } | { kind: "retry"; turnId: string }) => {
    setPending(p)
    let opened = p.threadId !== null
    void send({
      ...(call.kind === "send" ?
        {
          kind: "send" as const,
          payload: {
            text: call.text,
            ...(p.threadId === null ? {} : { threadId: p.threadId }),
            context: { route, ...(storeId === undefined ? {} : { storeId }) }
          }
        } :
        { kind: "retry" as const, turnId: call.turnId }),
      onFrame: (f) => {
        setPending((now) => (now === null ? now : onFrame(now, f)))
        if (f._tag === "started" && !opened) {
          opened = true
          openThread(f.threadId)
        }
      }
    }).then((exit) => {
      if (Exit.isFailure(exit)) {
        setPending(null)
        sayAskRefusal(failureOf(exit))
      }
    })
  }, [send, route, storeId, openThread])

  return useMemo((): AskSource => {
    const kept = thread?.turns ?? []
    // The question on its way, drawn from its frames until the conversation as kept has its answer settled.
    const landed = pending?.turnId != null && kept.some((t) => t.id === pending.turnId && t.state !== "streaming")
    const showing = pending !== null && !landed && pending.threadId === active
    const hidden = new Set(showing ? [pending.turnId, pending.questionId] : [])
    const turns = [...kept.filter((t) => !hidden.has(t.id)).map(turnOf), ...(showing ? pendingTurns(pending) : [])]
    return {
      conversations: (list?.rows ?? []).map((r) => ({ id: r.id, title: r.title, at: r.lastTurnAt })),
      active,
      turns: active === null && turns.length === 0 ? undefined : turns,
      busy,
      ask: (text) => {
        const clean = text.trim()
        if (clean === "" || busy) return
        run(emptyPending(active, clean), { kind: "send", text: clean })
      },
      retry: (turnId) => {
        if (busy || active === null) return
        const at = thread?.turns.findIndex((t) => t.id === turnId) ?? -1
        const question = at > 0 ? thread?.turns[at - 1]?.text ?? "" : ""
        run(emptyPending(active, question), { kind: "retry", turnId })
      },
      start: () => {
        setPending(null)
        openThread(null)
      },
      open: (id) => openThread(id),
      page: () => void navigate({ to: "/ask" as never, search: (active === null ? {} : { c: active }) as never }),
      remove: (id) => {
        void remove({ payload: { id }, reactivityKeys: ASK }).then((exit) => {
          if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Dat gesprek bestaat niet meer" })
          if (id === active) openThread(null)
          undoable(
            "Gesprek verwijderd",
            () =>
              void undo({ payload: { token: exit.value.undo.token }, reactivityKeys: ASK }).then((back) => {
                if (Exit.isFailure(back)) sayRefusal(failureOf(back), { gone: "Dat gesprek bestaat niet meer" })
              })
          )
        })
      },
      // A kept turn is never played; a proposal is not drawn in an answer (it has no tools that act).
      settle: () => {},
      decide: () => {},
      welcome: { name: frame?.me.name.split(" ")[0] ?? "", needs: null, starts: STARTS },
      // The `@` list is the design's records on screen; the console has none of them in hand here.
      mentions: [],
      note:
        "Insyte leest alleen wat jij mag zien en verandert niets: elk getal in een antwoord komt uit je eigen gegevens en opent waar het geteld is."
    }
  }, [list, thread, pending, active, busy, frame, run, openThread, remove, undo, navigate])
}

const emptyPending = (threadId: string | null, question: string): Pending => ({
  threadId,
  question,
  turnId: null,
  questionId: null,
  startedAt: Date.now(),
  steps: [],
  tools: [],
  sources: [],
  tokens: [],
  settled: null
})
