import { ReferenceRates } from "@insyte/modules/fx/domain/Rates"
import { Effect, Layer } from "effect"
import { parseRates } from "./Ecb.ts"

/*
 * The ECB's recorded twin (integrations.md §1.1), for the worker tests and offline runs: three working days of the file
 * the ECB served on 12 November 2026, a few currencies each. Friday 6 November, then Monday 9 and Tuesday 10: the
 * weekend between has no rates, as the ECB publishes none.
 */

const RECORDED = `<gesmes:Envelope><Cube>
<Cube time="2026-11-10"><Cube currency="USD" rate="1.1214"/><Cube currency="JPY" rate="177.38"/><Cube currency="GBP" rate="0.83545"/><Cube currency="CHF" rate="0.9203"/></Cube>
<Cube time="2026-11-09"><Cube currency="USD" rate="1.1193"/><Cube currency="JPY" rate="176.79"/><Cube currency="GBP" rate="0.8343"/><Cube currency="CHF" rate="0.9164"/></Cube>
<Cube time="2026-11-06"><Cube currency="USD" rate="1.1165"/><Cube currency="JPY" rate="176.77"/><Cube currency="GBP" rate="0.83415"/><Cube currency="CHF" rate="0.9143"/></Cube>
</Cube></gesmes:Envelope>`

export const EcbRecorded = Layer.succeed(ReferenceRates)(
  ReferenceRates.of({ recent: Effect.sync(() => parseRates(RECORDED)) })
)
