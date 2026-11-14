import { setupTasks, type Task } from "@insyte/ui/app/dashboard/setup-checklist"
import { useCallback } from "react"
import { useHasPage } from "../frame/pages.ts"

/*
 * Start's setup checklist in the console (M10, M5.3 for M8–M13): the design's tasks, each opening the page the console
 * has for it. Koppelingen is not a console page; a mailbox is connected on the inbox and a supplier added on
 * Leveranciers, so those two go there. A task whose page the console lacks is named but not linked.
 */

const HERE: Partial<Record<Task["id"], string>> = {
  inbox: "/inbox",
  supplier: "/suppliers"
}

/** The tasks, ticked by what the workspace has done, each at its console page. */
export const consoleSetupTasks = (done: (id: Task["id"]) => boolean): Array<Task> =>
  setupTasks(done).map((task) => ({ ...task, to: HERE[task.id] ?? task.to }))

/** Whether the console has the page a task opens. */
export function useCanOpenTask(): (task: Task) => boolean {
  const hasPage = useHasPage()
  return useCallback((task: Task) => hasPage(task.to), [hasPage])
}
