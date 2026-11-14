/*
 * What one of Start's read cards shows (M10.3): its bones until a read that asked for it is in, the read's figures,
 * a quiet line when the role may not read it (a read asked for it and left it out), or that it could not be loaded.
 * The board keeps its last read on screen while a changed board is read, and that read was not asked for a card
 * added since: the card waits, it is no answer that the role may not see it. Pure, so tested without a browser.
 */

/** What the board shows of its read: the cards it was asked for, and whether the read for the board as it is failed. */
export interface WidgetsShown<Id extends string = string> {
  /** The cards the shown read was asked for: a card added since waits for its own read. */
  readonly asked: ReadonlySet<Id>
  /** The read for the board as it is now failed: a card it does not cover says so instead of waiting. */
  readonly failed: boolean
}

export type CardState = "bones" | "failed" | "role" | "draw"

export const cardState = <Id extends string>(
  shown: WidgetsShown<Id> | undefined,
  widgets: Readonly<Partial<Record<Id, unknown>>> | undefined,
  id: Id
): CardState => {
  const asked = shown === undefined || shown.asked.has(id)
  if (!asked) return shown?.failed === true ? "failed" : "bones"
  if (widgets === undefined) return "bones"
  return widgets[id] === undefined ? "role" : "draw"
}
