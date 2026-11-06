/* The search params of `dashboard-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */
import { z } from "zod";

export const homeSearch = z.object({
	view: z.enum(["overzicht", "werk", "agenda", "activiteit"]).optional(),
	/** A queue row to open on arrival, from the agenda or My work. */
	row: z.string().optional(),
});
