import { useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { toast } from "sonner"
import { customers, orders } from "../../data-source"
import type { Customer } from "../lib/types/domain"
import { CustomerReturns } from "../returns/order-returns"
import { applyCustomerEdits, useWorkspace } from "../stores/workspace-store"
import { CustomerDetail } from "./customer-screen"
import { type CustomerDetailSource, CustomerDetailSourceProvider } from "./detail-source"

/*
 * One customer's source in the design app: the profile as the operator changed it (tags, merges, a Klaviyo list), the
 * orders of every profile merged into it, and a follow-up ticket on the board, as the screen read them before it had
 * a source.
 */

export function DemoCustomerDetail({ customer: loaded }: { customer: Customer }) {
  const edit = useWorkspace((s) => s.customerEdits[loaded.id])
  const customer = useMemo(
    () => applyCustomerEdits([loaded], edit ? { [loaded.id]: { ...edit, mergedInto: undefined } } : {})[0] ?? loaded,
    [loaded, edit]
  )
  const mergedInto = useWorkspace((
    s
  ) => (edit?.mergedInto ? [...s.createdCustomers, ...customers].find((c) => c.id === edit.mergedInto) : undefined))
  const createTicket = useWorkspace((s) => s.createTicket)
  const navigate = useNavigate()
  const absorbed = edit?.absorbed?.ids ?? []
  const customerOrders = orders.filter((o) => o.customer_id === customer.id || absorbed.includes(o.customer_id))

  const source: CustomerDetailSource = {
    customer,
    orders: customerOrders,
    lastOrderAt: customerOrders[0]?.created_at,
    merged: {
      into: mergedInto ? { id: mergedInto.id, name: mergedInto.name } : undefined,
      absorbed: absorbed.length,
      alsoEmails: edit?.absorbed?.emails ?? []
    },
    klaviyo: edit?.klaviyo,
    newTicket: () => {
      const ticket = createTicket({
        title: `Opvolgen met ${customer.name}`,
        description: `${customer.name} · ${customer.email}. Tot nu toe ${customer.orders_count} ${
          customer.orders_count === 1 ? "bestelling" : "bestellingen"
        }.`,
        priority: "medium",
        related_entity: { type: "customer", id: customer.id, label: customer.name }
      })
      toast.success(`${ticket.number} geopend voor ${customer.name}`, {
        action: { label: "Openen", onClick: () => navigate({ to: "/tickets", search: { ticket: ticket.id } as never }) }
      })
    },
    Returns: CustomerReturns
  }
  return (
    <CustomerDetailSourceProvider value={source}>
      <CustomerDetail />
    </CustomerDetailSourceProvider>
  )
}
