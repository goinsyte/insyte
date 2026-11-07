import type { Invalid } from "@insyte/domain/Errors"
import type { UserId, WorkspaceId } from "@insyte/domain/Ids"
import { Context, type Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * Founding a workspace, as a port (16 §3): onboarding's organisation step calls it, the workspaces slice implements it,
 * and neither imports the other (slices meet only in `shared/`). `found` runs on the caller's transaction (its
 * `SqlClient`), so the workspace and the step that founded it commit together or not at all.
 */

export const COUNTRIES = ["NL", "BE", "DE", "FR", "GB", "US", "IT", "ES"] as const
export type Country = (typeof COUNTRIES)[number]
export const TEAM_SIZES = ["1", "2-5", "6-20", "21+"] as const
export type TeamSize = (typeof TEAM_SIZES)[number]

/** What the organisation step sends: plain strings, checked here, so a refusal names its field and reason. */
export const CreateWorkspaceInput = Schema.Struct({
  name: Schema.String,
  slug: Schema.String,
  country: Schema.String,
  teamSize: Schema.String
})
export type CreateWorkspaceInput = typeof CreateWorkspaceInput.Type

export interface ValidWorkspace {
  readonly name: string
  readonly slug: string
  readonly country: Country
  readonly teamSize: TeamSize
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

/** The input, trimmed and checked; or each failing field with its reason code (the console owns the sentence). */
export const validateWorkspace = (
  input: CreateWorkspaceInput
): { readonly ok: ValidWorkspace } | { readonly fields: Record<string, string> } => {
  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()
  const fields: Record<string, string> = {}
  if (name.length === 0) fields["name"] = "required"
  else if (name.length > 80) fields["name"] = "too_long"
  if (slug.length === 0) fields["slug"] = "required"
  else if (!SLUG.test(slug)) fields["slug"] = "format"
  if (!(COUNTRIES as ReadonlyArray<string>).includes(input.country)) fields["country"] = "invalid"
  if (!(TEAM_SIZES as ReadonlyArray<string>).includes(input.teamSize)) fields["teamSize"] = "invalid"
  if (Object.keys(fields).length > 0) return { fields }
  return { ok: { name, slug, country: input.country as Country, teamSize: input.teamSize as TeamSize } }
}

export class WorkspaceFounder extends Context.Service<WorkspaceFounder, {
  /** The workspace, its five system roles, its counters and its owner. `Invalid { slug: "taken" }` when in use. */
  readonly found: (
    id: WorkspaceId,
    workspace: ValidWorkspace,
    owner: UserId
  ) => Effect.Effect<void, Invalid, SqlClient.SqlClient>
}>()("shared/WorkspaceFounder") {}
