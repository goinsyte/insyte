import type { Db } from "@insyte/database/Db"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import type { Flow } from "@insyte/domain/automations/Graph"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { Tab } from "@insyte/domain/sheets"
import { Context, type Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { AutonomyLocked, AutonomyStale } from "../agent/domain/Autonomy.ts"
import type { UndoTicket } from "../shared/domain/Undo.ts"
import type { OfflineLevel } from "./domain/FirstAnalysis.ts"

/**
 * What "Klaarzetten" and "Afronden" make through the slices that own them (M15 step 5; `platform/links/`): an
 * automation as a draft (Automatiseringen, never published here), a rekenblad (Rekenbladen), and the offline plan's
 * levels as a new version of the autonomy policy (Zelfstandigheid), each as the person with their own permissions,
 * audited, on the caller's transaction (a nested one where the slice opens its own).
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class Makers extends Context.Service<Makers, {
  /** A draft from a library template, with its steps as given; its id. */
  readonly automation: (
    input: { readonly template: string; readonly name: string; readonly description: string; readonly nodes: Flow }
  ) => Effect.Effect<string, Forbidden | Invalid, Db | CurrentPrincipal>
  /** A sheet with these tabs; its id. */
  readonly sheet: (
    input: { readonly title: string; readonly tabs: ReadonlyArray<Tab> }
  ) => Effect.Effect<string, Forbidden | Invalid, Db | CurrentPrincipal>
  /**
   * The levels as the policy's next version, made on `baseVersion` (`AutonomyStale` when someone saved since); the
   * version written (null when nothing changed) and its undo.
   */
  readonly autonomy: (
    sql: SqlClient.SqlClient,
    levels: Partial<Record<AgentActionId, OfflineLevel>>,
    baseVersion: number
  ) => Effect.Effect<
    { readonly version: number | null; readonly undo: UndoTicket | null },
    Forbidden | Invalid | AutonomyLocked | AutonomyStale,
    CurrentPrincipal
  >
}>()("firstAnalysis/Makers") {}
