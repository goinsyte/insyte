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
export const OnboardingProgressId = typeId("onb").pipe(Schema.brand("OnboardingProgressId"))
export type OnboardingProgressId = typeof OnboardingProgressId.Type
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

/*
 * Minting: a UUIDv7 in 26 Crockford base32 characters, the first holding the top 3 bits (TypeID's encoding). Here, not
 * in an adapter, so every writer (a slice, better-auth's rows, the security log) mints the same format.
 */
const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

const uuidv7 = (): Uint8Array => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const ms = Date.now()
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return bytes
}

/** 128 bits as 26 base32 characters, the first holding the top 3 bits (TypeID's encoding). */
const base32 = (bytes: Uint8Array): string => {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  let out = ""
  for (let i = 0; i < 26; i++) {
    out = CROCKFORD[Number(value & 31n)] + out
    value >>= 5n
  }
  return out
}

/** A new id with this prefix: the format the schemas above check, sortable by creation. */
export const mintId = (prefix: string): string => `${prefix}_${base32(uuidv7())}`
