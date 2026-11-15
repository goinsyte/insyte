import { WORKSPACE_HEADER } from "@insyte/api/rpc/Member"

/*
 * The workspace this tab shows (M3.1), named on every call to the API (`x-insyte-workspace`): the RPC client's and the
 * uploads' (`fetchInTab`). The session may have moved to another one since the page loaded (another tab switched, or
 * the person left this one); the server then does nothing and answers `WorkspaceMismatch` (an RPC failure, or a 409
 * from an upload route), and the tab loads afresh, once, in the workspace the session is in now.
 */

let tabWorkspace: string | null = null
let reloading = false

/** The frame names its workspace once it is read; until then no call names one. In the browser only. */
export const nameTabWorkspace = (id: string) => {
  if (typeof window !== "undefined") tabWorkspace = id
}

const reloadOnMismatch = async (response: Response) => {
  if (reloading) return
  const body = await response.clone().text().catch(() => "")
  if (!body.includes("\"WorkspaceMismatch\"")) return
  reloading = true
  window.location.reload()
}

/** The page's `fetch`, naming this tab's workspace, and loading the tab afresh when the server says it moved on. */
export const fetchInTab: typeof globalThis.fetch = (input, init) => {
  if (tabWorkspace === null) return globalThis.fetch(input, init)
  const headers = new Headers(init?.headers)
  headers.set(WORKSPACE_HEADER, tabWorkspace)
  const sent = globalThis.fetch(input, { ...init, headers })
  void sent.then(reloadOnMismatch, () => {})
  return sent
}
