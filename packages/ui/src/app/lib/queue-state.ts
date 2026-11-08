import type { QueueItem } from "../stores/workspace-store"

/* The queue's derived reads, so two screens never count the same thing two ways. Store-free, so the frame can count
   from whatever queue its host gives it. */

export const isNeedsYou = (q: QueueItem) => q.state === "open" && (q.signal === "red" || q.signal === "amber")
export const isDrawn = (q: QueueItem) => q.state === "open" && q.plate !== undefined
export const isOpen = (q: QueueItem) => q.state === "open"
