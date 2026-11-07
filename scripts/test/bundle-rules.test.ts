import { describe, expect, it } from "vitest"
import { API_GZIP_LIMIT, checkApiSize, checkClientBundle } from "../lib/bundle-rules.ts"

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
})
