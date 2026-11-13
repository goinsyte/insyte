import { figuresIn } from "@insyte/modules/analytics/use-cases/figures"
import { SheetFigures } from "@insyte/modules/sheets/domain/Ports"
import { Layer } from "effect"

/** A sheet export → the INSYTE() figures from analytics, on the export's transaction (M14 step 4). */
export const SheetFiguresLive = Layer.succeed(SheetFigures, {
  read: (sql, requests) => figuresIn(sql, requests)
})
