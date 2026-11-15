import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Cause, Effect, Option, Queue, Stream } from "effect"
import type { LanguageModel } from "effect/ai"
import { ASK_PROMPT_VERSION, askStep } from "../../ai/Ai.ts"
import { type AiModel, AiRateLimited, BudgetExceeded } from "../../ai/domain/Ai.ts"
import { untracedFigures } from "../../ai/domain/Guards.ts"
import type { AskContext, AskFrame, Source, Token, ToolChip, TurnFailure } from "../domain/Ask.ts"
import type { AnswerPart, AskStep, StepInput, StepResult } from "../domain/Steps.ts"
import type { AskTool, ToolFigure, ToolRecord } from "../domain/Tools.ts"
import type { Begun, Settled } from "./threads.ts"
import * as Threads from "./threads.ts"

/*
 * Vraag Insyte's loop (M15 step 3; ai.md §4, §6.2, §8): the model asks for tools, the tools run as the person asking,
 * and the model answers with what they found, placing figures and records by id. Each step is one model call, reserved
 * against the budget first and metered whatever its outcome. A turn has room for `MAX_STEPS` calls, `MAX_TOOLS` tool
 * runs and `DEADLINE_MS`; past any of them the model answers with what it has, and the turn says so.
 *
 * After the answer, the check (§6.2): a digit in its words that is in neither the question nor what the tools read is
 * one the model made up, an amount or a percentage belongs in a figure, and a figure or record it names must be one a
 * tool gave. A failed answer is asked for once more with what was wrong; failing again, the parts that fail are left
 * out. Nothing the model writes acts: it has no tool that writes.
 *
 * The frames go out as the turn happens; the answer is kept as it settles, and a turn left before it settles is kept as
 * failed.
 */

export const MAX_STEPS = 5
export const MAX_TOOLS = 8
export const DEADLINE_MS = 60_000

const PAGES: Readonly<Record<string, string>> = {
  dashboard: "Start",
  orders: "Bestellingen",
  tickets: "Tickets",
  chargebacks: "Chargebacks",
  customers: "Klanten",
  products: "Producten",
  inbox: "Inbox",
  analytics: "Analyse",
  costs: "Kosten",
  settings: "Instellingen",
  ask: "Vraag Insyte"
}

const pageOf = (context: AskContext | undefined) => {
  const first = context?.route?.split("/")[1] ?? ""
  return PAGES[first] ?? null
}

/** The words of an answer part as tokens: a word and the space after it each their own, as the thread streams them. */
const words = (text: string): Array<Token> => text.split(/(\s+)/).filter((w) => w !== "").map((t) => ({ t }))

const plainOf = (tokens: ReadonlyArray<Token>) =>
  tokens.map((t) => ("t" in t ? t.t : "ref" in t ? t.ref : t.figure)).join("")

const MONEY_OR_PERCENT = /[€%]|\beuro\b|\bprocent\b/i

/** What is wrong with an answer, part by part; none is a clean answer. */
export const faultsOf = (
  parts: ReadonlyArray<AnswerPart>,
  given: string,
  figures: ReadonlyMap<string, unknown>,
  records: ReadonlyMap<string, unknown>
): Array<{ readonly index: number; readonly why: string }> =>
  parts.flatMap((part, index) => {
    if (part.kind === "figure") return figures.has(part.value) ? [] : [{ index, why: `onbekende figuur ${part.value}` }]
    if (part.kind === "record") return records.has(part.value) ? [] : [{ index, why: `onbekend record ${part.value}` }]
    const untraced = untracedFigures(part.value, given)
    if (untraced.length > 0) return [{ index, why: `getallen die niet uit een tool komen: ${untraced.join(", ")}` }]
    if (MONEY_OR_PERCENT.test(part.value)) return [{ index, why: "een bedrag of percentage hoort in een figuur" }]
    return []
  })

interface Found {
  readonly results: Array<StepResult>
  readonly figures: Map<string, ToolFigure>
  readonly records: Map<string, ToolRecord>
  readonly recordIds: Map<string, string>
  readonly sources: Array<Source>
  readonly chips: Array<ToolChip>
  readonly storeIds: Set<string>
  /** The tool output the model read that is not a figure: what a digit in the words may come from. */
  traced: Array<string>
}

const renderResult = (found: Found, figureIds: ReadonlyArray<string>, recordIds: ReadonlyArray<string>, s: string) =>
  [
    s,
    ...figureIds.map((id) => {
      const f = found.figures.get(id)!
      return `${id}: ${f.label} = ${f.display}`
    }),
    ...recordIds.map((id) => {
      const r = found.records.get(id)!
      return `${id} (${r.kind} ${r.label}): ${r.facts}`
    })
  ].join("\n")

