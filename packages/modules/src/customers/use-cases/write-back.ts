import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { ShopifyWrite, WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { gidId, gidOf } from "../../stores/domain/Mirror.ts"
import { ConnectionGate } from "../../stores/domain/Ports.ts"
import { mirrorOne } from "../../stores/use-cases/webhooks.ts"
import { isAnswer, mutate } from "../../stores/use-cases/write.ts"
import { CUSTOMER_CREATE, CUSTOMER_TAGS_ADD, CUSTOMER_TAGS_REMOVE } from "../domain/WriteBack.ts"

/*
 * Shopify hears what changed on a customer in Insyte (M7.4), one customer per step of the `ShopifyWrite` Workflow,
 * once the undo window has passed. Tags go as the change. A customer made in Insyte is created in Shopify and takes
 * Shopify's id (a webhook that mirrored it first gives way to Insyte's row). Shopify refusing a new customer (its
 * email taken there, say) removes it from Insyte, since it never existed; refusing tags reads the customer again.
 */

interface Target {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string | null
  readonly status: string
  readonly shopifyId: string
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly country: string | null
  readonly tags: ReadonlyArray<string>
}

type CustomerWrite = Extract<ShopifyWrite, { type: "customer.updated" | "customer.created" }>

export const customerWriteBack = Effect.fn("Customers.writeBack")(function*(write: CustomerWrite, customerId: string) {
  const db = yield* Db
  const [target] = yield* db.scopedFor((sql) =>
    sql<Target>`
      select s.id as store_id, s.connection_id, s.shop_domain as shop, s.currency, s.status, c.shopify_id, c.name,
             c.email, c.phone, c.country, c.tags
      from customers c join stores s on s.id = c.store_id where c.id = ${customerId}`
  )
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: customerId,
    outcome: o,
    reason
  })
  if (target === undefined) return outcome("skipped", "gone")
  if (target.status !== "connected" && target.status !== "connecting") return outcome("skipped", "disconnected")
  const created = write.type === "customer.created"
  // Already created (a step retried after Shopify answered): nothing more to send.
  if (created && !target.shopifyId.startsWith("insyte-")) return outcome("sent")

  const send = Effect.gen(function*() {
    if (created) {
      const [first, ...rest] = target.name.trim().split(/\s+/)
      const input = {
        firstName: first ?? "",
        lastName: rest.join(" "),
        ...(target.email === null ? {} : { email: target.email }),
        ...(target.phone === null ? {} : { phone: target.phone }),
        ...(target.country === null ? {} : { addresses: [{ countryCode: target.country }] }),
        tags: [...target.tags]
      }
      const answered = yield* mutate(target, CUSTOMER_CREATE, { input }, "customerCreate")
      if (answered.errors.length > 0) return answered.errors
      const id = (answered.data as { customerCreate?: { customer?: { id: string } | null } })?.customerCreate?.customer
        ?.id
      if (id !== undefined) {
        yield* db.scopedFor((sql) =>
          Effect.gen(function*() {
            yield* sql`delete from customers where store_id = ${target.storeId} and shopify_id = ${gidId(id)}
                       and id <> ${customerId}`
            yield* sql`update customers set shopify_id = ${gidId(id)} where id = ${customerId}`
          })
        )
      }
      return []
    }
    const gid = gidOf("Customer", target.shopifyId)
    const added = write.add.length === 0
      ? []
      : (yield* mutate(target, CUSTOMER_TAGS_ADD, { id: gid, tags: write.add }, "tagsAdd")).errors
    if (added.length > 0) return added
    return write.remove.length === 0
      ? []
      : (yield* mutate(target, CUSTOMER_TAGS_REMOVE, { id: gid, tags: write.remove }, "tagsRemove")).errors
  })

  const answer = yield* send.pipe(
    Effect.map((errors) => errors.length === 0 ? null : errors.map((e) => e.message).join("; ")),
    Effect.catchTags({
      TokenRefused: () => Effect.succeed("disconnected" as const),
      ShopifyRefused: (error) =>
        isAnswer(error)
          ? Effect.succeed(error.reason)
          : Effect.flatMap(
            error.status === 401
              ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(target.connectionId))
              : Effect.void,
            () => Effect.fail(error)
          )
    })
  )
  if (answer === null) return outcome("sent")
  if (answer === "disconnected") return outcome("skipped", "disconnected")

  const workspace = yield* CurrentWorkspace
  if (created) {
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`delete from customers where id = ${customerId} and shopify_id like 'insyte-%'`
        yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
          action: "customer.shopify_refused",
          subjectType: "customer",
          subjectId: customerId,
          diff: { change: "create", reason: answer.slice(0, 300) }
        })
      })
    )
    return outcome("refused", answer)
  }
  const store = { id: target.storeId, connectionId: target.connectionId, shop: target.shop, currency: target.currency }
  yield* mirrorOne(store, "Customer", gidOf("Customer", target.shopifyId))
  yield* db.scopedFor((sql) =>
    Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
      action: "customer.shopify_refused",
      subjectType: "customer",
      subjectId: customerId,
      diff: { change: "tags", reason: answer.slice(0, 300) }
    })
  )
  return outcome("refused", answer)
})
