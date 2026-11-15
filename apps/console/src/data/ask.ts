import type { AskFrame, SendInput } from "@insyte/modules/ask/domain/Ask"
import { Effect, Stream } from "effect"
import { Atom, Reactivity } from "effect/reactivity"
import { ConsoleClient } from "./client.ts"

/*
 * Vraag Insyte (M15 step 3): the viewer's own conversations, one conversation with its turns, setting one aside with
 * Undo, and a question whose answer streams as frames (`Ask.send`, `Ask.retry`). Every write names `ASK`.
 */

export const ASK = ["ask"] as const

export const askListAtom = ConsoleClient.query("Ask.list", {}, { reactivityKeys: ASK })

export const askThreadAtom = Atom.family((id: string) =>
  ConsoleClient.query("Ask.get", { id }, { reactivityKeys: ASK })
)

export const askWrites = {
  remove: ConsoleClient.mutation("Ask.remove"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

/** A question asked (`send`) or asked again (`retry`): each frame of its answer handed to `onFrame` as it comes. */
export type AskCall =
  & ({ readonly kind: "send"; readonly payload: SendInput } | { readonly kind: "retry"; readonly turnId: string })
  & { readonly onFrame: (frame: AskFrame) => void }

export const askStream = ConsoleClient.runtime.fn((call: AskCall) =>
  Effect.gen(function*() {
    const client = yield* ConsoleClient
    const frames = call.kind === "send" ?
      client("Ask.send", call.payload) :
      client("Ask.retry", { turnId: call.turnId })
    yield* Stream.runForEach(frames, (frame) => Effect.sync(() => call.onFrame(frame)))
  }).pipe(Effect.ensuring(Reactivity.invalidate(ASK)))
)
