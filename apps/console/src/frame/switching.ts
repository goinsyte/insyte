/*
 * Moving the console from one workspace to another (M3.1). After the server has changed the session's workspace
 * (`Workspaces.switch`, `.create`, `.leave`), the page loads afresh at the landing: every read, cache and the realtime
 * socket then belong to the new workspace, and nothing read in the other one is left on screen or subscribed. The
 * sentence to say once there is carried across the load in `sessionStorage`; the browser's other tabs of this session
 * hear of it through `localStorage` and load afresh too, since their next read would be the other workspace's.
 */

const FLASH = "insyte.workspace.flash"
const SIGNAL = "insyte.workspace.switched"

/** What to say once the page is back: a title and, if any, its line. */
export interface Flash {
  readonly title: string
  readonly description?: string | undefined
}

const attempt = (f: () => void) => {
  try {
    f()
  } catch {
    // Storage blocked (a private window): the page still loads afresh, it just says nothing.
  }
}

/** Loads `landing` afresh in the new workspace, and tells the other tabs. */
export const reloadInto = (landing: string, flash?: Flash) => {
  attempt(() => {
    if (flash !== undefined) sessionStorage.setItem(FLASH, JSON.stringify(flash))
    localStorage.setItem(SIGNAL, String(Date.now()))
  })
  window.location.assign(landing)
}

/** The sentence a load into a workspace carried, once. */
export const takeFlash = (): Flash | undefined => {
  let flash: Flash | undefined
  attempt(() => {
    const raw = sessionStorage.getItem(FLASH)
    sessionStorage.removeItem(FLASH)
    if (raw !== null) flash = JSON.parse(raw) as Flash
  })
  return flash
}

/** Calls `onSwitched` when another tab of this browser moved the session to another workspace. */
export const onOtherTabSwitched = (onSwitched: () => void) => {
  const listener = (e: StorageEvent) => {
    if (e.key === SIGNAL) onSwitched()
  }
  window.addEventListener("storage", listener)
  return () => window.removeEventListener("storage", listener)
}
