import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AuditExport, AuditFacets, AuditPage, ExportInput, ListInput } from "./domain/Audit.ts"
import * as Audit from "./use-cases/audit.ts"

type R = Db | CurrentPrincipal

/**
 * The Logboek (M17 step 20.1a): the workspace's settings changes, the people and pages in them, and the CSV.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class AuditService extends Context.Service<AuditService, {
  readonly list: (input: ListInput) => Effect.Effect<AuditPage, Forbidden | Invalid, R>
  readonly facets: Effect.Effect<AuditFacets, Forbidden, R>
  readonly exportCsv: (input: ExportInput) => Effect.Effect<AuditExport, Forbidden | Invalid, R>
}>()("modules/AuditService") {
  static readonly layer = Layer.succeed(AuditService, {
    list: (input) => Audit.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    facets: Audit.facets().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    exportCsv: (input) => Audit.exportCsv(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}
