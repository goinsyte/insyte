import { ConsoleClient } from "./client.ts"

/**
 * Who is signed in and where they land (`Session.me`, M2.4). Read by the client gate in `beforeLoad`, so not
 * serializable: a redirect is decided before any HTML, and nothing renders it.
 */
export const sessionMeAtom = ConsoleClient.query("Session.me", undefined)
