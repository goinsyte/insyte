import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  CreateInput,
  CustomerChange,
  MergeInput,
  NotDuplicateInput,
  TagInput as CustomerTagInput
} from "@insyte/modules/customers/domain/Commands"
import { CustomerDetail, CustomerListInput, CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { DuplicateGroup } from "@insyte/modules/customers/domain/Duplicates"
import {
  CancelInput,
  CreateDraftInput,
  IdsInput,
  NoteInput,
  OrderChange,
  ShippingInput,
  TagCount,
  TagInput
} from "@insyte/modules/orders/domain/Commands"
import {
  CustomerMailQueued,
  CustomerMailRefused,
  EmailCustomerInput,
  TrackingSent
} from "@insyte/modules/orders/domain/CustomerMail"
import { OrderDetail, OrderPage } from "@insyte/modules/orders/domain/Orders"
import {
  AlreadyRefunded,
  RefundInput,
  RefundOverBalance,
  RefundOverLimit,
  RefundResult
} from "@insyte/modules/orders/domain/Refunds"
import {
  CreateInput as CreateProductInput,
  EditInput,
  ProductChange,
  RepriceInput,
  RepriceResult,
  StatusInput
} from "@insyte/modules/products/domain/Commands"
import {
  LowStockInput,
  LowStockPage,
  ProductDetail,
  ProductListInput,
  ProductPage
} from "@insyte/modules/products/domain/Products"
import { CursorInvalid, FilterFieldUnknown, ListInput } from "@insyte/modules/shared/domain/Filter"
import { MaybeInStore } from "@insyte/modules/shared/domain/Stores"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Bestellingen, Producten and Klanten (M6.4): each list takes the list contract (filter, search, cursor, page size,
 * store) and answers a page with its counts; each detail one record. At the area's Bekijken, inside the role's stores.
 * The order commands (M7.1) at Bestellingen · Bewerken answer the orders they changed and, where it can be taken
 * back, the undo token (`Shared.undo`); a cancellation has none.
 */
const ListError = Schema.Union([Forbidden, FilterFieldUnknown, CursorInvalid])
const ById = Schema.Struct({ id: Schema.String })
const GetError = Schema.Union([Forbidden, NotFound])

export class CommerceRpcs extends RpcGroup.make(
  Rpc.make("Orders.list", { payload: ListInput, success: OrderPage, error: ListError }),
  Rpc.make("Orders.get", { payload: ById, success: OrderDetail, error: GetError }),
  Rpc.make("Orders.tags", { success: Schema.Array(TagCount), error: Forbidden }),
  Rpc.make("Orders.tag", {
    payload: TagInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict])
  }),
  // "Nieuwe bestelling" (M7.1): a draft in one of the principal's stores, with Undo; removing one is final.
  Rpc.make("Orders.createDraft", {
    payload: CreateDraftInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict])
  }),
  Rpc.make("Orders.removeDraft", { payload: ById, error: Schema.Union([Forbidden, NotFound, Conflict]) }),
  Rpc.make("Orders.markFulfilled", {
    payload: IdsInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Orders.updateShipping", {
    payload: ShippingInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict])
  }),
  Rpc.make("Orders.cancel", {
    payload: CancelInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  // "Als vertraagd markeren" and "Vertraging wissen" (M7, M8.3): bulk, one undo for the selection.
  Rpc.make("Orders.flagDelayed", {
    payload: IdsInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Orders.clearDelay", {
    payload: IdsInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Orders.setNote", { payload: NoteInput, error: Schema.Union([Forbidden, NotFound, Conflict]) }),
  // Mail the shopper (M7 9.1): the team's words to one order's shopper (Klantenservice · Bewerken), and the bulk
  // "Track & trace-update sturen" (Bestellingen · Bewerken). Each waits out the undo window; one undo per call.
  Rpc.make("Orders.emailCustomer", {
    payload: EmailCustomerInput,
    success: CustomerMailQueued,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict, CustomerMailRefused])
  }),
  Rpc.make("Orders.sendTrackingUpdate", {
    payload: IdsInput,
    success: TrackingSent,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  // Irreversible (api.md §1.1): Terugbetalen within the role's limit, confirmed in the console, no undo.
  Rpc.make("Orders.refund", {
    payload: RefundInput,
    success: RefundResult,
    error: Schema.Union([Forbidden, NotFound, Conflict, RefundOverLimit, RefundOverBalance, AlreadyRefunded])
  }),
  Rpc.make("Products.list", { payload: ProductListInput, success: ProductPage, error: ListError }),
  Rpc.make("Products.get", { payload: ById, success: ProductDetail, error: GetError }),
  Rpc.make("Products.lowStock", { payload: LowStockInput, success: LowStockPage, error: Forbidden }),
  // "Nieuw product" (M7.3): one variant, in one of the principal's stores, with Undo.
  Rpc.make("Products.create", {
    payload: CreateProductInput,
    success: ProductChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict])
  }),
  Rpc.make("Products.edit", {
    payload: EditInput,
    success: ProductChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Products.setStatus", { payload: StatusInput, success: ProductChange, error: GetError }),
  Rpc.make("Products.reprice", { payload: RepriceInput, success: RepriceResult, error: GetError }),
  Rpc.make("Products.sync", { payload: ById, error: Schema.Union([Forbidden, NotFound, Conflict]) }),
  Rpc.make("Customers.list", { payload: CustomerListInput, success: CustomerPage, error: ListError }),
  Rpc.make("Customers.get", { payload: ById, success: CustomerDetail, error: GetError }),
  Rpc.make("Customers.tag", {
    payload: CustomerTagInput,
    success: CustomerChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Customers.create", {
    payload: CreateInput,
    success: CustomerChange,
    error: Schema.Union([Forbidden, Invalid, Conflict])
  }),
  Rpc.make("Customers.merge", {
    payload: MergeInput,
    success: CustomerChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict])
  }),
  Rpc.make("Customers.duplicates", { payload: MaybeInStore, success: Schema.Array(DuplicateGroup), error: Forbidden }),
  Rpc.make("Customers.markNotDuplicate", { payload: NotDuplicateInput, error: Forbidden })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
