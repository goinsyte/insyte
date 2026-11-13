import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ScopeMissingV1 } from "../Errors.ts"
import { List } from "../Paging.ts"

/* The team (M19.2): the workspace's members and its roles, read with `team.read`. */

const Access = Schema.Literals(["none", "read", "write", "manage"])

export const Member = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Struct({ id: Schema.String, label: Schema.String }),
  status: Schema.Literals(["active", "deactivated"]),
  joined_at: Schema.String,
  last_active_at: Schema.NullOr(Schema.String)
}).annotate({ identifier: "Member" })

export const Role = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  system: Schema.Boolean,
  /** Area → what the role may do there. */
  access: Schema.Record(Schema.String, Access)
}).annotate({ identifier: "Role" })

export class TeamGroup extends HttpApiGroup.make("team")
  .add(
    HttpApiEndpoint.get("members", "/members", { success: List(Member), error: ScopeMissingV1 }).annotate(
      OpenApi.Description,
      "The workspace's members. Needs `team.read`."
    ),
    HttpApiEndpoint.get("roles", "/roles", { success: List(Role), error: ScopeMissingV1 }).annotate(
      OpenApi.Description,
      "The workspace's roles and what each may do per area. Needs `team.read`."
    )
  )
  .annotate(OpenApi.Title, "Team")
{}
