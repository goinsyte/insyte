import { describe, expect, it } from "vitest"
import { ok } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The MCP server's resources (M19.3): `insyte://workspace` (the key's workspace, its plan, the stores the key reaches)
 * and `insyte://orders/{id}` (one order, as `get_order`). Both are fenced as the key is: its scopes and its stores.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"
const VERSION = "2026-07-28"

let id = 0

const mcp = async (token: string, method: string, params: Record<string, unknown> = {}): Promise<Json> => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": method,
      ...(typeof params["uri"] === "string" ? { "Mcp-Name": params["uri"] } : {}),
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  return response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
}

const read = async (token: string, uri: string) => {
  const message = await mcp(token, "resources/read", { uri })
  return message.result === undefined
    ? { error: message.error.message as string }
    : { value: JSON.parse(message.result.contents[0].text) as Json, mime: message.result.contents[0].mimeType }
}

describe("the MCP server's resources", () => {
  it("reads the key's workspace and one order, within the key's scopes and stores", async () => {
    const store = await importedStore("mcp-resources")
    const other = await anotherStore(store, "mcp-resources-b")
    const make = async (label: string, access: unknown, stores: "all" | Array<string>) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: access as never,
          stores,
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      ).secret
    const all = await make("Alle winkels", { kind: "role", roleId: "view" }, "all")
    const one = await make("Eén winkel", { kind: "role", roleId: "view" }, [store.storeId])
    const team = await make("Alleen het team", { kind: "custom", scopes: { team: 1 } }, "all")

    // Every key is named the workspace; the order's template only a key that reads orders, the thread's one that reads
    // the inbox (support.read: the view role has it, a key for the team only has not).
    const listed = await mcp(all, "resources/list")
    expect(listed.result.resources).toMatchObject([{ uri: "insyte://workspace", mimeType: "application/json" }])
    const templates = async (token: string) =>
      ((await mcp(token, "resources/templates/list")).result.resourceTemplates as Array<{ uriTemplate: string }>)
        .map((t) => t.uriTemplate)
    expect((await templates(all)).toSorted()).toEqual(["insyte://orders/{id}", "insyte://threads/{id}"])
    expect(await templates(team)).toEqual([])

    // The workspace, with the stores the key reaches.
    const everything = await read(all, "insyte://workspace")
    expect(everything.mime).toBe("application/json")
    expect(everything.value).toMatchObject({ object: "workspace", id: store.workspace, plan: expect.any(String) })
    expect((everything.value.stores as Array<{ id: string }>).map((s) => s.id).toSorted())
      .toEqual([store.storeId, other.storeId].toSorted())
    const narrowed = await read(one, "insyte://workspace")
    expect(narrowed.value.stores).toMatchObject([{ id: store.storeId, shop_domain: store.shop }])
    expect((await read(team, "insyte://workspace")).value.stores).toHaveLength(2)

    // One order, as get_order has it; not one of a store the key does not reach, and not without orders.read.
    const orders = ok(await rpc("Orders.list", { limit: 100 }, store.cookie)).rows
    const mine = orders.find((o) => o.storeId === store.storeId)!
    const theirs = orders.find((o) => o.storeId === other.storeId)!
    const order = await read(one, `insyte://orders/${mine.id}`)
    expect(order.value).toMatchObject({ id: mine.id, number: mine.number })
    expect((await read(all, `insyte://orders/${theirs.id}`)).value).toMatchObject({ id: theirs.id })
    expect((await read(one, `insyte://orders/${theirs.id}`)).error).toContain("NotFoundV1")
    expect((await read(team, `insyte://orders/${mine.id}`)).error).toContain("ScopeMissingV1")
    expect((await read(team, "insyte://threads/thr_none")).error).toContain("ScopeMissingV1")
  }, 180_000)
})
