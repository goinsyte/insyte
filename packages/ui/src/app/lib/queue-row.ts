import type { LegRow } from "../stores/forwarding-store"
import type { Order, OrderLineItem } from "./types/domain"

/** A leg with its order and its lines: the forwarding queue's row (`useQueueRows`). */
export type QueueRow = LegRow & { order: Order; lines: OrderLineItem[] }
