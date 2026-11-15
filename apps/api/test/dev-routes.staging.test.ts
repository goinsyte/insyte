import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/*
 * The `__dev` routes on a Worker configured as staging (`vitest.staging.config.ts`): every one answers 404, without a
 * session and whatever it is asked, as a path no route claims does. The guard is the prefix's (`DevRoutes.ts`), so a
 * route added to `dev/` later is refused there without a line of its own; this lists them from their sources, so a new
 * one is checked without a line here either.
 */

declare global {
  // Vite's, which this project's types leave out: the files are read when the test is built.
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { readonly query: string; readonly import: string; readonly eager: true }
    ): Record<string, T>
  }
}

const sources = import.meta.glob<string>("../src/transports/http/dev/*.ts", {
  query: "?raw",
  import: "default",
  eager: true
})

const ADD = /HttpRouter\.add\(\s*"([A-Z*]+)",\s*"([^"]+)"/g

const routes = Object.entries(sources).flatMap(([file, source]) => {
  const found = [...source.matchAll(ADD)].map(([, method, path]) => ({ file, method: method!, path: path! }))
  // Each `HttpRouter.add(` is one the pattern read, so none is left out of the check by how it is written.
  expect(found.length, file).toBe(source.split("HttpRouter.add(").length - 1)
  return found
})

describe("the __dev routes on staging", () => {
  it("are all found in their sources", () => {
    expect(routes.length).toBeGreaterThan(40)
    for (const route of routes) expect(route.path, route.file).toMatch(/^\/api\/__dev\//)
  })

  it.each(routes.map((route) => [`${route.method} ${route.path}`, route] as const))(
    "refuses %s with a 404",
    async (_, route) => {
      const method = route.method === "*" ? "GET" : route.method
      const response = await call(`http://api.test${route.path.replaceAll(/:\w+/g, "x")}?workspace=ws_any`, {
        method,
        ...(method === "GET" ? {} : { headers: { "content-type": "application/json" }, body: "{}" })
      })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: { code: "not_found" } })
    }
  )
})
