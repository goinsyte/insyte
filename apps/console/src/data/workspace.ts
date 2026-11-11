import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { Regional, WorkspaceAccount } from "@insyte/modules/workspaces/domain/Settings"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Account and Regio (M3.1): the workspace's facts and its notation, each primed by its route's loader and
 * carried in the document. A write names `WORKSPACE`; one that renames the workspace names the frame's key too, so the
 * store selector reads the new name.
 */

export const WORKSPACE = ["workspace"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const accountAtom = Atom.serializable(
  ConsoleClient.query("Workspaces.getAccount", undefined, { reactivityKeys: WORKSPACE }),
  {
    key: "workspace-account",
    schema: AsyncResult.Schema({ success: WorkspaceAccount, error: errors }),
    skipInitialRun: true
  }
)

export const regionalAtom = Atom.serializable(
  ConsoleClient.query("Workspaces.getRegional", undefined, { reactivityKeys: WORKSPACE }),
  { key: "workspace-regional", schema: AsyncResult.Schema({ success: Regional, error: errors }), skipInitialRun: true }
)

export const workspaceWrites = {
  saveAccount: ConsoleClient.mutation("Workspaces.saveAccount"),
  setAlerts: ConsoleClient.mutation("Workspaces.setAlerts"),
  setRetention: ConsoleClient.mutation("Workspaces.setRetention"),
  saveRegional: ConsoleClient.mutation("Workspaces.saveRegional")
} as const
