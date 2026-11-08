import { Db } from "@insyte/database/Db"
import { Effect } from "effect"

/*
 * Which workspace a landing address belongs to (M3.4), through the routing functions (0014): an invitation by its id
 * and secret, the shareable link by its secret. Nothing about the invitation itself; that is read in the workspace.
 */

export interface Route {
  readonly workspaceId: string
  /** The shareable link rather than one person's invitation. */
  readonly link: boolean
}

export const sha256 = (text: string) =>
  Effect.promise(async () =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  )

export const LINK_PREFIX = "link_"

export const route = Effect.fn("Landing.route")(
  function*(ref: { readonly id: string; readonly k?: string | undefined }) {
    const db = yield* Db
    if (ref.id.startsWith(LINK_PREFIX)) {
      const hash = yield* sha256(ref.id.slice(LINK_PREFIX.length))
      const [row] = yield* db.routing((sql) =>
        sql<{ workspaceId: string | null }>`select invite_link_route(decode(${hash}, 'hex')) as workspace_id`
      )
      return row?.workspaceId == null ? undefined : { workspaceId: row.workspaceId, link: true } satisfies Route
    }
    if (ref.k === undefined || ref.k === "") return undefined
    const hash = yield* sha256(ref.k)
    const [row] = yield* db.routing((sql) =>
      sql<{ workspaceId: string | null }>`select invitation_route(${ref.id}, decode(${hash}, 'hex')) as workspace_id`
    )
    return row?.workspaceId == null ? undefined : { workspaceId: row.workspaceId, link: false } satisfies Route
  }
)
