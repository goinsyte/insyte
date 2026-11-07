import { Schema } from "effect"

/**
 * A prefixed TypeID: the prefix, `_`, and 26 Crockford base32 characters of a UUIDv7, so ids sort by creation and read
 * well in logs and URLs (domain.md §1). The prefixes are the console's own, so the fixtures seed unchanged; a slice
 * adds its prefix here when it lands.
 */
const typeId = (prefix: string) =>
  Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{26}$`), { message: "Ongeldige id" }))

export const WorkspaceId = typeId("ws").pipe(Schema.brand("WorkspaceId"))
export type WorkspaceId = typeof WorkspaceId.Type
export const UserId = typeId("usr").pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type
export const MemberId = typeId("mem").pipe(Schema.brand("MemberId"))
export type MemberId = typeof MemberId.Type
export const InvitationId = typeId("inv").pipe(Schema.brand("InvitationId"))
export type InvitationId = typeof InvitationId.Type
export const TeamId = typeId("team").pipe(Schema.brand("TeamId"))
export type TeamId = typeof TeamId.Type
export const StoreId = typeId("store").pipe(Schema.brand("StoreId"))
export type StoreId = typeof StoreId.Type
export const OrderId = typeId("ord").pipe(Schema.brand("OrderId"))
export type OrderId = typeof OrderId.Type
export const CustomerId = typeId("cus").pipe(Schema.brand("CustomerId"))
export type CustomerId = typeof CustomerId.Type
export const ProductId = typeId("prd").pipe(Schema.brand("ProductId"))
export type ProductId = typeof ProductId.Type
export const TicketId = typeId("tkt").pipe(Schema.brand("TicketId"))
export type TicketId = typeof TicketId.Type
export const SupplierId = typeId("sup").pipe(Schema.brand("SupplierId"))
export type SupplierId = typeof SupplierId.Type
export const SupplierContactId = typeId("sc").pipe(Schema.brand("SupplierContactId"))
export type SupplierContactId = typeof SupplierContactId.Type
export const AffiliateId = typeId("aff").pipe(Schema.brand("AffiliateId"))
export type AffiliateId = typeof AffiliateId.Type
export const AutomationId = typeId("auto").pipe(Schema.brand("AutomationId"))
export type AutomationId = typeof AutomationId.Type
