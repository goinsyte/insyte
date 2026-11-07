/* The search params of `reset-password-screen.tsx`'s route, apart from the screen so the route tree can read them
   without loading it (ADR-0026). better-auth's link lands here with `?token=`, or with `?error=INVALID_TOKEN` when the
   token is unknown, used or past its 30 minutes. */
import { z } from "zod"

export const search = z.object({
  token: z.string().optional(),
  error: z.string().optional()
})
