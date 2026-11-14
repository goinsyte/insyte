import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

// Loaded the way `console-screens.test.ts` loads screens: the screens' own imports are written for the bundler.
const parts = "../src/app/ask/agent-parts.tsx"
const { RecordAgentRows, RecentAgentRow, UndoControl } = (await import(/* @vite-ignore */ parts)) as {
  RecordAgentRows: FunctionComponent<{ kind: string; id: string }>
  RecentAgentRow: FunctionComponent<{ action: string }>
  UndoControl: FunctionComponent<{ e: Record<string, unknown>; now: number }>
}

describe("the agent's rows where the host has no log", () => {
  it("draw nothing, and do not break the screen they are on", () => {
    const now = Date.now()
    const entry = { id: "agl_1", status: "done", undoUntil: now + 60_000, at: new Date(now).toISOString() }
    expect(renderToStaticMarkup(createElement(RecordAgentRows, { kind: "ticket", id: "tkt_1" }))).toBe("")
    expect(renderToStaticMarkup(createElement(RecentAgentRow, { action: "SendReply" }))).toBe("")
    expect(renderToStaticMarkup(createElement(UndoControl, { e: entry, now }))).toBe("")
  })
})
