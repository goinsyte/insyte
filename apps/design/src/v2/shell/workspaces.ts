import { STORES } from "../fixtures/workspace.ts"
import type { ShopStore } from "../fixtures/workspace.ts"
import type { WorkspaceId } from "./shell-state.ts"

/**
 * The workspaces Elena works in: her own Northwind, a client she helps as a beheerder, and an
 * invitation from a third that waits for her answer. All fictional, as the rest of `/v2`. Each has
 * its own stores; the records under them are Northwind's in this reference.
 */

export type Workspace = {
  readonly id: WorkspaceId
  readonly name: string
  readonly role: string
  readonly members: number
  readonly plan: string
  /** Hers: she cannot leave it, only hand it over. */
  readonly own: boolean
  readonly stores: ReadonlyArray<ShopStore>
}

const NORTHWIND: Workspace = {
  id: "northwind",
  name: "Northwind",
  role: "Eigenaar",
  members: 5,
  plan: "Groei",
  own: true,
  stores: STORES
}

export const WORKSPACES: ReadonlyArray<Workspace> = [
  NORTHWIND,
  {
    id: "lumen",
    name: "Lumen Studio",
    role: "Beheerder",
    members: 3,
    plan: "Start",
    own: false,
    stores: [{ id: "store_lumen", name: "Lumen Studio", detail: "Shopify · EUR", connected: true }]
  },
  {
    id: "fjord",
    name: "Fjord Outdoor",
    role: "Klantenservice",
    members: 9,
    plan: "Groei",
    own: false,
    stores: [
      { id: "store_fjord_no", name: "Fjord Outdoor NO", detail: "Shopify · NOK", connected: true },
      { id: "store_fjord_eu", name: "Fjord Outdoor EU", detail: "Shopify · EUR", connected: true }
    ]
  }
]

/** The open invitation: who sent it, as what, and when. */
export const INVITE = {
  workspace: "fjord" as WorkspaceId,
  by: "Marit Solberg",
  role: "Klantenservice",
  sent: "2 uur geleden"
}

export const workspaceOf = (id: WorkspaceId) => WORKSPACES.find((w) => w.id === id) ?? NORTHWIND
