import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { Catalog, InstallView } from "@insyte/modules/marketplace/domain/Marketplace"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The Marketplace (M17 step 3): the catalogue, the workspace's installs and its recommendations, read when the modal
 * opens or Instellingen → Apps loads (its loader primes them, carried in the document). Every change names
 * `MARKETPLACE`, so all three read again.
 */

export const MARKETPLACE = ["marketplace"] as const

const errors = Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const catalogAtom = Atom.serializable(
  ConsoleClient.query("Marketplace.catalog", undefined, { reactivityKeys: MARKETPLACE }),
  {
    key: "marketplace-catalog",
    schema: AsyncResult.Schema({ success: Catalog, error: errors }),
    skipInitialRun: true
  }
)

export const installsAtom = Atom.serializable(
  ConsoleClient.query("Marketplace.installs", undefined, { reactivityKeys: MARKETPLACE }),
  {
    key: "marketplace-installs",
    schema: AsyncResult.Schema({ success: Schema.Array(InstallView), error: errors }),
    skipInitialRun: true
  }
)

export const recommendedAtom = Atom.serializable(
  ConsoleClient.query("Marketplace.recommended", undefined, { reactivityKeys: MARKETPLACE }),
  {
    key: "marketplace-recommended",
    schema: AsyncResult.Schema({ success: Schema.Array(Schema.String), error: errors }),
    skipInitialRun: true
  }
)

export const marketplaceWrites = {
  install: ConsoleClient.mutation("Marketplace.install"),
  uninstall: ConsoleClient.mutation("Marketplace.uninstall"),
  setScopes: ConsoleClient.mutation("Marketplace.setScopes"),
  open: ConsoleClient.mutation("Marketplace.open"),
  feedback: ConsoleClient.mutation("Marketplace.feedback"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
