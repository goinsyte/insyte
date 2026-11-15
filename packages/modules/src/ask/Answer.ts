import { Db } from "@insyte/database/Db"
import type { NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Stream } from "effect"
import type { LanguageModel } from "effect/ai"
import { SqlError } from "effect/sql"
import type { AiModel } from "../ai/domain/Ai.ts"
import type { AskBusy, AskFrame, SendInput } from "./domain/Ask.ts"
import type { AskToolSet } from "./domain/Tools.ts"
import { answer } from "./use-cases/answer.ts"
import * as Threads from "./use-cases/threads.ts"

/*
 * Vraag Insyte asking (M15 step 3; ai.md §4): the question kept, then the answer's frames as the loop runs. This file
 * imports the model's side (`effect/ai`, the prompt), so the API Worker loads it per call, with the model, never at
 * startup. The tools are the app's to compose: each slice's read-only views, run as the person asking.
 */

type R = Db | CurrentPrincipal | AiModel | LanguageModel.LanguageModel

/** A question on a conversation of the person's own, or a new one; the frames of its answer. */
export const send = <T>(
  input: SendInput,
  tools: AskToolSet<T>
): Stream.Stream<AskFrame, NotFound | AskBusy, R | T> =>
  Stream.unwrap(
    Effect.gen(function*() {
      const db = yield* Db
      const begun = yield* db.scoped((sql) =>
        Threads.begin(sql, { threadId: input.threadId, text: input.text, context: input.context })
      ).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      return answer(begun, { text: input.text, context: input.context }, tools)
    })
  )

/** "Opnieuw vragen": an answer's question asked again on its conversation, as a new turn. */
export const retry = <T>(turnId: string, tools: AskToolSet<T>): Stream.Stream<AskFrame, NotFound | AskBusy, R | T> =>
  Stream.unwrap(
    Effect.gen(function*() {
      const db = yield* Db
      const asked = yield* db.scoped((sql) => Threads.questionOf(sql, turnId)).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      )
      const begun = yield* db.scoped((sql) =>
        Threads.begin(sql, { threadId: asked.threadId, text: asked.text, context: asked.context, retryOf: turnId })
      ).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      return answer(begun, { text: asked.text, context: asked.context }, tools)
    })
  )
