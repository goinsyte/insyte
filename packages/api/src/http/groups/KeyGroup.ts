import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"

/* The key making the call (M19.2): `/v1/me`. */

export const Me = Schema.Struct({
  key: Schema.Struct({ id: Schema.String, label: Schema.String, scopes: Schema.Array(Schema.String) }),
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String })
}).annotate({ identifier: "Me" })

export class KeyGroup extends HttpApiGroup.make("key")
  .add(
    HttpApiEndpoint.get("me", "/me", { success: Me }).annotate(
      OpenApi.Description,
      "The key making the call: its scopes and the workspace it belongs to."
    )
  )
  .annotate(OpenApi.Title, "Key")
{}
