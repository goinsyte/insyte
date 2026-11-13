import { AuditRpcs } from "@insyte/api/rpc/AuditRpcs"
import { AuditService } from "@insyte/modules/audit/Audit"
import { Effect } from "effect"

export const AuditHandlers = AuditRpcs.toLayer(Effect.gen(function*() {
  const audit = yield* AuditService
  return AuditRpcs.of({
    "Audit.list": (input) => audit.list(input),
    "Audit.facets": () => audit.facets,
    "Audit.export": (input) => audit.exportCsv(input)
  })
}))
