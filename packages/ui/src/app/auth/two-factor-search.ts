/* The search params of `two-factor-screen.tsx`'s route, apart from the screen so the route tree can read them without
   loading it (ADR-0026): where sign-in was going, carried through the second step. A host holds it to its own paths. */
import { z } from "zod"

export const search = z.object({
  redirect: z.string().optional()
})
