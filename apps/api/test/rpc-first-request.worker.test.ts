import { expect, it } from "vitest"
import { call, health } from "./support.ts"

/*
 * Its own file, so its first request is the isolate's first. With `RpcServer.layerHttp`, an isolate whose first request
 * did no I/O (here a 404) never started its RPC server, and every later RPC call hung (`RpcHttp`). This is that
 * sequence.
 */
it("serves RPC when the isolate's first request was a 404", async () => {
  expect((await call("http://api.test/nope")).status).toBe(404)
  expect(await health()).toMatchObject({ version: "dev" })
  expect(await health()).toMatchObject({ version: "dev" })
})
