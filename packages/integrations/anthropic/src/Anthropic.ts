import { CallSettings, type ModelInfo } from "@insyte/modules/ai/domain/Ai"
import { Effect, Redacted, Stream } from "effect"
import { AiError, AnthropicStructuredOutput, LanguageModel, type Prompt, type Response } from "effect/ai"

/*
 * Claude behind `effect/ai`'s `LanguageModel` (M15 step 1; ADR-0015, ai.md §3), through Cloudflare AI Gateway: the
 * official SDK with the gateway as its base URL, so the gateway sees every call (cost, latency, errors) and never stores
 * what was said (`cf-aig-collect-log-payload: false`) or answers from its cache (`cf-aig-skip-cache`). One model for
 * every Insyte prompt; the effort and the length are each prompt's own (`CallSettings`). Structured output is Anthropic's
 * JSON-schema format, from the prompt's own schema.
 *
 * The SDK is imported on the first call, not when the Worker starts: no request that does not draft pays for it.
 */

export interface GatewayConfig {
  readonly accountId: string
  readonly gatewayId: string
  readonly apiKey: Redacted.Redacted<string>
  /** The gateway's own token, where it is an authenticated one. */
  readonly gatewayToken: Redacted.Redacted<string> | undefined
}

export const MODEL = "claude-opus-5-5"

/** Claude Opus 5.5, in dollars per million tokens. */
export const MODEL_INFO: ModelInfo = {
  provider: "anthropic",
  model: MODEL,
  price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  ready: true
}

const failed = (method: string, reason: AiError.AiErrorReason) => AiError.make({ module: "Anthropic", method, reason })

/** The HTTP status of an SDK error, when it is one the provider answered with. */
const statusOf = (error: unknown): number | undefined => {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : NaN
  return Number.isFinite(status) ? status : undefined
}

const errorOf = (error: unknown): AiError.AiError => {
  const status = statusOf(error)
  const description = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
  if (status !== undefined) return failed("generateText", AiError.reasonFromHttpStatus({ status, description }))
  return failed("generateText", new AiError.UnknownError({ description }))
}

/** The prompt's system text, and its turns as Anthropic's messages (text only: Insyte's prompts have nothing else). */
const messagesOf = (prompt: Prompt.Prompt) => {
  const system: Array<string> = []
  const messages: Array<{ role: "user" | "assistant"; content: string }> = []
  for (const m of prompt.content) {
    if (m.role === "system") system.push(m.content)
    else if (m.role === "user" || m.role === "assistant") {
      const text = m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n")
      if (text !== "") messages.push({ role: m.role, content: text })
    }
  }
  return { system: system.join("\n\n"), messages }
}

const FINISH: Record<string, typeof Response.FinishReason.Encoded> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  model_context_window_exceeded: "length",
  tool_use: "tool-calls",
  pause_turn: "pause",
  refusal: "content-filter"
}

const unsupported = (method: string) =>
  Stream.fail(failed(method, new AiError.UnknownError({ description: "Insyte does not stream model calls yet" })))

/** The Anthropic adapter: Claude through the account's AI Gateway. */
export const makeAnthropic = (config: GatewayConfig) => {
  const client = Effect.cached(Effect.promise(async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    return new Anthropic({
      apiKey: Redacted.value(config.apiKey),
      baseURL: `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/anthropic`,
      // The gateway retries; the SDK's own retries on top would multiply a provider's outage.
      maxRetries: 0,
      defaultHeaders: {
        "cf-aig-collect-log-payload": "false",
        "cf-aig-skip-cache": "true",
        ...(config.gatewayToken === undefined
          ? {}
          : { "cf-aig-authorization": `Bearer ${Redacted.value(config.gatewayToken)}` })
      }
    })
  }))
  return Effect.flatMap(client, (sdk) =>
    LanguageModel.make({
      codecTransformer: AnthropicStructuredOutput.toCodecAnthropic,
      generateText: (options) =>
        Effect.gen(function*() {
          const anthropic = yield* sdk
          const settings = yield* CallSettings
          const { system, messages } = messagesOf(options.prompt)
          const format = options.responseFormat.type === "json"
            ? {
              type: "json_schema" as const,
              schema: AnthropicStructuredOutput.toCodecAnthropic(options.responseFormat.schema as never)
                .jsonSchema as Record<string, unknown>
            }
            : null
          const seen = settings.meter
          if (seen !== undefined) seen.sent = true
          const response = yield* Effect.tryPromise({
            try: (signal) =>
              anthropic.messages.create({
                model: MODEL,
                max_tokens: settings.maxTokens,
                ...(system === "" ? {} : { system }),
                messages,
                // Thinking is always on for this model; how hard it thinks is the effort.
                output_config: { effort: settings.effort, format }
              }, {
                signal,
                headers: { "cf-aig-metadata": JSON.stringify({ prompt: settings.promptId }) }
              }),
            catch: (error) => {
              // An HTTP error is the provider (or the gateway) turning the request away: nothing ran, nothing billed.
              if (seen !== undefined && statusOf(error) !== undefined) seen.rejected = true
              return errorOf(error)
            }
          })
          const u = response.usage
          const cacheRead = u.cache_read_input_tokens ?? 0
          const cacheWrite = u.cache_creation_input_tokens ?? 0
          // Billed whatever comes next: a refusal, an answer cut off at the limit, one that does not decode.
          if (seen !== undefined) {
            seen.usage = { input: u.input_tokens, output: u.output_tokens, cacheRead, cacheWrite }
          }
          if (response.stop_reason === "refusal") {
            return yield* failed(
              "generateText",
              new AiError.ContentPolicyError({ description: "The model declined to answer" })
            )
          }
          const parts: Array<Response.PartEncoded> = response.content.flatMap((b) =>
            b.type === "text" ? [{ type: "text" as const, text: b.text }] : []
          )
          parts.push({
            type: "finish",
            reason: FINISH[response.stop_reason ?? ""] ?? "unknown",
            usage: {
              inputTokens: {
                uncached: u.input_tokens,
                total: u.input_tokens + cacheRead + cacheWrite,
                cacheRead,
                cacheWrite
              },
              outputTokens: { total: u.output_tokens }
            }
          })
          return parts
        }),
      streamText: () => unsupported("streamText")
    }))
}

/** What the fake costs: nothing. Ready only where it is asked for by name (`AI_ADAPTER=fake`). */
export const FAKE_INFO: ModelInfo = {
  provider: "fake",
  model: "fake",
  price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  ready: true
}

/** A deployed stage without its keys: no model, so Insyte writes nothing there (and the fake is never shown). */
export const NO_MODEL: ModelInfo = { ...FAKE_INFO, model: "none", ready: false }

/**
 * The fake (tests, local runs, previews, any stage without the keys): each prompt's own deterministic answer
 * (`CallSettings.fake`), as the model would return it. Nothing leaves the Worker, and nothing costs anything.
 */
export const makeFake = LanguageModel.make({
  generateText: () =>
    Effect.gen(function*() {
      const settings = yield* CallSettings
      if (settings.fake === undefined) {
        return yield* failed("generateText", new AiError.UnknownError({ description: "no fake answer for this call" }))
      }
      const answer = settings.fake()
      return [
        { type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) },
        {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0 } }
        }
      ] satisfies Array<Response.PartEncoded>
    }),
  streamText: () => unsupported("streamText")
})
