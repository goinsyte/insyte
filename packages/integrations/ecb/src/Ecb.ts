import { type EcbDay, RatesError, ReferenceRates } from "@insyte/modules/fx/domain/Rates"
import { Duration, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

/*
 * The ECB's euro foreign exchange reference rates (§0.4): one public XML file of the last 90 days, no key, published
 * each working day around 16:00 CET. Each day is a `<Cube time="YYYY-MM-DD">` holding a `<Cube currency="USD"
 * rate="1.1081"/>` per currency, 1 EUR in that currency. The rates are kept as the decimals the ECB wrote; a day or a
 * rate that does not read as one is left out rather than guessed.
 */

export const RECENT_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"
const TIMEOUT = Duration.seconds(15)

const DAY = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g
const RATE = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["'](\d+(?:\.\d+)?)["']\s*\/>/g

/** The ECB's XML as days of rates, in the file's order (newest first); a rate of 0 is left out. */
export const parseRates = (xml: string): ReadonlyArray<EcbDay> =>
  [...xml.matchAll(DAY)].map(([, day, body]) => ({
    day: day!,
    rates: [...body!.matchAll(RATE)]
      .filter(([, , rate]) => Number(rate) > 0)
      .map(([, currency, rate]) => ({ currency: currency!, rate: rate! }))
  })).filter((d) => d.rates.length > 0)

const unreachable = () => new RatesError({ reason: "De ECB was niet bereikbaar" })

export const EcbLive = Layer.effect(
  ReferenceRates,
  Effect.gen(function*() {
    const http = yield* HttpClient.HttpClient
    return ReferenceRates.of({
      recent: Effect.gen(function*() {
        const response = yield* http.execute(
          HttpClientRequest.get(RECENT_URL).pipe(HttpClientRequest.setHeaders({ accept: "application/xml, text/xml" }))
        ).pipe(Effect.timeout(TIMEOUT), Effect.mapError(unreachable))
        if (response.status !== 200) return yield* new RatesError({ reason: `De ECB antwoordde ${response.status}` })
        const days = parseRates(yield* response.text.pipe(Effect.mapError(unreachable)))
        if (days.length === 0) return yield* new RatesError({ reason: "De ECB stuurde geen koersen" })
        return days
      }).pipe(Effect.withSpan("Ecb.recent"))
    })
  })
)
