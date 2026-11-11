/* The search params of `tickets-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */
import { z } from "zod";

export const ticketsSearch = z.object({
	ticket: z.string().optional(),
	// The area panel's views and sources.
	view: z.enum(["open", "mine", "unassigned", "snoozed", "done", "archived", "trash", "spam"]).optional(),
	source: z.enum(["gmail", "outlook", "email", "shopify", "klarna", "chat", "insyte", "manual"]).optional(),
});
