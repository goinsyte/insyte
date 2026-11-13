import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { StatementDetail, StatementList } from "@insyte/modules/suppliers/domain/Statements"
import { SupplierDetail, SupplierList } from "@insyte/modules/suppliers/domain/Suppliers"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { PRODUCTS } from "./products.ts"

/*
 * Leveranciers (M8.1): the list with each supplier's standing, primed by the route's loader, and one supplier when its
 * dialog opens. A supplier command names `SUPPLIERS` and `PRODUCTS` (a product's supplier shows on the products list
 * and page); a change to a product names `PRODUCTS`, which the figures here count too.
 */

export const SUPPLIERS = ["suppliers"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const suppliersAtom = Atom.serializable(
  ConsoleClient.query("Suppliers.list", {}, { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }),
  { key: "suppliers", schema: AsyncResult.Schema({ success: SupplierList, error: errors }), skipInitialRun: true }
)

export const supplierAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Suppliers.get", { id }, { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }),
    {
      key: `supplier:${id}`,
      schema: AsyncResult.Schema({ success: SupplierDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/*
 * A supplier's statements (M13 step 6): its months, and one month line by line. A cost price changed on a product
 * changes the running month, so they name `PRODUCTS` too; the monthly close says `supplier_statement` on the socket.
 */
export const statementsAtom = Atom.family((supplierId: string) =>
  Atom.serializable(
    ConsoleClient.query("Suppliers.statements", { supplierId }, { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }),
    {
      key: `statements:${supplierId}`,
      schema: AsyncResult.Schema({ success: StatementList, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/** One month of a supplier's, by `<supplierId>/<YYYY-MM>`. */
export const statementAtom = Atom.family((key: string) => {
  const [supplierId = "", month = ""] = key.split("/")
  return Atom.serializable(
    ConsoleClient.query("Suppliers.statement", { supplierId, month }, { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }),
    {
      key: `statement:${key}`,
      schema: AsyncResult.Schema({ success: StatementDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
})

export const supplierWrites = {
  create: ConsoleClient.mutation("Suppliers.create"),
  update: ConsoleClient.mutation("Suppliers.update"),
  setPaused: ConsoleClient.mutation("Suppliers.setPaused"),
  assignProducts: ConsoleClient.mutation("Suppliers.assignProducts"),
  connectApi: ConsoleClient.mutation("Suppliers.connectApi"),
  disconnectApi: ConsoleClient.mutation("Suppliers.disconnectApi"),
  testConnection: ConsoleClient.mutation("Suppliers.testConnection"),
  markStatementPaid: ConsoleClient.mutation("Suppliers.markStatementPaid"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
