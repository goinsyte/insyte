import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { ScopeMissingV1 } from "../../http/Errors.ts"
import { Member, Role } from "../../http/groups/TeamGroup.ts"
import { asKey } from "../Shared.ts"

/* The team and its roles (M19.3), to read; inviting, removing and changing roles stay with people. */

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

export const TeamTools = Toolkit.make(
  ListMembers,
  ListRoles
)
