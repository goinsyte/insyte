import { describe, expect, it } from "vitest"
import {
  API_GZIP_LIMIT,
  checkApiSize,
  checkClientBundle,
  checkNoDemoModules,
  checkSeamReads,
  seamReadsOf
} from "../lib/bundle-rules.ts"

describe("bundle:check", () => {
  it("passes a browser bundle with no server code", () => {
    expect(checkClientBundle([{ name: "a.js", content: "fetch('/api/rpc/v1')" }])).toEqual([])
  })

  it.each([
    ["a cloudflare: module", `import{env}from"cloudflare:workers"`],
    ["DDL", "CREATE TABLE outbox (id text)"],
    ["the RLS context", "select set_config('app.workspace_id', $1, true)"],
    ["a database role", `"insyte_owner"`],
    ["Effect's SQL client", `"~effect/sql/SqlError/Reason"`]
  ])("fails %s in the browser bundle", (what, content) => {
    expect(checkClientBundle([{ name: "a.js", content }])).toEqual([`a.js: ${what} in the browser bundle`])
  })

  it("rings over 10 MiB gzipped", () => {
    expect(checkApiSize(API_GZIP_LIMIT)).toEqual([])
    expect(checkApiSize(API_GZIP_LIMIT + 1)).toHaveLength(1)
  })

  it("fails a fixture, a demo source or the reference itself in the console bundle", () => {
    expect(checkNoDemoModules("client", [
      "packages/ui/src/app/orders/orders-screen.tsx",
      "apps/console/src/data-hub/data-source.ts",
      "apps/design/src/app/fixtures/mock-data/orders.ts",
      "packages/ui/src/app/orders/demo-source.tsx",
      "packages/ui/src/app/settings/workspace-demo-source.tsx",
      "packages/ui/src/app/orders/forwarding-demo.tsx"
    ])).toEqual([
      "apps/design/src/app/fixtures/mock-data/orders.ts: a demo module in the console's client bundle",
      "packages/ui/src/app/orders/demo-source.tsx: a demo module in the console's client bundle",
      "packages/ui/src/app/settings/workspace-demo-source.tsx: a demo module in the console's client bundle",
      "packages/ui/src/app/orders/forwarding-demo.tsx: a demo module in the console's client bundle"
    ])
  })

  it("reads the seam's value imports only, however the file names the seam", () => {
    const file = "packages/ui/src/app/lib/team.ts"
    expect(seamReadsOf(file, `import { members as seed, presenceById, type Presence } from "../../data-source";`))
      .toEqual(["members", "presenceById"])
    expect(seamReadsOf(file, `import type { Member } from "../../data-source"`)).toEqual([])
    expect(seamReadsOf(file, `import { orders } from "@insyte/ui/data-source"`)).toEqual(["orders"])
    expect(seamReadsOf(file, `import { app } from "../../data-source/hrefs"`)).toEqual([])
    expect(seamReadsOf("packages/ui/src/app/data/data-screen.tsx", `import { useDataSource } from "./data-source"`))
      .toEqual([])
  })

  it("fails a cut-over binding the console reads, a read not on the list, and a row that no longer reads", () => {
    const reads = new Map([["orders", ["a.ts"]], ["members", ["b.ts", "c.ts"]]])
    expect(checkSeamReads(reads, { orders: { status: "api" }, members: { status: "demo" } }, {
      members: ["b.ts"],
      tickets: ["d.ts"]
    })).toEqual([
      "orders is cut over, yet the console bundle reads it: a.ts",
      "members is read in the console bundle by c.ts",
      "tickets: d.ts no longer reads it; delete the row"
    ])
  })
})
