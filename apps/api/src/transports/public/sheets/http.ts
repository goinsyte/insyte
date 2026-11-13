import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { SheetsV1 } from "./SheetsV1.ts"

export const SheetsHttp = HttpApiBuilder.group(
  PublicApi,
  "sheets",
  (handlers) =>
    Effect.map(
      Effect.service(SheetsV1),
      (act) =>
        handlers
          .handle("list", () => act.sheets)
          .handle("get", ({ params }) => act.sheet(params.id))
    )
).pipe(Layer.provide(SheetsV1.layer))
