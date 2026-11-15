import { FAKE_EMBEDDER } from "@insyte/modules/knowledge/domain/Chunks"
import { DIMENSIONS, Embedder, type EmbedderApi, EmbeddingFailed } from "@insyte/modules/knowledge/domain/Knowledge"
import { env } from "cloudflare:workers"
import { Config, Effect } from "effect"

/*
 * The knowledge base's embedder (M15 step 7; ai.md §11), chosen per call by configuration, like the model
 * (`AiSettings.ts`):
 *
 * - `EMBEDDINGS_ADAPTER=fake` (the worker tests, local runs and previews): a deterministic vector of the text's words,
 *   free, sent nowhere.
 * - `workers_ai` (staging and production, `infra/app.ts`): `@cf/baai/bge-m3` through the `AI` binding, through the
 *   stage's AI Gateway where it has one (payload logging off there). No key: the binding is the account's.
 * - Otherwise none: no vector is made, and the knowledge base is found by its words (Postgres' full-text search).
 *
 * Nothing here loads a model or an SDK: the binding is a handle, and a call is a request.
 */

const MODEL = "@cf/baai/bge-m3"

/** `bge-m3` on Workers AI: $0.012 per million input tokens (Workers AI pricing, 2026-11). */
const PRICE_PER_MILLION = 0.012

/** Below this cosine `bge-m3` is talking about something else (its scale sits high: unrelated Dutch ≈ 0.35). */
const MIN_SCORE = 0.45

const EmbeddingSettings = Config.all({
  adapter: Config.String("EMBEDDINGS_ADAPTER").pipe(Config.withDefault("")),
  gatewayId: Config.String("AI_GATEWAY_ID").pipe(Config.withDefault(""))
})

const workersAi = (ai: Ai, gatewayId: string): EmbedderApi => ({
  provider: "workers_ai",
  model: MODEL,
  minScore: MIN_SCORE,
  pricePerMillion: PRICE_PER_MILLION,
  embed: (texts) =>
    Effect.tryPromise({
      try: () =>
        ai.run(
          MODEL,
          { text: [...texts], truncate_inputs: true },
          gatewayId === "" ? {} : { gateway: { id: gatewayId, collectLog: false } }
        ),
      catch: (cause) => new EmbeddingFailed({ reason: cause instanceof Error ? cause.message : "unknown" })
    }).pipe(
      Effect.flatMap((out) => {
        const data = "data" in out ? out.data : undefined
        return data !== undefined && data.length === texts.length && data.every((v) => v.length === DIMENSIONS)
          ? Effect.succeed(data)
          : Effect.fail(new EmbeddingFailed({ reason: "unexpected shape" }))
      })
    )
})

/** This stage's embedder, or none. */
export const embedder: Effect.Effect<EmbedderApi | null> = Effect.gen(function*() {
  const c = yield* EmbeddingSettings
  if (c.adapter === "fake") return FAKE_EMBEDDER
  if (c.adapter === "workers_ai" && env.AI !== undefined) return workersAi(env.AI, c.gatewayId)
  return null
}).pipe(
  Effect.catchCause((cause) =>
    Effect.logWarning("the embedder's settings did not read; the knowledge base is searched by its words", { cause })
      .pipe(Effect.as(null))
  )
)

/** `effect` with this stage's embedder. */
export const withEmbedder = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(embedder, (e) => Effect.provideService(effect, Embedder, e))
