import {
  type BulkPage,
  type BulkStatus,
  ShopifyGraphql,
  ShopifyRefused,
  ShopifyThrottled,
  type ThrottleStatus
} from "@insyte/modules/stores/domain/Ports"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * The Admin GraphQL API (M6.3; integrations.md §2): one query (a webhook's object, the reconcile sweep's pages), and
 * bulk operations for the backfill, API 2026-01 and later: up to five
 * per shop at once, each polled by its own id (`bulkOperation(id:)`; `currentBulkOperation` is deprecated). Every
 * answer carries the bucket (`extensions.cost.throttleStatus`) for the gate; a `THROTTLED` answer says how long to
 * wait. The result file is read from a byte offset with a range request, a page of whole lines at a time, so a
 * Workflow step resumes a large file where the last one stopped instead of starting over.
 */

const Throttle = Schema.Struct({
  maximumAvailable: Schema.Finite,
  currentlyAvailable: Schema.Finite,
  restoreRate: Schema.Finite
})

const Answer = Schema.Struct({
  data: Schema.optional(Schema.NullOr(Schema.Unknown)),
  errors: Schema.optional(Schema.Array(Schema.Struct({
    message: Schema.String,
    extensions: Schema.optional(Schema.Struct({
      code: Schema.optional(Schema.String),
      requiredAccess: Schema.optional(Schema.String)
    }))
  }))),
  extensions: Schema.optional(Schema.Struct({
    cost: Schema.optional(
      Schema.Struct({ requestedQueryCost: Schema.optional(Schema.Finite), throttleStatus: Throttle })
    )
  }))
})

const Started = Schema.Struct({
  bulkOperationRunQuery: Schema.Struct({
    bulkOperation: Schema.NullOr(Schema.Struct({ id: Schema.String })),
    userErrors: Schema.Array(Schema.Struct({ message: Schema.String }))
  })
})

const Polled = Schema.Struct({
  bulkOperation: Schema.NullOr(Schema.Struct({
    status: Schema.String,
    errorCode: Schema.NullOr(Schema.String),
    objectCount: Schema.Union([Schema.String, Schema.Finite]),
    url: Schema.NullOr(Schema.String)
  }))
})

const START = `mutation($query: String!) {
  bulkOperationRunQuery(query: $query) { bulkOperation { id } userErrors { message } }
}`
const POLL = `query($id: ID!) { bulkOperation(id: $id) { status errorCode objectCount url } }`

/** "Required access: `write_gift_cards` access scope." → `write_gift_cards`. */
export const scopeIn = (text: string): string | undefined => /\b((?:read|write)_[a-z_]+)\b/.exec(text)?.[1]

const NEWLINE = 0x0a

/** Splits bytes into whole lines, keeping what follows the last newline for the next chunk. */
const takeLines = (buffer: Uint8Array, max: number) => {
  const lines: Array<Uint8Array> = []
  let start = 0
  for (let i = 0; i < buffer.length && lines.length < max; i++) {
    if (buffer[i] === NEWLINE) {
      lines.push(buffer.subarray(start, i))
      start = i + 1
    }
  }
  return { lines, consumed: start }
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** Up to `max` whole lines from the body, after skipping `skip` bytes; `offset` is where the body starts in the file. */
export const readLines = async (
  body: ReadableStream<Uint8Array>,
  skip: number,
  offset: number,
  max: number
): Promise<BulkPage> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const lines: Array<unknown> = []
  let pending: Uint8Array = new Uint8Array(0)
  let consumed = 0
  let toSkip = skip
  let ended = false
  while (lines.length < max) {
    const { value, done } = await reader.read()
    if (done) {
      ended = true
      break
    }
    let chunk = value
    if (toSkip > 0) {
      const dropped = Math.min(toSkip, chunk.length)
      chunk = chunk.subarray(dropped)
      toSkip -= dropped
    }
    pending = concat(pending, chunk)
    const taken = takeLines(pending, max - lines.length)
    for (const line of taken.lines) {
      const text = decoder.decode(line).trim()
      if (text !== "") lines.push(JSON.parse(text))
    }
    consumed += taken.consumed
    pending = pending.subarray(taken.consumed)
  }
  if (!ended) await reader.cancel()
  // The file ends without a newline after its last line: that line is whole too.
  if (ended && pending.length > 0) {
    const text = decoder.decode(pending).trim()
    if (text !== "") lines.push(JSON.parse(text))
    consumed += pending.length
  }
  return { lines, next: offset + consumed, done: ended }
}

const unreadable = (reason: string) => new ShopifyRefused({ status: 0, reason: `bulk file ${reason}` })

