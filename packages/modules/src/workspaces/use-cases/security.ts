import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { SecurityPolicy } from "../domain/Security.ts"

/*
 * Instellingen → Beveiliging, read (M3.1; widgets/05 §2.4): the workspace's sign-in policy from its row, and the
 * reader's own two-factor from their session. Reading takes Instellingen · Bekijken, as the page does.
 */

export const getSecurity = Effect.fn("Workspaces.getSecurity")(function*() {
  yield* Policy.require("settings", 1)
  const { workspaceId } = yield* CurrentPrincipal
  const user = yield* CurrentUser
  const db = yield* Db
  const [row] = yield* db.scoped((sql) =>
    sql<{ requireMfa: boolean; ssoKind: string | null }>`
      select require_mfa, sso_policy->>'kind' as sso_kind from workspaces where id = ${workspaceId}`
  )
  if (row === undefined) return yield* Effect.die(`no workspace ${workspaceId}`)
  return new SecurityPolicy({
    requireMfa: row.requireMfa,
    googleSso: row.ssoKind !== null && row.ssoKind !== "off",
    twoFactorEnabled: user.twoFactorEnabled
  })
})
