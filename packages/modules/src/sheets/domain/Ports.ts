import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/*
 * What Rekenbladen needs of another slice (architecture.md: never its use-cases/), implemented where the app is
 * composed (`apps/api/src/platform/SliceLinks.ts`).
 */

/** One INSYTE() figure as the analytics slice answers it: a number, or why there is none. */
export interface SheetFigure {
  readonly metric: string
  readonly month?: string | undefined
  readonly value: number | null
  readonly error: string | null
}

/**
 * The figures a sheet's cells read (`Analytics.figures`), on the export's transaction, so the server evaluates a tab
 * with the same numbers the console shows.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class SheetFigures extends Context.Service<SheetFigures, {
  readonly read: (
    sql: SqlClient.SqlClient,
    requests: ReadonlyArray<{ readonly metric: string; readonly month?: string | undefined }>
  ) => Effect.Effect<
    { readonly currency: string; readonly figures: ReadonlyArray<SheetFigure> },
    SqlError.SqlError,
    CurrentPrincipal
  >
}>()("sheets/SheetFigures") {}
