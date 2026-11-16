import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ScopeMissingV1 } from "../Errors.ts"

/* Klantagent: how the customer agent answers shoppers, and its day. Read only: its settings change in the console. */

const Mode = Schema.Literals(["auto", "drafts", "off"]).annotate({
  description:
    "`auto` answers by itself (the website chat only), `drafts` writes a draft for the team, `off` stays out."
})

const Channels = Schema.Struct({ webchat: Mode, whatsapp: Mode, instagram: Mode, email: Mode })

const Day = Schema.Struct({
  open: Schema.Boolean,
  from: Schema.String.annotate({ description: "`HH:mm`, the workspace's time zone." }),
  to: Schema.String.annotate({ description: "`HH:mm`; `24:00` is the end of the day." })
})

export const CustomerAgentV1 = Schema.Struct({
  on: Schema.Boolean,
  channels: Channels.annotate({ description: "Each channel's mode as set." }),
  effective: Channels.annotate({
    description:
      "Each channel's mode as it works now: never more than the autonomy rule for answering customers (`send_reply`) allows."
  }),
  send_reply: Schema.Literals(["auto", "ask", "never"]).annotate({
    description: "The autonomy rule for answering customers (`SendReply`), which every channel's mode narrows."
  }),
  hours: Schema.Array(Day).annotate({ description: "Seven days, Monday first." }),
  timezone: Schema.String,
  outside_hours: Schema.Literals(["answer", "take"]).annotate({
    description: "Outside the hours: answer from the knowledge base, or take the question and hand it to the team."
  }),
  handover: Schema.Struct({
    unsure: Schema.Boolean,
    asks_person: Schema.Boolean,
    topics: Schema.Array(Schema.String),
    after_messages: Schema.NullOr(Schema.Int)
  }),
  tone: Schema.Literals(["brand", "short", "formal"]),
  handover_message: Schema.String,
  version: Schema.Int.annotate({ description: "Saves so far; 0 is the default, never saved." })
}).annotate({ identifier: "CustomerAgent" })

export const CustomerAgentDayV1 = Schema.Struct({
  conversations: Schema.Int.annotate({ description: "Website chats the agent heard today, in the key's stores." }),
  handled: Schema.Int.annotate({ description: "Of those, answered by the agent and not handed over." }),
  handed_over: Schema.Int,
  waiting: Schema.Int.annotate({ description: "Handed over and not taken by a person yet, as far as the agent saw." }),
  first_reply_seconds: Schema.Int.annotate({ description: "The agent's first reply, on average." })
}).annotate({ identifier: "CustomerAgentDay" })

export class CustomerAgentGroup extends HttpApiGroup.make("customer_agent")
  .add(
    HttpApiEndpoint.get("get", "/customer_agent", {
      success: CustomerAgentV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Klantagent: whether the customer agent is on, each channel's mode as set and as it works now, its hours, when it hands over and its tone. Changed in the console only. Needs `support.read`."
    ),
    HttpApiEndpoint.get("today", "/customer_agent/today", {
      success: CustomerAgentDayV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The customer agent's day so far, in the workspace's time zone, within the key's stores. Needs `support.read`."
    )
  )
  .annotate(OpenApi.Title, "Customer agent")
{}
