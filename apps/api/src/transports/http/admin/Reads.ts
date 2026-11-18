import { ConsoleRpcs } from "@insyte/api/ConsoleRpcs"
import { Authenticated } from "@insyte/api/rpc/Authenticated"
import { Member } from "@insyte/api/rpc/Member"
import { WithDb } from "@insyte/api/rpc/WithDb"
import { Connect } from "@insyte/database/Connect"
import { Db, makeDb } from "@insyte/database/Db"
import { UserId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { PendingEvents } from "@insyte/modules/shared/domain/Outbox"
import { SealBroken, Sealer } from "@insyte/modules/shared/domain/Sealer"
import { type StaffSession, viewerPrincipal } from "@insyte/modules/support/domain/Support"
import { Cause, Effect, Exit, Schema, Scope } from "effect"
import { type Rpc, RpcGroup, RpcSchema, RpcTest } from "effect/rpc"

/*
 * What a staff session may read (M18), and the reading itself. Three locks, each enough on its own:
 *
 * 1. This list: a console RPC the team may call is named here, with what the workspace's Logboek calls it. Anything
 *    else is refused before it runs, and an export, an erasure, a deletion or a secret's reveal is refused by name
 *    even if someone adds it here (`NEVER`).
 * 2. `Policy`: the session reads as `staff_viewer`, which it refuses every level past Bekijken and every special.
 * 3. The database: every transaction the read opens is read-only (`makeDb(…, { readOnly: true })`), as a
 *    `staff_viewer` (row level security holds it to the workspace), and the sealed secrets are closed to it (0107);
 *    the sealer here opens nothing either.
 *
 * The read is the console's own handler, with the session's principal in place of a member's: what support sees is
 * what that workspace's member at Bekijken would.
 */

/** The reads, by RPC, as the Logboek says them ("Bekeken: Bestellingen"). */
export const STAFF_READS: Readonly<Record<string, string>> = {
  "Home.brief": "Start",
  "Stores.list": "Winkels",
  "Stores.syncStatus": "Synchronisatie",
  "Connections.list": "Koppelingen",
  "Connections.health": "Gezondheid van de koppelingen",
  "Orders.list": "Bestellingen",
  "Orders.get": "Een bestelling",
  "Products.list": "Producten",
  "Products.get": "Een product",
  "Customers.list": "Klanten",
  "Customers.get": "Een klant",
  "Returns.list": "Retouren",
  "Returns.get": "Een retour",
  "Tickets.list": "Tickets",
  "Tickets.get": "Een ticket",
  "Chargebacks.list": "Chargebacks",
  "Chargebacks.get": "Een chargeback",
  "Queue.list": "Werklijst",
  "Automations.list": "Automatiseringen",
  "Automations.get": "Een automatisering",
  "Runs.list": "Uitvoeringen",
  "Runs.get": "Een uitvoering",
  "Team.get": "Team",
  "Roles.list": "Rollen",
  "Workspaces.getAccount": "Account",
  "Workspaces.getRegional": "Regio",
  "WorkspaceSettings.get": "Instellingen",
  "Audit.list": "Logboek",
  "AiBudget.get": "AI-limieten",
  "Autonomy.get": "AI-autonomie",
  "AgentLog.list": "Wat de agent deed",
  "Data.overview": "Data",
  "Data.imports.list": "Imports",
  "FirstAnalysis.get": "Eerste analyse"
}

/** Never for the team, whatever the list says: exports, erasures, deletions, a secret or a link that opens one. */
const NEVER = /export|erasure|erase|delet|reveal|secret|requestaccess|invoiceurl|portalsession|undo|redo|compensate/i

export type Readability = "readable" | "not_readable" | "never_for_staff"

export const readability = (tag: string): Readability =>
  NEVER.test(tag) ? "never_for_staff" : Object.hasOwn(STAFF_READS, tag) ? "readable" : "not_readable"

/** The RPC itself, when it is a member's single answer (no stream, inside a workspace). */
export const rpcOf = (tag: string): Rpc.AnyWithProps | undefined => {
  const rpc = (ConsoleRpcs.requests as ReadonlyMap<string, Rpc.AnyWithProps>).get(tag)
  if (rpc === undefined || RpcSchema.isStreamSchema(rpc.successSchema)) return undefined
  return rpc.middlewares.has(Member as never) ? rpc : undefined
}

/** Who the console's handlers see as the person: nobody's account, only a name for what they print. */
const STAFF_USER: SessionUser = {
  id: Schema.decodeSync(UserId)("usr_00000000000000000000000000"),
  email: "support@insyte.invalid",
  name: "Insyte-support",
  emailVerified: true,
  image: null,
  twoFactorEnabled: false
}

/** Opens nothing and seals nothing: a staff session never sees a secret. */
const NO_SECRETS = Sealer.of({
  seal: () => Effect.die(new Error("a staff session seals nothing")),
  open: () => Effect.fail(new SealBroken({ kid: "staff" }))
})

/** A console RPC's schemas need no service to decode or encode. */
type Json = Schema.Codec<unknown, unknown, never, never>

export type ReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code: string }

