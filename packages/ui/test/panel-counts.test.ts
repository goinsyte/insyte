import { describe, expect, it } from "vitest"

/*
 * M5's exit criterion, ADR-0028: no count in the console's frame is hard-coded. The design's panel config carries demo
 * counts; the console's panel (`withServerCounts`) carries none of them, only what the server counts. Both modules
 * are loaded at run time: they import the icons, which this project does not compile.
 */

interface Panel {
  readonly sections: ReadonlyArray<{
    readonly items: ReadonlyArray<
      { readonly to: string; readonly count?: unknown; readonly search?: Record<string, string> }
    >
  }>
}

const CONFIG = "../src/app/lib/app-shell-config"
const COUNTS = "../src/app/lib/panel-counts"

describe("the area panel's counts", () => {
  it("are demo figures in the design's config, and none in the console's panel but the server's", async () => {
    const { SUB_PANELS } = await import(/* @vite-ignore */ CONFIG) as { SUB_PANELS: Record<string, Panel | null> }
    const { withServerCounts } = await import(/* @vite-ignore */ COUNTS) as {
      withServerCounts: (cfg: Panel, counts: Record<string, number>) => Panel
    }
    const panels = Object.values(SUB_PANELS).filter((p): p is Panel => p !== null)
    const counts = (p: Panel) => p.sections.flatMap((s) => s.items.map((i) => i.count))

    expect(panels.flatMap(counts).some((c) => typeof c === "number")).toBe(true)
    for (const panel of panels) expect(counts(withServerCounts(panel, {})).filter((c) => c !== undefined)).toEqual([])
    const orders = SUB_PANELS["/orders"]!
    const first = orders.sections[0]!.items[0]!
    expect(withServerCounts(orders, { [first.to]: 7 }).sections[0]!.items[0]!.count).toBe(7)
    // Items that share a path are counted by their search too.
    const open = orders.sections[0]!.items.findIndex((i) => i.search?.["status"] === "open")
    const counted = withServerCounts(orders, { "/orders?status=open": 3 }).sections[0]!.items
    expect(counted[open]!.count).toBe(3)
    expect(counted[0]!.count).toBeUndefined()
  })
})
