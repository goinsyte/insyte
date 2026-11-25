import { type Notation, readNotationFrom } from "@insyte/ui/app/lib/format"
import { createIsomorphicFn, getGlobalStartContext } from "@tanstack/react-start"

/*
 * The workspace's notation (Instellingen → Regio: how dates and times are written) for the shared formatters
 * (`@insyte/ui/app/lib/format`). It arrives with the frame (`Shell.frame`), and the frame's render hands it on before any
 * screen inside it renders. On the server one isolate renders many workspaces' pages at once, so the notation is the
 * request's: a holder in Start's request context (`server.ts`), which the request's render reads back. In the browser
 * the tab has one workspace at a time, so a module's holder serves.
 */

/** What a request (on the server) or the tab (in the browser) writes dates in; empty until a frame renders. */
export interface NotationHolder {
  notation?: Notation
}

/** What `server.ts` hands Start for each request. */
export interface RequestContext {
  readonly nonce?: string
  readonly notation: NotationHolder
}

const tab: NotationHolder = {}

const holder = createIsomorphicFn()
  .server((): NotationHolder | undefined => {
    try {
      // Typed by the app's registered request context, which the console declares none of (`router.tsx`).
      return (getGlobalStartContext() as unknown as RequestContext | undefined)?.notation
    } catch {
      // Outside a request (a module's first evaluation): the default notation.
      return undefined
    }
  })
  .client((): NotationHolder | undefined => tab)

/** Once, at the composition root: the formatters read the request's or the tab's notation. */
export const installNotation = () => readNotationFrom(() => holder()?.notation)

/** The frame gone from the tab (a portal, signed out): dates are written in the default notation again. */
export const leaveNotation = () => {
  delete tab.notation
}

/** During the frame's render, before its children's: from here on dates are written in `notation`. */
export const applyNotation = (notation: Notation) => {
  const held = holder()
  if (held !== undefined) held.notation = notation
}
