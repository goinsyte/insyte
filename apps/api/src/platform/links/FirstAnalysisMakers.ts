import { set as setAutonomy } from "@insyte/modules/agent/use-cases/autonomy"
import { create as createAutomation } from "@insyte/modules/automations/use-cases/commands"
import { Makers } from "@insyte/modules/first-analysis/Links"
import { create as createSheet } from "@insyte/modules/sheets/use-cases/commands"
import { Effect, Layer } from "effect"
import { SqlError } from "effect/sql"

/**
 * The first analysis → what it makes, through the slices that own it (M15 step 5): the delivery update as a draft in
 * Automatiseringen (`Automations.create`, never published here), "Levertijd per land" in Rekenbladen
 * (`Sheets.create`), and the offline plan's levels as the autonomy policy's next version (`Autonomy.set`, made on the
 * version the offline step showed). Each as the person, with their permissions, its own audit and its own undo.
 */
export const FirstAnalysisMakersLive = Layer.succeed(Makers)(Makers.of({
  automation: (input) =>
    createAutomation({
      templateId: input.template,
      name: input.name,
      description: input.description,
      nodes: input.nodes
    }).pipe(
      Effect.map((change) => change.automation!.automation.id),
      Effect.catchIf(SqlError.isSqlError, Effect.die),
      Effect.catchTag("NotFound", Effect.die)
    ),
  sheet: (input) =>
    createSheet({ title: input.title, template: "blank", tabs: input.tabs, source: "first_analysis" }).pipe(
      Effect.map((made) => made.sheet.id),
      Effect.catchIf(SqlError.isSqlError, Effect.die),
      Effect.catchTag("FolderNotFound", Effect.die)
    ),
  autonomy: (sql, levels, baseVersion) =>
    setAutonomy(sql, { levels, baseVersion }).pipe(
      Effect.map((saved) => ({ version: saved.undo === null ? null : saved.policy.version, undo: saved.undo })),
      Effect.catchIf(SqlError.isSqlError, Effect.die)
    )
}))
