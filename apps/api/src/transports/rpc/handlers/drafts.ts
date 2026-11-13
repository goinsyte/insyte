import { DraftsRpcs } from "@insyte/api/rpc/DraftsRpcs"
import { DraftsService } from "@insyte/modules/ai/Ai"
import { Effect, Layer } from "effect"
import { AiChoice } from "../../../platform/AiLive.ts"

const DraftsHandlers = DraftsRpcs.toLayer(Effect.gen(function*() {
  const drafts = yield* DraftsService
  return DraftsRpcs.of({
    "Drafts.reply": (input) => drafts.reply(input),
    "Drafts.use": ({ id }) => drafts.use(id),
    "Drafts.forSubject": ({ subject }) => drafts.forSubject(subject),
    "Drafts.summarizeTicket": ({ ticketId }) => drafts.summarizeTicket(ticketId),
    "Drafts.summarizeThread": ({ threadId }) => drafts.summarizeThread(threadId),
    "Drafts.knowledgeAnswer": () => drafts.knowledgeAnswer
  })
}))

/** The handlers over the service and the stage's model; `RpcRoutes.ts` imports this module when its layer is built. */
export const DraftsLive = DraftsHandlers.pipe(Layer.provide(DraftsService.layer), Layer.provide(AiChoice))
