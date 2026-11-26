import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { InTx } from "../../ai/Ai.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { TestAnswer, type TestInput } from "../domain/ChannelAgent.ts"
import {
  aboutAnOrder,
  ASK_PROOF,
  checkable,
  claimOf,
  handFor,
  handoverText,
  isOpen,
  TEST_HANDOVER_LABEL
} from "../domain/Rules.ts"
import { type Brain, think } from "./engine.ts"
import { sendReplyLevel, timezoneOf } from "./settings.ts"

/*
 * "Proberen" (M15 step 8; widgets/04 the test chat): one message through the agent's own thinking (`think`), on the
 * page's unsaved settings, server-side. Nothing is sent and nothing is filed; the model call counts against the
 * person's own budget, flagged as a test. It reads the knowledge base as the chat of the first store the person
 * reaches would, and looks up no order: a question about one says what a shopper would be asked.
 */

/** In the test chat no order is looked up: the shopper's question is what they would read, and this says why. */
const TEST_ORDER_NOTE = "In de testchat zoekt Insyte geen bestellingen op"

export const test = (brain: Brain, inTx: InTx<CurrentPrincipal>, input: TestInput) =>
  Effect.gen(function*() {
    yield* Policy.require("settings", 1)
    const principal = yield* CurrentPrincipal
    const s = input.settings
    const { level, tz, brand, storeId } = yield* inTx((sql) =>
      Effect.gen(function*() {
        const [store] = yield* sql<{ id: string; name: string }>`
          select id, name from stores where ${yield* inScope(sql, "id")} and status <> 'disconnected'
          order by created_at, id limit 1`
        return {
          level: yield* sendReplyLevel(sql),
          tz: yield* timezoneOf(sql),
          brand: store?.name ?? "",
          storeId: store?.id ?? null
        }
      })
    )
    const now = new Date()
    const open = isOpen(s.hours, tz, now)
    const { hand, mode } = handFor({
      on: true,
      mode: s.channels.webchat === "off" ? "auto" : s.channels.webchat,
      level,
      open,
      outside: s.outside
    })
    const shown = s.on ? (s.channels.webchat === "off" ? "off" : mode) : "off"
    const handover = (reason: string) =>
      new TestAnswer({
        text: handoverText(s, tz, now),
        source: null,
        handover: { reason, label: TEST_HANDOVER_LABEL[reason] ?? TEST_HANDOVER_LABEL["error"]! },
        note: null,
        mode: shown
      })
    if (level === "never") return handover("policy")
    if (hand === "handover") return handover("outside_hours")
    const claim = claimOf(input.text)
    if (checkable(claim) || aboutAnOrder(input.text)) {
      return new TestAnswer({ text: ASK_PROOF, source: null, handover: null, note: TEST_ORDER_NOTE, mode: shown })
    }
    const thought = yield* think(brain, {
      text: input.text,
      // As a shopper on the first store's chat would ask: that store's chapters and every store's.
      storeId,
      before: [],
      settings: s,
      brand,
      order: null,
      caller: {
        memberId: principal.kind === "member" ? principal.id : null,
        principalKind: principal.kind,
        subject: null,
        test: true
      }
    })
    if (thought._tag === "Handover") return handover(thought.reason)
    const hit = thought.hits[0]
    return new TestAnswer({
      text: thought.text,
      source: hit === undefined ? null : { articleId: hit.articleId, title: hit.title, version: hit.version },
      handover: null,
      note: null,
      mode: shown
    })
  })
