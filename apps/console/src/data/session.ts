import { Atom } from "effect/reactivity"
import { ConsoleClient } from "./client.ts"

/**
 * Who is signed in and where they land (`Session.me`, M2.4). Read by the client gate in `beforeLoad`, so not
 * serializable: a redirect is decided before any HTML, and nothing renders it. No idle TTL (the browser's registry
 * keeps unread atoms a few seconds, `router.tsx`): a sign-out and sign-in in quick succession must ask again.
 */
export const sessionMeAtom = ConsoleClient.query("Session.me", undefined).pipe(Atom.setIdleTTL(0))
