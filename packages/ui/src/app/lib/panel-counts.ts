import type { SubPanelConfig } from "./types/sub-panel"

/*
 * ADR-0028 for the area panel: real counts or none. The design's panel config carries counts for the demo; a host
 * that has the server's figures drops every one of those and puts in only what the server counts, by the item's link:
 * its path, and its search when it has one (`/orders?status=open`), since several items share a path.
 * Counts the panel works out from the records it is given (an empty workspace's zero) still apply after this.
 */

/** The key a count is kept under for a panel item: `/orders`, or `/orders?status=open`. */
export const countKey = (to: string, search?: Readonly<Record<string, string>>) => {
  if (search === undefined || Object.keys(search).length === 0) return to
  const params = new URLSearchParams(Object.entries(search).sort(([a], [b]) => a.localeCompare(b)))
  return `${to}?${params}`
}

export function withServerCounts(cfg: SubPanelConfig, counts: Readonly<Record<string, number>>): SubPanelConfig {
  return {
    ...cfg,
    sections: cfg.sections.map((section) => ({
      ...section,
      items: section.items.map(({ count: _demo, ...item }) => {
        const n = counts[countKey(item.to, item.search)]
        return n === undefined || n === 0 ? item : { ...item, count: n }
      })
    }))
  }
}