export const ShopifyGraphqlLive = Layer.effect(
  ShopifyGraphql,
  Effect.gen(function*() {
    const version = yield* Config.String("SHOPIFY_API_VERSION").pipe(Config.withDefault("2026-10"))
    const http = yield* HttpClient.HttpClient

    const graphql = Effect.fn("Shopify.graphql")(function*(
      shop: string,
      token: Redacted.Redacted<string>,
      query: string,
      variables: Record<string, unknown>
    ) {
      const response = yield* http.execute(
        HttpClientRequest.post(`https://${shop}/admin/api/${version}/graphql.json`).pipe(
          HttpClientRequest.setHeader("x-shopify-access-token", Redacted.value(token)),
          HttpClientRequest.bodyJsonUnsafe({ query, variables })
        )
      ).pipe(
        Effect.timeout("20 seconds"),
        Effect.mapError((error) => new ShopifyRefused({ status: 0, reason: `graphql failed: ${error._tag}` }))
      )
      if (response.status === 429) {
        const seconds = Number(response.headers["retry-after"] ?? "2")
        return yield* new ShopifyThrottled({ retryAfterMs: (Number.isFinite(seconds) ? seconds : 2) * 1000 })
      }
      if (response.status >= 400) {
        return yield* new ShopifyRefused({ status: response.status, reason: `graphql answered ${response.status}` })
      }
      const answer = yield* HttpClientResponse.schemaBodyJson(Answer)(response).pipe(
        Effect.mapError(() => new ShopifyRefused({ status: response.status, reason: "graphql answer unreadable" }))
      )
      const cost = answer.extensions?.cost
      const throttle: ThrottleStatus | null = cost?.throttleStatus ?? null
      if (answer.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
        const needed = (cost?.requestedQueryCost ?? 10) - (throttle?.currentlyAvailable ?? 0)
        const rate = throttle?.restoreRate ?? 50
        return yield* new ShopifyThrottled({ retryAfterMs: Math.max(1000, Math.ceil((needed / rate) * 1000)) })
      }
      // The store's token may not do this: the app's scopes grew since the store approved them.
      const denied = answer.errors?.find((e) => e.extensions?.code === "ACCESS_DENIED")
      if (denied !== undefined) {
        const scope = scopeIn(`${denied.extensions?.requiredAccess ?? ""} ${denied.message}`)
        return yield* new ShopifyRefused({
          status: 403,
          reason: denied.message,
          ...(scope === undefined ? {} : { scope })
        })
      }
      if (answer.errors !== undefined && answer.errors.length > 0) {
        return yield* new ShopifyRefused({ status: 200, reason: answer.errors.map((e) => e.message).join("; ") })
      }
      return { data: answer.data, throttle }
    })

    return ShopifyGraphql.of({
      query: (shop, token, query, variables) => graphql(shop, token, query, variables),
      start: Effect.fn("Shopify.bulk.start")(function*(shop, token, query) {
        const { data, throttle } = yield* graphql(shop, token, START, { query })
        const started = yield* Schema.decodeUnknownEffect(Started)(data).pipe(
          Effect.mapError(() => new ShopifyRefused({ status: 200, reason: "bulk start answer unreadable" }))
        )
        const operation = started.bulkOperationRunQuery.bulkOperation
        if (operation === null) {
          const reason = started.bulkOperationRunQuery.userErrors.map((e) => e.message).join("; ")
          return yield* new ShopifyRefused({ status: 200, reason: reason || "bulk operation refused" })
        }
        return { id: operation.id, throttle }
      }),
      status: Effect.fn("Shopify.bulk.status")(function*(shop, token, id) {
        const { data, throttle } = yield* graphql(shop, token, POLL, { id })
        const polled = yield* Schema.decodeUnknownEffect(Polled)(data).pipe(
          Effect.mapError(() => new ShopifyRefused({ status: 200, reason: "bulk status answer unreadable" }))
        )
        const operation = polled.bulkOperation
        if (operation === null) return yield* new ShopifyRefused({ status: 404, reason: `no bulk operation ${id}` })
        return {
          status: operation.status as BulkStatus["status"],
          errorCode: operation.errorCode,
          objectCount: Number(operation.objectCount),
          url: operation.url,
          throttle
        }
      }),
      read: Effect.fn("Shopify.bulk.read")(function*(url, offset, maxLines) {
        const response = yield* http.execute(
          HttpClientRequest.get(url).pipe(HttpClientRequest.setHeader("range", `bytes=${offset}-`))
        ).pipe(Effect.timeout("60 seconds"), Effect.mapError((error) => unreadable(`unreachable: ${error._tag}`)))
        if (response.status === 416) return { lines: [], next: offset, done: true } satisfies BulkPage
        if (response.status >= 400) return yield* unreadable(`answered ${response.status}`)
        // A server that ignores the range sends the whole file: skip to the offset here.
        const skipping = response.status === 206 ? 0 : offset
        const body = Stream.toReadableStream(response.stream)
        return yield* Effect.tryPromise({
          try: () => readLines(body, skipping, offset, maxLines),
          catch: (error) => unreadable(`unreadable: ${String(error)}`)
        })
      })
    })
  })
)
