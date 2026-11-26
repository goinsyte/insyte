/** What a shortcut listener asks of a key press's target; an `HTMLElement` has all of it. */
interface KeyTarget {
  readonly tagName: string
  readonly isContentEditable: boolean
  readonly closest: (selector: string) => unknown
}

const isElement = (t: unknown): t is KeyTarget =>
  typeof t === "object" && t !== null && typeof (t as Partial<KeyTarget>).closest === "function"

/**
 * Whether a key press belongs to whatever the person is typing in or moving through: a field, an editable cell, a
 * grid (a sheet reads its own letters), a dialog or a menu. Shortcuts on the window leave those alone.
 */
export const typing = (t: EventTarget | null): boolean =>
  isElement(t) &&
  (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
    t.closest("[role=grid],[role=dialog],[role=menu]") !== null)
