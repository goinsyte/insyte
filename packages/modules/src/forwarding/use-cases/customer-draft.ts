import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { CustomerDraft, customerDraftText } from "../domain/CustomerDraft.ts"
import type { ErrorKind } from "../domain/Forwarding.ts"

/*
 * `Forwarding.customerDraft` (M8 10.2a): Insyte's draft for the shopper of one leg, at Bestellingen · Bekijken inside
 * the role's stores. Read only: sending it is `Orders.emailCustomer`, which the team does after reading it.
 */
export const customerDraft = Effect.fn("Forwarding.customerDraft")(function*(legId: string) {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "f.store_id")
      const [leg] = yield* sql<{
        id: string
        orderId: string
        errorKind: ErrorKind | null
        customer: string
        email: string | null
        number: string
        shop: string
        title: string | null
        variant: string | null
      }>`
        select f.id, f.order_id, f.error_kind, o.customer_name as customer,
               nullif(btrim(o.customer_email), '') as email, o.number, coalesce(nullif(s.name, ''), w.name) as shop,
               l.title, l.variant_title as variant
        from forwarding_items f join orders o on o.id = f.order_id join stores s on s.id = f.store_id
        join workspaces w on w.id = f.workspace_id
        left join lateral (select coalesce(p.title, ol.title) as title, ol.variant_title from order_lines ol
                           left join products p on p.id = ol.product_id
                           where ol.id = any(f.line_ids) order by ol.id limit 1) l on true
        where f.id = ${legId} and ${scope}`
      if (leg === undefined) return yield* new NotFound({ entity: "forwarding_item", id: legId })
      const text = customerDraftText({
        errorKind: leg.errorKind,
        customer: leg.customer,
        number: leg.number,
        shop: leg.shop,
        line: leg.title === null ? null : { title: leg.title, variant: leg.variant }
      })
      return new CustomerDraft({ legId: leg.id, orderId: leg.orderId, to: leg.email, ...text })
    })
  )
})
