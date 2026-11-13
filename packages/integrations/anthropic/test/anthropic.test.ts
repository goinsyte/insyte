import { replyPrompt } from "@insyte/modules/ai/prompts/reply"
import { topicPrompt } from "@insyte/modules/ai/prompts/topic"
import { generate } from "@insyte/modules/ai/use-cases/call"
import { Effect, Exit, Redacted } from "effect"
import { LanguageModel } from "effect/ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeAnthropic, makeFake } from "../src/Anthropic.ts"

/*
 * The adapter (M15 step 1) against a stand-in for the gateway: what it sends (the gateway's URL, payload logging off,
 * the prompt's effort and schema) and how it reads the answer (the usage, a refusal). And the fake: each prompt's own
 * answer. No network.
 */

const config = {
  accountId: "acc",
  gatewayId: "insyte-test",
  apiKey: Redacted.make("sk-test"),
  gatewayToken: Redacted.make("gw-test")
}

const input = { title: "Pakket kwijt", description: "Nog niets ontvangen." }

const answer = (body: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify({ topic: "where_is_my_order" }) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 10, cache_creation_input_tokens: 0 },
      ...body
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )

const run = <A, E>(
  effect: Effect.Effect<A, E, LanguageModel.LanguageModel>,
  model: Effect.Effect<LanguageModel.LanguageModel>
) => Effect.runPromise(Effect.flatMap(model, (m) => effect.pipe(Effect.provideService(LanguageModel.LanguageModel, m))))

afterEach(() => vi.unstubAllGlobals())

describe("the Anthropic adapter", () => {
  it("asks through the gateway, without its payload kept, with the prompt's effort and schema", async () => {
    const seen: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = []
    vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) })
      return answer({})
    })
    const { exit } = await run(generate(topicPrompt, input), makeAnthropic(config))
    expect(Exit.isSuccess(exit) && exit.value.value).toEqual({ topic: "where_is_my_order" })
    expect(Exit.isSuccess(exit) && exit.value.usage.inputTokens).toMatchObject({ uncached: 120, cacheRead: 10 })
    const [request] = seen
    expect(request!.url).toBe("https://gateway.ai.cloudflare.com/v1/acc/insyte-test/anthropic/v1/messages")
    expect(request!.headers.get("cf-aig-collect-log-payload")).toBe("false")
    expect(request!.headers.get("cf-aig-authorization")).toBe("Bearer gw-test")
    expect(request!.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 400,
      output_config: { effort: "low", format: { type: "json_schema" } }
    })
    expect(request!.body["system"]).toContain("classify")
  })

  it("reads a refusal as the model declining", async () => {
    vi.stubGlobal("fetch", async () => answer({ stop_reason: "refusal", content: [] }))
    const { exit } = await run(generate(topicPrompt, input), makeAnthropic(config))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain("ContentPolicyError")
  })
})

describe("the fake", () => {
  it("answers each prompt with its own text, for nothing", async () => {
    const { exit } = await run(
      generate(replyPrompt, {
        via: "mail",
        brand: "Noordkust",
        firstName: "Sanne",
        subject: "Waar is mijn pakket?",
        messages: [],
        orders: [],
        note: null,
        rewrite: null
      }),
      makeFake
    )
    expect(Exit.isSuccess(exit) && exit.value.value.text).toMatch(/^Hoi Sanne,/)
    expect(Exit.isSuccess(exit) && exit.value.usage.outputTokens.total).toBe(0)
  })
})
