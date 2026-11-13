import type { Db } from "@insyte/database/Db"
import type { Effect } from "effect"
import type { SqlError } from "effect/sql"
import type { RatesError, ReferenceRates } from "./domain/Rates.ts"
import * as Fill from "./use-cases/fill.ts"

/*
 * Exchange rates (§0.4): `fx_rates` kept from the ECB's daily reference rates. The cron's nightly turn runs `fill`; Start's
 * figures and the facts' readers convert at the latest day on or before the one they convert.
 */

/** The ECB's last 90 days into `fx_rates`; how many rows were new or changed. */
export const fill: Effect.Effect<number, RatesError | SqlError.SqlError, Db | ReferenceRates> = Fill.fill
