import { afterAll, expect, it, vi } from "vitest"
import { fetchInTab, nameTabWorkspace } from "../src/data/tab-workspace.ts"

/*
 * A tab names the workspace it shows on every call (M3.1), and loads afresh, once, when the server says the session
 * has moved on: an RPC failure or an upload route's 409, both naming `WorkspaceMismatch`.
 */

const reload = vi.fn()
const sent: Array<Headers> = []
let answer = (): Response => new Response("{}")
vi.stubGlobal("window", { location: { reload } })
vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
  sent.push(new Headers(init?.headers))
  return Promise.resolve(answer())
})
afterAll(() => vi.unstubAllGlobals())

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

it("names no workspace before the frame has read one, then the frame's", async () => {
  await fetchInTab("/api/rpc", { headers: { "content-type": "application/ndjson" } })
  expect(sent[0]!.get("x-insyte-workspace")).toBeNull()
  nameTabWorkspace("ws_shown")
  await fetchInTab("/api/rpc", { headers: { "content-type": "application/ndjson" } })
  expect(sent[1]!.get("x-insyte-workspace")).toBe("ws_shown")
  expect(sent[1]!.get("content-type")).toBe("application/ndjson")
  await settled()
  expect(reload).not.toHaveBeenCalled()
})

it("loads the tab afresh when an upload answers WorkspaceMismatch, and only once for the calls after", async () => {
  answer = () => new Response(JSON.stringify({ error: { code: "WorkspaceMismatch" } }), { status: 409 })
  const response = await fetchInTab("/api/data/imports", { method: "PUT", body: "a,b\n" })
  // The caller still reads the answer itself.
  expect(await response.json()).toEqual({ error: { code: "WorkspaceMismatch" } })
  await settled()
  expect(reload).toHaveBeenCalledTimes(1)
  answer = () =>
    new Response(`{"_tag":"Exit","exit":{"_tag":"Failure","cause":[{"error":{"_tag":"WorkspaceMismatch"}}]}}`)
  await fetchInTab("/api/rpc", {})
  await settled()
  expect(reload).toHaveBeenCalledTimes(1)
})
