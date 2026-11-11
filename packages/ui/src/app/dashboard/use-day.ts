import { useMemo } from "react"
import { automations } from "../../data-source"
import { type Moment, moments, type WorkItem, workItems } from "../lib/home/day"
import { useNow } from "../notifications/note-parts"
import { useHome } from "../stores/home-store"
import { useNotifications } from "../stores/notifications-store"
import { useTeam } from "../stores/team-store"
import { useWorkspace } from "../stores/workspace-store"

/** The day's dated things and the operator's work, read live from every store that holds a part. */
export function useDay(): { now: number; moments: Moment[]; work: WorkItem[] } {
  const now = useNow(30_000)
  const queue = useWorkspace((s) => s.queue)
  const chargebacks = useWorkspace((s) => s.chargebacks)
  const orders = useWorkspace((s) => s.orders)
  const tickets = useWorkspace((s) => s.tickets)
  const todos = useHome((s) => s.todos)
  const snoozed = useHome((s) => s.snoozed)
  const doneWork = useHome((s) => s.doneWork)
  const invites = useTeam((s) => s.invites)
  const prefs = useNotifications((s) => s.prefs)

  return useMemo(() => {
    const input = { queue, chargebacks, orders, tickets, automations, todos, invites, prefs, now }
    return { now, moments: moments(input), work: workItems({ ...input, snoozed, doneWork }) }
  }, [queue, chargebacks, orders, tickets, todos, invites, prefs, now, snoozed, doneWork])
}
