import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { type CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import type { TestInput } from "@insyte/modules/channel-agent/domain/ChannelAgent"
import { type Brain, onChat } from "@insyte/modules/channel-agent/use-cases/engine"
import { test as testChat } from "@insyte/modules/channel-agent/use-cases/test"
import { search } from "@insyte/modules/knowledge/Knowledge"
import { Effect } from "effect"
import { withAi } from "./Ai.ts"
import { LocalChat } from "./chat/LocalChat.ts"
import { withEmbedder } from "./Embeddings.ts"

/*
 * The customer agent's platform side (M15 step 8): what it thinks with (the stage's knowledge-base search and model,
 * loaded on first use as every AI call is, `Ai.ts`) and the chat it answers on. Loaded by the agent sink's queue
 * consumer for a `chat.received` task (`AgentSink.ts`) and by the test chat's RPC, never when a Worker starts.
 *
 * The chat is `LocalChat` until the website chat's own `ChatChannel` lands (W12.1), which replaces it here.
 */

const brain: Brain = {
  search: (query) =>
    Effect.flatMap(
      Effect.service(Db),
      (db) => withEmbedder(search(db.scoped, { query, audience: "customer_agent", limit: 3 }))
    ).pipe(
      Effect.map((r) => r.hits),
      // A search that failed finds nothing: the question goes to a person.
      Effect.catchCause((cause) =>
        Effect.as(Effect.logWarning("the customer agent's search did not answer", { cause }), [])
      )
    ),
  answer: (input, caller) =>
    withAi((ai) =>
      Effect.flatMap(Effect.service(Db), (db) => ai.customerAgentStep<CurrentPrincipal>(db.scoped, caller, input)).pipe(
        Effect.map((called) => ({
          value: called.value,
          callId: called.callId,
          model: { name: called.model.model || called.model.provider, promptVersion: ai.CUSTOMER_AGENT_PROMPT_VERSION }
        }))
      )
    ).pipe(Effect.catchTag("SqlError", Effect.die))
}

type ChatTrigger = Extract<AgentTask["trigger"], { kind: "chat.received" }>

/** A shopper's message, as the workspace's agent: what became of it, never its words. */
export const answerChat = (task: AgentTask, t: ChatTrigger) =>
  onChat(brain, { eventId: task.eventId, storeId: t.storeId, threadId: t.threadId, messageId: t.messageId }).pipe(
    Effect.tap((turn) => Effect.logInfo("customer agent", { turn })),
    // The thread gone from the chat meanwhile (deleted, out of the agent's stores): nothing to answer.
    Effect.catchTag("NotFound", () => Effect.logWarning("the customer agent's chat was gone")),
    Effect.provide(LocalChat),
    Effect.provideService(CurrentWorkspace, { id: task.workspaceId as WorkspaceId })
  )

/** "Proberen": one message through the agent's thinking, as the person on the page. */
export const tryChat = (input: TestInput) =>
  Effect.flatMap(Effect.service(Db), (db) => testChat(brain, db.scoped, input))
