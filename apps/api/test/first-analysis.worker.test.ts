import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * A store's first analysis (step 8.5, M6.5), against Shopify's recorded twin: started after the import, the Workflow
 * reads the mirror's orders and product pages and Shopify's countries and policies, and gives the early read. Every
 * prediction stands on a fact read (the policy's 7 to 12 working days, a refund policy without a rule for damage);
 * the watches count the store's own parcels and refund reasons. Starting again finds the same reading. A store whose
 * Shopify cannot be read gets no predictions, not guesses.
 */

describe("a store's first analysis", () => {
  it("reads the store after its import and gives the early read", async () => {
    const store = await importedStore("analysis")
    expect(ok(await rpc("FirstAnalysis.get", undefined, store.cookie)).state).toBe("none")

    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    expect(ok(await rpc("FirstAnalysis.start", undefined, store.cookie)).state).toBe("reading")
    const [instance] = await workflows.get()
    expect(instance).toBeDefined()
    await instance!.waitForStatus("complete")

    const view = ok(await rpc("FirstAnalysis.get", undefined, store.cookie))
    expect(view).toMatchObject({
      state: "early",
      history: "young",
      store: { products: 3, customers: 3, orders: 5 },
      chosen: null
    })
    expect(view.reads.map((r) => [r.id, r.done])).toEqual([["orders", true], ["products", true], ["policies", true]])
    expect(view.predictions.map((p) => p.read)).toEqual([
      "7 tot 12 werkdagen levertijd",
      "Retourbeleid zonder regel voor beschadigde artikelen"
    ])
    expect(view.predictions[0]).toMatchObject({ prepares: "automation" })
    expect(view.watch.map((w) => [w.label, w.have, w.need])).toEqual([
      ["Levertijd per land", 1, 30],
      ["Retourredenen", 1, 10]
    ])
    expect(view.prepared.automation.title).toBe("Levertijd-update op dag 5")

    // Asked again, the same analysis: no second reading.
    expect(ok(await rpc("FirstAnalysis.start", undefined, store.cookie)).state).toBe("early")
    expect(await workflows.get()).toHaveLength(1)

    const chosen = ok(
      await rpc("FirstAnalysis.prepare", {
        ids: ["automation", "agent"],
        answers: { fulfilment: "many", reply: "auto" }
      }, store.cookie)
    )
    expect(chosen.chosen).toEqual({
      ids: ["automation", "agent"],
      answers: { fulfilment: "many", reply: "auto" }
    })
  })

  it("says nothing it could not read for a store Shopify does not answer for", async () => {
    const owner = await person("analysis-seed", "Analysis Seed B.V.")
    // The recorded store without credentials: the mirror reads, Shopify's countries and policies do not.
    expect(
      (await call("http://api.test/api/__dev/stores/seed", { method: "POST", headers: { cookie: owner.cookie } }))
        .status
    ).toBe(200)
    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    ok(await rpc("FirstAnalysis.start", undefined, owner.cookie))
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    const view = ok(await rpc("FirstAnalysis.get", undefined, owner.cookie))
    expect(view.state).toBe("early")
    expect(view.predictions).toEqual([])
    expect(view.watch.map((w) => w.have)).toEqual([1, 1])
  })

  it("has nothing to prepare before there is a reading", async () => {
    const owner = await person("analysis-none", "Analysis None B.V.")
    expect(ok(await rpc("FirstAnalysis.start", undefined, owner.cookie)).state).toBe("none")
    expect(
      failure(
        await rpc(
          "FirstAnalysis.prepare",
          { ids: ["agent"], answers: { fulfilment: "one", reply: "ask" } },
          owner.cookie
        )
      )
    ).toMatchObject({ _tag: "AnalysisNotReady" })
  })
})
