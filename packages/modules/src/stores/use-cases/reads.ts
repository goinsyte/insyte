import { Effect } from "effect"
import { childFields, childQuery, flatten, FOLLOW_UP_PAGE, gidType } from "../domain/Mirror.ts"

/*
 * Reading an object whole (M6.3): every read of a store (the import's pages, the reconcile sweep's, a webhook's single
 * read) asks for each node with the first page of its children, so the query stays within Shopify's cost limit. A node
 * with more has the rest read right after it, a page at a time (`childQuery`), and is written with all of them: never
 * cut short at a page.
 */

/** A connection as Shopify answers one; `pageInfo` may be missing where the query did not ask for it. */
export interface Connection {
  readonly pageInfo?: { readonly hasNextPage: boolean; readonly endCursor: string | null }
  readonly edges: ReadonlyArray<{ readonly node: Record<string, unknown> }>
}

/** The connection at `path` in an answer, if there is one. */
export const connectionAt = (data: unknown, path: ReadonlyArray<string>): Connection | undefined => {
  let at: unknown = data
  for (const key of path) at = typeof at === "object" && at !== null ? (at as Record<string, unknown>)[key] : undefined
  return typeof at === "object" && at !== null && "edges" in at ? at as Connection : undefined
}

/** One query to the store, through its gate. */
export type Ask<E, R> = (
  query: string,
  variables: Record<string, unknown>
) => Effect.Effect<{ readonly data: unknown }, E, R>

/**
 * A node as lines (`flatten`), with all of its children: each child connection past its first page is read on, by the
 * node's id, until Shopify says there is no more. A node gone since it was read answers nothing: what was read stays.
 */
export const wholeNode = <E, R>(node: Record<string, unknown>, ask: Ask<E, R>, childPage = FOLLOW_UP_PAGE) =>
  Effect.gen(function*() {
    const lines = flatten(node)
    const id = node["id"]
    if (typeof id !== "string") return lines
    const type = gidType(id)
    for (const field of childFields(type)) {
      let children = connectionAt(node, [field])
      while (children?.pageInfo?.hasNextPage === true && children.pageInfo.endCursor !== null) {
        const more = yield* ask(childQuery(type, field, childPage), { id, after: children.pageInfo.endCursor })
        children = connectionAt(more.data, ["node", field])
        // The node without its other fields: only its children are lines.
        if (children !== undefined) lines.push(...flatten({ id, [field]: children }).slice(1))
      }
    }
    return lines
  })
