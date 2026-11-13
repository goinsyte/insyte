import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { DataV1 } from "./DataV1.ts"

export const DataHttp = HttpApiBuilder.group(
  PublicApi,
  "data",
  (handlers) =>
    Effect.map(
      Effect.service(DataV1),
      (read) =>
        handlers
          .handle("imports", () => read.imports)
          .handle("exports", () => read.exports)
          .handle("export", ({ params }) => read.export(params.id))
    )
).pipe(Layer.provide(DataV1.layer))
