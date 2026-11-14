import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../shared/domain/Documents.ts"
import { Sealer } from "../shared/domain/Sealer.ts"
import { QualityTickets } from "./domain/Ports.ts"
import type {
  DeliverableMissing,
  IllegalCheckMove,
  LinkExpired,
  NoSupplier,
  QualityChange,
  QualityStats,
  QualityView,
  RejectInput,
  RequestInput,
  SetPhaseInput,
  StatsInput,
  SubmitInput,
  SupplierCheck,
  SupplierLink
} from "./domain/Quality.ts"
import * as Quality from "./use-cases/quality.ts"
import * as Supplier from "./use-cases/supplier.ts"

type R = Db | CurrentPrincipal

/**
 * Product quality (M9.4): a product's checks, complaints, rate and phase; asking its supplier for a check, judging what
 * came back, the phase; and the link the supplier answers through.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class QualityService extends Context.Service<QualityService, {
  readonly list: (productId: string) => Effect.Effect<QualityView, Forbidden | NotFound, R>
  readonly stats: (input: typeof StatsInput.Type) => Effect.Effect<QualityStats, Forbidden, R>
  readonly request: (
    input: typeof RequestInput.Type
  ) => Effect.Effect<QualityChange, Forbidden | NotFound | Invalid | NoSupplier, R>
  readonly approve: (id: string) => Effect.Effect<QualityChange, Forbidden | NotFound | IllegalCheckMove, R>
  readonly reject: (
    input: typeof RejectInput.Type
  ) => Effect.Effect<QualityChange, Forbidden | NotFound | IllegalCheckMove, R>
  readonly setPhase: (input: typeof SetPhaseInput.Type) => Effect.Effect<QualityChange, Forbidden | NotFound, R>
  readonly link: (id: string) => Effect.Effect<SupplierLink, Forbidden | NotFound, R>
}>()("modules/QualityService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    QualityService,
    Effect.map(Effect.all([Effect.service(Sealer), Effect.service(QualityTickets)]), ([sealer, tickets]) => ({
      list: (productId) => Quality.list(productId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      stats: (input) => Quality.stats(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      request: (input) => Quality.request(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      approve: (id) => Quality.approve(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      reject: (input) =>
        Quality.reject(input).pipe(
          Effect.provideService(QualityTickets, tickets),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        ),
      setPhase: (input) => Quality.setPhase(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      link: (id) =>
        Quality.link(id).pipe(Effect.provideService(Sealer, sealer), Effect.catchIf(SqlError.isSqlError, Effect.die))
    }))
  )
}

/**
 * A quality check answered by its supplier through the signed link (M9.4), until the partner portal. No principal.
 *
 * @effect-expect-leaking Db
 */
export class QualityLinkService extends Context.Service<QualityLinkService, {
  readonly check: (token: string) => Effect.Effect<SupplierCheck, LinkExpired, Db>
  /** The check a link names, for the transport's limits. */
  readonly checkOf: (token: string) => Effect.Effect<string, LinkExpired>
  readonly upload: (
    input: { readonly token: string; readonly name: string; readonly mime: string; readonly bytes: Uint8Array }
  ) => Effect.Effect<{ readonly id: string }, LinkExpired | Invalid | IllegalCheckMove, Db>
  readonly submit: (
    input: typeof SubmitInput.Type
  ) => Effect.Effect<
    { readonly submittedAt: number },
    LinkExpired | Invalid | IllegalCheckMove | DeliverableMissing,
    Db
  >
}>()("modules/QualityLinkService") {
  static readonly layer = Layer.effect(
    QualityLinkService,
    Effect.gen(function*() {
      const sealer = yield* Sealer
      const files = yield* FileStore
      const ports = <A, E, Req>(effect: Effect.Effect<A, E, Req>) =>
        effect.pipe(Effect.provideService(Sealer, sealer), Effect.provideService(FileStore, files))
      return {
        check: (token) => ports(Supplier.check(token)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        checkOf: (token) => ports(Supplier.openLink(token)).pipe(Effect.map((c) => c.checkId)),
        upload: (input) => ports(Supplier.upload(input)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        submit: (input) => ports(Supplier.submit(input)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      }
    })
  )
}

/** `Shared.undo` for `quality.restore`; a rejection's ticket goes through the tickets link. */
export const restore: (
  sql: SqlClient.SqlClient,
  compensation: unknown
) => Effect.Effect<void, Conflict | SqlError.SqlError, CurrentPrincipal | QualityTickets> = Quality.restore
