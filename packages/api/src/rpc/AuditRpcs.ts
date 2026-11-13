import { Forbidden, Invalid } from "@insyte/domain/Errors"
import { AuditExport, AuditFacets, AuditPage, ExportInput, ListInput } from "@insyte/modules/audit/domain/Audit"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Refused = Schema.Union([Forbidden, Invalid])

/**
 * The Logboek (M17 step 20.1a): every settings change, who made it and what it was and became, the people and pages in
 * it, and the CSV. Reading takes Instellingen · Bekijken; the export also Exporteren. Not reachable by an API key
 * (`settings` is `api: false`).
 */
export class AuditRpcs extends RpcGroup.make(
  Rpc.make("Audit.list", { payload: ListInput, success: AuditPage, error: Refused }),
  Rpc.make("Audit.facets", { success: AuditFacets, error: Forbidden }),
  Rpc.make("Audit.export", { payload: ExportInput, success: AuditExport, error: Refused })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
