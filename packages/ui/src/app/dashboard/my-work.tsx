import type { WorkItem } from "../lib/home/kinds"
import { undoable } from "../lib/undo"
import { useHome } from "../stores/home-store"
import { useWorkspace } from "../stores/workspace-store"
import { useDay } from "./use-day"
import { MyWorkView } from "./work-view"

/** Mijn werk in the demo: the day's work from its stores, ticked and moved on them (`work-view.tsx` draws it). */
export function MyWork() {
  const { now, work } = useDay()
  const snoozed = useHome((s) => s.snoozed)
  const addTodo = useHome((s) => s.addTodo)
  const toggleTodo = useHome((s) => s.toggleTodo)
  const setWorkDone = useHome((s) => s.setWorkDone)
  const snoozeWork = useHome((s) => s.snoozeWork)
  const unsnoozeWork = useHome((s) => s.unsnoozeWork)
  const setTicketStatus = useWorkspace((s) => s.setTicketStatus)
  const discardQueue = useWorkspace((s) => s.discardQueue)
  const restoreQueue = useWorkspace((s) => s.restoreQueue)

  // The demo's ticks: on the to-do, on the record where there is one, else only on this list.
  function tick(w: WorkItem) {
    if (w.check === "todo") {
      const id = w.id.slice("todo:".length)
      toggleTodo(id)
      if (!w.done) undoable("Taak afgevinkt", () => toggleTodo(id))
    } else if (w.check === "ticket" && w.ticketId) {
      const ticketId = w.ticketId
      if (w.done) {
        setTicketStatus(ticketId, "in_progress")
        setWorkDone(w.id, false)
        return
      }
      const before = setTicketStatus(ticketId, "done")
      setWorkDone(w.id, true)
      undoable(`${w.record ?? "Ticket"} gesloten`, () => {
        if (before) setTicketStatus(ticketId, before)
        setWorkDone(w.id, false)
      })
    } else if (w.check === "queue" && w.queueId) {
      const queueId = w.queueId
      if (w.done) {
        restoreQueue(queueId, "open")
        setWorkDone(w.id, false)
        return
      }
      const before = discardQueue(queueId)
      setWorkDone(w.id, true)
      undoable("Van je wachtrij gehaald", () => {
        if (before) restoreQueue(queueId, before)
        setWorkDone(w.id, false)
      }, "Er is niets aan het record veranderd.")
    } else {
      setWorkDone(w.id, !w.done)
      if (!w.done) undoable("Afgevinkt", () => setWorkDone(w.id, false))
    }
  }

  return (
    <MyWorkView
      now={now}
      work={work}
      actions={{
        snoozed,
        add: addTodo,
        tick,
        snooze: (w, day, label) => {
          const before = snoozed[w.id]
          snoozeWork(w.id, day)
          undoable(
            `Verplaatst naar ${label.toLowerCase()}`,
            () => (before ? snoozeWork(w.id, before) : unsnoozeWork(w.id))
          )
        },
        unsnooze: (w) => unsnoozeWork(w.id)
      }}
    />
  )
}
