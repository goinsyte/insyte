import type { SupplierRow } from "@insyte/modules/suppliers/domain/Suppliers"
import type { Supplier } from "@insyte/ui/app/lib/types/domain"

/** A server supplier as the design's: its stock mode in the design's words, the contact empty where there is none. */
const STOCK: Record<SupplierRow["stockMode"], Supplier["stock_indicator"]> = {
  live: "live",
  indicator: "in_stock_out_of_stock",
  manual: "none"
}

export const supplierOf = (s: SupplierRow): Supplier => ({
  id: s.id,
  name: s.name,
  contact_email: s.contactEmail ?? "",
  ...(s.contactPhone === null ? {} : { contact_phone: s.contactPhone }),
  status: s.status,
  api_connected: s.apiConnected,
  stock_indicator: STOCK[s.stockMode],
  assigned_product_count: s.stats.products,
  created_at: new Date(s.createdAt).toISOString()
})
