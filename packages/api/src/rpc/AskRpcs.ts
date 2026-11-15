import { NotFound } from "@insyte/domain/Errors"
import { AiRateLimited, ModelUnavailable } from "@insyte/modules/ai/domain/Ai"
import {
  AskBusy,
  AskFrame,
  AskRemoved,
  AskThread,
  AskThreadList,
  ListInput,
  RetryInput,
  SendInput,
  ThreadIdInput
} from "@insyte/modules/ask/domain/Ask"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Vraag Insyte (M15 step 3; api.md §2.12): the person's own conversations, listed, read and set aside with Undo, and a
 * question asked, whose answer streams as frames (`AskFrame`) while the loop runs. The answer is read-only: nothing the
 * model says acts. A spent budget settles the turn as failed (`failure: "budget"`), as a model that did not answer does;
 * too many questions a minute and a stage without a model are errors before anything is kept.
 */
export class AskRpcs extends RpcGroup.make(
  Rpc.make("Ask.list", { payload: ListInput, success: AskThreadList }),
  Rpc.make("Ask.get", { payload: ThreadIdInput, success: AskThread, error: NotFound }),
  Rpc.make("Ask.send", {
    payload: SendInput,
    success: AskFrame,
    error: Schema.Union([NotFound, AskBusy, AiRateLimited, ModelUnavailable]),
    stream: true
  }),
  Rpc.make("Ask.retry", {
    payload: RetryInput,
    success: AskFrame,
    error: Schema.Union([NotFound, AskBusy, AiRateLimited, ModelUnavailable]),
    stream: true
  }),
  Rpc.make("Ask.remove", { payload: ThreadIdInput, success: AskRemoved, error: NotFound })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
