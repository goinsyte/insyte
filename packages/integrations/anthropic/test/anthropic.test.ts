import { replyPrompt } from "@insyte/modules/ai/prompts/reply"
import { topicPrompt } from "@insyte/modules/ai/prompts/topic"
import { billed, generate, meter, worstCase } from "@insyte/modules/ai/use-cases/call"
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
      max_tokens: 16_000,
      output_config: { effort: "low", format: { type: "json_schema" } }
    })
    expect(request!.body["system"]).toContain("classify")
  })

  it("reads a refusal as the model declining, and keeps what it billed", async () => {
    vi.stubGlobal("fetch", async () => answer({ stop_reason: "refusal", content: [] }))
    const seen = meter()
    const { exit } = await run(generate(topicPrompt, input, seen), makeAnthropic(config))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain("ContentPolicyError")
    expect(seen.usage).toEqual({ input: 120, output: 30, cacheRead: 10, cacheWrite: 0 })
  })

  it("keeps the usage of an answer that does not decode, or is cut off at the limit", async () => {
    vi.stubGlobal("fetch", async () =>
      answer({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "{\"topic\": \"where_is" }],
        usage: { input_tokens: 900, output_tokens: 16_000 }
      }))
    const seen = meter()
    const { exit } = await run(generate(topicPrompt, input, seen), makeAnthropic(config))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(seen).toMatchObject({ sent: true, rejected: false })
    expect(billed(seen, exit, worstCase(topicPrompt, ""))).toEqual({
      input: 900,
      output: 16_000,
      cacheRead: 0,
      cacheWrite: 0
    })
  })

  it("bills nothing for a request the provider turned away", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), {
          status: 529,
          headers: { "content-type": "application/json" }
        })
    )
    const seen = meter()
    const { exit } = await run(generate(topicPrompt, input, seen), makeAnthropic(config))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(seen).toMatchObject({ sent: true, rejected: true, usage: undefined })
    expect(billed(seen, exit, worstCase(topicPrompt, "")).output).toBe(0)
  })

  it("bills the worst case when the request went out and no answer came back", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network connection lost")
    })
    const seen = meter()
    const { exit } = await run(generate(topicPrompt, input, seen), makeAnthropic(config))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(seen).toMatchObject({ sent: true, rejected: false, usage: undefined })
    const worst = worstCase(topicPrompt, topicPrompt.render(input))
    expect(billed(seen, exit, worst)).toEqual(worst)
    expect(worst.output).toBe(16_000)
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
        rewrite: null
      }),
      makeFake
    )
    expect(Exit.isSuccess(exit) && exit.value.value.text).toMatch(/^Hoi Sanne,/)
    expect(Exit.isSuccess(exit) && exit.value.usage.outputTokens.total).toBe(0)
  })
})
