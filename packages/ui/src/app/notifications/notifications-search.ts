/* The search params of `notifications-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */
import { z } from "zod"
import { type NoteSource, SOURCE_ORDER } from "../lib/notifications"

export const search = z.object({
  view: z.enum(["other", "later", "cleared"]).optional(),
  source: z.enum(SOURCE_ORDER as unknown as [NoteSource, ...NoteSource[]]).optional()
})
