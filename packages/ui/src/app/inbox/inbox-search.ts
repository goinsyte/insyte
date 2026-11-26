/* The search params of `inbox-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */
import { z } from "zod"

export const inboxSearch = z.object({
  folder: z
    .enum(["all", "unassigned", "mine", "linked", "archive", "trash", "spam"])
    .optional(),
  /** Replaces the deleted `/inbox/$threadId` route: a thread stays linkable. */
  thread: z.string().optional(),
  /** One connected mailbox instead of all of them. */
  mailbox: z.string().optional(),
  /** One channel: e-mail, WhatsApp, Instagram or the website chat (PLAN 27). */
  channel: z.enum(["email", "whatsapp", "instagram", "webchat"]).optional(),
  /** The customer agent's cuts (PLAN 28): handed over to the team, or handled by Insyte. */
  view: z.enum(["handed_over", "insyte"]).optional()
})
