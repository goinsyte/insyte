import { Schema } from "effect"
import { StoreAccess, StoreChoice } from "../../shared/domain/Stores.ts"

/*
 * Rollen (M3.2): the workspace's roles as the list and the editor read them, with who holds each, and the changes the
 * editor makes. Levels and specials are the catalogue's (`@insyte/domain/Permissions`); the refund limit is in euros,
 * as the catalogue counts it.
 */

const Level = Schema.Literals([0, 1, 2, 3])

export class RoleHolders extends Schema.Class<RoleHolders>("roles/RoleHolders")({
  members: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  invites: Schema.Int,
  link: Schema.Boolean,
  /** Live API keys that hold the role (and follow it): neither revoked nor expired. */
  keys: Schema.Int
}) {}

export class RoleView extends Schema.Class<RoleView>("roles/RoleView")({
  id: Schema.String,
  label: Schema.String,
  system: Schema.Boolean,
  basedOn: Schema.NullOr(Schema.String),
  levels: Schema.Record(Schema.String, Level),
  specials: Schema.Record(Schema.String, Schema.Boolean),
  refundLimit: Schema.NullOr(Schema.Finite),
  stores: StoreAccess,
  version: Schema.Int,
  holders: RoleHolders
}) {}

export class Roles extends Schema.Class<Roles>("roles/Roles")({
  /** The signed-in member, and the role they hold. */
  me: Schema.String,
  myRoleId: Schema.String,
  roles: Schema.Array(RoleView),
  /** The signed-in member's fence (`storeScope`): `null` is every store. */
  storeScope: Schema.NullOr(Schema.Array(Schema.String)),
  /** The stores the signed-in member reaches, for the editor's store picker. */
  stores: Schema.Array(StoreChoice)
}) {}

export const Permissions = Schema.Struct({
  levels: Schema.Record(Schema.String, Level),
  specials: Schema.Record(Schema.String, Schema.Boolean),
  refundLimit: Schema.NullOr(Schema.Finite),
  stores: StoreAccess
})

export const CreateRole = Schema.Struct({ label: Schema.String, from: Schema.NullOr(Schema.String) })
export const UpdateRole = Schema.Struct({ id: Schema.String, ...Permissions.fields })
export type UpdateRole = typeof UpdateRole.Type
export const RenameRole = Schema.Struct({ id: Schema.String, label: Schema.String })
export const RoleRef = Schema.Struct({ id: Schema.String })
export const RemoveRole = Schema.Struct({ id: Schema.String, to: Schema.String })

/** What a create answers: the roles, and which one is new (the editor opens it). */
export class Created extends Schema.Class<Created>("roles/Created")({ id: Schema.String, roles: Roles }) {}
