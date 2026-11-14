import { NotFound, Unauthenticated } from "@insyte/domain/Errors"
import {
  NotSupplierContact,
  SupplierDashboard,
  SupplierMe,
  SupplierOrderDetail,
  SupplierOrderList,
  SupplierProductDetail,
  SupplierProductList
} from "@insyte/modules/supplier-portal/domain/Portal"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The supplier portal (M16 step 2): what a supplier's contact reads of its own work for one brand, primed by the
 * routes' loaders and carried in the document. Every portal write names `PORTAL`, and so does the supplier's own
 * realtime socket (`supplier-realtime.ts`) when the brand or another of its people changes something of theirs.
 */

export const PORTAL = ["supplier-portal"] as const

const errors = Schema.Union([NotSupplierContact, Unauthenticated, RpcClientError.RpcClientError])
const keys = { reactivityKeys: PORTAL }

export const portalMeAtom = Atom.serializable(ConsoleClient.query("SupplierPortal.me", undefined, keys), {
  key: "supplier-portal:me",
  schema: AsyncResult.Schema({ success: SupplierMe, error: errors }),
  skipInitialRun: true
})

export const portalDashboardAtom = Atom.serializable(
  ConsoleClient.query("SupplierPortal.dashboard", undefined, keys),
  {
    key: "supplier-portal:dashboard",
    schema: AsyncResult.Schema({ success: SupplierDashboard, error: errors }),
    skipInitialRun: true
  }
)

/** Every order of theirs: the list cuts it by view in the browser, as the panel counts it. */
export const portalOrdersAtom = Atom.serializable(
  ConsoleClient.query("SupplierPortal.orders.list", { view: "all" }, keys),
  {
    key: "supplier-portal:orders",
    schema: AsyncResult.Schema({ success: SupplierOrderList, error: errors }),
    skipInitialRun: true
  }
)

export const portalOrderAtom = Atom.family((orderId: string) =>
  Atom.serializable(ConsoleClient.query("SupplierPortal.orders.get", { orderId }, keys), {
    key: `supplier-portal:order:${orderId}`,
    schema: AsyncResult.Schema({ success: SupplierOrderDetail, error: Schema.Union([NotFound, errors]) }),
    skipInitialRun: true
  })
)

export const portalProductsAtom = Atom.serializable(
  ConsoleClient.query("SupplierPortal.products.list", undefined, keys),
  {
    key: "supplier-portal:products",
    schema: AsyncResult.Schema({ success: SupplierProductList, error: errors }),
    skipInitialRun: true
  }
)

export const portalProductAtom = Atom.family((productId: string) =>
  Atom.serializable(ConsoleClient.query("SupplierPortal.products.get", { productId }, keys), {
    key: `supplier-portal:product:${productId}`,
    schema: AsyncResult.Schema({ success: SupplierProductDetail, error: Schema.Union([NotFound, errors]) }),
    skipInitialRun: true
  })
)

export const portalWrites = {
  accept: ConsoleClient.mutation("SupplierPortal.orders.accept"),
  ship: ConsoleClient.mutation("SupplierPortal.orders.ship"),
  reportProblem: ConsoleClient.mutation("SupplierPortal.orders.reportProblem"),
  /** An order's page, read for its packing slip. */
  order: ConsoleClient.mutation("SupplierPortal.orders.get"),
  saveStock: ConsoleClient.mutation("SupplierPortal.products.saveStock"),
  setReporting: ConsoleClient.mutation("SupplierPortal.products.setReporting"),
  undo: ConsoleClient.mutation("SupplierPortal.undo")
} as const
