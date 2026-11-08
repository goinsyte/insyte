import { type Channel, NOTIFICATION_KINDS } from "@insyte/domain/Notifications"
import { describe, expect, it } from "vitest"

/*
 * The notification catalogue has two halves (M5.2): the server's (`@insyte/domain/Notifications`, kinds, Primair,
 * default channels) and the console's (`lib/notifications.ts`, the words). They list the same kinds, the same way.
 * The console's half is loaded at run time: it imports the icons, which this project does not compile.
 */

interface ConsoleEvent {
  readonly key: string
  readonly primary: boolean
  readonly defaults: Record<Channel, boolean>
}

const CONSOLE_CATALOGUE = "../src/app/lib/notifications"

describe("the notification catalogue", () => {
  it("lists the same kinds, with the same Primair and default channels, on both sides", async () => {
    const { EVENTS } = await import(/* @vite-ignore */ CONSOLE_CATALOGUE) as { EVENTS: ReadonlyArray<ConsoleEvent> }
    const server = NOTIFICATION_KINDS.map((k) => ({ key: k.key, primary: k.primary, defaults: k.defaults }))
    expect(EVENTS.map((e) => ({ key: e.key, primary: e.primary, defaults: e.defaults }))).toEqual(server)
  })
})
