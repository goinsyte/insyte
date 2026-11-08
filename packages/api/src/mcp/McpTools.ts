import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { CurrentApiKey, Me, Member, Role, ScopeMissingV1 } from "../http/PublicApi.ts"

/*
 * The MCP server's tools (M19.3): what an agent with an API key may read, in the public API's shapes. The same key,
 * the same scopes, the same request log; inviting, removing and changing roles stay with people.
 */

/** What the key door provides: every tool runs as the key. */
const asKey = () => [CurrentPrincipal, CurrentApiKey, Db]

export const Whoami = Tool.make("whoami", {
  description: "The API key in use: its label, its scopes and the Insyte workspace it belongs to.",
  success: Me,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListMembers = Tool.make("list_members", {
  description: "The workspace's team members: name, email, role and whether they are active. Needs team.read.",
  success: Schema.Struct({ data: Schema.Array(Member) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListRoles = Tool.make("list_roles", {
  description: "The workspace's roles and what each may do per area (none, read, write, manage). Needs team.read.",
  success: Schema.Struct({ data: Schema.Array(Role) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const InsyteTools = Toolkit.make(Whoami, ListMembers, ListRoles)