/**
 * A failure as a code the staff page and the team's audit can say: an error's tag, or what refused it. Never the
 * error itself: its fields can carry what the read was not to show (an id of another workspace, a message).
 */
const codeOf = (cause: Cause.Cause<unknown>): string => {
  const failure = cause.reasons.find((r) => r._tag === "Fail")
  const error = failure === undefined ? undefined : (failure as { readonly error: unknown }).error
  if (/read-only transaction/i.test(Cause.pretty(cause))) return "read_only"
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = String((error as { readonly _tag: unknown })._tag)
    if (/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(tag)) return tag
  }
  return "failed"
}

/** An id as Insyte mints them (`ord_…`), and nothing else: what a person typed is never a record's name. */
const ID = /^[a-z]{2,6}_[0-9a-z]{8,40}$/

/**
 * The record a read names, for both trails, so the owner sees which one was viewed: the payload's `id`, or else its
 * one `…Id` (an order's, a store's), when that is an id. A list, a search, a filter names none.
 */
export const subjectOf = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null) return null
  const fields = payload as Record<string, unknown>
  const id = fields["id"]
  if (typeof id === "string" && ID.test(id)) return id
  const ids = Object.entries(fields).filter(([key, value]) =>
    key.endsWith("Id") && typeof value === "string" && ID.test(value)
  )
  return ids.length === 1 ? String(ids[0]![1]) : null
}

/**
 * Runs one console RPC as the session: decoded from JSON, answered as JSON. The caller has checked the list and
 * written the read to both trails (`Staff.beginRead`).
 */
export const readAs = (
  session: StaffSession,
  rpc: Rpc.AnyWithProps,
  payload: unknown
): Effect.Effect<ReadResult, never, Connect> =>
  Effect.gen(function*() {
    const decoded = yield* Schema.decodeUnknownEffect(rpc.payloadSchema as unknown as Json)(payload).pipe(
      Effect.mapError(() => "invalid_payload" as const)
    )
    const principal = viewerPrincipal(session.id, session.workspaceId as never)
    const connect = yield* Connect
    const scope = yield* Effect.scope
    const connection = yield* Effect.cached(connect.open.pipe(Effect.provideService(Scope.Scope, scope)))
    const db = makeDb(connection, { readOnly: true })
    // The handlers and the other middleware are the console's, in this request's context (`RpcContext`, provided
    // with the app's layer): typed out here, as the group is one RPC chosen at run time.
    const makeClient = RpcTest.makeClient(RpcGroup.make(rpc)) as unknown as Effect.Effect<
      Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>,
      never,
      Scope.Scope | Authenticated | Member | WithDb | Sealer
    >
    const client = yield* makeClient.pipe(
      Effect.provideService(
        Authenticated,
        Authenticated.of((effect) => Effect.provideService(effect, CurrentUser, STAFF_USER))
      ),
      Effect.provideService(Member, Member.of((effect) => Effect.provideService(effect, CurrentPrincipal, principal))),
      Effect.provideService(
        WithDb,
        WithDb.of((effect) =>
          effect.pipe(Effect.provideService(Db, db), Effect.provideService(PendingEvents, { add: () => undefined }))
        )
      ),
      Effect.provideService(Sealer, NO_SECRETS)
    )
    const exit = yield* Effect.exit(client[rpc._tag]!(decoded))
    if (Exit.isFailure(exit)) return { ok: false, code: codeOf(exit.cause) } satisfies ReadResult
    const value = yield* Schema.encodeUnknownEffect(rpc.successSchema as unknown as Json)(exit.value).pipe(
      Effect.orElseSucceed(() => null)
    )
    return { ok: true, value } satisfies ReadResult
  }).pipe(
    Effect.catch((code) => Effect.succeed({ ok: false, code } satisfies ReadResult)),
    Effect.scoped
  )
