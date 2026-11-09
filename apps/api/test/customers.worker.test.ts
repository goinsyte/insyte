import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * The customer commands (step 9.4, M7.4), against Shopify's recorded twin. Tags and a new customer change Insyte at
 * once and reach Shopify after the undo window; the new customer takes Shopify's id. Duplicates are found on the
 * server and an operator's "not the same person" holds. A merge is Insyte's: the absorbed profile leaves the list,
 * its orders and value count for the survivor, and undo takes it apart again.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

const customerNamed = async (cookie: string, name: string) => {
  const page = ok(await rpc("Customers.list", { limit: 50 }, cookie))
  return page.rows.find((c) => c.name === name)!
}

describe("the customer commands", () => {
  it("tags customers and creates one, each reaching Shopify after the window", async () => {
    const store = await importedStore("cus-tag")
    const anna = await customerNamed(store.cookie, "Anna de Vries")
    const bram = await customerNamed(store.cookie, "Bram Jansen")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)

    const tagged = ok(
      await rpc("Customers.tag", { ids: [anna.id, bram.id], add: ["VIP klant"], remove: [] }, store.cookie)
    )
    expect(tagged.customers.map((c) => c.tags)).toEqual([["vip-klant"], ["vip-klant"]])
    expect(tagged.undo).not.toBeNull()

    const created = ok(
      await rpc("Customers.create", {
        name: "Dewi Kusuma",
        email: "dewi@example.com",
        phone: "",
        country: "nl",
        tags: ["Nieuwsbrief"]
      }, store.cookie)
    )
    const dewi = created.customers[0]!
    expect(dewi).toMatchObject({ name: "Dewi Kusuma", country: "NL", tags: ["nieuwsbrief"] })
    expect(dewi.shopifyId).toBe(`insyte-${dewi.id}`)

    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const instances = await writes.get()
    expect(instances).toHaveLength(2)
    for (const instance of instances) await instance.waitForStatus("complete")
    const outcomes = (await Promise.all(instances.map((i) => i.getOutput()))).flat() as Array<Outcome>
    expect(outcomes.map((o) => o.outcome)).toEqual(["sent", "sent", "sent"])
    expect(ok(await rpc("Customers.get", { id: dewi.id }, store.cookie)).customer.shopifyId).toBe("7001")

    // The address is taken in this store; a customer needs an email or a phone.
    expect(failure(
      await rpc("Customers.create", {
        name: "Dewi K.",
        email: "DEWI@example.com",
        phone: "",
        country: "NL",
        tags: []
      }, store.cookie)
    )).toMatchObject({ _tag: "Invalid", fields: { email: "taken" } })
    expect(
      failure(
        await rpc("Customers.create", { name: "Niemand", email: "", phone: "", country: "", tags: [] }, store.cookie)
      )
    )
      .toMatchObject({ _tag: "Invalid", fields: { email: "required" } })
  })

  it("undoes a new customer inside the window: gone, and Shopify never hears of it", async () => {
    const store = await importedStore("cus-undo")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const created = ok(
      await rpc(
        "Customers.create",
        { name: "Eva Bos", email: "eva@example.com", phone: "", country: "", tags: [] },
        store.cookie
      )
    )
    ok(await rpc("Shared.undo", { token: created.undo!.token }, store.cookie))
    expect(failure(await rpc("Customers.get", { id: created.customers[0]!.id }, store.cookie))).toMatchObject({
      _tag: "NotFound"
    })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)
  })

  it("finds duplicates, remembers who is not the same person, and merges with undo", async () => {
    const store = await importedStore("cus-merge")
    const anna = await customerNamed(store.cookie, "Anna de Vries")
    const bram = await customerNamed(store.cookie, "Bram Jansen")
    const twin = ok(
      await rpc("Customers.create", {
        name: "anna de vries",
        email: "anna@thuis.example",
        phone: "",
        country: "NL",
        tags: []
      }, store.cookie)
    ).customers[0]!

    const [group] = ok(await rpc("Customers.duplicates", undefined, store.cookie))
    expect(group).toMatchObject({ match: "same name and country" })
    expect([...group!.ids].sort()).toEqual([anna.id, twin.id].sort())
    ok(await rpc("Customers.markNotDuplicate", { key: group!.key }, store.cookie))
    expect(ok(await rpc("Customers.duplicates", undefined, store.cookie))).toEqual([])

    const merged = ok(await rpc("Customers.merge", { survivorId: anna.id, ids: [bram.id] }, store.cookie))
    expect(merged.customers[0]).toMatchObject({ id: anna.id, ordersCount: 4, lifetimeValueMinor: 21340 })
    expect(await customerNamed(store.cookie, "Bram Jansen")).toBeUndefined()
    const survivor = ok(await rpc("Customers.get", { id: anna.id }, store.cookie))
    expect(survivor.orders.map((o) => o.number).sort()).toEqual(["#1001", "#1002", "#1003", "#1004"])
    expect(survivor.merged).toEqual({ into: null, absorbed: 1, alsoEmails: ["klant2@example.com"] })
    expect(ok(await rpc("Customers.get", { id: bram.id }, store.cookie)).merged.into).toEqual({
      id: anna.id,
      name: "Anna de Vries"
    })
    expect(failure(await rpc("Customers.merge", { survivorId: bram.id, ids: [anna.id] }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "merged" })

    ok(await rpc("Shared.undo", { token: merged.undo!.token }, store.cookie))
    expect(ok(await rpc("Customers.get", { id: anna.id }, store.cookie)).orders.map((o) => o.number).sort())
      .toEqual(["#1001", "#1002"])
    expect((await customerNamed(store.cookie, "Bram Jansen")).ordersCount).toBe(2)
  })
})
