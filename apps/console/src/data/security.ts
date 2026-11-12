import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ActiveSession } from "@insyte/domain/Session"
import { SecurityPolicy } from "@insyte/modules/workspaces/domain/Security"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { WORKSPACE } from "./workspace.ts"

/*
 * Instellingen → Beveiliging (M3.3): the workspace's sign-in policy and the person's own sessions, each primed by the
 * route's loader and carried in the document. Signing a session out names `SESSIONS`; the policy changes with the
 * workspace's other settings.
 */

export const SESSIONS = ["sessions"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const securityAtom = Atom.serializable(
  ConsoleClient.query("Workspaces.getSecurity", undefined, { reactivityKeys: WORKSPACE }),
  {
    key: "workspace-security",
    schema: AsyncResult.Schema({ success: SecurityPolicy, error: errors }),
    skipInitialRun: true
  }
)

export const sessionsAtom = Atom.serializable(
  ConsoleClient.query("Session.listSessions", undefined, { reactivityKeys: SESSIONS }),
  {
    key: "own-sessions",
    schema: AsyncResult.Schema({
      success: Schema.Array(ActiveSession),
      error: Schema.Union([Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const revokeSession = ConsoleClient.mutation("Session.revoke")