const parseInput = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** The answer's frames, as the turn happens. */
export const answer = <R>(
  begun: Begun,
  ask: { readonly text: string; readonly context: AskContext | undefined },
  tools: ReadonlyArray<AskTool<R>>
) =>
  Stream.callback<AskFrame, never, R | Db | CurrentPrincipal | StepR>((queue) =>
    run(begun, ask, tools, (frame) => Queue.offer(queue, frame).pipe(Effect.asVoid)).pipe(
      Effect.andThen(Queue.end(queue))
    )
  )

/** What a model step needs: the model and its settings. */
type StepR = AiModel | LanguageModel.LanguageModel

const run = <R>(
  begun: Begun,
  ask: { readonly text: string; readonly context: AskContext | undefined },
  tools: ReadonlyArray<AskTool<R>>,
  emit: (frame: AskFrame) => Effect.Effect<void>
) =>
  Effect.gen(function*() {
    const db = yield* Db
    const principal = yield* CurrentPrincipal
    const started = Date.now()
    const thinking: Array<string> = []
    const modelCalls: Array<string> = []
    const found: Found = {
      results: [],
      figures: new Map(),
      records: new Map(),
      recordIds: new Map(),
      sources: [],
      chips: [],
      storeIds: new Set(),
      traced: []
    }
    let settled = false

    const think = (step: string) => {
      const line = step.trim().slice(0, 120)
      if (line === "" || thinking.at(-1) === line || thinking.length >= 12) return Effect.void
      thinking.push(line)
      return emit({ _tag: "thinking", step: line, at: Date.now() })
    }

    const keep = (
      s: Omit<Settled, "thinking" | "thinkingMs" | "storeIds" | "refs" | "modelCallIds" | "promptVersion">
    ) =>
      Effect.gen(function*() {
        const turn = yield* db.scoped((sql) =>
          Threads.settle(sql, begun.turnId, {
            ...s,
            thinking,
            thinkingMs: Date.now() - started,
            storeIds: [...found.storeIds],
            refs: [...found.records.values()].map((r) => r.id),
            promptVersion: ASK_PROMPT_VERSION,
            modelCallIds: modelCalls
          })
        )
        settled = true
        yield* emit({ _tag: "settled", turn })
      })

    const fail = (failure: TurnFailure) =>
      keep({
        state: "failed",
        text: "",
        tokens: [],
        tools: found.chips,
        sources: found.sources,
        followUps: [],
        failure
      })

    const caller = {
      memberId: principal.kind === "member" ? principal.id : null,
      principalKind: principal.kind,
      subject: { type: "ask_turn", id: begun.turnId }
    }
    const toolList = tools.map((t) => ({ name: t.name, description: t.description }))

    const runCall = (call: { readonly tool: string; readonly input: string }) =>
      Effect.gen(function*() {
        const tool = tools.find((t) => t.name === call.tool)
        if (tool === undefined) {
          found.results.push({ tool: call.tool, text: "Deze tool bestaat niet." })
          return
        }
        yield* think(tool.step)
        const result = yield* tool.run(parseInput(call.input), { storeId: ask.context?.storeId })
        const figureIds = result.figures.map((f) => {
          const id = `f${found.figures.size + 1}`
          found.figures.set(id, f)
          return id
        })
        const recordIds = result.records.map((r) => {
          const key = `${r.kind}:${r.id}`
          const known = found.recordIds.get(key)
          if (known !== undefined) return known
          const id = `r${found.records.size + 1}`
          found.records.set(id, r)
          found.recordIds.set(key, id)
          return id
        })
        for (const s of result.storeIds) found.storeIds.add(s)
        for (const r of result.records) if (r.storeId !== null) found.storeIds.add(r.storeId)
        found.traced.push(result.summary, ...result.records.map((r) => `${r.label} ${r.facts}`))
        found.chips.push(result.chip)
        yield* emit({ _tag: "tool", tool: result.chip })
        for (const source of result.sources) {
          if (found.sources.some((s) => s.kind === source.kind && s.to === source.to)) continue
          found.sources.push(source)
          yield* emit({ _tag: "source", source })
        }
        found.results.push({ tool: tool.name, text: renderResult(found, figureIds, recordIds, result.summary) })
      })

    const stepWith = (final: boolean, correction: string | null) => {
      const input: StepInput = {
        today: new Date().toISOString().slice(0, 10),
        page: pageOf(ask.context),
        question: ask.text,
        history: begun.history,
        tools: final ? [] : toolList,
        results: found.results,
        figures: [...found.figures].map(([id, f]) => ({ id, label: f.label, display: f.display })),
        records: [...found.records].map(([id, r]) => ({ id, kind: r.kind, label: r.label })),
        final,
        correction
      }
      return askStep<CurrentPrincipal>(db.scoped, caller, input).pipe(
        Effect.tap((called) => Effect.sync(() => modelCalls.push(called.callId))),
        Effect.map((called): AskStep => called.value)
      )
    }

    const loop = Effect.gen(function*() {
      yield* emit({
        _tag: "started",
        threadId: begun.threadId,
        title: begun.title,
        question: begun.question,
        turnId: begun.turnId
      })
      let steps = 0
      let toolRuns = 0
      let limited = false
      let correction: string | null = null
      let parts: ReadonlyArray<AnswerPart> | null = null
      let followUps: ReadonlyArray<string> = []
      while (steps < MAX_STEPS) {
        // Out of room: the model answers with what it has, and the answer says it was cut short.
        const out = steps >= MAX_STEPS - 1 || toolRuns >= MAX_TOOLS || Date.now() - started > DEADLINE_MS
        if (out && correction === null) limited = true
        const step = yield* stepWith(out || correction !== null, correction)
        steps++
        yield* think(step.thought)
        if (step.answer !== null) {
          const given = [ask.text, ...begun.history.flatMap((h) => [h.question, h.answer]), ...found.traced].join("\n")
          const faults = faultsOf(step.answer.parts, given, found.figures, found.records)
          if (faults.length > 0 && correction === null && steps < MAX_STEPS) {
            correction = faults.map((f) => f.why).join("; ")
            continue
          }
          if (faults.length > 0) {
            // Asked once more and still wrong: what fails is left out.
            yield* Effect.logWarning("an Ask answer failed the figure check twice", { faults: faults.length })
          }
          const dropped = new Set(faults.map((f) => f.index))
          parts = step.answer.parts.filter((_, i) => !dropped.has(i))
          followUps = step.answer.followUps
          break
        }
        // Tools asked for when it was told to answer: not run; the next step asks again.
        if (out || correction !== null) continue
        const room = MAX_TOOLS - toolRuns
        if (step.calls.length > room) limited = true
        const calls = step.calls.slice(0, room)
        for (const call of calls) yield* runCall(call)
        toolRuns += calls.length
      }

      const tokens: Array<Token> = []
      for (const part of parts ?? []) {
        if (part.kind === "text") tokens.push(...words(part.value))
        else if (part.kind === "figure") {
          const f = found.figures.get(part.value)
          if (f !== undefined) tokens.push({ figure: f.display, label: f.label, to: f.to, explain: f.explain })
        } else {
          const r = found.records.get(part.value)
          if (r !== undefined) tokens.push({ ref: r.label, to: r.to, kind: r.kind })
        }
      }
      if (tokens.length === 0) {
        tokens.push(...words("Ik kon deze vraag niet beantwoorden met wat ik kon lezen."))
        limited = limited || parts === null
      }
      for (let i = 0; i < tokens.length; i += 6) yield* emit({ _tag: "text", tokens: tokens.slice(i, i + 6) })
      yield* keep({
        state: "settled",
        text: plainOf(tokens),
        tokens,
        tools: found.chips,
        sources: found.sources,
        followUps: followUps.map((f) => f.trim().slice(0, 200)).filter((f) => f !== "").slice(0, 3),
        failure: limited ? "limit" : null
      })
    })

    yield* loop.pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt
        const failure = Cause.findErrorOption(cause)
        const why: TurnFailure = Option.match(failure, {
          onNone: () => "model",
          onSome: (e) => (e instanceof BudgetExceeded ? "budget" : e instanceof AiRateLimited ? "rate" : "model")
        })
        const tag = Option.match(failure, {
          onNone: () => "defect",
          onSome: (e) => (typeof e === "object" && e !== null && "_tag" in e ? String(e._tag) : "error")
        })
        // The reason only: an error's text can carry what the tools read.
        return Effect.logWarning("an Ask answer failed", { why, tag }).pipe(
          Effect.andThen(settled ? Effect.void : fail(why))
        )
      }),
      Effect.onInterrupt(
        () => (settled ? Effect.void : Effect.ignore(fail("interrupted")).pipe(Effect.uninterruptible))
      )
    )
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.logError("an Ask answer could not be kept")
    )
  )
