/* The search params of `onboarding-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */
import { z } from "zod";

export const search = z.object({
	persona: z.enum(["admin", "supplier", "affiliate"]).optional(),
	step: z.number().int().min(0).optional(),
});
