import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"

/*
 * `Idempotency-Key` on the public API's writes (api.md §6; `idempotency_keys`): the first request with a key runs and
 * its answer is kept for a day; the same key with the same request answers that again without running; the same key
 * with another request is refused, and so is one that arrives while the first is still running. A request without a
 * key just runs. Per principal: two keys never share each other's answers.
 */

/** The key came with a different request than the one it was first used for. */
export class IdempotencyKeyReused extends Schema.TaggedError<IdempotencyKeyReused>()("IdempotencyKeyReused", {}) {}

/** The first request with this key has not finished yet. */
export class IdempotencyInFlight extends Schema.TaggedError<IdempotencyInFlight>()("IdempotencyInFlight", {}) {}

const HOURS = 24

const hashOf = (request: unknown) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(request)))).pipe(
    Effect.map((bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""))
  )

/**
 * Runs `effect` once per `key` and `request`. The answer is kept as JSON, so it must be one (the public API's shapes
 * are). A failure is not kept: the same key may try again.
 */
export const once = <A, E, R>(key: string | undefined, request: unknown, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    if (key === undefined || key.trim() === "") return yield* effect
    const principal = yield* CurrentPrincipal
    const db = yield* Db
    const hash = yield* hashOf(request)
    const claimed = yield* db.scoped((sql) =>
      Effect.gen(function*() {
        yield* sql`delete from idempotency_keys where principal_id = ${principal.id} and key = ${key}
                   and expires_at < now()`
        const inserted = yield* sql`
          insert into idempotency_keys (workspace_id, principal_id, key, request_hash, expires_at)
          values (${principal.workspaceId}, ${principal.id}, ${key}, decode(${hash}, 'hex'),
                  now() + make_interval(hours => ${HOURS}))
          on conflict do nothing returning key`
        if (inserted.length > 0) return { first: true as const }
        // As text: the client renames JSON keys to camelCase on the way out, and the answer must come back as kept.
        const [row] = yield* sql<{ same: boolean; response: string | null }>`
          select request_hash = decode(${hash}, 'hex') as same, response::text as response from idempotency_keys
          where principal_id = ${principal.id} and key = ${key}`
        return { first: false as const, same: row?.same === true, response: row?.response ?? null }
      })
    ).pipe(Effect.orDie)
    if (!claimed.first) {
      if (!claimed.same) return yield* new IdempotencyKeyReused()
      if (claimed.response === null) return yield* new IdempotencyInFlight()
      return JSON.parse(claimed.response) as A
    }
    const release = db.scoped((sql) =>
      sql`delete from idempotency_keys where principal_id = ${principal.id} and key = ${key} and response is null`
    ).pipe(Effect.orDie)
    const answer = yield* effect.pipe(Effect.onError(() => release))
    yield* db.scoped((sql) =>
      sql`update idempotency_keys set response = ${JSON.stringify(answer ?? null)}::jsonb
          where principal_id = ${principal.id} and key = ${key}`
    ).pipe(Effect.orDie)
    return answer
  })
