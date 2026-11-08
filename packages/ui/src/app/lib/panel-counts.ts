import type { SubPanelConfig } from "./types/sub-panel"

/*
 * ADR-0028 for the area panel: real counts or none. The design's panel config carries counts for the demo; a host
 * that has the server's figures drops every one of those and puts in only what the server counts, by the item's path.
 * Counts the panel works out from the records it is given (an empty workspace's zero) still apply after this.
 */
export function withServerCounts(cfg: SubPanelConfig, counts: Readonly<Record<string, number>>): SubPanelConfig {
  return {
    ...cfg,
    sections: cfg.sections.map((section) => ({
      ...section,
      items: section.items.map(({ count: _demo, ...item }) => {
        const n = counts[item.to]
        return n === undefined || n === 0 ? item : { ...item, count: n }
      })
    }))
  }
}
