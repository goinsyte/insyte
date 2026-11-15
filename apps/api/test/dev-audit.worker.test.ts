import { Connect } from "@insyte/database/Connect"
import { Context, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { expect, it } from "vitest"
import { AppInfo } from "../src/platform/Bindings.ts"
import { SyncScheduler } from "../src/platform/InfraLayer.ts"
import { OutboxRoutes } from "../src/transports/http/dev/outbox.ts"

/*
 * `/api/__dev/audit` reads any workspace's audit log by its id: only where nothing real lives (`devOnly`). On staging
 * and in production it answers 404 before it opens a connection (the one here would fail).
 */

it.each(["staging", "production"] as const)("refuses the audit log on %s", async (environment) => {
  const web = HttpRouter.toWebHandler(OutboxRoutes.pipe(Layer.provideMerge(SyncScheduler)))
  const stage = Context.make(AppInfo, { version: "test", environment }).pipe(
    Context.add(Connect, Connect.of({ open: Effect.die(new Error("no database on this stage")) }))
  )
  const response = await web.handler(new Request("http://api.test/api/__dev/audit?workspace=ws_any"), stage)
  expect(response.status).toBe(404)
  await web.dispose()
})
