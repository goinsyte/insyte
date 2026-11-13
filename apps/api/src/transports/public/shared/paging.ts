import type { InvalidRequestV1 } from "@insyte/api/http/Errors"
import type { ListQuery } from "@insyte/api/http/Paging"
import { CurrentApiKey } from "@insyte/api/http/Security"
import type { FilterNode, ListInput } from "@insyte/modules/shared/domain/Filter"
import { Effect } from "effect"

/* A `/v1` list's query as the use case reads it (M19.2), and a cursor it did not hand out refused. */

/** A list's query as the use case's input; `status` is the one-status filter. */
export const listInput = (query: ListQuery, statusField: string | undefined): ListInput => {
  const filter: FilterNode | undefined = query.status === undefined || statusField === undefined
    ? undefined
    : { kind: "rule", id: "status", field: statusField, op: "any", value: [query.status] }
  return {
    ...(query.limit === undefined ? {} : { limit: Math.min(200, Math.max(1, Math.floor(query.limit))) }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.store_id === undefined ? {} : { storeId: query.store_id }),
    ...(filter === undefined ? {} : { filter })
  }
}

/** A cursor the list did not hand out, in the V1 envelope. */
export const invalid = (field: string) =>
  Effect.flatMap(CurrentApiKey, (key) =>
    Effect.fail<InvalidRequestV1>({
      error: {
        code: "InvalidRequestV1",
        message: `The ${field} is not one this list handed out.`,
        request_id: key.requestId,
        field
      }
    }))
