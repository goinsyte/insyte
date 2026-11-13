import { KeyHasher } from "@insyte/modules/developer/domain/Ports"
import {
  createOn as createKeyOn,
  rescopeOn,
  restoreOn as restoreKeyOn,
  revokeOn
} from "@insyte/modules/developer/use-cases/keys"
import { AppKeys, type KeyGrant } from "@insyte/modules/marketplace/domain/Ports"
import { Effect, Layer } from "effect"

/* The Marketplace → a recipe app's API key, made, revoked, put back and narrowed by the developer slice (M17). */

/** What the Marketplace grants a recipe app's key, as the developer slice keeps it (clamped per area there too). */
const accessOf = (grant: KeyGrant) => ({ kind: "custom" as const, scopes: { ...grant.scopes } })

/** What an app's key does without making one: revoked, put back and narrowed, on the Marketplace's transaction. */
const keysKept = {
  revoke: (sql: Parameters<typeof revokeOn>[0], keyId: string) => revokeOn(sql, keyId),
  restore: (sql: Parameters<typeof restoreKeyOn>[0], keyId: string, revokedAt: Date) =>
    restoreKeyOn(sql, keyId, revokedAt),
  rescope: (sql: Parameters<typeof rescopeOn>[0], keyId: string, grant: KeyGrant) =>
    rescopeOn(sql, keyId, accessOf(grant), grant.stores === "all" ? "all" : [...grant.stores])
}

/** An undo puts a key back or narrows it; it never makes one. */
export const undoKeys = AppKeys.of({ ...keysKept, create: () => Effect.die(new Error("an undo makes no API key")) })

/**
 * The Marketplace's recipe apps' keys (M17), with the hasher a new key's secret is stored under. Composed beside the
 * hasher in the app layer, not in `SliceLinks`, which the background layers share without one.
 */
export const AppKeysLive = Layer.effect(
  AppKeys,
  Effect.map(Effect.service(KeyHasher), (hasher) =>
    AppKeys.of({
      ...keysKept,
      create: (sql, input) =>
        createKeyOn(sql, {
          label: input.label,
          access: accessOf(input.grant),
          stores: input.grant.stores === "all" ? "all" : [...input.grant.stores],
          expiresInDays: input.expiresInDays,
          ips: [],
          agent: false
        }).pipe(
          Effect.provideService(KeyHasher, hasher),
          Effect.map((made) => ({ keyId: made.key.id, secret: made.secret, prefix: made.key.prefix }))
        )
    }))
)
