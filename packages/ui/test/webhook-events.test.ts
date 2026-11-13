import {
  WEBHOOK_API_VERSIONS,
  WEBHOOK_AUTO_DISABLE_AFTER,
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_RETRIES
} from "@insyte/domain/Webhooks"
import { describe, expect, it } from "vitest"

/*
 * The webhook catalogue has two halves (M19.4): the server's (`@insyte/domain/Webhooks`, what an endpoint may take and
 * what is sent today) and the console's (`lib/webhooks-core.ts`, the words). They list the same events in the same
 * groups, the same API versions and retry policies. The console's half is loaded at run time, as the notifications'.
 */

interface ConsoleCatalogue {
  readonly EVENT_GROUPS: ReadonlyArray<{ area: string; events: ReadonlyArray<{ id: string }> }>
  readonly API_VERSIONS: ReadonlyArray<string>
  readonly RETRY: ReadonlyArray<{ id: number }>
  readonly AUTO_DISABLE_AFTER: number
}

const CONSOLE_CATALOGUE = "../src/app/lib/webhooks-core"

describe("the webhook catalogue", () => {
  it("lists the same events, groups, versions and policies on both sides", async () => {
    const ui = await import(/* @vite-ignore */ CONSOLE_CATALOGUE) as ConsoleCatalogue
    expect(ui.EVENT_GROUPS.map((g) => [g.area, g.events.map((e) => e.id)])).toEqual(
      WEBHOOK_EVENT_GROUPS.map((g) => [g.group, g.events.map((e) => e.id)])
    )
    expect(ui.API_VERSIONS).toEqual(WEBHOOK_API_VERSIONS)
    expect(ui.RETRY.map((r) => r.id)).toEqual(WEBHOOK_RETRIES)
    expect(ui.AUTO_DISABLE_AFTER).toBe(WEBHOOK_AUTO_DISABLE_AFTER)
  })
})
